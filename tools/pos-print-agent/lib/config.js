"use strict";

// Agent configuration: %APPDATA%\BillBull\PrintAgent\config.json (per Windows
// user, like the install itself). Re-read whenever the file changes, so
// `--add-origin` from the installer or a support engineer takes effect without
// restarting a running agent.
//
// {
//   "allowedOrigins": ["https://acme.billbull.app"],
//   "tokenTtlDays": 180,
//   "diagnostics": false,
//   "maxBodyBytes": 4194304,
//   "network": { "allowedPorts": "9100-9109", "allowLoopback": false, "allowPublic": false },
//   "printers": {
//     "escpos": { "queues": ["POS-80C"], "network": ["192.168.1.50:9100"] },
//     "zpl":    { "queues": ["ZDesigner ZD220-203dpi ZPL"], "network": [] }
//   }
// }
//
// "printers" binds each destination to the command language it speaks (see
// destinations.js). A printer that is not listed receives nothing.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildDestinations, hasDuplicateKeys } = require("./destinations");

const DEFAULTS = Object.freeze({
  allowedOrigins: [],
  tokenTtlDays: 180,
  diagnostics: false,
  maxBodyBytes: 4 * 1024 * 1024,
  network: { allowedPorts: "9100-9109", allowLoopback: false, allowPublic: false },
});

const defaultHome = () => process.env.BILLBULL_PRINT_AGENT_HOME
  || path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "BillBull", "PrintAgent");

// How messages name the file: no user name, the same on every PC.
const DISPLAY_FILE = "%APPDATA%\\BillBull\\PrintAgent\\config.json";

class ConfigError extends Error {}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Canonical "scheme://host[:port]" for an exact trusted origin, or null.
 * https only, except plain http on loopback for local development: an http
 * origin on a LAN or public host can be impersonated by anyone on the path.
 * No wildcards, paths, credentials, queries or fragments.
 */
const normalizeOrigin = (value) => {
  if (typeof value !== "string" || !value.trim() || value.includes("*")) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return `${url.protocol}//${url.host}`; // URL.host drops the scheme's default port
};

const createConfig = ({ home = defaultHome(), env = process.env } = {}) => {
  const file = path.join(home, "config.json");
  let cache = null;
  let cachedText = null;

  const readText = () => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") console.warn(`[config] ${file} unreadable, using defaults: ${err.message}`);
      return "";
    }
  };

  // Why the file cannot be used, or null. An unusable file means "trust no
  // site, print to no printer" until it is fixed, never a silent reset.
  const unusable = (text) => {
    if (!text) return null;
    try {
      const raw = JSON.parse(text);
      return raw && typeof raw === "object" && !Array.isArray(raw) ? null : "it does not hold a JSON object";
    } catch (err) {
      return `it is not valid JSON (${err.message})`;
    }
  };

  const parse = (text) => {
    const problem = unusable(text);
    if (problem) {
      console.warn(`[config] ${file} cannot be used, so no site is trusted and no printer is set up: ${problem}`);
      return {};
    }
    return text ? JSON.parse(text) : {};
  };

  const build = (raw, text = "") => {
    const rejected = [];
    const origins = new Set();
    const envOrigins = String(env.BILLBULL_PRINT_AGENT_ORIGINS || "").split(",").filter((s) => s.trim());
    for (const o of [...(Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : []), ...envOrigins]) {
      const n = normalizeOrigin(o);
      if (n) origins.add(n);
      else rejected.push(o);
    }
    if (rejected.length) console.warn(`[config] ignored invalid allowedOrigins: ${rejected.join(", ")}`);
    const ttl = Number(raw.tokenTtlDays);
    const maxBody = Number(raw.maxBodyBytes);
    const destinations = buildDestinations(raw.printers, { duplicateKeys: Boolean(text) && hasDuplicateKeys(text) });
    for (const problem of destinations.problems) console.warn(`[config] printers: ${problem}`);
    return {
      allowedOrigins: origins,
      tokenTtlDays: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULTS.tokenTtlDays,
      diagnostics: raw.diagnostics === true,
      maxBodyBytes: Number.isFinite(maxBody) && maxBody > 0 ? maxBody : DEFAULTS.maxBodyBytes,
      network: { ...DEFAULTS.network, ...(raw.network || {}) },
      destinations,
      fileProblem: unusable(text),
    };
  };

  // Keyed on content, not mtime (see pairing.js), so a CLI edit is seen on the
  // very next request.
  const current = () => {
    const text = readText();
    if (!cache || text !== cachedText) {
      cache = build(parse(text), text);
      cachedText = text;
    }
    return cache;
  };

  // Read-modify-write of the raw file, for the CLI. Atomic rename so a running
  // agent never reads half a file. A damaged file is refused rather than
  // rewritten: rewriting it would quietly drop every trusted site and printer.
  const update = (mutate) => {
    const text = readText();
    const problem = unusable(text);
    if (problem) {
      throw new ConfigError(`${DISPLAY_FILE} cannot be read because ${problem}. Nothing was changed. ` +
        "Fix the file, or rename it and set up the trusted site and printers again.");
    }
    const raw = parse(text);
    mutate(raw);
    fs.mkdirSync(home, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`);
    fs.renameSync(tmp, file);
    cache = null;
    return current();
  };

  return { home, file, current, update };
};

module.exports = { createConfig, normalizeOrigin, defaultHome, DEFAULTS, ConfigError, DISPLAY_FILE };
