"use strict";

// Pairing: how a BillBull browser on this till earns a token.
//
// 1. The page (on an allow-listed origin) calls POST /pair/start.
// 2. The agent shows a 6-digit code on THIS PC only — tray notification and
//    tray menu (or the console when run in a terminal). It is never sent over
//    HTTP.
// 3. The operator types the code into BillBull, which calls POST /pair/complete
//    and receives a token bound to its origin.
//
// A web page cannot pair itself: it needs the code that only someone looking
// at the till's screen has. Five wrong guesses or two minutes kill the attempt.
//
// Tokens are stored as SHA-256 hashes in tokens.json next to config.json, so
// reading the file does not yield a usable token. The file is re-read on every
// check, so `--revoke-all` from another process takes effect immediately.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN_PREFIX = "bbpa_";
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_STARTS_PER_MINUTE = 5;
const MAX_ACTIVE_TOKENS = 50;
const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

const createTokenStore = ({ home, now = Date.now }) => {
  const file = path.join(home, "tokens.json");
  let records = [];
  let loadedText = null;

  // Re-read on every use, keyed on content rather than mtime: two writes in
  // the same NTFS timestamp tick would otherwise hide a --revoke-all made by
  // another process. The file is a few KB.
  const load = () => {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") console.warn(`[pairing] ${file} unreadable: ${err.message}`);
    }
    if (text === loadedText) return;
    try {
      const parsed = text ? JSON.parse(text) : null;
      records = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
    } catch (err) {
      console.warn(`[pairing] ${file} unreadable: ${err.message}`);
      records = [];
    }
    loadedText = text;
  };

  const save = () => {
    const t = now();
    records = records.filter((r) => t - Math.max(r.expiresAt, r.revokedAt || 0) < PRUNE_AFTER_MS);
    fs.mkdirSync(home, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    const text = `${JSON.stringify({ tokens: records }, null, 2)}\n`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    loadedText = text;
  };

  const active = () => records.filter((r) => !r.revokedAt && r.expiresAt > now());

  const issue = ({ origin, label, ttlDays }) => {
    load();
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
    const t = now();
    const record = {
      id: crypto.randomBytes(6).toString("hex"),
      hash: sha256(token).toString("hex"),
      origin,
      label: String(label || "").slice(0, 80) || null,
      createdAt: t,
      expiresAt: t + ttlDays * 24 * 60 * 60 * 1000,
      lastUsedAt: null,
      revokedAt: null,
    };
    records.push(record);
    const live = active().sort((a, b) => a.createdAt - b.createdAt);
    for (const old of live.slice(0, Math.max(0, live.length - MAX_ACTIVE_TOKENS))) old.revokedAt = t;
    save();
    return { token, record };
  };

  /** { ok: true, record } or { ok: false, code } — code is AGENT_TOKEN_INVALID / _EXPIRED / _REVOKED. */
  const verify = (token, origin) => {
    load();
    if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX) || token.length > 200) {
      return { ok: false, code: "AGENT_TOKEN_INVALID" };
    }
    const hash = sha256(token);
    const record = records.find((r) => safeEqual(Buffer.from(r.hash, "hex"), hash));
    // A token presented from a different origin than it was paired on is
    // treated exactly like an unknown token.
    if (!record || record.origin !== origin) return { ok: false, code: "AGENT_TOKEN_INVALID" };
    if (record.revokedAt) return { ok: false, code: "AGENT_TOKEN_REVOKED" };
    if (record.expiresAt <= now()) return { ok: false, code: "AGENT_TOKEN_EXPIRED" };
    if (!record.lastUsedAt || now() - record.lastUsedAt > LAST_USED_WRITE_INTERVAL_MS) {
      record.lastUsedAt = now();
      try { save(); } catch (err) { console.warn(`[pairing] lastUsedAt not saved: ${err.message}`); }
    }
    return { ok: true, record };
  };

  const revoke = (id) => {
    load();
    const record = records.find((r) => r.id === id && !r.revokedAt);
    if (!record) return false;
    record.revokedAt = now();
    save();
    return true;
  };

  const revokeAll = () => {
    load();
    const t = now();
    let n = 0;
    for (const r of records) if (!r.revokedAt) { r.revokedAt = t; n++; }
    save();
    return n;
  };

  const list = () => {
    load();
    return records.map(({ hash, ...rest }) => rest);
  };

  return { file, issue, verify, revoke, revokeAll, list, active: () => { load(); return active(); } };
};

class PairingError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

// In-memory pending pairings for this process.
const createPairingManager = ({ store, getTtlDays, display, now = Date.now }) => {
  const pending = new Map(); // pairingId -> { origin, label, codeHash, expiresAt, attempts }
  const starts = [];

  const sweep = () => {
    const t = now();
    for (const [id, p] of pending) if (p.expiresAt <= t) pending.delete(id);
  };

  const start = ({ origin, label }) => {
    sweep();
    const t = now();
    while (starts.length && t - starts[0] > 60 * 1000) starts.shift();
    if (starts.length >= MAX_STARTS_PER_MINUTE) {
      throw new PairingError(429, "AGENT_PAIRING_RATE_LIMITED", "Too many pairing attempts. Wait a minute and try again.");
    }
    starts.push(t);
    // One live attempt per origin: a new request replaces the old one.
    for (const [id, p] of pending) if (p.origin === origin) pending.delete(id);

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const pairingId = crypto.randomBytes(16).toString("hex");
    const expiresAt = t + CODE_TTL_MS;
    const shown = display({ code, origin, label: label || null, expiresAt });
    if (shown === false) {
      throw new PairingError(503, "AGENT_PAIRING_UNAVAILABLE",
        "This agent has no screen to show a pairing code on. Run the tray build (BillBullPrintAgent.exe) or start it in a terminal.");
    }
    pending.set(pairingId, { origin, label: label || null, codeHash: sha256(code), expiresAt, attempts: 0 });
    return { pairingId, expiresInSeconds: Math.round(CODE_TTL_MS / 1000), codeLength: 6 };
  };

  const complete = ({ origin, pairingId, code }) => {
    sweep();
    const p = typeof pairingId === "string" ? pending.get(pairingId) : null;
    if (!p || p.origin !== origin) {
      throw new PairingError(410, "AGENT_PAIRING_EXPIRED", "This pairing request has expired. Start pairing again.");
    }
    if (!safeEqual(sha256(String(code ?? "").trim()), p.codeHash)) {
      p.attempts += 1;
      const remaining = MAX_CODE_ATTEMPTS - p.attempts;
      if (remaining <= 0) pending.delete(pairingId);
      throw new PairingError(401, "AGENT_PAIRING_CODE_INVALID",
        remaining > 0 ? "That code is not the one shown by the print agent." : "Too many wrong codes. Start pairing again.",
        { attemptsRemaining: Math.max(0, remaining) });
    }
    pending.delete(pairingId);
    display({ done: true, origin });
    const { token, record } = store.issue({ origin, label: p.label, ttlDays: getTtlDays() });
    return { token, expiresAt: new Date(record.expiresAt).toISOString() };
  };

  return { start, complete, pendingCount: () => { sweep(); return pending.size; } };
};

module.exports = { createTokenStore, createPairingManager, PairingError, TOKEN_PREFIX };
