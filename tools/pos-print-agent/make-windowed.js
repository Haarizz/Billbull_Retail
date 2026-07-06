"use strict";

// pkg always compiles a CONSOLE-subsystem exe on Windows, so double-clicking
// BillBullPrintAgent.exe pops a console window even though tray.js never writes
// to it and never wants one. There's no pkg flag for this — the console
// window is a property of the PE header itself, decided by Windows before the
// process even starts, so tray.js has no way to hide it at runtime. The fix is
// to flip the PE Optional Header's Subsystem field from
// IMAGE_SUBSYSTEM_WINDOWS_CUI (3) to IMAGE_SUBSYSTEM_WINDOWS_GUI (2) after build.
// Run this right after `npm run build` (before packaging the installer) —
// `npm run build` alone will keep producing a console-subsystem exe.
const fs = require("node:fs");
const path = require("node:path");

const exePath = path.join(__dirname, "dist", "BillBullPrintAgent.exe");

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

const buf = fs.readFileSync(exePath);

if (buf.readUInt16LE(0) !== 0x5a4d) {
  throw new Error("Not a valid PE file (missing MZ signature).");
}
const peOffset = buf.readUInt32LE(0x3c);
if (buf.readUInt32LE(peOffset) !== 0x00004550) {
  throw new Error("Not a valid PE file (missing PE signature).");
}

const coffHeaderOffset = peOffset + 4;
const sizeOfOptionalHeader = buf.readUInt16LE(coffHeaderOffset + 16);
if (sizeOfOptionalHeader === 0) {
  throw new Error("No optional header present — can't locate Subsystem field.");
}

const optionalHeaderOffset = coffHeaderOffset + 20;
const magic = buf.readUInt16LE(optionalHeaderOffset);
// Subsystem sits at a fixed offset from the start of the optional header:
// PE32 (0x10b) -> +68, PE32+ (0x20b) -> +68 as well (same field layout up to here).
const subsystemOffset = optionalHeaderOffset + 68;

const current = buf.readUInt16LE(subsystemOffset);
if (current === IMAGE_SUBSYSTEM_WINDOWS_GUI) {
  console.log(`Already GUI subsystem (2) — nothing to do: ${exePath}`);
  process.exit(0);
}
if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
  throw new Error(`Unexpected existing subsystem value ${current}; refusing to patch to avoid corrupting the exe.`);
}

buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
fs.writeFileSync(exePath, buf);
console.log(`Patched subsystem CUI(3) -> GUI(2): ${exePath}`);
