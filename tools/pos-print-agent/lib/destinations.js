"use strict";

// Which printer speaks which command language. This is the only thing that
// decides the command policy a print job is checked against: the destination,
// not the request. The request's route (/print/escpos or /print/zpl) only says
// what the caller believes it is sending; when that disagrees with the
// destination the job is refused before a connection is opened.
//
// config.json:
//
//   "printers": {
//     "escpos": { "queues": ["POS-80C"], "network": ["192.168.1.50:9100"] },
//     "zpl":    { "queues": ["ZDesigner ZD220-203dpi ZPL"], "network": [] }
//   }
//
// Written only by this PC's administrator: the CLI (--set-printer ...), the
// tray menu, the installer, or a hand edit. Never by HTTP.
//
// Identities
//   Windows queue   — the queue name, compared the way Windows compares it for
//                     ASCII letters (case-insensitive). The job is then sent to
//                     the configured spelling, not the caller's.
//   Network printer — an IP literal and port. The caller's address is resolved
//                     and checked by the network policy first; the resolved
//                     address is what is matched.
//
// Fail closed
//   - A destination that is not listed is refused.
//   - A name that is not an exact (ASCII case-insensitive) match but folds to a
//     configured name under Unicode case/compatibility folding is refused as
//     ambiguous: Windows might treat it as the same queue, the agent does not.
//   - A destination listed under both protocols, under an unknown protocol, or
//     colliding with another entry under Unicode folding with a different
//     protocol, is refused as conflicting until the configuration is fixed.
//   - A config.json that repeats a JSON key (whose meaning would depend on the
//     reader) trusts no printer at all.

const net = require("node:net");

const PROTOCOLS = Object.freeze(["escpos", "zpl"]);
const PROTOCOL_TEXT = { escpos: "receipt printer (ESC/POS)", zpl: "label printer (ZPL)" };
const MAX_QUEUE_NAME = 260;

class DestinationError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// ── identities ─────────────────────────────────────────────────────────────

/**
 * Returns null when `name` is a usable Windows queue name, or why not.
 * Refused: control characters, leading/trailing whitespace, non-NFC text (a
 * different code-point sequence that renders the same), commas (OpenPrinter
 * reads "Name,Job 5" or ",XcvPort x" as something other than a queue) and
 * backslashes outside the \\server\printer form.
 */
const queueNameProblem = (name) => {
  if (typeof name !== "string" || !name) return "is empty";
  if (name.length > MAX_QUEUE_NAME) return "is too long";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) return "contains a control character";
  if (name !== name.trim()) return "starts or ends with a space";
  if (name !== name.normalize("NFC")) return "is not in canonical (NFC) Unicode form";
  if (name.includes(",")) return "contains a comma";
  if (name.includes("\\") && !/^\\\\[^\\]+\\[^\\]+$/.test(name)) return "contains a backslash outside \\\\server\\printer";
  return null;
};

// Windows compares queue names case-insensitively. Only ASCII letters are
// folded for the exact match: a Unicode case mapping that Windows does not
// share (JS maps "ß" to "SS") must never make two different queues one.
const queueKey = (name) => name.replace(/[A-Z]/g, (c) => c.toLowerCase());
// Wide fold, used only to detect names that MIGHT be the same queue to Windows.
const queueLooseKey = (name) => name.normalize("NFKC").toUpperCase().toLowerCase().normalize("NFKC");

/** Canonical text for an IP literal ("192.168.1.5", "fd00::5"), or null. */
const canonicalIp = (value) => {
  const raw = String(value ?? "").trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
  const address = mapped ? mapped[1] : raw;
  const family = net.isIP(address);
  if (family === 4) return address;
  if (family === 6) {
    try {
      return new URL(`http://[${address}]/`).hostname.slice(1, -1);
    } catch {
      return null;
    }
  }
  return null;
};

/** "192.168.1.50:9100" or "[fd00::5]:9100" → { address, port, key }, or null. Host names are not accepted. */
const parseNetworkSpec = (spec) => {
  if (typeof spec !== "string") return null;
  const m = /^(?:\[([^\]]+)\]|([^:\[\]]+)):(\d{1,5})$/.exec(spec.trim());
  if (!m) return null;
  const address = canonicalIp(m[1] ?? m[2]);
  const port = Number(m[3]);
  if (!address || (m[1] !== undefined && net.isIP(address) !== 6) || (m[2] !== undefined && net.isIP(address) !== 4)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address, port, key: networkKey(address, port) };
};

const networkKey = (address, port) => `${address}|${port}`;
const networkLabel = (address, port) => (net.isIP(address) === 6 ? `[${address}]:${port}` : `${address}:${port}`);

// ── duplicate JSON keys ────────────────────────────────────────────────────

/**
 * True when any JSON object in `text` repeats a key. JSON.parse silently keeps
 * the last one; for a trust decision the file must mean one thing only.
 * Assumes `text` already parsed; it only walks structure.
 */
const hasDuplicateKeys = (text) => {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = () => {
    const start = i++;
    while (i < text.length && text[i] !== "\"") i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const seen = new Set();
      ws();
      if (text[i] === "}") { i++; return false; }
      for (;;) {
        ws();
        const key = str();
        if (seen.has(key)) return true;
        seen.add(key);
        ws(); i++; // ':'
        if (value()) return true;
        ws();
        if (text[i++] === "}") return false;
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") { i++; return false; }
      for (;;) {
        if (value()) return true;
        ws();
        if (text[i++] === "]") return false;
      }
    }
    if (c === "\"") { str(); return false; }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    return false;
  };
  try {
    return value();
  } catch {
    return true;
  }
};

// ── configuration ──────────────────────────────────────────────────────────

const asList = (value, where, problems) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(`${where} must be a list`);
    return [];
  }
  return value;
};

/**
 * Builds the destination table from the raw "printers" value.
 * @returns {{ queues: Map, network: Map, looseQueues: Map, problems: string[], trusted: boolean }}
 */
const buildDestinations = (rawPrinters, { duplicateKeys = false } = {}) => {
  const problems = [];
  const queues = new Map();      // queueKey → { name, protocol } | { name, conflict: reason }
  const network = new Map();     // networkKey → { address, port, protocol } | { ..., conflict }
  const looseQueues = new Map(); // queueLooseKey → Set of queueKey

  if (duplicateKeys) {
    problems.push("config.json repeats a key; no printer is trusted until the file is fixed");
    return { queues, network, looseQueues, problems, trusted: false };
  }
  if (rawPrinters === undefined) return { queues, network, looseQueues, problems, trusted: true };
  if (!rawPrinters || typeof rawPrinters !== "object" || Array.isArray(rawPrinters)) {
    problems.push("\"printers\" must be an object with \"escpos\" and \"zpl\" sections; no printer is trusted");
    return { queues, network, looseQueues, problems, trusted: false };
  }

  const addQueue = (name, protocol, where) => {
    const why = queueNameProblem(name);
    if (why) {
      problems.push(`${where}: queue ${JSON.stringify(name)} ${why}; ignored`);
      return;
    }
    const key = queueKey(name);
    const existing = queues.get(key);
    if (!existing) {
      queues.set(key, protocol ? { name, protocol } : { name, conflict: `listed under ${where}` });
    } else if (existing.conflict || existing.protocol !== protocol) {
      if (!existing.conflict) problems.push(`queue ${JSON.stringify(name)} is listed as more than one kind of printer; it is refused until that is fixed`);
      queues.set(key, { name: existing.name, conflict: "listed as more than one kind of printer" });
    }
    const loose = queueLooseKey(name);
    if (!looseQueues.has(loose)) looseQueues.set(loose, new Set());
    looseQueues.get(loose).add(key);
  };

  const addNetwork = (spec, protocol, where) => {
    const parsed = parseNetworkSpec(spec);
    if (!parsed) {
      problems.push(`${where}: network printer ${JSON.stringify(spec)} is not an IP address and port (e.g. 192.168.1.50:9100); ignored`);
      return;
    }
    const existing = network.get(parsed.key);
    if (!existing) {
      network.set(parsed.key, protocol ? { ...parsed, protocol } : { ...parsed, conflict: `listed under ${where}` });
    } else if (existing.conflict || existing.protocol !== protocol) {
      if (!existing.conflict) problems.push(`network printer ${networkLabel(parsed.address, parsed.port)} is listed as more than one kind of printer; it is refused until that is fixed`);
      network.set(parsed.key, { ...parsed, conflict: "listed as more than one kind of printer" });
    }
  };

  for (const [section, body] of Object.entries(rawPrinters)) {
    const protocol = PROTOCOLS.includes(section) ? section : null;
    if (!protocol) problems.push(`printers.${section} is not a known printer kind (escpos or zpl); its printers are refused`);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      problems.push(`printers.${section} must be an object with "queues" and "network" lists`);
      continue;
    }
    for (const [list, values] of Object.entries(body)) {
      const where = `printers.${section}.${list}`;
      if (list === "queues") for (const v of asList(values, where, problems)) addQueue(v, protocol, where);
      else if (list === "network") for (const v of asList(values, where, problems)) addNetwork(v, protocol, where);
      else problems.push(`${where} is not "queues" or "network"; ignored`);
    }
  }

  // Names that might be one queue to Windows but are different spellings here
  // must agree on the protocol, or all of them are refused.
  for (const keys of looseQueues.values()) {
    if (keys.size < 2) continue;
    const entries = [...keys].map((k) => queues.get(k));
    const protocols = new Set(entries.map((e) => e.protocol || "conflict"));
    if (protocols.size > 1) {
      problems.push(`queues ${entries.map((e) => JSON.stringify(e.name)).join(", ")} may be the same Windows printer but are listed as different kinds; all are refused`);
      for (const k of keys) queues.set(k, { name: queues.get(k).name, conflict: "may be the same printer as another entry of a different kind" });
    }
  }

  return { queues, network, looseQueues, problems, trusted: true };
};

const setupHint = (kind, identity, protocol) => (kind === "queue"
  ? `On this PC choose it in the BillBull Print Agent tray menu → Printers, or run: BillBullPrintAgent.exe --set-printer "${identity}" ${protocol}`
  : `On this PC run: BillBullPrintAgent.exe --set-network-printer ${identity} ${protocol} | more`);

const notConfigured = (kind, label, jobProtocol, extra = {}) => new DestinationError(403, "AGENT_DESTINATION_NOT_CONFIGURED",
  `${kind === "queue" ? "Printer" : "Network printer"} ${JSON.stringify(label)} is not set up for BillBull printing on this PC. Nothing was sent. ${setupHint(kind, label, jobProtocol)}`,
  { destination: label, ...extra });

const checkProtocol = (entry, kind, label, jobProtocol) => {
  if (entry.conflict) {
    throw new DestinationError(409, "AGENT_DESTINATION_CONFLICT",
      `${kind === "queue" ? "Printer" : "Network printer"} ${JSON.stringify(label)} has conflicting print agent settings on this PC (${entry.conflict}). Nothing was sent. On this PC choose what it prints in the BillBull Print Agent tray menu → Printers (to see the settings: BillBullPrintAgent.exe --list-printers | more).`,
      { destination: label });
  }
  if (entry.protocol !== jobProtocol) {
    throw new DestinationError(409, "AGENT_PROTOCOL_MISMATCH",
      `${JSON.stringify(label)} is set up as a ${PROTOCOL_TEXT[entry.protocol]}, but this job is for a ${PROTOCOL_TEXT[jobProtocol]}. Nothing was sent.`,
      { destination: label, destinationProtocol: entry.protocol, protocol: jobProtocol });
  }
};

/** The configured queue a job for `name` may go to, or throws DestinationError. */
const resolveQueue = (table, name, jobProtocol) => {
  const why = queueNameProblem(name);
  if (why) throw new DestinationError(400, "AGENT_BAD_REQUEST", `Printer name ${JSON.stringify(String(name))} ${why}.`);
  if (!table.trusted) throw notConfigured("queue", name, jobProtocol, { reason: "configuration" });
  const entry = table.queues.get(queueKey(name));
  const looseMatches = table.looseQueues.get(queueLooseKey(name));
  if (!entry) {
    if (looseMatches && looseMatches.size) {
      const like = [...looseMatches].map((k) => JSON.stringify(table.queues.get(k).name)).join(", ");
      throw new DestinationError(403, "AGENT_DESTINATION_AMBIGUOUS",
        `Printer ${JSON.stringify(name)} is not spelled exactly like the printer set up on this PC (${like}). Nothing was sent. Select the printer again in POS → Devices.`,
        { destination: name });
    }
    throw notConfigured("queue", name, jobProtocol);
  }
  checkProtocol(entry, "queue", entry.name, jobProtocol);
  return { kind: "queue", printerName: entry.name, protocol: entry.protocol };
};

/** The configured network printer at an already policy-approved address, or throws DestinationError. */
const resolveNetwork = (table, address, port, jobProtocol) => {
  const canonical = canonicalIp(address);
  const label = canonical ? networkLabel(canonical, Number(port)) : String(address);
  if (!table.trusted || !canonical) throw notConfigured("network", label, jobProtocol);
  const entry = table.network.get(networkKey(canonical, Number(port)));
  if (!entry) throw notConfigured("network", label, jobProtocol);
  checkProtocol(entry, "network", label, jobProtocol);
  return { kind: "network", address: canonical, port: Number(port), protocol: entry.protocol };
};

/** The protocol a listed Windows queue is set up for: "escpos", "zpl", "conflict" or null. */
const queueProtocol = (table, name) => {
  if (queueNameProblem(name) || !table.trusted) return null;
  const entry = table.queues.get(queueKey(name));
  if (!entry) return null;
  return entry.conflict ? "conflict" : entry.protocol;
};

// ── edits (CLI, tray, installer) ───────────────────────────────────────────

const rawSection = (raw, protocol) => {
  if (!raw.printers || typeof raw.printers !== "object" || Array.isArray(raw.printers)) raw.printers = {};
  const s = raw.printers[protocol];
  if (!s || typeof s !== "object" || Array.isArray(s)) raw.printers[protocol] = {};
  for (const list of ["queues", "network"]) {
    if (!Array.isArray(raw.printers[protocol][list])) raw.printers[protocol][list] = [];
  }
  return raw.printers[protocol];
};

/**
 * Sets (protocol = "escpos" | "zpl") or removes (protocol = null) a Windows
 * queue in the raw config. Every entry Windows could read as the same queue is
 * removed first, so an edit never leaves a conflict behind.
 */
const setQueue = (raw, name, protocol) => {
  const why = queueNameProblem(name);
  if (why) throw new DestinationError(400, "AGENT_BAD_REQUEST", `Printer name ${JSON.stringify(String(name))} ${why}.`);
  if (protocol !== null && !PROTOCOLS.includes(protocol)) throw new DestinationError(400, "AGENT_BAD_REQUEST", "Printer kind must be escpos or zpl.");
  const loose = queueLooseKey(name);
  if (raw.printers && typeof raw.printers === "object" && !Array.isArray(raw.printers)) {
    for (const section of Object.values(raw.printers)) {
      if (section && Array.isArray(section.queues)) {
        section.queues = section.queues.filter((q) => typeof q !== "string" || queueLooseKey(q) !== loose);
      }
    }
  }
  if (protocol) rawSection(raw, protocol).queues.push(name);
};

const setNetwork = (raw, spec, protocol) => {
  const parsed = parseNetworkSpec(spec);
  if (!parsed) throw new DestinationError(400, "AGENT_BAD_REQUEST", `Not an IP address and port: ${JSON.stringify(String(spec))}. Use e.g. 192.168.1.50:9100.`);
  if (protocol !== null && !PROTOCOLS.includes(protocol)) throw new DestinationError(400, "AGENT_BAD_REQUEST", "Printer kind must be escpos or zpl.");
  if (raw.printers && typeof raw.printers === "object" && !Array.isArray(raw.printers)) {
    for (const section of Object.values(raw.printers)) {
      if (section && Array.isArray(section.network)) {
        section.network = section.network.filter((n) => parseNetworkSpec(n)?.key !== parsed.key);
      }
    }
  }
  if (protocol) rawSection(raw, protocol).network.push(networkLabel(parsed.address, parsed.port));
  return parsed;
};

/** Human-readable listing for --list-printers and the tray. */
const describeDestinations = (table) => {
  const lines = [];
  for (const e of table.queues.values()) lines.push(`queue    ${JSON.stringify(e.name)}  ${e.conflict ? `REFUSED (${e.conflict})` : PROTOCOL_TEXT[e.protocol]}`);
  for (const e of table.network.values()) lines.push(`network  ${networkLabel(e.address, e.port)}  ${e.conflict ? `REFUSED (${e.conflict})` : PROTOCOL_TEXT[e.protocol]}`);
  return lines;
};

module.exports = {
  PROTOCOLS,
  PROTOCOL_TEXT,
  DestinationError,
  buildDestinations,
  hasDuplicateKeys,
  resolveQueue,
  resolveNetwork,
  queueProtocol,
  queueNameProblem,
  parseNetworkSpec,
  canonicalIp,
  networkLabel,
  setQueue,
  setNetwork,
  describeDestinations,
};
