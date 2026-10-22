"use strict";

// Local configuration commands. These (with the tray menu and the installer,
// which call the same code) are the only way to change which sites the agent
// trusts, which printers it prints to and in which command language, or to
// revoke pairings — deliberately not HTTP endpoints, so no web page can
// reconfigure the agent. They edit files under the current
// Windows user's %APPDATA%\BillBull\PrintAgent; a running agent picks the
// change up on its next request.
//
//   BillBullPrintAgent.exe --add-origin https://acme.billbull.app
//   BillBullPrintAgent.exe --remove-origin https://acme.billbull.app
//   BillBullPrintAgent.exe --list-origins
//   BillBullPrintAgent.exe --list-pairings
//   BillBullPrintAgent.exe --revoke-all
//   BillBullPrintAgent.exe --diagnostics on|off
//   BillBullPrintAgent.exe --set-printer "POS-80C" escpos
//   BillBullPrintAgent.exe --set-printer "ZDesigner ZD220-203dpi ZPL" zpl
//   BillBullPrintAgent.exe --remove-printer "POS-80C"
//   BillBullPrintAgent.exe --set-network-printer 192.168.1.60:9100 zpl
//   BillBullPrintAgent.exe --remove-network-printer 192.168.1.60:9100
//   BillBullPrintAgent.exe --list-printers
//   BillBullPrintAgent.exe --status [--wait <ms>]
//   BillBullPrintAgent.exe --stop
//
// Where the output goes: the packaged exe is a windowed program, so a plain
// Command Prompt shows none of it. Every command's result is also appended to
// %APPDATA%\BillBull\PrintAgent\logs\cli.log; `--out <file>` writes it to a
// file (what the installer reads); and piping shows it on screen:
//   BillBullPrintAgent.exe --list-printers | more
//
// Exit codes: 0 success; 2 refused (a usage error, an invalid origin or
// printer, a damaged config.json) — the installer relies on these two;
// 1 `--status`: this version of the agent is not running; 5 `--stop`: an agent
// is still running, so its files may be in use.

const fs = require("node:fs");
const { createConfig, normalizeOrigin, ConfigError } = require("./config");
const { createTokenStore } = require("./pairing");
const { setQueue, setNetwork, describeDestinations, PROTOCOLS, PROTOCOL_TEXT, networkLabel } = require("./destinations");
const { createLog, redact } = require("./log");
const lifecycle = require("./lifecycle");
const { HOST, PORT, VERSION } = require("./constants");

const USAGE = `BillBull Print Agent configuration
  --add-origin <https://tenant.billbull.app>   trust a BillBull site (exact address)
  --remove-origin <address>                    stop trusting a site
  --list-origins                               show trusted sites
  --list-pairings                              show paired browsers (no tokens)
  --revoke-all                                 unpair every browser
  --diagnostics on|off                         probe page + byte capture (support only)
  --set-printer "<Windows printer>" escpos|zpl print receipts (escpos) or Zebra labels (zpl) on it
  --remove-printer "<Windows printer>"         stop printing to it
  --set-network-printer <ip>:<port> escpos|zpl print to a printer on the network
  --remove-network-printer <ip>:<port>         stop printing to it
  --list-printers                              show the printers BillBull may print to
  --status [--wait <ms>]                       is this version of the agent running? (exit 0 yes, 1 no)
  --stop                                       stop the running agent (exit 0 stopped, 5 still running)
  --out <file>                                 also write the result to <file>
Results are also written to %APPDATA%\\BillBull\\PrintAgent\\logs\\cli.log.
The agent has no console window: add | more to see the result in a Command Prompt.`;

const COMMANDS = new Set(["--add-origin", "--remove-origin", "--list-origins", "--list-pairings", "--revoke-all", "--diagnostics",
  "--set-printer", "--remove-printer", "--set-network-printer", "--remove-network-printer", "--list-printers",
  "--status", "--stop", "--help"]);

const EXIT = Object.freeze({ OK: 0, NOT_RUNNING: 1, REFUSED: 2, STILL_RUNNING: 5 });

// Pulls `--out <file>` and `--wait <ms>` out of argv, wherever they are.
const takeOptions = (argv) => {
  const rest = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out" || argv[i] === "--wait") {
      options[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  return { rest, options };
};

const runSync = ({ command, value, kind, config, out, fail }) => {
  switch (command) {
    case "--add-origin":
    case "--remove-origin": {
      const origin = normalizeOrigin(value);
      if (!origin) {
        return fail(`Not a valid BillBull address: ${value ?? "(missing)"}. Use the exact site address, e.g. https://acme.billbull.app (http is accepted only for localhost).`);
      }
      config.update((raw) => {
        const list = (Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : []).map(normalizeOrigin).filter(Boolean);
        raw.allowedOrigins = command === "--add-origin"
          ? [...new Set([...list, origin])]
          : list.filter((o) => o !== origin);
      });
      out(`${command === "--add-origin" ? "Trusted" : "Removed"}: ${origin}`);
      break;
    }
    case "--list-origins":
      out([...config.current().allowedOrigins].join("\n") || "(no trusted sites)");
      break;
    case "--list-pairings": {
      const rows = createTokenStore({ home: config.home }).list();
      out(rows.length ? rows.map((r) => [
        r.id, r.origin, r.label || "-",
        `created ${new Date(r.createdAt).toISOString()}`,
        r.revokedAt ? `revoked ${new Date(r.revokedAt).toISOString()}` : `expires ${new Date(r.expiresAt).toISOString()}`,
      ].join("  ")).join("\n") : "(no paired browsers)");
      break;
    }
    case "--revoke-all":
      out(`Revoked ${createTokenStore({ home: config.home }).revokeAll()} pairing(s). Every BillBull browser on this PC must pair again.`);
      break;
    case "--diagnostics":
      if (value !== "on" && value !== "off") return fail("Use --diagnostics on or --diagnostics off.");
      config.update((raw) => { raw.diagnostics = value === "on"; });
      out(`Diagnostics ${value}.${value === "on" ? " Receipt bytes are now saved to the Desktop; switch this off after the investigation." : ""}`);
      break;
    case "--set-printer":
    case "--remove-printer":
    case "--set-network-printer":
    case "--remove-network-printer": {
      const setting = command.startsWith("--set-");
      const network = command.endsWith("network-printer");
      if (setting && !PROTOCOLS.includes(kind)) {
        return fail(`Say what the printer is: ${command} ${network ? "<ip>:<port>" : '"<Windows printer>"'} escpos (receipts) or zpl (Zebra labels).`);
      }
      let label;
      config.update((raw) => {
        if (network) {
          const parsed = setNetwork(raw, value, setting ? kind : null);
          label = networkLabel(parsed.address, parsed.port);
        } else {
          setQueue(raw, value, setting ? kind : null);
          label = JSON.stringify(value);
        }
      });
      out(setting ? `${label} is now a ${PROTOCOL_TEXT[kind]}.` : `Removed: ${label}. BillBull no longer prints to it.`);
      break;
    }
    case "--list-printers": {
      const { destinations, fileProblem } = config.current();
      const lines = describeDestinations(destinations);
      out([
        ...(fileProblem ? [`problem: config.json cannot be used because ${fileProblem} — BillBull cannot print on this PC until it is fixed`] : []),
        ...(lines.length ? lines : ["(no printers set up — BillBull cannot print on this PC)"]),
        ...destinations.problems.map((p) => `problem: ${p}`),
      ].join("\n"));
      break;
    }
    default:
      out(USAGE);
  }
  return EXIT.OK;
};

const runAsync = async ({ command, options, config, out, agent }) => {
  const { host, port, version, deps } = agent;
  if (command === "--stop") {
    const result = await lifecycle.stopAgents({ home: config.home, host, port, ...deps });
    out(result.message);
    return result.ok ? EXIT.OK : EXIT.STILL_RUNNING;
  }
  const result = await lifecycle.checkStatus({ home: config.home, host, port, version, waitMs: options.waitMs, ...deps });
  out(result.message);
  return result.ok ? EXIT.OK : EXIT.NOT_RUNNING;
};

/**
 * Runs a configuration command, or returns false when argv is empty (start
 * the agent). Anything else is a command: an unknown one is refused rather
 * than starting a second agent. Returns true when the command finished
 * synchronously, or a Promise of the exit code for --status and --stop.
 */
const runCli = (argv, {
  config = createConfig(),
  out: print = console.log,
  err: printErr = console.error,
  exit = (c) => { process.exitCode = c; },
  log = createLog({ home: config.home, name: "cli.log" }),
  agent = {},
} = {}) => {
  if (!argv.length) return false;
  const { rest, options } = takeOptions(argv);
  const [command, value, kind] = rest;
  const lines = [];
  const out = (message) => { lines.push(message); print(message); };
  const err = (message) => { lines.push(message); printErr(message); };

  const finish = (code) => {
    const text = lines.join("\n");
    if (options.out) {
      try { fs.writeFileSync(options.out, `${text}\n`); } catch (e) { printErr(`Could not write ${options.out}: ${e.message}`); }
    }
    const shown = argv.map((a) => (/^--/.test(a) ? a : JSON.stringify(a))).join(" ");
    log.write(code === EXIT.OK ? "info" : "warn", `${redact(shown)} -> exit ${code}${text ? `\n  ${text.split("\n").join("\n  ")}` : ""}`);
    exit(code);
    return code;
  };
  const fail = (message) => { err(message); return EXIT.REFUSED; };

  if (!COMMANDS.has(command)) {
    err(`Unknown command: ${command}\n\n${USAGE}`);
    finish(EXIT.REFUSED);
    return true;
  }
  if (command === "--status" || command === "--stop") {
    const waitMs = options.wait === undefined ? 0 : Number(options.wait);
    if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 600000) {
      err("Use --wait <milliseconds>, at most 600000.");
      finish(EXIT.REFUSED);
      return true;
    }
    const target = { host: agent.host || HOST, port: agent.port || PORT, version: agent.version || VERSION, deps: agent.deps || {} };
    return runAsync({ command, options: { waitMs }, config, out, agent: target })
      .catch((e) => fail(`Could not ${command === "--stop" ? "stop" : "check"} the print agent: ${e.message}`))
      .then(finish);
  }
  let code;
  try {
    code = runSync({ command, value, kind, config, out, fail });
  } catch (e) {
    // A damaged config.json (ConfigError), a printer name the destinations
    // module refuses, an unwritable folder: all reported, never a crash.
    code = fail(e instanceof ConfigError ? e.message : e?.message || String(e));
  }
  finish(code);
  return true;
};

module.exports = { runCli, USAGE, EXIT };
