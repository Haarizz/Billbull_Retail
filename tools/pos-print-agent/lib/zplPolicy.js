"use strict";

// Decides whether a ZPL II byte stream may be sent to a Zebra label printer.
//
// ZPL is text, so the ESC/POS walker (escposPolicy.js) would wave any ZPL job
// through as "printable text" — including ~JR (power-cycle), ^JUF (factory
// reset), ^ID (delete files), ^NC/^NS (network settings), ~DY/~DG (download
// files or firmware) and ^JUS (save settings to flash). This is the ZPL
// policy, and it is an ALLOWLIST built from what BillBull's only ZPL builder
// (billbull-frontend/src/utils/zebraZpl.js) emits:
//
//   ^XA ^CI28 ^PW ^LL ^LH ^LS ^PO ^MMT ^BY  per label
//   ^FO [^FB] [^A<font>] [^BC] [^FH] ^FD … ^FS  per field
//   ^XZ
//
// The stream must be one or more complete ^XA … ^XZ formats separated only by
// whitespace. Every command's parameters must match an exact grammar, so a
// field cannot run on into a second command. Tilde commands are refused
// outright: the printer executes them the moment it reads them, even inside
// field data, and BillBull needs none of them. Field data may not contain a
// literal '~' or a control character; '^' cannot appear in it at all because
// '^' always starts the next command. zebraZpl.js writes those characters as
// ^FH hex escapes (_5E, _7E, _5F) instead, which the printer prints but never
// executes.
//
// The whole job is checked before a byte is sent; a refusal sends nothing.

const MAX_FIELD_DATA = 3072;

const n = (digits) => `\\d{1,${digits}}`;
// Exact parameter grammar per allowed command (whole parameter string).
const FORMAT_COMMANDS = new Map([
  ["CI", /^28$/],                                   // UTF-8 encoding — the only one the builder uses
  ["PW", new RegExp(`^${n(5)}$`)],                  // print width (dots)
  ["LL", new RegExp(`^${n(5)}$`)],                  // label length (dots)
  ["LH", new RegExp(`^${n(5)},${n(5)}$`)],          // label home
  ["LS", new RegExp(`^-?${n(4)}$`)],                // label shift
  ["PO", /^[NI]$/],                                 // print orientation
  ["MM", /^T$/],                                    // print mode: tear-off only
  ["BY", new RegExp(`^${n(2)}(,\\d(\\.\\d)?(,${n(5)})?)?$`)], // barcode defaults
]);

const FIELD_COMMANDS = new Map([
  ["FB", new RegExp(`^${n(5)},${n(3)},-?${n(4)},[LCRJ],${n(4)}$`)],           // field block
  ["BC", new RegExp(`^[NRIB](,${n(5)}?(,[YN](,[YN](,[YN](,[NUAD])?)?)?)?)?$`)], // Code 128
  ["FH", /^_?$/],                                                              // hex escapes, '_' indicator
]);
// ^A<font><orientation>,<h>,<w> — a resident font; ^A@ (font by file name) is not allowed.
const FONT_PARAMS = new RegExp(`^[NRIB](,${n(5)}(,${n(5)})?)?$`);
const FIELD_ORIGIN = new RegExp(`^${n(5)},${n(5)}(,[012])?$`);

// Named refusals so the error says what was blocked.
const DENIED = new Map(Object.entries({
  JU: "CONFIG_WRITE", JZ: "CONFIG_WRITE", JM: "CONFIG_WRITE", JS: "CONFIG_WRITE", JJ: "CONFIG_WRITE",
  JW: "CONFIG_WRITE", JT: "CONFIG_WRITE", MU: "CONFIG_WRITE", MT: "CONFIG_WRITE", MN: "CONFIG_WRITE",
  MD: "CONFIG_WRITE", MF: "CONFIG_WRITE", ML: "CONFIG_WRITE", MP: "CONFIG_WRITE", SC: "CONFIG_WRITE",
  SS: "CONFIG_WRITE", ST: "CONFIG_WRITE", SZ: "CONFIG_WRITE", KD: "CONFIG_WRITE", KL: "CONFIG_WRITE",
  KN: "CONFIG_WRITE", KP: "CONFIG_WRITE", PR: "CONFIG_WRITE", PF: "CONFIG_WRITE", CC: "CONFIG_WRITE",
  CD: "CONFIG_WRITE", CT: "CONFIG_WRITE", CO: "CONFIG_WRITE", CM: "CONFIG_WRITE", CW: "CONFIG_WRITE",
  NC: "NETWORK", ND: "NETWORK", NI: "NETWORK", NN: "NETWORK", NP: "NETWORK", NS: "NETWORK",
  NT: "NETWORK", NW: "NETWORK", NB: "NETWORK", WA: "NETWORK", WE: "NETWORK", WI: "NETWORK",
  WL: "NETWORK", WP: "NETWORK", WR: "NETWORK", WS: "NETWORK", WX: "NETWORK",
  DF: "STORAGE", ID: "STORAGE", IL: "STORAGE", IM: "STORAGE", IS: "STORAGE", XG: "STORAGE",
  DG: "STORAGE", DY: "STORAGE", TO: "STORAGE", HF: "STORAGE", HG: "STORAGE", HY: "STORAGE",
  HH: "DEVICE_QUERY", HW: "DEVICE_QUERY", HZ: "DEVICE_QUERY", HV: "DEVICE_QUERY", HT: "DEVICE_QUERY",
  SN: "UNSUPPORTED", SF: "UNSUPPORTED", SO: "UNSUPPORTED", SQ: "UNSUPPORTED", SE: "UNSUPPORTED",
  PQ: "UNSUPPORTED", FX: "UNSUPPORTED", FN: "UNSUPPORTED", FV: "UNSUPPORTED", XF: "UNSUPPORTED",
  RF: "RFID", RS: "RFID", RW: "RFID", RB: "RFID", WT: "RFID", WV: "RFID", RZ: "RFID",
}));
const TILDE = new Map(Object.entries({
  JR: "POWER", JP: "DEVICE_CONTROL", JA: "DEVICE_CONTROL", JC: "DEVICE_CONTROL", JE: "DEVICE_CONTROL",
  JF: "DEVICE_CONTROL", JL: "DEVICE_CONTROL", JN: "DEVICE_CONTROL", JO: "DEVICE_CONTROL",
  JS: "DEVICE_CONTROL", JX: "DEVICE_CONTROL", JD: "DEVICE_CONTROL", JB: "DEVICE_CONTROL",
  JG: "DEVICE_CONTROL", JI: "DEVICE_CONTROL", JQ: "DEVICE_CONTROL",
  DY: "STORAGE", DG: "STORAGE", DB: "STORAGE", DE: "STORAGE", DN: "STORAGE", DS: "STORAGE",
  DT: "STORAGE", DU: "STORAGE", EG: "STORAGE",
  NC: "NETWORK", NR: "NETWORK", NT: "NETWORK", WC: "DEVICE_CONTROL", WQ: "DEVICE_QUERY", WR: "NETWORK",
  HS: "DEVICE_QUERY", HQ: "DEVICE_QUERY", HI: "DEVICE_QUERY", HM: "DEVICE_QUERY", HB: "DEVICE_QUERY",
  HD: "DEVICE_QUERY", HU: "DEVICE_QUERY",
  CC: "CONFIG_WRITE", CD: "CONFIG_WRITE", CT: "CONFIG_WRITE", SD: "CONFIG_WRITE", TA: "CONFIG_WRITE",
  KB: "CONFIG_WRITE", PR: "CONFIG_WRITE", RO: "CONFIG_WRITE",
  PH: "DEVICE_CONTROL", PL: "DEVICE_CONTROL", PM: "DEVICE_CONTROL", PP: "DEVICE_CONTROL", PS: "DEVICE_CONTROL",
}));

const CARET = 0x5e, TILDE_CHAR = 0x7e;
const isSpace = (b) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
const isControl = (b) => b < 0x20 || b === 0x7f;
const ascii = (data, from, to) => Buffer.from(data.subarray(from, to)).toString("latin1");

const refuse = (offset, command, category) => ({ allowed: false, offset, command, category });

/**
 * @param {Uint8Array|Buffer} data
 * @returns {{ allowed: true } | { allowed: false, offset: number, command: string, category: string }}
 */
const inspectZpl = (data) => {
  const len = data.length;
  // Tilde commands run on receipt, wherever they appear — find any first.
  for (let i = 0; i < len; i++) {
    if (data[i] !== TILDE_CHAR) continue;
    const code = ascii(data, i + 1, i + 3).toUpperCase();
    return refuse(i, `~${code}`, TILDE.get(code) || "DEVICE_CONTROL");
  }

  let i = 0;
  let inFormat = false;
  let formats = 0;
  let field = null; // { hex: boolean, data: boolean } while a ^FO … ^FS field is open
  let formatStart = -1;

  while (i < len) {
    const b = data[i];
    if (b !== CARET) {
      if (isSpace(b)) { i++; continue; }
      // Only whitespace may sit between commands; anything else would be
      // printed or parsed by the printer outside the command grammar.
      return refuse(i, `byte 0x${b.toString(16).padStart(2, "0")}`, isControl(b) ? "CONTROL_CHARACTER" : "MALFORMED");
    }
    if (i + 3 > len) return refuse(i, "^", "INCOMPLETE");
    const code = ascii(data, i + 1, i + 3);
    const start = i;
    // Parameters run to the next '^' (field data likewise ends at ^FS).
    let end = i + 3;
    while (end < len && data[end] !== CARET) end++;

    if (code === "FD") {
      if (!field || field.data) return refuse(start, "^FD", "MALFORMED");
      if (end >= len) return refuse(start, "^FD", "INCOMPLETE");
      if (end - (i + 3) > MAX_FIELD_DATA) return refuse(start, "^FD", "MALFORMED");
      for (let j = i + 3; j < end; j++) {
        if (isControl(data[j])) return refuse(j, "^FD", "CONTROL_CHARACTER");
        if (field.hex && data[j] === 0x5f) {
          const pair = ascii(data, j + 1, j + 3);
          if (j + 2 >= end || !/^[0-9A-Fa-f]{2}$/.test(pair)) return refuse(j, "^FH escape", "MALFORMED");
          j += 2;
        }
      }
      field.data = true;
      i = end;
      continue;
    }

    // Every other command: printable ASCII parameters, trailing whitespace ignored.
    let paramEnd = end;
    while (paramEnd > i + 3 && isSpace(data[paramEnd - 1])) paramEnd--;
    for (let j = i + 1; j < paramEnd; j++) {
      if (data[j] < 0x20 || data[j] > 0x7e) return refuse(j, `^${code}`, data[j] < 0x20 ? "CONTROL_CHARACTER" : "MALFORMED");
    }
    const params = ascii(data, i + 3, paramEnd);
    const name = `^${code}`;

    if (code === "XA") {
      if (inFormat || params) return refuse(start, name, "MALFORMED");
      inFormat = true;
      formatStart = start;
    } else if (!inFormat) {
      return refuse(start, name, DENIED.get(code.toUpperCase()) || "OUTSIDE_FORMAT");
    } else if (code === "XZ") {
      if (field || params) return refuse(start, name, "MALFORMED");
      inFormat = false;
      formats++;
    } else if (code === "FO") {
      if (field || !FIELD_ORIGIN.test(params)) return refuse(start, name, "MALFORMED");
      field = { hex: false, data: false };
    } else if (code === "FS") {
      if (!field || !field.data || params) return refuse(start, name, "MALFORMED");
      field = null;
    } else if (FORMAT_COMMANDS.has(code)) {
      if (field || !FORMAT_COMMANDS.get(code).test(params)) return refuse(start, name, "MALFORMED");
    } else if (FIELD_COMMANDS.has(code)) {
      if (!field || field.data || !FIELD_COMMANDS.get(code).test(params)) return refuse(start, name, "MALFORMED");
      if (code === "FH") field.hex = true;
    } else if (code[0] === "A" && /^[0-9A-Z]$/.test(code[1])) {
      if (!field || field.data || !FONT_PARAMS.test(params)) return refuse(start, name, "MALFORMED");
    } else {
      return refuse(start, name, DENIED.get(code.toUpperCase()) || "UNKNOWN");
    }
    i = end;
  }

  if (inFormat) return refuse(formatStart, "^XA", "INCOMPLETE");
  if (!formats) return refuse(0, "(empty)", "INCOMPLETE");
  return { allowed: true };
};

const CATEGORY_TEXT = {
  POWER: "restarts the printer",
  DEVICE_CONTROL: "controls the printer directly",
  DEVICE_QUERY: "asks the printer for its configuration",
  CONFIG_WRITE: "changes the printer's settings",
  NETWORK: "changes the printer's network settings",
  STORAGE: "writes or deletes files in the printer's memory",
  RFID: "drives the RFID encoder",
  UNSUPPORTED: "is not used by BillBull labels",
  OUTSIDE_FORMAT: "sits outside a ^XA … ^XZ label",
  CONTROL_CHARACTER: "contains a control character",
  MALFORMED: "is not a well-formed BillBull label command",
  INCOMPLETE: "ends part-way through a label",
  UNKNOWN: "is not a command BillBull sends",
};

const describeZplRefusal = (r) =>
  `Label job refused: ${r.command} at byte ${r.offset} ${CATEGORY_TEXT[r.category] || "is not allowed"}. Nothing was sent to the printer.`;

module.exports = { inspectZpl, describeZplRefusal };
