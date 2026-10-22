# Print agent: trust model, installation and rollout

The BillBull Print Agent (`tools/pos-print-agent`) is a Windows tray app that listens on `127.0.0.1:19777` on each till PC. It is the only route from the browser to USB, Bluetooth and Windows-queue printers. Network/IP printers do not use it: they are relayed by the backend (`POST /api/pos/printers/{id}/print/escpos`, see `PERMISSIONS.md`).

**Agent 0.6.0** (2026-10-11) closes the hole recorded in `PERMISSIONS.md`: up to 0.5.3 the agent answered `Access-Control-Allow-Origin: *`, had no authentication, and relayed any bytes. Any web page open on the till could print, open the cash drawer, or write bytes to any `host:port` on the shop LAN.

**Printer command security, all paths** (2026-10-11, same unreleased 0.6.0): the backend relay now enforces an ESC/POS allow-list as strict as the agent's, and Zebra labels are checked by a dedicated ZPL allow-list on both the agent (`POST /print/zpl`) and the backend. The ZPL builder no longer lets product names inject commands. See [Every printer-output path](#every-printer-output-path).

**Agent 0.7.0 — printers bound to their protocol** (2026-10-12, unreleased): each printer the agent may print to is set up on the PC as an ESC/POS receipt printer or a ZPL label printer, and that setting — not the request — decides which command policy a job meets. A job whose route disagrees with the printer is refused before anything is opened. This closes the "agent cannot tell a Zebra queue from a receipt queue" limitation (ZPL hidden in an ESC/POS raster could reach a Zebra) and removes the ZPL substring heuristic that refused receipts such as "Gift Box~Deluxe", on both the agent and the backend. See [Printer destinations and protocols](#printer-destinations-and-protocols).

Status (2026-10-12): implemented and tested on a developer PC with a fake queue, loopback fake printers and recorded real payloads. The 0.7.0 installer **has been compiled** (Inno Setup 6.7.3, from a clean scratch copy) but **has not been installed, upgraded over an older agent, rolled back or deployed** on any machine, and nothing has run on a physical till or a physical Zebra. Release status: **BLOCKED** until the disposable-Windows tests and the hardware checklist pass (see [What has and has not been verified](#what-has-and-has-not-been-verified)).

## Every printer-output path

Raw bytes reach a printer in exactly two places: the backend's socket write in `PosPrinterService.printRaw`, and the agent's `sendBytes` (Windows RAW spooler or TCP socket). Everything else in this table funnels into one of them. Each protection is enforced at the place the bytes leave; neither side relies on the other's checks.

| # | Path | Who builds the bytes | Command policy | Other protections |
|---|---|---|---|---|
| 1 | Browser → agent `POST /print/escpos` (USB, Bluetooth, Windows queue; receipts, thermal invoices, returns, vouchers, reports, printer test page) | `escPosReceipt.js` | **Destination must be set up as `escpos`**, then agent `lib/escposPolicy.js` (ESC/POS allow-list, drawer refused) | Origin, pairing token, LAN policy for a network target |
| 2 | Browser → agent `POST /print/zpl` (USB/queue Zebra; product labels, employee labels, label-printer test page) | `zebraZpl.js`, `zplText.js` | **Destination must be set up as `zpl`**, then agent `lib/zplPolicy.js` (ZPL allow-list) | Same as 1 |
| 3 | Browser → agent `POST /print/receipt`, `POST /test-print` (text/GDI fallback) | The agent itself (`textToEscPosBuffer`, or GDI) | Destination must be set up as `escpos` (text typed as `^XA…` must not reach a Zebra); control characters become `?`; GDI prints glyphs | Same as 1 |
| 4 | Browser → agent `POST /probe/capabilities` (diagnostics only) | The agent itself | Destination must be `escpos`; agent ESC/POS policy (same `sendBytes`) | 404 unless diagnostics is on; token |
| 5 | Browser → backend `POST /api/pos/printers/{id}/print/escpos` (every Network/IP printer: receipts, invoices, labels, test pages) | Same builders as 1 and 2 | **Chosen by the stored printer's `deviceType`**: `LABEL_PRINTER` → `ZplCommandPolicy`, otherwise → `EscPosCommandPolicy`. The optional `format` field never selects the policy | JWT; printer's branch in scope; `PrinterNetworkPolicy` (private LAN, ports 9100–9109, DNS re-checked); a drawer pulse needs `PosDrawerKickAuthorizer` |
| 6 | Print jobs: `POST /api/pos/print-jobs`, dispatch, result, retry, timeout sweep | — | **No bytes reach a printer.** `PosPrintJobService` only records status; nothing reads a job's `payload` back and sends it. Retries are status changes; the browser re-sends through path 1, 2 or 5 | Branch scope, job ownership |
| 7 | Cash drawer `PosCashDrawerController` | — | Never opens a drawer; records kick results only | — |
| 8 | Legacy agents ≤ 0.5.3 | — | **None** (any bytes, any target). Flagged "outdated" in POS → Devices | None — upgrade |

Fallbacks: the only frontend fallback is ESC/POS → text (path 1 → 3) after a 5xx driver failure. A 4xx refusal is never retried as text, and labels have no fallback.

Feed, cut, buzz, drawer, power-off, NV memory: only paths 1, 4 and 5 (ESC/POS) and 2 and 5 (ZPL) can carry such commands, and each is listed under its protocol below.

## Trust boundary

```
BillBull page (https://<tenant>.billbull.app, Retail or /pos/)
   │  fetch http://127.0.0.1:19777/...   Origin: https://<tenant>.billbull.app
   │                                     Authorization: Bearer bbpa_…   (pairing token, localStorage)
   ▼
Print agent 0.7.0  (per Windows user, %LOCALAPPDATA%\Programs\BillBull\PrintAgent)
   1. peer is loopback                     else 403 AGENT_REMOTE_REJECTED
   2. Host is 127.0.0.1:19777 / localhost   else 421 AGENT_HOST_REJECTED     ← DNS rebinding stops here
   3. Origin on the allow-list (exact)      else 403 AGENT_ORIGIN_NOT_ALLOWED, no CORS headers
   4. token issued to that origin           else 401 AGENT_AUTH_REQUIRED / _TOKEN_INVALID / _EXPIRED / _REVOKED
   5. application/json, ≤ 4 MB              else 415 / 413
   6. network target passes the LAN policy  else 400 AGENT_PRINTER_ADDRESS_REFUSED
   7. destination is set up on this PC      else 403 AGENT_DESTINATION_NOT_CONFIGURED / _AMBIGUOUS,
      (queue name, or resolved IP:port)          409 AGENT_DESTINATION_CONFLICT
   8. its protocol matches the route        else 409 AGENT_PROTOCOL_MISMATCH (nothing sent)
      (/print/escpos, text, probes → escpos; /print/zpl → zpl)
   9. raw bytes pass that protocol's        else 403 AGENT_COMMAND_FORBIDDEN (nothing sent)
      allow-list
   ▼
Win32 spooler RAW (OpenPrinter/WritePrinter)  or  TCP socket to an approved LAN address
   ▼
Printer → drawer kick port / cutter / buzzer
```

CORS (step 3) only stops a hostile page from *reading* responses, so it is not what authorizes a print. The token is: a page on another origin cannot read `localStorage` for the BillBull origin, and it cannot get its own token without the pairing code shown on the till's screen.

What is trusted: the BillBull origin's JavaScript (anything that runs there, including an XSS, can use the token), the Windows user account the agent runs under, and the local admin. Out of scope: malware already running as that user. It can read the browser profile and talk to the printer directly without the agent.

## Endpoints

| Route | 0.5.3 | 0.6.0 |
|---|---|---|
| `GET /health` | open, `ACAO: *` | Open (Host check; an Origin, if sent, must be trusted). Returns `version` and `protocol: 2` only |
| `GET /printers` | open | token |
| `POST /print/escpos` (raw bytes) | open, any bytes, any `ip:port` | token + ESC/POS allow-list + LAN policy |
| `POST /print/zpl` (Zebra labels) | — (labels went through `/print/escpos` unfiltered) | token + ZPL allow-list + LAN policy |
| `POST /print/receipt`, `POST /test-print` (text) | open, any `ip:port` | token + LAN policy. The agent builds the bytes, and control characters become `?` |
| `POST /print/label/zebra` | open, proxied any ZPL to Zebra Browser Print | **Removed.** No caller. Labels go through `/print/zpl` |
| `POST /probe/echo`, `POST /probe/capabilities` | open | 404 unless diagnostics is on; then token + the same policies |
| `GET /diagnostics/probe` | — | Diagnostics only: serves `probe.html` from the agent |
| `POST /pair/start`, `POST /pair/complete` | — | Trusted origin + the code shown on the till |
| `GET /auth/status`, `POST /pair/revoke` | — | token |

There is no HTTP endpoint that changes configuration. Trusted sites, printer setup, revocation and diagnostics are set only on the PC: through the CLI, `config.json`, the installer or the tray menu. From 0.7.0 every printing route additionally requires a destination set up for its protocol (next section), and `GET /printers` reports each queue's setup read-only (`BillBullProtocol`).

## Printer destinations and protocols

**How the protocol is assigned.** `config.json` holds a `printers` section (`tools/pos-print-agent/lib/destinations.js`):

```json
"printers": {
  "escpos": { "queues": ["POS-80C"], "network": ["192.168.1.50:9100"] },
  "zpl":    { "queues": ["ZDesigner ZD220-203dpi ZPL"], "network": ["192.168.1.60:9100"] }
}
```

A destination listed under `escpos` is a receipt printer: only `/print/escpos`, `/print/receipt`, `/test-print` and `/probe/capabilities` may print to it, and the bytes meet the ESC/POS allow-list. A destination listed under `zpl` is a Zebra: only `/print/zpl` may print to it, and the bytes meet the ZPL allow-list. The route says what the caller *believes* it is sending; it never selects the policy. Request fields such as `protocol`, `format`, `deviceType` or a `printers` object are not read. The policy that runs is always the destination's.

**Who can set it.** Only someone on the PC: the tray menu (**Printers** → a printer → *Receipt printer (ESC/POS)* / *Zebra label printer (ZPL)* / *Not used by BillBull*), the installer's Printers page, the CLI, or editing `config.json`. All of these write the same file. A web page cannot: there is no HTTP route that writes it, and a paired token does not change that.

```
BillBullPrintAgent.exe --set-printer "POS-80C" escpos
BillBullPrintAgent.exe --set-printer "ZDesigner ZD220-203dpi ZPL" zpl
BillBullPrintAgent.exe --set-network-printer 192.168.1.60:9100 zpl
BillBullPrintAgent.exe --remove-printer "POS-80C" | --remove-network-printer <ip>:<port>
BillBullPrintAgent.exe --list-printers
```

`--set-*` first removes every entry for the same printer (including spellings Windows might treat as the same queue), so the CLI and the tray never create a conflict.

**Trusted identities.**

| Destination | Identity | Matching |
|---|---|---|
| Windows queue (USB, Bluetooth paired as a printer, Windows/driver queue, `\\server\printer`) | The queue name | Case-insensitive for ASCII letters only, as Windows compares queue names. The job is sent to the **configured** spelling, never the caller's. Names with a comma (`POS-80C,Job 5`, `,XcvPort …` are OpenPrinter syntax for something other than a queue), control characters, leading/trailing spaces, non-NFC Unicode, or a backslash outside `\\server\printer` are refused (400) in requests and ignored in setup |
| Network printer | IP literal + port (`192.168.1.60:9100`, `[fd00::5]:9100`) | The caller's address is resolved and approved by the LAN policy first, then the **resolved** address (IPv4-mapped IPv6 unmapped, IPv6 canonicalised) and port must be set up. Host names are not accepted in setup, so DNS cannot move a trusted identity |

A queue and a network address are separate identities: asking for the same physical printer by IP instead of by queue name needs its own setup. `connectionType` only selects which identity the request names.

**Missing, conflicting or unsupported setup — fail closed.**

| Situation | Result |
|---|---|
| No `printers` section (every 0.5.x/0.6.0 configuration), or the destination is not listed | 403 `AGENT_DESTINATION_NOT_CONFIGURED`; the message names the exact `--set-printer` / `--set-network-printer` command |
| The requested name only matches a set-up name under Unicode case or compatibility folding (`STRASSE` vs `Straße`, full-width letters) | 403 `AGENT_DESTINATION_AMBIGUOUS` — Windows might treat them as one queue, the agent does not guess |
| The same destination is listed under both kinds; listed under an unknown kind (`"zlp"`); or two names that might be one Windows queue are listed as different kinds | 409 `AGENT_DESTINATION_CONFLICT` for every protocol, until fixed. Other printers are unaffected. Duplicates of the *same* kind are harmless |
| `printers` is not an object of `{ queues, network }` lists | Nothing is trusted (403 `AGENT_DESTINATION_NOT_CONFIGURED`) |
| `config.json` repeats a JSON key anywhere | Nothing is trusted: a file whose meaning depends on the reader is not a trust decision |
| Invalid entries (bad names, host names, bad ports) | Ignored, each reported by `--list-printers`, in the agent log and as a count in the tray |

A refusal never falls back to raw printing, text printing, another printer or a laxer parser.

**How a mismatch is reported.** 409 `{ code: "AGENT_PROTOCOL_MISMATCH", protocol: <route>, destinationProtocol: <setup>, destination, message }`, e.g. `"ZD220" is set up as a label printer (ZPL), but this job is for a receipt printer (ESC/POS). Nothing was sent.` Logged as `[security] refused <protocol> job: AGENT_PROTOCOL_MISMATCH "<destination>"`. Every destination error is a 4xx, so `localPrintAgent.js` surfaces the message and never retries as text.

**Why the ZPL heuristic is gone.** 0.6.0 searched receipt text, QR and barcode data for `^XA` or `~` + a ZPL tilde code, because a Zebra queue looked like any other queue. That refused real receipts ("Gift Box~Deluxe" contains `~DE`) and still missed ZPL inside raster blocks. Now the ESC/POS walker reads bytes only the way an ESC/POS printer does — `^` and `~` are characters — and ZPL can only reach a printer set up as `zpl`, through the ZPL allow-list. The backend made the same change: it already chose the policy from the stored printer's `deviceType`, and `format` can only cause a `PROTOCOL_MISMATCH`.

**Upgrading from 0.5.x or 0.6.0.** Neither version recorded which printer speaks which language (0.5.3 has no `config.json`; 0.6.0's holds only origins, token lifetime, diagnostics, body limit and network policy). Printer and driver names do not identify the protocol unambiguously — a Zebra and a receipt printer can both use "Generic / Text Only" — so **nothing is migrated automatically** and no discovered printer is trusted. Existing settings are kept untouched. Until a printer is set up, every print to it is refused with the setup command in the message, and the agent logs a startup warning. One-time setup per till, any of:

1. The installer's **Printers** page: receipt printer and Zebra label printer by their Windows names (silent: `/RECEIPTPRINTER="POS-80C" /LABELPRINTER="ZDesigner ZD220-203dpi ZPL"`). Empty fields keep the current setup.
2. The tray menu → Printers → the printer → its kind.
3. The CLI commands above.

**Label printing resumes only after the Zebra's queue is set up as `zpl`** on each PC that prints labels. POS → Devices → **Load Workstation Printers** shows each queue's setup ("Not set up in the print agent on this PC" when missing).

## Pairing

1. In BillBull: **POS → Devices → Local Print Agent → Pair this PC**. The browser calls `/pair/start`.
2. The agent shows a 6-digit code in a tray notification and as the first line of the tray menu. It is valid for 2 minutes. The code is never sent over HTTP.
3. The operator types the code into BillBull, which calls `/pair/complete` and stores the token in `localStorage['billbull.printAgent.token']`.

Limits: 5 wrong codes kill the attempt, and 5 pairing starts per minute per agent. A new start from the same origin replaces the previous one. A token is bound to the origin that paired it, so a token from tenant A is invalid for tenant B even on the same PC.

Retail and `/pos/` share an origin, so one pairing serves both, including Retail label and thermal-invoice printing. Each browser profile pairs separately (Chrome and Edge on the same till are two pairings). A Retail-only user who cannot open the POS console needs someone with POS access to pair that browser once.

Storage: `%APPDATA%\BillBull\PrintAgent\tokens.json` holds SHA-256 hashes of tokens, never the tokens. Lifetime: `tokenTtlDays` (default 180). When it expires, the till gets `AGENT_TOKEN_EXPIRED` and must be paired again.

Revocation and rotation:

- the tray menu "Unpair all browsers"
- `BillBullPrintAgent.exe --revoke-all`
- **Unpair** in POS → Devices (revokes that browser's token)
- uninstalling, which deletes the folder

Revocation takes effect on the next request without a restart. Pairing again issues a new token.

The agent refuses to pair (503 `AGENT_PAIRING_UNAVAILABLE`) when it has nowhere to show the code: started headless with output redirected to a log. The tray build always has a screen.

## Physical commands

### ESC/POS (agent `lib/escposPolicy.js`, backend `EscPosCommandPolicy`)

The two are the same allow-list in two languages; the only difference is the drawer (below). The stream is walked command by command, as an **allow-list**. Arguments and image, QR and barcode data are skipped by their declared lengths, so a logo containing `1B 70` is not a drawer pulse. The refusal names the command and its byte offset.

| Operation | Decision | Why |
|---|---|---|
| Text, formatting, raster logo (`GS v 0`, `ESC *`), QR (`GS ( k`), barcode (`GS k`), print-buffer graphics (`GS ( L` fn 48–52, 64, 69, 80–85, 112, 113) | Allowed with a token | What receipts, invoices, vouchers, reports and labels are made of |
| Feed (`ESC d`, `ESC J`), cut (`GS V`, `ESC i`/`m`) | Allowed with a token | Every receipt ends with them. Abuse costs paper, which any authorized print can waste anyway. Bounded by the 4 MB body limit |
| Status requests (`DLE EOT`, `DLE ENQ`, `GS r`, `GS I`) | Allowed | Read-only |
| **Drawer pulse** (`ESC p`, `DLE DC4 1`) | Agent: **refused for everyone**. Backend: allowed only for `PosDrawerKickAuthorizer` (till permission, branch, open session); a malformed pulse is refused | See below |
| Star-mode drawer drives (`BEL`, `SUB`, `FS`, `ESC BEL`) | Refused on both | Not used |
| `^` and `~` anywhere (text, QR, barcode, raster), including sequences that spell ZPL (`Gift Box~Deluxe`, `^XA`, `~JR`) | Allowed on both since 0.7.0 (was `FOREIGN_PROTOCOL`) | Characters to a receipt printer. Keeping ZPL away from Zebras is the destination's job: an ESC/POS job never reaches a printer set up (agent) or stored (backend) as a label printer |
| **Buzzer** (`ESC B`, `ESC ( A`, `DLE DC4 3`) | Refused | Not used by BillBull |
| **Power off** (`DLE DC4 2`) | Refused | Not used |
| **Non-volatile writes** (`GS ( E` memory switches, `GS ( C`, `GS ( M`, NV graphics define/delete, `FS q`) | Refused | They persistently reconfigure the printer |
| Hardware config (`ESC c` panel/sensors, `ESC =`, `GS ( D`, `GS ( A`) | Refused | Not used |
| Any other command | Refused (`UNKNOWN`) | Without its length the walker cannot tell later commands from data |
| A job ending part-way through a command | Refused (`INCOMPLETE`) | The printer would finish it with the next job's first bytes. `…ESC` followed by a job starting `p 0 25 250` is a drawer pulse that neither job contains |
| Strict real-time pulse or power-off inside image data (`DLE DC4 1 m t`, `DLE DC4 2 1 8`) | Refused | Printers can act on real-time commands inside data blocks. The match is strict, so a false positive is about 1 in 10⁹ positions (same rule as the backend) |
| Printer discovery (`/printers`) | Token | Printer and driver names are not public |
| Configuration | No HTTP surface | CLI, `config.json` or the tray, on the PC |

The frontend contract test `packages/shared/src/utils/__tests__/escPosAgentPolicy.contract.test.js` loads the agent's own `escposPolicy.js` and runs every builder in `escPosReceipt.js` through it: plain text, document with barcode, test page, full receipt with QR, and a canvas raster whose bytes spell `1B 70 00 19 FA`. If someone adds a command to the receipt builder without adding it to the agent, that test fails before any till does.

**Shared real payloads.** `src/utils/__tests__/printerPayloadFixtures.test.js` (frontend) builds 11 real payloads with the production builders — 80 mm receipt with QR, 58 mm receipt, plain text, credit voucher with Code 39, a canvas receipt whose raster spells `ESC p`, `^XA` and `~JR`, four product-label variants (including names carrying `^ ~ _ \`, Arabic and control characters), the employee label and the label test page — checks each against its own protocol's agent policy (and each receipt against the ZPL policy, which must refuse it), and pins them in `billbull-backend/src/test/resources/printer-payloads/` (marked `binary` in `.gitattributes`). The backend (`PrinterPayloadFixturesTest`) and the agent (`test/fixtures.test.js`) run the same files through their own policies. The agent also prints each one over HTTP, byte for byte, to a fake queue and a fake TCP printer **set up for its protocol**, and sends each to a destination of the other protocol on both routes: the own route gets `AGENT_PROTOCOL_MISMATCH`, a receipt on the label route meets the ZPL policy and is refused, and nothing reaches the Zebra. A label is printable text to the ESC/POS walker, so cross-protocol protection comes from the destination, not from the walkers. Regenerate after an intended builder change with `UPDATE_PRINTER_FIXTURES=1 npx vitest run src/utils/__tests__/printerPayloadFixtures.test.js`.

### ZPL (agent `lib/zplPolicy.js`, backend `ZplCommandPolicy`)

Built from the commands BillBull's label builders actually emit (`src/utils/zebraZpl.js` for product and employee labels, `packages/shared/src/utils/zplText.js` for the label-printer test page). The whole job must be one or more complete `^XA … ^XZ` formats separated only by whitespace.

| Command | Allowed form | Used for |
|---|---|---|
| `^XA`, `^XZ` | no parameters; no nesting | Label start/end |
| `^CI` | `28` only | UTF-8 text |
| `^PW`, `^LL` | 1–5 digits | Label width/length |
| `^LH` | `x,y` | Label home |
| `^LS` | signed integer | Label shift |
| `^PO` | `N` or `I` | Orientation |
| `^MM` | `T` only | Tear-off mode |
| `^BY` | `w[,ratio[,h]]` | Barcode defaults |
| `^FO` | `x,y[,0-2]` — opens a field | Field origin |
| `^FB` | `w,lines,spacing,L/C/R/J,indent` | Text block |
| `^A<font>` | resident font `0-9A-Z`, `N/R/I/B[,h[,w]]` | Font |
| `^BC` | Code 128 parameters | Barcodes |
| `^FH` | default `_` indicator only | Hex escapes |
| `^FD … ^FS` | ≤ 3072 bytes; no `~`, no control characters; `_XX` escapes must be complete | Field data |

Refused, by category: **every tilde command** (`~JR` restart → `POWER`; `~DY`/`~DG` downloads → `STORAGE`; `~NC`/`~WR` → `NETWORK`; `~HS`/`~WC` → query/control; `~CC`/`~SD` → config), anywhere in the job including field data; `^JU`/`^MD`/`^KN`/`^SC`/`^PR`/… → `CONFIG_WRITE`; `^NC`/`^NS`/`^WI`/… → `NETWORK`; `^ID`/`^DF`/`^XG`/`^IS`/`^IM`/`^HF`… → `STORAGE`; `^HH`/`^HW`… → `DEVICE_QUERY`; RFID commands; `^PQ`, `^FX`, `^FN` → `UNSUPPORTED`; anything else → `UNKNOWN`; other parameter values (`^CI0`, `^MMC`, `^A@`) → `MALFORMED`/`UNKNOWN`; commands outside a format → `OUTSIDE_FORMAT`; a missing `^XZ`, an unclosed field or a cut-short command → `INCOMPLETE`; nested formats, data without `^FO`, a field without data, stray bytes → `MALFORMED`; any control byte (ESC, BEL, …) → `CONTROL_CHARACTER`. An allowed ZPL job therefore contains no ESC/POS control byte either.

**Field-data injection (fixed).** `zebraZpl.js` used to escape `^` and `~` with a backslash, which ZPL does not honour: a product named `Shirt^JUF` was printed as `^FDShirt\^JUF^FS`, which ends the field and factory-resets the printer, and `~JR` in any name restarted it. Field data is now written with `^FH` hex escapes (`^` → `_5E`, `~` → `_7E`, `_` → `_5F`, control characters → space; a backslash is still doubled inside `^FB` text blocks, where `\\` prints one). Both policies would refuse the old output (`fieldDataCannotBreakOutOfItsField`, "field data cannot break out of its field"). Side effect: a barcode value containing `\` now encodes one backslash instead of two (the old doubling was a bug outside `^FB`).

No legacy label template needed a command outside this list. The removed Zebra Browser Print proxy (`/print/label/zebra`) had no remaining caller.

### How a refusal is reported

| Path | Response | Frontend |
|---|---|---|
| Agent, command | 403 `{ code: "AGENT_COMMAND_FORBIDDEN", protocol: "escpos"\|"zpl", category, command, offset, message }` (`protocol` is the destination's); logged as `[security] refused <protocol> job: …` | `PrintAgentError` with `code`, `status`, `category`; never retried as text |
| Agent, destination | 403 `AGENT_DESTINATION_NOT_CONFIGURED` / `AGENT_DESTINATION_AMBIGUOUS`, 409 `AGENT_DESTINATION_CONFLICT` / `AGENT_PROTOCOL_MISMATCH` (`{ protocol, destinationProtocol, destination }`), 400 for a malformed queue name — see [Printer destinations and protocols](#printer-destinations-and-protocols) | Same; the message names the fix |
| Backend | 422 `{ code: "PRINT_COMMAND_REJECTED", protocol: "ESCPOS"\|"ZPL", category, command, offset, message, requestId }`; `PROTOCOL_MISMATCH` when the declared `format` differs from the printer's type; logged at WARN by `GlobalExceptionHandler` | `printPosPrinterEscPos` throws an `Error` with `message`, `code`, `category`, `status` |

The message names the command and byte offset, e.g. "Print job refused: DLE DC4 2 at byte 44 powers the printer off. Nothing was sent to the printer." It contains nothing about the server. Every check (destination, protocol, command policy) runs on the whole job before a socket or spooler handle is opened, so a refused job writes no bytes (asserted against the fake queue, the fake TCP printers and the backend's local socket sink).

### The cash drawer

No BillBull code sends a drawer pulse today (`PERMISSIONS.md`, "How the till actually prints"). The agent therefore refuses every pulse from every caller. That keeps `PosDrawerKickAuthorizer` effective: the agent was the one path around it, and it no longer is.

With the agent, a drawer on a USB or queue printer opens only if the printer or its Windows driver is set to kick on every print. That is a driver setting outside BillBull. The backend relay still opens a drawer on a network printer for a cashier on shift (`PosHardwareControlAuthorizationTest`).

Opening the drawer from software on a cash sale or a manual kick needs a product decision first. Once that is made, the agent should accept a pulse only with a **backend-signed grant**, never because the caller is paired:

1. The browser asks the backend for a grant: `POST /api/pos/cash-drawers/{id}/grant` with the SHA-256 of the exact bytes and the printer name.
2. The backend applies `PosDrawerKickAuthorizer` (till permission, branch, open session), logs the request, and returns `{sha256, printerName, terminal, exp ≤ 30 s, nonce}` signed with a per-tenant Ed25519 key.
3. The agent holds the tenant's public key, installed by the installer next to the trusted origin. It verifies the signature, expiry and single-use nonce, recomputes the hash over the bytes it will send, and only then lets `DRAWER` through, for that job only.

Pairing alone is not enough, because any page script on the BillBull origin holds the pairing token. Tests needed then: a valid grant sends exactly the pulse bytes; a missing, expired, replayed, wrong-hash or wrong-printer grant sends nothing.

## Network targets

`/print/escpos`, `/print/zpl` and the text paths with `connectionType: NETWORK_IP` use the same rule as the backend's `PrinterNetworkPolicy`:

- allowed: private LAN addresses (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7) on ports 9100–9109
- refused: loopback, link-local (169.254/16, which includes cloud metadata), multicast, broadcast, unspecified and public addresses

The name is resolved once and the socket connects to that address. From 0.7.0 that resolved address and port must also be set up (`--set-network-printer`), and its protocol must match the route. The till's own frontend sends raw network jobs to the backend relay; the agent's network path is used by plain-text receipts (`/print/receipt`) and by tests of an unsaved printer.

## Installation and configuration

Files are per Windows user:

- `%LOCALAPPDATA%\Programs\BillBull\PrintAgent\BillBullPrintAgent.exe`: the program
- `%APPDATA%\BillBull\PrintAgent\config.json`: settings
- `%APPDATA%\BillBull\PrintAgent\tokens.json`: hashes of paired browsers' tokens

The installer asks for the **BillBull address**: the exact site this till opens, such as `https://royaltools.billbull.app`. It passes the address to `BillBullPrintAgent.exe --add-origin`, which validates it, and warns if it is rejected.

From 0.7.0 it also asks for the **receipt printer** and the **Zebra label printer** by their Windows names and passes each to `--set-printer` (see [Printer destinations and protocols](#printer-destinations-and-protocols)).

- Silent install: `BillBullPrintAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /LOG="%TEMP%\bbpa-setup.log" /ORIGIN=https://<tenant>.billbull.app /RECEIPTPRINTER="POS-80C" /LABELPRINTER="ZDesigner ZD220-203dpi ZPL"`. Without `/SUPPRESSMSGBOXES` an error still opens a message box and the silent install waits for it.
- Upgrade: the address and printer fields may be left empty to keep what the PC already has. An upgrade from 0.5.x/0.6.0 has no printers yet, so at least the receipt printer must be given here or in the tray.
- Install as the till's own Windows user. Setup is per-user (`PrivilegesRequired=lowest`): run elevated as another account, it installs the program, settings and autostart into that account's profile.

### Install, upgrade and recovery (from 0.7.0)

The agent is one windowed process (`BillBullPrintAgent.exe`, running `tray.js`) plus the tray-icon helper it copies to `%TEMP%`, so only the agent itself holds files under the install folder. It is started at logon by a shortcut in the user's Startup folder (installer task "Start automatically"), never as a service. The listening port is its single-instance lock.

Setup does the same thing interactive and `/VERYSILENT`:

1. **Stop.** Before any file is replaced, `PrepareToInstall` extracts the *new* exe to `{tmp}` and runs `--stop`. That writes `%APPDATA%\BillBull\PrintAgent\stop-request`, which a 0.7.0 agent sees within a second: it stops accepting connections, finishes the requests it is serving (up to 8 s), records "stopped" and exits. Agents before 0.7.0 do not look for the file, so after 6 s the `BillBullPrintAgent.exe` processes **in this Windows session** are ended with `taskkill /F /PID`. Setup's own copy is excluded; no process with another name, and nothing in another session, is ever ended. `--stop` then confirms that no agent answers on `127.0.0.1:19777` and no such process is left.
2. **Abort if it is still running.** If the stop cannot be confirmed within 15 s (a process that will not die, or an agent running as `node tray.js` or in another user's session), setup stops on the "Preparing to Install" page with the reason and exits with **code 7**. Nothing has been replaced, and the agent already installed keeps running.
3. **Replace files, then configure.** `config.json` and `tokens.json` are never touched by an upgrade: trusted sites, printer protocols and pairings carry over. Values entered on the wizard pages (or `/ORIGIN=`, `/RECEIPTPRINTER=`, `/LABELPRINTER=`) are **added** through the CLI; empty fields change nothing. A damaged `config.json` is refused rather than rewritten (`--add-origin` exits 2 and says so), so a typo can never wipe a till's setup.
4. **Start and verify.** Setup starts the new agent as the user who ran it (`ExecAsOriginalUser`), **also when silent**, so no one has to sign out and back in. It then runs `--status --wait 20000` and waits until the agent answers `/health` with this version. If it does not, setup shows (or with `/SUPPRESSMSGBOXES`, only logs) why, and exits with **code 10** instead of 0. The files are installed either way.

Uninstall runs `{app}\BillBullPrintAgent.exe --stop` first, then deletes the program and `%APPDATA%\BillBull\PrintAgent` (settings, pairings, logs and status).

**Port conflicts.** At startup the agent binds `127.0.0.1:19777`. Only after the bind succeeds does it count as running, write `"state": "running"` to `agent-status.json` and answer `/health`; there is no window in which it looks healthy without listening. If the bind fails, it asks the occupant for `/health`:

| Who holds the port | What the new agent does |
|---|---|
| A copy of the same version | Shows "already running" in a notification and exits (code 3). The running copy and its status are left alone |
| An agent of another version | Stays in the tray as **NOT RUNNING**, naming that version and how to quit it, and retries every 15 s |
| Another program, or a listener that does not answer | Same, with `netstat -ano \| findstr :19777` to find it. It never ends that program |
| Nobody, but Windows refuses the port (`EACCES`, an excluded port range) | Same, with the `netsh … excludedportrange` command |

The reason is written to the tray menu, to `agent-status.json` (`"state": "failed"`, a code and a message) and to `logs\agent.log`. The tray offers **Retry now**, **Open log folder** and **Quit**. The headless `node server.js` exits instead of retrying: 3 if it is already running, 4 if the port is unavailable. Messages name ports and versions only, never tokens, printer settings or profile paths. (Windows lets a program bound to `0.0.0.0:19777` coexist with the agent's `127.0.0.1` bind. The agent then receives the loopback traffic, so this is not reported as a conflict.)

**Recovery.**

| What happened | What to do |
|---|---|
| Setup: "could not be stopped" (exit 7) | Nothing was changed. Quit the agent from its tray icon, or end `BillBullPrintAgent.exe` in Task Manager → Details. For a `node tray.js` agent, close it. Then run the same setup again |
| Setup: "installed but is not running" (exit 10) | Read the reason in the message or the setup log. Port conflict: close the other program; the agent retries every 15 s, or choose **Retry now** in its tray menu. Otherwise start it from Start → BillBull Print Agent |
| Setup was killed or the PC lost power mid-upgrade | Run the same setup again. It stops whatever is running and replaces every file. Settings and pairings are not touched |
| Prints fail after a successful upgrade | `BillBullPrintAgent.exe --status \| more` and `--list-printers \| more`; logs in `%APPDATA%\BillBull\PrintAgent\logs`. An upgrade from 0.5.x/0.6.0 needs the one-time printer setup and pairing |

A failed upgrade is never "recovered" by installing an older agent. Rolling back is a separate decision because it removes the origin, pairing and command protections ([Rollback](#rollback)).

`config.json` (every field optional; without `printers`, nothing prints):

```json
{
  "allowedOrigins": ["https://royaltools.billbull.app"],
  "tokenTtlDays": 180,
  "diagnostics": false,
  "maxBodyBytes": 4194304,
  "network": { "allowedPorts": "9100-9109", "allowLoopback": false, "allowPublic": false },
  "printers": {
    "escpos": { "queues": ["POS-80C"], "network": [] },
    "zpl": { "queues": ["ZDesigner ZD220-203dpi ZPL"], "network": [] }
  }
}
```

Origin rules:

- `https://` only, exact scheme, host and port
- no wildcards, paths or subdomain matching: `https://evil.<tenant>.billbull.app` is not trusted because the tenant host is
- plain `http://` only for `localhost` / `127.0.0.1` / `[::1]`, for development: `--add-origin http://localhost:5173` (Retail `npm run dev`) or `http://localhost:5174` (`npm run dev:pos`)
- invalid entries are ignored with a warning
- `BILLBULL_PRINT_AGENT_ORIGINS` (comma-separated) adds origins for a development session without editing the file

CLI. The packaged exe is a windowed program (GUI subsystem). **Typed at a plain Command Prompt it shows nothing**, not even an error. Measured on 2026-10-12: `--list-printers` and an invalid `--set-printer` printed nothing in a new console. At an interactive prompt, `cmd` also does not wait for it, so `%ERRORLEVEL%` is not its exit code. Three supported ways to see results:

- `BillBullPrintAgent.exe --list-printers | more`: a pipe shows the output on screen (PowerShell: `| Out-Host`)
- `--out <file>`: writes the result to a file, e.g. `BillBullPrintAgent.exe --list-printers --out "%TEMP%\bb.txt" & notepad "%TEMP%\bb.txt"`. This is what the installer reads
- `%APPDATA%\BillBull\PrintAgent\logs\cli.log`: every command, its exit code and its result, appended. The tray has **Open log folder**

For the exit code at a prompt use `start /wait "" BillBullPrintAgent.exe … & echo %ERRORLEVEL%`. Exit codes: 0 success; 2 refused (unknown command, bad origin, bad printer kind or name, damaged `config.json`). The installer relies on these two. `--status` returns 1 when this version is not running, `--stop` returns 5 when an agent is still running. An unknown or mistyped option is refused with exit 2; before this change it started a second agent. Output never contains tokens; `--list-pairings` shows ids, sites and dates only. Cashiers should not need the CLI: the tray covers printers, pairing and the log, and support uses the commands above.

```
BillBullPrintAgent.exe --add-origin https://<tenant>.billbull.app
BillBullPrintAgent.exe --remove-origin https://<tenant>.billbull.app
BillBullPrintAgent.exe --list-origins | --list-pairings
BillBullPrintAgent.exe --revoke-all
BillBullPrintAgent.exe --diagnostics on|off
BillBullPrintAgent.exe --set-printer "<Windows printer>" escpos|zpl
BillBullPrintAgent.exe --remove-printer "<Windows printer>"
BillBullPrintAgent.exe --set-network-printer <ip>:<port> escpos|zpl
BillBullPrintAgent.exe --remove-network-printer <ip>:<port>
BillBullPrintAgent.exe --list-printers
BillBullPrintAgent.exe --status [--wait <ms>]
BillBullPrintAgent.exe --stop
(any command) --out <file>
```

Changes reach a running agent on its next request.

**Diagnostics** (off by default) serves `probe.html` at `http://127.0.0.1:19777/diagnostics/probe`, enables `/probe/*`, and saves every job's bytes to `Desktop\billbull-print-capture`. Those files hold customer names, phones and totals, which is why capture is no longer always on. Diagnostics trusts the agent's own origin, and a token is still required. Switch it off after an investigation.

Logs (`%APPDATA%\BillBull\PrintAgent\logs\agent.log` and `cli.log`, 1 MB each plus one `.1` generation) never contain tokens or pairing codes; both are redacted on the way in as a second line of defence. Refusals are logged as `[security] <status> <code> <method> <path> origin=… host=…`.

## Browser requirements

- **Mixed content is not an issue.** An `https://` BillBull page may call `http://127.0.0.1`, because loopback counts as a secure context in Chrome, Edge and Firefox. Use `127.0.0.1` or `localhost`; a LAN IP would be blocked.
- **Local Network Access prompt.** Recent Chrome and Edge ask the user before a public site talks to the local machine ("…wants to access other apps and services on this device"). The cashier must click **Allow** once per site and browser profile. Managed tills can pre-grant it with the `LocalNetworkAccessAllowedForUrls` policy for `https://<tenant>.billbull.app`. This applies to every agent version. If the prompt is denied, the agent shows as "not reachable". The agent also answers the older Private Network Access preflight (`Access-Control-Allow-Private-Network`), and only for trusted origins.
- **Every call from BillBull except `/health` is preflighted**, because it sends `Authorization` and, on POST, `Content-Type: application/json`. The agent grants only `GET`/`POST` with those two headers, and caches the grant for 10 minutes. A preflight never prints.
- **No cookies or credentials mode.** The token is an explicit header, so `Access-Control-Allow-Credentials` is never sent.

## Frontend behaviour (`localPrintAgent.js`)

| Agent state | What BillBull does |
|---|---|
| Not running | `AGENT_UNREACHABLE`: "Start the BillBull Print Agent on this PC" |
| Running, this site not trusted | Detected by an opaque `no-cors` probe. `AGENT_ORIGIN_NOT_ALLOWED` names the exact `--add-origin <this origin>` command |
| < 0.6.0 (no `protocol` in `/health`) | Prints as before. A console warning, and POS → Devices shows **outdated** with the version. No token is sent, so a rolled-back till keeps printing |
| 0.6.0, not paired / token rejected | 401 with the agent's message ("Pair it in POS → Devices → Local Print Agent"). A rejected token is cleared, and POS → Devices offers **Pair this PC** |
| Command refused | `AGENT_COMMAND_FORBIDDEN` with the command and category |
| 0.7.0, printer not set up / mismatched / conflicting | `AGENT_DESTINATION_NOT_CONFIGURED` (message names the `--set-printer` command), `AGENT_PROTOCOL_MISMATCH`, `AGENT_DESTINATION_AMBIGUOUS`, `AGENT_DESTINATION_CONFLICT`. POS → Devices → **Load Workstation Printers** shows each queue's setup |

A 4xx from the agent is never retried through the text/GDI fallback. That fallback is for drivers that reject RAW, and it would hide the reason. A 500 (driver failure) still falls back as before.

## Compatibility

| | Agent ≤ 0.5.3 | Agent 0.6.0 |
|---|---|---|
| **Frontend before this change** | Works, insecure | **Breaks.** Old frontend sends no token, and every print gets 401 |
| **Frontend with this change** | Works, insecure, flagged "outdated" | Works after pairing |

So **the frontend ships first**, then agents are upgraded till by till. The new agent never accepts unauthenticated prints, and there is no compatibility switch.

0.7.0 needs no frontend change to print (the request contract is unchanged; the "set up" line in POS → Devices is the only addition and is hidden for older agents). It does need **each till's printers set up** during the upgrade, or that till stops printing with a clear message. There is no compatibility switch for this either.

Labels: the new frontend sends labels to `/print/zpl` on a 0.6.0 agent and to the old `/print/escpos` on a ≤ 0.5.3 agent (which has no ZPL route and filters nothing). The backend command policy ships with the backend and needs no agent change. One behaviour change on the backend: an ESC/POS test page sent by an **old** frontend to a network `LABEL_PRINTER` is now refused with 422 (it never printed anything on a Zebra); the new frontend sends a ZPL test label instead. Backend and frontend should therefore deploy together.

## Rollout

1. Deploy the frontend to QA, then to tenants. Nothing changes on tills still running 0.5.x, apart from the "outdated" notice in POS → Devices.
2. Build the release as described in [Building a release](#building-a-release): from a clean copy, never in place. Record the SHA-256 of `BillBullPrintAgentSetup.exe` and `BillBullPrintAgent.exe`.
3. Run the disposable-Windows checklist (`RELEASE_READINESS.md`, "Phase 3"): fresh install, interactive and silent upgrades from 0.5.3 and 0.6.0 **with the old agent running**, a port held by another program, an agent that will not stop, and the rollback. Nothing below starts until it passes.
4. **One test till per tenant**, with the cashier and someone from BillBull present:
   1. Install with the tenant address, the receipt printer and (if the till prints labels) the Zebra label printer.
   2. In the tray, check the version reads 0.7.0, the trusted site is correct, and under Printers the receipt printer shows "Receipts (ESC/POS)" and the Zebra "Labels (ZPL)".
   3. Pair from `/pos/`, then open `/sales/pos` and confirm it is already paired.
   4. Run `HARDWARE_CHECKLIST.md` items 4–8, 16 and 17, plus the new agent items. Note especially: device discovery (**Load Workstation Printers**), a USB receipt, the printer test page, a Retail thermal invoice and a label.
   5. Leave the till trading for one business day.
5. Upgrade the remaining tills of that tenant. Each needs the one-time printer setup (installer Printers page or tray → Printers) and pairing once per browser profile. Budget a few minutes per till.
6. Later, a frontend release may refuse to print through an agent below 0.6.0. That needs all tills upgraded first: there is no visibility of agent versions across a tenant today.

### Building a release

`npm run build:installer` writes into `dist\` and `installer\output\` of the folder it runs in. Building in the repository therefore overwrites whatever setup is there, and on 2026-10-12 that was the only copy of the historical rollback installer. Build from a clean copy instead, into a new, empty release folder:

```
robocopy tools\pos-print-agent <scratch>\pos-print-agent /E /XD dist output node_modules
cd <scratch>\pos-print-agent
npm ci
npx pkg . --targets node18-win-x64 --output dist\BillBullPrintAgent.exe
node make-windowed.js
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" /O<new release folder> installer\BillBullPrintAgent.iss
```

Requires Node, Inno Setup 6.7.3 and the cached pkg base binary (`%USERPROFILE%\.pkg-cache\v3.4\fetched-v18.5.0-win-x64`). Copy `dist\BillBullPrintAgent.exe` into the release folder as well, and record both SHA-256 hashes. The release folder must not contain an earlier release.

### Rollback

**Rollback candidate: not verified.** Two 0.5.3 candidates exist, both kept in the 0.7.0 release folder under `rollback-candidate-0.5.3\` (exact path and evidence: `RELEASE_READINESS.md`):

| Candidate | Setup SHA-256 | Agent SHA-256 | What is known |
|---|---|---|---|
| The 2026-07-05 build (original) | `cac0483a…7eb39ba2` | `9670d309…16616189` | Embedded `package.json` says 0.5.3; Inno metadata says 0.4.0. Built before 0.5.3 was committed (2026-07-06 10:32). Its `server.js` bytecode differs in size from every build of the committed source and matches a variant that has only one of the two `connectionType` routing guards. So it is **not** the committed 0.5.3 |
| `rebuilt-from-cbb09be9\` (2026-10-12) | `00b89eac…66d72d8c` | `7d5f2998…bd9f` | Built from commit `cbb09be9`, whose agent folder is identical to the last committed 0.5.3 tree (`e0c82ece` ↔ `cbb09be9` differ only in `probe.html`, which 0.5.3 did not package). Inno metadata also says 0.4.0, because the 0.5.3 `.iss` was never bumped. **Preferred**, but no one has installed it yet |

Neither has been installed over a running 0.7.0. That test is pending on a disposable Windows machine, and until it passes there is no verified rollback.

Procedure (per till), once verified:

1. Stop 0.7.0 first: tray → Quit, or `"%LOCALAPPDATA%\Programs\BillBull\PrintAgent\BillBullPrintAgent.exe" --stop`. The 0.5.3 installer has no stop step, so it would otherwise depend on Restart Manager closing a windowless process.
2. Run the 0.5.3 setup. The Inno `AppId` is unchanged, so it installs in place. Add/Remove Programs will say 0.4.0.
3. Start it (Start → BillBull Print Agent). A silent 0.5.3 install does not start it.
4. Check `http://127.0.0.1:19777/health` reports 0.5.3. POS → Devices shows "outdated", and printing resumes with no token.

**This is a security downgrade.** Any web page can print and pulse the drawer again, and any host:port on the LAN can be reached. `%APPDATA%\BillBull\PrintAgent` (sites, printers, pairings) is left in place and ignored by 0.5.x. Rolling forward again reuses it, including pairings that have not expired.

## Known limitations

- **The setup is only as right as the person who made it.** A Zebra set up as `escpos` on a till (agent) or stored as a receipt printer (backend `deviceType`) receives ESC/POS jobs, and the ESC/POS walker no longer looks for ZPL in them, so ZPL typed into a receipt or hidden in a logo would run on that Zebra. Setting up a printer needs someone at the till (agent) or `pos.printers` edit permission (backend); neither is reachable by a web page or a pairing token. Set label printers up as `zpl`, and check the tray / POS → Devices after installing.
- **Every till must be set up on upgrade to 0.7.0.** No earlier version recorded printer protocols, so there is nothing to migrate; tills upgraded without the Printers page or the tray step refuse every print (with the fix in the message).
- **A renamed Windows queue is a new printer.** It is refused until it is set up again under the new name.
- **One physical printer, two identities.** A printer reachable both as a queue and by IP is two destinations; each must be set up, and nothing prevents setting them to different kinds (each still gets only its own protocol).
- **The ZPL allow-list is BillBull's current labels only.** `^PQ` (quantity), `^MM` modes other than tear-off, `^CI` other than 28, downloaded fonts/graphics (`^A@`, `^XG`, `~DG`) and serialisation (`^SN`/`^SF`) are refused. A future template needing them must add them to both policies and the fixtures.
- **Not tested on hardware.** No physical ESC/POS printer or Zebra has run these payloads since the change; the `^FH` escaping and `^FH`-before-`^FD` placement follow the ZPL II manual but need one label print per printer model (`HARDWARE_CHECKLIST.md` A8–A10).
- **Windows driver behaviour.** A driver set to "open drawer on print" kicks on every job, including text and GDI jobs. That is configuration on the till, outside BillBull.
- **Same-user malware** can read the browser's token or drive the spooler itself.
- **An XSS on a BillBull origin** can print, though still not open the drawer, buzz or rewrite the printer.
- **The installer and the packaged exe are unsigned** (SmartScreen warning, as before).
- **Upgrade and rollback are untested on Windows.** The stop/start/verify steps are covered by automated tests with simulated processes and by a packaged-exe run on a developer PC (scratch config and port). No installer has been executed.
- **`--stop` ends every `BillBullPrintAgent.exe` in the session.** On a till there is one. On a developer PC that runs other copies (a test build, the installed agent), `--stop` and setup end those too.
- **Parallel implementations.** The ESC/POS and ZPL policies exist in JavaScript (agent) and Java (backend), plus the older `EscPosDrawerKick` kept as a second drawer detector. The shared fixtures run every real payload through all of them, but a rule added to one language must be added to the other by hand; the policy unit tests mirror each other.

## What has and has not been verified

| Level | Covers | Status |
|---|---|---|
| Automated tests (agent, frontend, backend) | Policies, pairing, origins, destinations, lifecycle logic, CLI exit codes | Pass (see [Tests](#tests)) |
| Source-level / packaged-exe checks on a developer PC | Installer compiles (0 warnings). Packaged exe on a scratch config folder and port: CLI exit codes, `--out`, `cli.log`, damaged config refused; tray waits on a held port, recovers when it is freed, a duplicate exits 3, a stop request exits 0. The rollback candidate was rebuilt and compared | Done 2026-10-12. The installed agent on that PC was not touched |
| Disposable Windows VM | Install, interactive and silent upgrade over a running 0.5.3/0.6.0, stop failure, port conflict, rollback, roll forward | **Not run.** No VM is available on the build PC (Windows 11 Home) |
| Physical till and printers | `HARDWARE_CHECKLIST.md` | **Not run** |

## Tests

All with simulated devices only: a recording fake Windows queue and loopback TCP fake printers in the agent (each test agent has its own temporary config folder), a local `ServerSocket` sink in the backend. No test talks to a physical printer or reads a real PC's printer setup.

- **Lifecycle (0.7.0, `test/lifecycle.test.js`, 23 cases; whole agent suite 183):** port probe (free / agent / other program / silent listener); a port held by another program is never reported healthy, is recorded with a non-sensitive reason, is retried, and the agent recovers when it is freed (timer and **Retry now**); a duplicate of the same version exits without touching the running copy's status; an older agent on the port is named and never touched; the headless agent exits 3 (duplicate) and 4 (foreign port) and stops cleanly on a stop request (real child processes on ephemeral ports); stale stop requests are discarded. `--stop` uses fake process listing and kill only, never real ones: it does nothing when no agent is running, kills nothing when the agent honours the request, ends only an old agent after the grace period and never setup's own process, fails (exit 5) when a process survives, never kills an agent without a `BillBullPrintAgent.exe` process, never touches another program on the port, and fails rather than guesses when the process list is unavailable. `--status` reports a startup failure at once and does not blame an old one. The CLI runs against a copied config folder: valid commands, invalid kind, unsafe destination, http origin, unknown command, bad `--wait`, damaged and missing `config.json`, `--out`, `cli.log`, with no token material in any output. Log redaction and capping are tested too. Negative controls (2026-10-12): self-PID exclusion removed, duplicate overwriting status, node-agent guard removed, damaged config rewritten, unknown command starting the agent, token redaction removed, stale stop requests honoured. Each was caught by 1–2 failures, and each file was restored.
- **Destination binding (0.7.0):** `cd tools/pos-print-agent && npm test` — 160 cases before the lifecycle work. `test/protocolBinding.test.js` (40) runs the real HTTP server with the queues `POS-80C` (escpos) and `ZD220` (zpl) and two fake TCP printers (one per protocol): each destination accepts its own protocol byte for byte, to the configured spelling; ZPL to an ESC/POS destination and ESC/POS to a ZPL destination are 409 with nothing written, on queues and network printers, including text routes and probes; **ZPL hidden in an ESC/POS raster cannot reach a Zebra** (the former bypass); request fields (`protocol`, `format`, `deviceType`, a `printers` object) are ignored and there is no HTTP route that changes setup; unlisted printers, a 0.6.0 config with no `printers`, malformed sections, a repeated JSON key, both-kinds entries, case-variant cross-kind duplicates and an unknown kind all fail closed; ASCII case variants resolve to the configured printer and keep its protocol; trailing/leading spaces, `,Job`, `,XcvPort`, control characters, NFD text and stray backslashes are 400; Unicode-fold look-alikes are ambiguous; network printers match on the resolved address (IPv4-mapped, `localhost`) and port, after the LAN policy; "Gift Box~Deluxe", `^XA`/`~JR` text, and QR/raster data holding ZPL print byte for byte on ESC/POS destinations; the ESC/POS and ZPL refusals are unchanged; auth still comes first. `test/destinations.test.js` (12) covers the setup table, duplicate-key detection, conflict-free edits and the CLI (in temporary folders). `test/fixtures.test.js` runs all 11 real payloads against configured destinations. Negative controls (2026-10-12, on a scratch copy): the mismatch check disabled → 10 failures; the old behaviour (policy chosen by the route) → the raster bypass test gets 200 instead of 409.

- **Agent (0.6.0 pass):** 103 cases (66 before the all-paths work), including `test/zplPolicy.test.js`, `test/fixtures.test.js` and the "label (ZPL) printing" HTTP suite: real labels print byte for byte to queue and socket; `~JR`, `^JUF`, `^NS`, `~DY`, `^ID`, truncated, unknown and field-breakout labels send nothing on either transport; ZPL relabelled as ESC/POS is refused (since 0.7.0 as `AGENT_PROTOCOL_MISMATCH`); the label route needs origin, token and an unrevoked pairing; LAN policy applies. Negative controls (2026-10-11): ZPL policy stubbed → 20 failures; the ESC/POS ZPL guard stubbed → 11 (that guard was removed in 0.7.0); the `sendBytes` check skipped → 20. Each file was restored byte-identical (SHA-256 compared).

  Coverage carried over from the first 0.6.0 pass:
  - origins: exact, suffix, subdomain, scheme, port, `null`, missing
  - the wildcard header is never sent
  - preflight, including the Private Network Access header, with no side effects
  - forged Host / DNS rebinding
  - missing, malformed, unknown, revoked, expired and cross-origin tokens
  - pairing: code never in a response, attempt and rate limits, no-screen refusal
  - receipts reach the queue and the socket byte for byte
  - text cannot smuggle commands
  - drawer, buzzer, power-off, NV, Star-mode, unknown and incomplete jobs send nothing
  - image false positives
  - LAN policy, body limit, Zebra removal, diagnostics gating, and CLI changes seen live

  Negative controls were run: with the command policy stubbed out, 10 tests fail; with token checks stubbed out, 4 fail.
- **Frontend:** `localPrintAgent.auth.test.js` (token header, pairing, error codes, no fallback on 4xx, untrusted-origin detection, outdated agent; labels to `/print/zpl` on 0.6.0 and `/print/escpos` on older agents, a refused label never falls back, network label test via the relay as ZPL), `escPosAgentPolicy.contract.test.js`, `printerPayloadFixtures.test.js` (above), `labelPrinterTransport.test.js`, `EmployeeBarcodeCard.test.jsx` and `PrintAgentPairing.test.jsx`. Negative control: removing the `^FH` escapes → 3 failures. 0.7.0: `escPosAgentPolicy.contract.test.js` adds a real sales receipt and a plain-text body carrying "Gift Box~Deluxe", `~JR`, `^XA` and a QR with ZPL text, built by `escPosReceipt.js` and passed through the agent's own walker.
- **Backend (0.7.0 change):** the `ZplSniffer` was removed from `EscPosCommandPolicy`. `PrinterCommandPolicyTest` now pins carets and tildes (including ZPL spellings, in text, QR and raster) as allowed receipt content next to unchanged refusals; `PrinterPayloadFixturesTest` checks each payload against its own policy and each receipt against ZPL; `PosHardwareControlAuthorizationTest` adds "ZPL hidden in a receipt raster cannot reach a label printer" (declared ESCPOS → `PROTOCOL_MISMATCH`, undeclared → ZPL policy refuses, nothing received; the same bytes print as a logo on a receipt printer) and "receipt text with carets and tildes prints on a receipt printer". 80 tests across the six print/authorization classes pass.
- **Backend (0.6.0 pass):** `PrinterCommandPolicyTest` (13: ESC/POS allow/refuse/drawer/incomplete/ZPL-in-text, ZPL allow/refuse/breakout), `PrinterPayloadFixturesTest` (12, the shared payloads), and three new end-to-end cases in `PosHardwareControlAuthorizationTest` through the real `PosPrinterService` to a local socket: buzzer, power-off, NV writes, unknown, truncated and ZPL-in-receipt jobs are refused **even for a cashier on shift and even behind an authorised drawer pulse**, with nothing received; the controller returns a structured 422; a label printer accepts only BillBull labels, its policy chosen by type not by `format`, and a label cannot go to a receipt printer. Negative controls: the service ignoring the verdict → 3 failures; label printers treated as ESC/POS → 1; Java ZPL policy stubbed → 10. Existing drawer-authorisation and network-policy tests still pass. The POS hardware/authorization suites were re-run green: `EscPosDrawerKickTest`, `PosPrinterServiceTest`, `PosCashDrawerServiceTest`, `PosHardwareControlAuthorizationTest`, `PosApiAuthorizationHardeningTest`, `PosBranchIsolationTest`, `PosCustomerBranchScopeTest` and `PosTillPermissionEnforcementTest`.
