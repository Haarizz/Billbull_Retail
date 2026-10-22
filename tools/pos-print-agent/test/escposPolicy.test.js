"use strict";

// Unit coverage for the command walker. The HTTP suite proves refusals reach
// the wire; this pins the parsing edge cases.

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectEscPos } = require("../lib/escposPolicy");
const { receiptBytes, ESC, GS } = require("./helpers");

const verdict = (bytes) => inspectEscPos(Buffer.from(bytes));

test("a representative receipt is allowed", () => {
  assert.deepEqual(inspectEscPos(receiptBytes()), { allowed: true });
});

test("plain text passes, including ordinary uses of ^ and ~", () => {
  assert.equal(verdict(Buffer.from("hello\r\n\tworld\x0c")).allowed, true);
  assert.equal(verdict(Buffer.from("Cable 2m ~ approx x^2 ~xl ~ab ^XYZ 50%~60%")).allowed, true);
});

test("receipt text with carets and tildes is text, including names that spell ZPL commands", () => {
  // Formerly refused by a ZPL substring heuristic ("~DE" is a ZPL command). The
  // destination now decides the protocol (lib/destinations.js), so the ESC/POS
  // walker reads '^' and '~' the way a receipt printer does: as characters.
  for (const text of ["Gift Box~Deluxe", "Gift Box~Deluxe x2  AED 45.00\n", "Tea ~JR Blend", "^XA Promo ^XZ", "~DY~DG~JR", "a^b~c^~^~", "x^2 ~ 50%~60%"]) {
    assert.deepEqual(verdict(Buffer.from(text)), { allowed: true }, text);
  }
});

test("command-like bytes in QR, barcode and raster data are data", () => {
  const qr = Buffer.from("~JR^XA^JUF^XZ~DYE:X");
  assert.equal(verdict([GS, 0x28, 0x6b, qr.length + 3, 0, 0x31, 0x50, 0x30, ...qr]).allowed, true);
  assert.equal(verdict([GS, 0x6b, 4, ...Buffer.from("^XA~JR"), 0]).allowed, true);
  const img = Buffer.from("^XA~JR~DY^XA~JR~DY");
  assert.equal(verdict([GS, 0x76, 0x30, 0, img.length, 0, 1, 0, ...img, 0x0a]).allowed, true);
  assert.equal(verdict([...Buffer.from("^X"), GS, 0x76, 0x30, 0, 1, 0, 1, 0, 0xff, ...Buffer.from("A")]).allowed, true);
});

test("the ESC/POS command restrictions still apply around caret and tilde text", () => {
  assert.equal(verdict([...Buffer.from("Gift Box~Deluxe"), ESC, 0x70, 0, 25, 250]).category, "DRAWER");
  assert.equal(verdict([...Buffer.from("~JR"), 0x10, 0x14, 2, 1, 8]).category, "POWER");
  assert.equal(verdict([...Buffer.from("^XA"), ESC]).category, "INCOMPLETE");
});

test("ESC * column image data is skipped by its declared length", () => {
  const cols = 4;
  const data = [ESC, 0x70, 0, 25, 250, 0, 0, 0, 0, 0, 0, 0]; // 3 bytes x 4 columns
  assert.equal(verdict([ESC, 0x2a, 33, cols, 0, ...data, 0x0a]).allowed, true);
});

test("GS k NUL-terminated and length-prefixed barcodes skip their data", () => {
  assert.equal(verdict([GS, 0x6b, 4, ...Buffer.from("A\x1bpB"), 0]).allowed, true);
  assert.equal(verdict([GS, 0x6b, 73, 3, ESC, 0x70, 0]).allowed, true);
  assert.equal(verdict([GS, 0x6b, 4, 0x41, 0x42]).category, "INCOMPLETE");
});

test("GS ( L print-buffer graphics (probe slips) are allowed; NV define is not", () => {
  const img = new Array(6 * 32).fill(0xff);
  const p = img.length + 10;
  const store = [GS, 0x28, 0x4c, p & 0xff, p >> 8, 48, 112, 48, 1, 1, 49, 48, 0, 32, 0, ...img];
  const print = [GS, 0x28, 0x4c, 2, 0, 48, 50];
  assert.equal(verdict([...store, ...print]).allowed, true);
  assert.equal(verdict([GS, 0x38, 0x4c, 6, 0, 0, 0, 48, 67, 48, 1, 1, 1]).category, "NV_WRITE");
});

test("real-time status requests are harmless; every DLE DC4 function is refused", () => {
  assert.equal(verdict([0x10, 0x04, 1, 0x10, 0x05, 2]).allowed, true);
  assert.equal(verdict([0x10, 0x14, 1, 0, 1]).category, "DRAWER");
  assert.equal(verdict([0x10, 0x14, 2, 1, 8]).category, "POWER");
  assert.equal(verdict([0x10, 0x14, 3, 0, 1, 1, 1, 1]).category, "BUZZER");
  assert.equal(verdict([0x10, 0x14, 8, 1, 3, 20, 1, 6, 2, 8]).category, "HARDWARE_CONTROL");
});

test("the refusal names the command and its position", () => {
  const v = verdict([ESC, 0x40, 0x41, ESC, 0x70, 0, 25, 250]);
  assert.deepEqual(v, { allowed: false, offset: 3, command: "ESC p", category: "DRAWER" });
});

test("power-off hidden in raster data is found", () => {
  const raster = [GS, 0x76, 0x30, 0, 8, 0, 1, 0, 0, 0x10, 0x14, 2, 1, 8, 0, 0];
  assert.equal(verdict(raster).category, "POWER");
});

test("GS V forms: cut, and feed-then-cut", () => {
  for (const cut of [[GS, 0x56, 0], [GS, 0x56, 1], [GS, 0x56, 48], [GS, 0x56, 49], [GS, 0x56, 65, 3], [GS, 0x56, 66, 120]]) {
    assert.equal(verdict(cut).allowed, true, JSON.stringify(cut));
  }
  assert.equal(verdict([GS, 0x56, 7]).category, "UNKNOWN");
});
