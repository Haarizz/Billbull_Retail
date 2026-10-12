"use strict";

// Log files under %APPDATA%\BillBull\PrintAgent\logs (per Windows user, next to
// config.json). The packaged BillBullPrintAgent.exe is a windowed program with
// no console, so without these files its startup errors and CLI results would
// go nowhere a cashier or support engineer could find them.
//
//   agent.log — what the running agent prints (startup, refusals, failures)
//   cli.log   — one entry per configuration command and its result
//
// Each file is capped (renamed to <name>.1 when full, one generation kept).
// Pairing tokens, Authorization headers and pairing codes are redacted on the
// way in; nothing else secret is ever printed (tokens.json holds only hashes).

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const MAX_BYTES = 1024 * 1024;

const redact = (text) => String(text)
  .replace(/(Bearer\s+)\S+/gi, "$1[redacted]")
  .replace(/bbpa_[A-Za-z0-9_-]+/g, "bbpa_[redacted]")
  .replace(/(\bCode:\s*)\S+/g, "$1[redacted]");

const createLog = ({ home, name = "agent.log", maxBytes = MAX_BYTES, now = () => new Date() }) => {
  const dir = path.join(home, "logs");
  const file = path.join(dir, name);

  const write = (level, ...args) => {
    const line = `${now().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(util.format(...args))}\n`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      let size = 0;
      try { size = fs.statSync(file).size; } catch { /* first entry */ }
      if (size && size + line.length > maxBytes) fs.renameSync(file, `${file}.1`);
      fs.appendFileSync(file, line);
    } catch {
      // A full disk or a locked file must never stop the agent from printing.
    }
  };

  return { dir, file, write };
};

// Copies everything the agent prints to the console into the log as well.
const teeConsole = (log, target = console) => {
  for (const [method, level] of [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"]]) {
    const original = target[method].bind(target);
    target[method] = (...args) => {
      log.write(level, ...args);
      original(...args);
    };
  }
};

module.exports = { createLog, teeConsole, redact, MAX_BYTES };
