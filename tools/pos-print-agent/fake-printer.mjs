// Diagnostic-only TCP listener that stands in for a real ESC/POS thermal printer.
// Point a BillBull printer at it (connectionType: Network/IP, ipAddress: 127.0.0.1,
// port: whatever you pass below) and any print/test-print job sent to it — through
// either the local agent's /print/escpos or the backend's network-printer relay —
// lands here instead of a physical printer. Every byte received is saved raw
// (.bin) and decoded into a human-readable command trace (.txt) so you can verify
// the full pipeline (Settings config -> ESC/POS builder -> transport -> socket)
// end-to-end with no printer attached.
//
// Usage: node fake-printer.mjs [port]   (defaults to 9100, the ESC/POS convention)
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 9100);
const OUT_DIR = path.join(process.cwd(), "captures");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ESC = 0x1b;
const GS = 0x1d;

// Walks the byte stream and labels every ESC/POS command this app's builders
// emit (escPosReceipt.js), so a capture can be sanity-checked without a printer:
// correct INIT/heating/codepage preamble, sane text, a QR block if expected, and
// a trailing cut — rather than just staring at a wall of hex.
function annotate(bytes) {
  const lines = [];
  let i = 0;
  let textBuf = "";
  const flush = () => {
    if (textBuf) {
      lines.push(`TEXT: ${JSON.stringify(textBuf)}`);
      textBuf = "";
    }
  };
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === ESC && bytes[i + 1] === 0x40) { flush(); lines.push("CMD: ESC @  (INIT)"); i += 2; continue; }
    if (b === ESC && bytes[i + 1] === 0x37) { flush(); lines.push(`CMD: ESC 7  (heating) dots=${bytes[i + 2]} time=${bytes[i + 3]} interval=${bytes[i + 4]}`); i += 5; continue; }
    if (b === ESC && bytes[i + 1] === 0x4d) { flush(); lines.push(`CMD: ESC M  (select font) ${bytes[i + 2]}`); i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x33) { flush(); lines.push(`CMD: ESC 3  (line spacing) ${bytes[i + 2]}`); i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x32) { flush(); lines.push("CMD: ESC 2  (default line spacing)"); i += 2; continue; }
    if (b === ESC && bytes[i + 1] === 0x45) { flush(); lines.push(`CMD: ESC E  (bold) ${bytes[i + 2] ? "ON" : "OFF"}`); i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x61) { flush(); lines.push(`CMD: ESC a  (align) ${["LEFT", "CENTER", "RIGHT"][bytes[i + 2]] ?? bytes[i + 2]}`); i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x74) { flush(); lines.push(`CMD: ESC t  (codepage) ${bytes[i + 2]}`); i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x64) { flush(); lines.push(`CMD: ESC d  (feed) ${bytes[i + 2]} lines`); i += 3; continue; }
    if (b === GS && bytes[i + 1] === 0x21) { flush(); lines.push(`CMD: GS !   (char size) 0x${bytes[i + 2].toString(16).padStart(2, "0")}`); i += 3; continue; }
    if (b === GS && bytes[i + 1] === 0x56) { flush(); lines.push(`CMD: GS V   (cut) mode=${bytes[i + 2]}`); i += 3; continue; }
    if (b === GS && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      flush();
      const xL = bytes[i + 4], xH = bytes[i + 5], yL = bytes[i + 6], yH = bytes[i + 7];
      const bytesPerRow = xL | (xH << 8);
      const height = yL | (yH << 8);
      const dataLen = bytesPerRow * height;
      lines.push(`CMD: GS v 0 (raster image) ${bytesPerRow * 8}x${height} dots, ${dataLen} data bytes`);
      i += 8 + dataLen;
      continue;
    }
    if (b === GS && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b) {
      flush();
      const len = (bytes[i + 3] | (bytes[i + 4] << 8)) & 0xffff;
      lines.push(`CMD: GS ( k (QR code sub-command) ${len} byte payload`);
      i += 5 + len;
      continue;
    }
    if (b === 0x0a) { flush(); lines.push("<line break>"); i += 1; continue; }
    if (b >= 0x20 && b <= 0xff) { textBuf += String.fromCharCode(b); i += 1; continue; }
    flush();
    lines.push(`BYTE: 0x${b.toString(16).padStart(2, "0")}`);
    i += 1;
  }
  flush();
  return lines.join("\n");
}

const server = net.createServer((socket) => {
  const chunks = [];
  socket.on("data", (d) => chunks.push(d));
  socket.on("end", () => {
    const buf = Buffer.concat(chunks);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const binPath = path.join(OUT_DIR, `capture-${stamp}.bin`);
    const txtPath = path.join(OUT_DIR, `capture-${stamp}.txt`);
    const annotated = annotate(buf);
    fs.writeFileSync(binPath, buf);
    fs.writeFileSync(txtPath, annotated);
    console.log(`\n=== received ${buf.length} bytes -> ${binPath} ===\n`);
    console.log(annotated);
    console.log(`\n=== end (also saved to ${txtPath}) ===\n`);
  });
  socket.on("error", () => {}); // client disconnecting mid-write is expected/harmless here
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Fake thermal printer listening on 127.0.0.1:${PORT}`);
  console.log(`Add a BillBull printer with Connection Type = "Network / IP", IP = 127.0.0.1, Port = ${PORT}, then Test Print / print a sale.`);
  console.log(`Captures are written to ${OUT_DIR}`);
});
