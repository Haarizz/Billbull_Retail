"use strict";

// Decides whether a raw printer byte stream may be sent to a printer.
//
// The stream is walked command by command the way the printer parses it, so an
// argument or a raster/QR data block is never mistaken for a command: a logo
// that happens to contain 1B 70 (ESC p) is image data, not a drawer pulse.
// This mirrors the backend's EscPosDrawerKick walker, but is an ALLOWLIST:
// only commands a receipt or label needs are accepted, and anything else —
// a drawer pulse, a buzzer, power-off, a write to the printer's non-volatile
// memory, or a command this walker does not know — rejects the whole job
// before a single byte reaches the printer.
//
// Why reject unknown commands instead of skipping them: without knowing a
// command's length the walker cannot tell where its arguments end, so it can no
// longer tell commands from data. The BillBull receipt builder
// (packages/shared/src/utils/escPosReceipt.js) and probe.html only emit
// commands listed here.
//
// This walker reads bytes the way an ESC/POS printer does, and only that way.
// It does not look for ZPL: '^' and '~' are ordinary text to a receipt printer
// ("Gift Box~Deluxe" prints as written). Which printers speak ZPL is decided by
// the destination, not by the bytes: a job reaches this policy only when its
// destination is set up for ESC/POS (lib/destinations.js), and a Zebra label
// printer is set up for ZPL, where lib/zplPolicy.js applies instead.
//
// A job that ends part-way through a command is rejected too: the printer
// would complete that command with the first bytes of the NEXT job, so
// "...ESC" followed by a job starting "p 0 25 250" would open the drawer
// without either job containing a whole pulse.

const NUL = 0x00, BEL = 0x07, DLE = 0x10, DC4 = 0x14, EOT = 0x04, ENQ = 0x05;
const SUB = 0x1a, ESC = 0x1b, FS = 0x1c, GS = 0x1d;

// Fixed argument counts for accepted single-form commands.
const ESC_ARGS = new Map([
  [0x20, 1], // ESC SP  right-side character spacing
  [0x21, 1], // ESC !   print mode
  [0x24, 2], // ESC $   absolute position
  [0x2d, 1], // ESC -   underline
  [0x32, 0], // ESC 2   default line spacing
  [0x33, 1], // ESC 3   line spacing
  [0x37, 3], // ESC 7   heating (clone density control, RAM only)
  [0x40, 0], // ESC @   initialise
  [0x45, 1], // ESC E   bold
  [0x47, 1], // ESC G   double-strike
  [0x4a, 1], // ESC J   print and feed n dots
  [0x4d, 1], // ESC M   font
  [0x52, 1], // ESC R   international character set
  [0x56, 1], // ESC V   90° rotation
  [0x5c, 2], // ESC \   relative position
  [0x61, 1], // ESC a   justification
  [0x64, 1], // ESC d   print and feed n lines
  [0x69, 0], // ESC i   full cut (legacy)
  [0x6d, 0], // ESC m   partial cut (legacy)
  [0x74, 1], // ESC t   code page
  [0x7b, 1], // ESC {   upside-down
]);

const GS_ARGS = new Map([
  [0x21, 1], // GS !    character size
  [0x42, 1], // GS B    reverse print
  [0x48, 1], // GS H    barcode HRI position
  [0x49, 1], // GS I    transmit printer ID (read-only)
  [0x4c, 2], // GS L    left margin
  [0x50, 2], // GS P    motion units
  [0x57, 2], // GS W    print area width
  [0x62, 1], // GS b    smoothing
  [0x66, 1], // GS f    HRI font
  [0x68, 1], // GS h    barcode height
  [0x72, 1], // GS r    transmit status (read-only)
  [0x77, 1], // GS w    barcode module width
]);

// GS ( L / GS 8 L graphics functions. Print-buffer and RAM ("download")
// graphics are accepted; 65-68 delete or define NV graphics, which rewrites the
// printer's flash and survives power-off.
const GRAPHICS_FN_ALLOWED = new Set([48, 49, 50, 51, 52, 64, 69, 80, 81, 82, 83, 84, 85, 112, 113]);
const GRAPHICS_FN_NV_WRITE = new Set([65, 66, 67, 68]);

// Named refusals, so the error a cashier or support engineer sees says what
// was blocked rather than "unknown command".
const DENIED_ESC = new Map([
  [0x70, ["ESC p", "DRAWER"]],             // pulse to drawer kick connector
  [0x42, ["ESC B", "BUZZER"]],             // beeper (Star-compatible and clone firmware)
  [0x07, ["ESC BEL", "DRAWER"]],           // Star: peripheral pulse width
  [0x63, ["ESC c", "HARDWARE_CONFIG"]],    // paper sensors / panel buttons
  [0x3d, ["ESC =", "HARDWARE_CONFIG"]],    // select peripheral device
]);

const DENIED_GS_PAREN = new Map([
  [0x41, ["GS ( A", "HARDWARE_CONTROL"]],  // self-test print
  [0x43, ["GS ( C", "NV_WRITE"]],          // edit NV user memory
  [0x44, ["GS ( D", "HARDWARE_CONFIG"]],   // enable/disable real-time commands
  [0x45, ["GS ( E", "NV_WRITE"]],          // user setup (memory switches)
  [0x4d, ["GS ( M", "NV_WRITE"]],          // customize setting values
]);

const DLE_DC4_FN = new Map([
  [1, "DRAWER"],
  [2, "POWER"],
  [3, "BUZZER"],
]);

const u = (data, at) => (at >= 0 && at < data.length ? data[at] : -1);
const word = (data, at) => u(data, at) + 256 * u(data, at + 1);
const hex = (b) => `0x${b.toString(16).padStart(2, "0")}`;

class Refusal {
  constructor(offset, command, category) {
    this.offset = offset;
    this.command = command;
    this.category = category;
  }
}

// Real-time commands can be acted on even inside image data, so data blocks
// are scanned for the strict drawer-pulse and power-off forms. Strict
// parameters (m 0/1, t 1-8; power-off is exactly DLE DC4 2 1 8) keep a random
// 5-byte match in a raster at roughly one in 10^9 positions — the same rule as
// the backend's EscPosDrawerKick.realtimePulseIn.
const realtimeInBlock = (data, from, to) => {
  for (let j = Math.max(from, 0); j + 4 < to; j++) {
    if (data[j] !== DLE || data[j + 1] !== DC4) continue;
    const fn = data[j + 2], a = data[j + 3], b = data[j + 4];
    if (fn === 1 && a <= 1 && b >= 1 && b <= 8) return new Refusal(j, "DLE DC4 1 (in data)", "DRAWER");
    if (fn === 2 && a === 1 && b === 8) return new Refusal(j, "DLE DC4 2 (in data)", "POWER");
  }
  return null;
};

// Returns [headerLength, dataBlockLength] for the command at i, or a Refusal.
const measure = (data, i) => {
  const b = data[i];
  const c = u(data, i + 1);

  if (b === DLE) {
    if (c === EOT) {
      const n = u(data, i + 2);
      return [n === 7 || n === 8 ? 4 : 3, 0]; // DLE EOT n [a] — status request
    }
    if (c === ENQ) return [3, 0];              // DLE ENQ n — real-time request
    if (c === DC4) {
      const fn = u(data, i + 2);
      return new Refusal(i, `DLE DC4 ${fn}`, DLE_DC4_FN.get(fn) || "HARDWARE_CONTROL");
    }
    return [1, 0]; // a lone DLE is ordinary data
  }

  if (b === ESC) {
    if (ESC_ARGS.has(c)) return [2 + ESC_ARGS.get(c), 0];
    if (c === 0x2a) { // ESC * m nL nH d1..dk
      const m = u(data, i + 2);
      if (m !== 0 && m !== 1 && m !== 32 && m !== 33) return new Refusal(i, `ESC * ${m}`, "UNKNOWN");
      return [5, word(data, i + 3) * (m >= 32 ? 3 : 1)];
    }
    if (c === 0x28 && u(data, i + 2) === 0x41) return new Refusal(i, "ESC ( A", "BUZZER");
    if (DENIED_ESC.has(c)) return new Refusal(i, ...DENIED_ESC.get(c));
    return new Refusal(i, c < 0 ? "ESC" : `ESC ${hex(c)}`, c < 0 ? "INCOMPLETE" : "UNKNOWN");
  }

  if (b === GS) {
    if (GS_ARGS.has(c)) return [2 + GS_ARGS.get(c), 0];
    switch (c) {
      case 0x76: // GS v 0 m xL xH yL yH d1..dk
        if (u(data, i + 2) !== 0x30) return new Refusal(i, "GS v", "UNKNOWN");
        return [8, word(data, i + 4) * word(data, i + 6)];
      case 0x56: { // GS V m [n]
        const m = u(data, i + 2);
        if ([0, 1, 48, 49].includes(m)) return [3, 0];
        if ([65, 66, 97, 98, 103, 104].includes(m)) return [4, 0];
        return new Refusal(i, `GS V ${m}`, m < 0 ? "INCOMPLETE" : "UNKNOWN");
      }
      case 0x6b: { // GS k m d1..dk NUL (m 0-6) | GS k m n d1..dn (m 65-79)
        const m = u(data, i + 2);
        if (m >= 0 && m <= 6) {
          let end = i + 3;
          while (end < data.length && data[end] !== NUL) end++;
          if (end >= data.length) return new Refusal(i, `GS k ${m}`, "INCOMPLETE");
          return [3, end + 1 - (i + 3)];
        }
        if (m >= 65 && m <= 79) return [4, u(data, i + 3)];
        return new Refusal(i, `GS k ${m}`, m < 0 ? "INCOMPLETE" : "UNKNOWN");
      }
      case 0x28: { // GS ( fn pL pH ...
        const fn = u(data, i + 2);
        if (fn === 0x6b) return [5, word(data, i + 3)]; // GS ( k — QR / 2D symbols
        if (fn === 0x4c) { // GS ( L pL pH m fn ...
          const gfn = u(data, i + 6);
          if (GRAPHICS_FN_NV_WRITE.has(gfn)) return new Refusal(i, `GS ( L fn ${gfn}`, "NV_WRITE");
          if (!GRAPHICS_FN_ALLOWED.has(gfn)) return new Refusal(i, `GS ( L fn ${gfn}`, gfn < 0 ? "INCOMPLETE" : "UNKNOWN");
          return [5, word(data, i + 3)];
        }
        if (DENIED_GS_PAREN.has(fn)) return new Refusal(i, ...DENIED_GS_PAREN.get(fn));
        return new Refusal(i, fn < 0 ? "GS (" : `GS ( ${hex(fn)}`, fn < 0 ? "INCOMPLETE" : "UNKNOWN");
      }
      case 0x38: { // GS 8 L p1 p2 p3 p4 m fn ...
        if (u(data, i + 2) !== 0x4c) return new Refusal(i, "GS 8", "UNKNOWN");
        const gfn = u(data, i + 8);
        if (GRAPHICS_FN_NV_WRITE.has(gfn)) return new Refusal(i, `GS 8 L fn ${gfn}`, "NV_WRITE");
        if (!GRAPHICS_FN_ALLOWED.has(gfn)) return new Refusal(i, `GS 8 L fn ${gfn}`, gfn < 0 ? "INCOMPLETE" : "UNKNOWN");
        return [7, word(data, i + 3) + word(data, i + 5) * 65536];
      }
      default:
        return new Refusal(i, c < 0 ? "GS" : `GS ${hex(c)}`, c < 0 ? "INCOMPLETE" : "UNKNOWN");
    }
  }

  // FS: kanji commands in ESC/POS, but in Star line mode a bare FS drives the
  // drawer. Neither BillBull builder emits it.
  return new Refusal(i, "FS", "DRAWER");
};

/**
 * @param {Uint8Array|Buffer} data
 * @returns {{ allowed: true } | { allowed: false, offset: number, command: string, category: string }}
 */
const inspectEscPos = (data) => {
  const n = data.length;
  let i = 0;
  while (i < n) {
    const b = data[i];
    // BEL and SUB drive peripheral 1/2 (the drawer, or a buzzer wired to its
    // port) on Star line-mode printers; ESC/POS printers ignore them.
    if (b === BEL || b === SUB) return { allowed: false, offset: i, command: hex(b), category: "DRAWER" };
    if (b !== DLE && b !== ESC && b !== GS && b !== FS) {
      i++; // text and single-byte controls (LF, CR, HT, FF, CAN, NUL)
      continue;
    }
    const m = measure(data, i);
    if (m instanceof Refusal) return { allowed: false, ...m };
    const [header, block] = m;
    const start = i + header;
    const end = start + block;
    if (header < 1 || end > n || u(data, start - 1) < 0) {
      return { allowed: false, offset: i, command: describeAt(data, i), category: "INCOMPLETE" };
    }
    const hit = realtimeInBlock(data, start, end);
    if (hit) return { allowed: false, ...hit };
    i = end;
  }
  return { allowed: true };
};

const describeAt = (data, i) => [data[i], u(data, i + 1)]
  .filter((x) => x >= 0)
  .map((x) => ({ [ESC]: "ESC", [GS]: "GS", [DLE]: "DLE", [FS]: "FS" }[x] || hex(x)))
  .join(" ");

const CATEGORY_TEXT = {
  DRAWER: "opens a cash drawer",
  BUZZER: "sounds the printer buzzer",
  POWER: "powers the printer off",
  NV_WRITE: "rewrites the printer's permanent memory",
  HARDWARE_CONFIG: "changes the printer's hardware settings",
  HARDWARE_CONTROL: "controls printer hardware",
  INCOMPLETE: "ends part-way through a command",
  UNKNOWN: "is not a command BillBull sends",
};

const describeRefusal = (r) =>
  `Print job refused: ${r.command} at byte ${r.offset} ${CATEGORY_TEXT[r.category] || "is not allowed"}. Nothing was sent to the printer.`;

module.exports = { inspectEscPos, describeRefusal };
