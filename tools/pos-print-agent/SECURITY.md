# Print agent security (0.7.0)

What the agent in this folder enforces, and how to configure and build it. Every
statement here is about the agent's own code (`server.js`, `tray.js`, `lib/`,
`installer/`). Release status: **not released**. The 0.7.0 build has not yet been
installed, upgraded over an older agent, rolled back or run against physical printers.

Up to 0.5.3 the agent answered `Access-Control-Allow-Origin: *`, had no
authentication, and relayed any bytes to any printer or `host:port`. 0.6.0 added
origins, pairing and command allow-lists; 0.7.0 binds each printer to its protocol.

## Request checks

Every request passes these checks in order. A refused print job writes no bytes:
all checks run on the whole job before a spooler handle or socket is opened.

| # | Check | Refusal |
|---|---|---|
| 1 | Peer is loopback | 403 `AGENT_REMOTE_REJECTED` |
| 2 | `Host` is `127.0.0.1:19777` or `localhost:19777` (stops DNS rebinding) | 421 `AGENT_HOST_REJECTED` |
| 3 | `Origin` is on the allow-list, exact scheme/host/port; no wildcard CORS | 403 `AGENT_ORIGIN_NOT_ALLOWED` (no CORS headers), `AGENT_ORIGIN_REQUIRED` |
| 4 | Pairing token issued to that origin (all routes except `/health`, `/pair/start`, `/pair/complete`) | 401 `AGENT_AUTH_REQUIRED`, `AGENT_TOKEN_INVALID` / `_EXPIRED` / `_REVOKED` |
| 5 | `application/json`, a JSON object, at most `maxBodyBytes` (4 MB) | 415 `AGENT_UNSUPPORTED_MEDIA_TYPE`, 413 `AGENT_BODY_TOO_LARGE`, 400 `AGENT_BAD_REQUEST` |
| 6 | Network target passes the LAN policy | 400 `AGENT_PRINTER_ADDRESS_REFUSED` |
| 7 | Destination is set up on this PC | 403 `AGENT_DESTINATION_NOT_CONFIGURED` / `_AMBIGUOUS`, 409 `AGENT_DESTINATION_CONFLICT`, 400 `AGENT_BAD_REQUEST` (malformed name) |
| 8 | Destination's protocol matches the route | 409 `AGENT_PROTOCOL_MISMATCH` |
| 9 | Bytes pass that protocol's command allow-list | 403 `AGENT_COMMAND_FORBIDDEN` |

`/probe/*` and `/diagnostics/probe` return 404 `AGENT_NOT_FOUND` unless diagnostics is
on. Preflights grant only `GET`/`POST` with `Authorization` and `Content-Type`
(otherwise 403 `AGENT_HEADERS_NOT_ALLOWED`), are cached for 600 s, answer the Private
Network Access header for trusted origins only, and never print.
`Access-Control-Allow-Credentials` is never sent.

There is **no HTTP route that changes configuration**. Trusted sites, printer setup,
revocation and diagnostics change only on the PC: CLI, tray, installer or editing
`config.json`. A paired token does not change that.

Trusted: JavaScript running on a trusted origin (it can use the token), the Windows
user the agent runs as, and the local admin. Out of scope: malware running as that user.

## Origins

`config.json` `allowedOrigins`, set by the installer (`/ORIGIN=`) or `--add-origin`
(`lib/config.js`):

- `https://` only, exact scheme, host and port. No wildcards, paths, credentials,
  queries or fragments, and no subdomain matching.
- Plain `http://` only for `localhost`, `127.0.0.1` and `[::1]` (development).
- `BILLBULL_PRINT_AGENT_ORIGINS` (comma-separated) adds origins for one session.

## Pairing

`lib/pairing.js`:

1. A page on a trusted origin calls `POST /pair/start` → `{ pairingId, expiresInSeconds }`.
2. The agent shows a 6-digit code on this PC only: a tray notification and the first
   line of the tray menu, or the terminal when `node server.js` runs in one. The code
   is never sent over HTTP.
3. The operator types the code; `POST /pair/complete { pairingId, code }` returns
   `{ token, expiresAt }`. The token is bound to the origin that paired it.

| Limit | Value |
|---|---|
| Code lifetime | 2 minutes (then 410 `AGENT_PAIRING_EXPIRED`) |
| Wrong codes per attempt | 5, then the attempt is dead (401 `AGENT_PAIRING_CODE_INVALID`) |
| Pairing starts | 5 per minute (429 `AGENT_PAIRING_RATE_LIMITED`); a new start from the same origin replaces the previous one |
| No screen to show the code (headless, output redirected) | 503 `AGENT_PAIRING_UNAVAILABLE` |
| Token lifetime | `tokenTtlDays`, default 180 |

Tokens (`bbpa_…`) are stored only as SHA-256 hashes in
`%APPDATA%\BillBull\PrintAgent\tokens.json`, which is re-read on every check.
Revocation takes effect on the next request: tray → **Unpair all browsers**,
`--revoke-all`, `POST /pair/revoke` (the caller's own token), or uninstalling.

## Printer destinations and protocols

`config.json` `printers` (`lib/destinations.js`) binds each destination to the language
it speaks. **A printer that is not listed receives nothing.**

```json
"printers": {
  "escpos": { "queues": ["POS-80C"], "network": ["192.168.1.50:9100"] },
  "zpl":    { "queues": ["ZDesigner ZD220-203dpi ZPL"], "network": [] }
}
```

| Route | Destination must be |
|---|---|
| `POST /print/escpos`, `POST /print/receipt`, `POST /test-print`, `POST /probe/capabilities` | `escpos` |
| `POST /print/zpl` | `zpl` |

The destination's setting chooses the command policy. Request fields (`protocol`,
`format`, `deviceType`, a `printers` object) are not read. It is set only from the tray
(Printers → a printer → **Receipt printer (ESC/POS)** / **Zebra label printer (ZPL)** /
**Not used by BillBull**), the installer (`/RECEIPTPRINTER=`, `/LABELPRINTER=`) or
`--set-printer` / `--set-network-printer`. `--set-*` first removes every entry for
the same printer, so these never create a conflict.

Identities:

- **Windows queue**: the queue name, matched case-insensitively for ASCII letters only.
  The job goes to the **configured** spelling. Names containing a comma, control
  characters, leading/trailing spaces, non-NFC Unicode, or a backslash outside
  `\\server\printer` are refused (400) and ignored in setup.
- **Network printer**: IP literal and port (`192.168.1.60:9100`, `[fd00::5]:9100`).
  The requested address is resolved and approved by the LAN policy first; then the
  resolved address and port must be set up. Host names are not accepted in setup.
- A queue and a network address are separate identities, even for one physical printer.

Fail closed:

| Situation | Result |
|---|---|
| No `printers` section (every 0.5.x/0.6.0 config), or destination not listed | 403 `AGENT_DESTINATION_NOT_CONFIGURED`; the message names the setup command |
| Name only matches under Unicode case or compatibility folding | 403 `AGENT_DESTINATION_AMBIGUOUS` |
| Listed under both kinds, under an unknown kind, or two names Windows may treat as one queue listed as different kinds | 409 `AGENT_DESTINATION_CONFLICT` |
| `printers` malformed, or `config.json` repeats a JSON key anywhere | Nothing is trusted |
| Invalid entries | Ignored; reported by `--list-printers`, the agent log and the tray |
| Route disagrees with the destination | 409 `{ code: "AGENT_PROTOCOL_MISMATCH", protocol, destinationProtocol, destination }` |

A refusal never falls back to another route, another printer or a laxer parser.
`GET /printers` reports each queue's setup read-only as `BillBullProtocol`: `"escpos"`,
`"zpl"`, `"conflict"`, or `null` for not set up.

**Upgrading from 0.5.x/0.6.0:** nothing is migrated, because neither version recorded
which printer speaks which language. Every printer must be set up once per PC, or every
print is refused.

## Commands

The job is walked command by command against the destination protocol's
**allow-list**. A refusal is 403
`{ code: "AGENT_COMMAND_FORBIDDEN", protocol, category, command, offset, message }`
and sends nothing.

### ESC/POS (`lib/escposPolicy.js`)

Arguments and image/QR/barcode data are skipped by their declared lengths, so a logo
containing `1B 70` is not a drawer pulse.

| Allowed | Refused |
|---|---|
| Text and formatting; raster logo (`GS v 0`, `ESC *`); QR (`GS ( k`); barcode (`GS k`); print-buffer/RAM graphics (`GS ( L`, `GS 8 L`, except fn 65–68) | **Drawer** (`DRAWER`): `ESC p`, `DLE DC4 1`, Star-mode `BEL`, `SUB`, `ESC BEL`, `FS` |
| Feed (`ESC d`, `ESC J`), cut (`GS V`, `ESC i`, `ESC m`) | **Buzzer** (`BUZZER`): `ESC B`, `ESC ( A`, `DLE DC4 3` |
| Status requests (`DLE EOT`, `DLE ENQ`, `GS r`, `GS I`) | **Power off** (`POWER`): `DLE DC4 2` |
| `^` and `~` anywhere: they are text to a receipt printer ("Gift Box~Deluxe" prints) | **Non-volatile writes** (`NV_WRITE`): `GS ( C`, `GS ( E`, `GS ( M`, NV graphics (`GS ( L` / `GS 8 L` fn 65–68) |
| | **Hardware** (`HARDWARE_CONFIG` / `_CONTROL`): `ESC c`, `ESC =`, `GS ( A`, `GS ( D` |
| | Any other command (`UNKNOWN`); a job ending mid-command (`INCOMPLETE`); a strict real-time pulse or power-off inside data (`DLE DC4 1 m t`, `DLE DC4 2 1 8`) |

The agent refuses drawer pulses from every caller. With the agent, a drawer opens only
if the printer or its Windows driver is set to kick on every print, which is outside
BillBull.

### ZPL (`lib/zplPolicy.js`)

The job must be one or more complete `^XA … ^XZ` formats separated only by whitespace.
Every parameter must match an exact grammar.

| Allowed | Form |
|---|---|
| `^XA`, `^XZ` | no parameters, no nesting |
| `^CI` | `28` only |
| `^PW`, `^LL`, `^LH`, `^LS`, `^PO` (`N`/`I`), `^MM` (`T` only), `^BY` | label setup |
| `^FO` `[^FB]` `[^A<resident font>]` `[^BC]` `[^FH]` `^FD … ^FS` | fields; field data ≤ 3072 bytes, no `~`, no control characters, complete `_XX` escapes |

Refused: **every tilde command**, anywhere, including field data (`~JR` → `POWER`,
`~DY`/`~DG` → `STORAGE`, `~NC`/`~WR` → `NETWORK`, `~HS` → `DEVICE_QUERY`, `~SD` →
`CONFIG_WRITE`, …); `^JU`, `^MD`, `^KN`, `^SC`, `^PR`, … → `CONFIG_WRITE`; `^NC`,
`^NS`, `^WI`, … → `NETWORK`; `^ID`, `^DF`, `^XG`, `^IS`, `^HF`, … → `STORAGE`; `^HH`,
`^HW`, … → `DEVICE_QUERY`; RFID; `^PQ`, `^FX`, `^FN`, `^SN`, `^SF` → `UNSUPPORTED`;
anything else → `UNKNOWN`. Also refused: other parameter values, commands outside a
format, unclosed formats or fields, stray bytes, and any control byte. An allowed ZPL
job therefore carries no ESC/POS control byte either.

## Network targets

`lib/networkPolicy.js`, for `connectionType: NETWORK_IP` on every printing route:

- allowed: private addresses 10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7, on
  ports 9100–9109 (`network.allowedPorts`)
- refused: loopback, link-local (169.254/16, fe80::/10), multicast, broadcast,
  unspecified and public addresses
- the name is resolved once and the socket connects to that address (10 s connect
  timeout); from 0.7.0 the resolved address and port must also be set up

`network.allowLoopback` and `network.allowPublic` exist in `config.json` and default
to `false`. Turning them on weakens the policy.

## Logging and diagnostics

- `%APPDATA%\BillBull\PrintAgent\logs\agent.log`: the running agent's console output.
- `%APPDATA%\BillBull\PrintAgent\logs\cli.log`: every CLI command, its exit code and
  result.
- Each log is capped at 1 MB, with one `.1` generation kept. Bearer tokens, `bbpa_…`
  tokens and pairing codes are redacted before writing.
- Refusals are logged as `[security] <status> <code> <method> <path> origin=… host=…`,
  `[security] refused <protocol> job: <code> "<destination>"` or
  `[security] refused <protocol> job: <command> at <offset> (<category>)`.
- **Diagnostics** (`--diagnostics on`, default off) serves `probe.html` at
  `/diagnostics/probe`, enables `/probe/echo` and `/probe/capabilities`, and saves
  every ESC/POS job's bytes to `Desktop\billbull-print-capture`. Those files contain
  customer names, phone numbers and totals. A token is still required. Switch it off
  after the investigation.

## CLI

`lib/cli.js`. Commands edit `%APPDATA%\BillBull\PrintAgent` (or
`BILLBULL_PRINT_AGENT_HOME`), and a running agent picks changes up on its next request.

```
BillBullPrintAgent.exe --add-origin https://<tenant>.billbull.app
BillBullPrintAgent.exe --remove-origin <address>
BillBullPrintAgent.exe --list-origins
BillBullPrintAgent.exe --list-pairings          # ids, sites, dates; never tokens
BillBullPrintAgent.exe --revoke-all
BillBullPrintAgent.exe --diagnostics on|off
BillBullPrintAgent.exe --set-printer "<Windows printer>" escpos|zpl
BillBullPrintAgent.exe --remove-printer "<Windows printer>"
BillBullPrintAgent.exe --set-network-printer <ip>:<port> escpos|zpl
BillBullPrintAgent.exe --remove-network-printer <ip>:<port>
BillBullPrintAgent.exe --list-printers
BillBullPrintAgent.exe --status [--wait <ms>]   # --wait at most 600000
BillBullPrintAgent.exe --stop
BillBullPrintAgent.exe --help
(any command) --out <file>
```

| Exit | Meaning |
|---|---|
| 0 | Success |
| 1 | `--status`: this version is not running |
| 2 | Refused: unknown command, invalid origin/kind/name/address, bad `--wait`, damaged `config.json` (never rewritten) |
| 5 | `--stop`: an agent is still running |

The packaged exe is a windowed program, so a plain Command Prompt shows no output. To
see output, pipe it (`| more`), use `--out <file>`, or read `cli.log`. For the exit
code, use `start /wait "" BillBullPrintAgent.exe … & echo %ERRORLEVEL%`. No command
prints a token. With no arguments the exe starts the agent; an unknown option is
refused rather than starting a second agent.

`--stop` writes a stop request that a 0.7.0 agent honours within about a second,
finishing in-flight requests (up to 8 s). After a 6 s grace period it ends any
`BillBullPrintAgent.exe` still running **in the current Windows session**
(`taskkill /F /PID`, never its own process). **Never run `--stop`, or the installer,
on a developer PC that has the agent installed**: it ends the installed agent too.

Headless `node server.js` exits 3 if this version is already running on the port and
4 if the port is unavailable. The tray build instead shows **NOT RUNNING** and retries
every 15 s, with **Retry now** in the menu. Neither ends another program holding the port.

## Installer

`installer/BillBullPrintAgent.iss` (`AppVersion` 0.7.0, per-user,
`PrivilegesRequired=lowest`):

- Before replacing files, setup runs the new exe's `--stop`. If the agent cannot be
  stopped, setup changes nothing and exits **7**.
- Values from the wizard or `/ORIGIN=`, `/RECEIPTPRINTER=`, `/LABELPRINTER=` are added
  through the CLI. Empty fields keep the current setup. Upgrades never touch
  `config.json` or `tokens.json`.
- Afterwards it starts the agent (also when `/VERYSILENT`) and runs
  `--status --wait 20000`. If the agent is not running, setup exits **10**.
- Uninstall runs `--stop`, then removes the program and `%APPDATA%\BillBull\PrintAgent`.

Silent install:
`BillBullPrintAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /LOG="%TEMP%\bbpa-setup.log" /ORIGIN=https://<tenant>.billbull.app /RECEIPTPRINTER="POS-80C" /LABELPRINTER="ZDesigner ZD220-203dpi ZPL"`

The installer and the exe are unsigned, so Windows SmartScreen warns on first run.

## Building a release

`npm run build:installer` writes `dist\` and `installer\output\` in the folder it runs
in, so running it in the repository overwrites whatever build is there. Build a release
from a clean copy into a new, empty release folder:

```
robocopy tools\pos-print-agent <scratch>\pos-print-agent /E /XD dist output node_modules
cd <scratch>\pos-print-agent
npm ci
npx pkg . --targets node18-win-x64 --output dist\BillBullPrintAgent.exe
node make-windowed.js
ISCC.exe /O<new release folder> installer\BillBullPrintAgent.iss
```

Requires Node, Inno Setup 6 (`ISCC.exe`) and the pkg base binary for `node18-win-x64`
(`%USERPROFILE%\.pkg-cache\v3.4\fetched-v18.5.0-win-x64`).
`make-windowed.js` switches the exe to the Windows GUI subsystem so it opens no
console window. Copy `dist\BillBullPrintAgent.exe` into the release folder too, record
the SHA-256 of both exes, and keep a copy of the exact source files used. Run
`npm test` on that copy first: `test/fixtures.test.js` reads
`billbull-backend/src/test/resources/printer-payloads/`, so run the tests from a full
repository checkout. The setup exe is the only file handed to a till.

## Tests

`npm test` runs real agents on ephemeral loopback ports with temporary config folders, a
fake Windows queue and loopback fake printers. No test reaches a physical printer, the
PC's own configuration or a real process. Coverage by file:

- `test/http.test.js`: origins, Host, tokens, pairing, limits, policies over HTTP
- `test/protocolBinding.test.js`: destination rules
- `test/destinations.test.js`: setup table and CLI
- `test/escposPolicy.test.js`, `test/zplPolicy.test.js`: the allow-lists
- `test/fixtures.test.js`: recorded real receipts and labels
- `test/lifecycle.test.js`: ports, `--stop`, `--status`, logs

None of this replaces installation, upgrade, rollback and physical-printer testing,
which are still outstanding for 0.7.0.
