"use strict";

// Test harness: a real agent on an ephemeral loopback port with its home in a
// temp directory. The Windows-queue transport is replaced by a recorder, so no
// test can reach a physical printer; network jobs go to loopback TCP listeners
// that record every byte they receive — `printer` set up as a receipt printer
// (ESC/POS) and `labelPrinter` as a Zebra (ZPL). The Windows queues "POS-80C"
// (ESC/POS) and "ZD220" (ZPL) are set up the same way; pass `printers` in
// `config` to replace that setup.

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { createAgentServer } = require("../server");
const { createConfig } = require("../lib/config");

const TRUSTED = "https://acme.billbull.app";

const startFakePrinter = () => new Promise((resolve) => {
  const jobs = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (d) => chunks.push(d));
    socket.on("end", () => jobs.push(Buffer.concat(chunks)));
    socket.on("error", () => {});
  });
  server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, jobs, close: () => new Promise((r) => server.close(r)) }));
});

const startAgent = async ({ config: extra = {}, now } = {}) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bbpa-test-"));
  const printer = await startFakePrinter();
  const labelPrinter = await startFakePrinter();
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({
    allowedOrigins: [TRUSTED],
    network: { allowedPorts: `${printer.port},${labelPrinter.port}`, allowLoopback: true },
    printers: {
      escpos: { queues: ["POS-80C"], network: [`127.0.0.1:${printer.port}`] },
      zpl: { queues: ["ZD220"], network: [`127.0.0.1:${labelPrinter.port}`] },
    },
    ...extra,
  }));
  const config = createConfig({ home, env: {} });
  const queueJobs = [];
  const textJobs = [];
  const codes = [];
  const server = createAgentServer({
    config,
    now,
    displayPairingCode: (event) => { if (!event.done) codes.push(event); return true; },
    transports: {
      listPrinters: async () => [{ Name: "POS-80C", IsDefault: true, StatusLabel: "Normal" }],
      printQueue: async (job) => { queueJobs.push(job); return { ok: true, message: "queued" }; },
      printText: async (job) => { textJobs.push(job); return { ok: true, message: "printed" }; },
      capture: async () => {},
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // http.request rather than fetch: tests need full control of Host and Origin.
  const request = ({ method = "GET", path: p = "/health", headers = {}, body, rawBody } = {}) =>
    new Promise((resolve, reject) => {
      const payload = rawBody ?? (body === undefined ? null : JSON.stringify(body));
      const req = http.request({
        host: "127.0.0.1",
        port,
        method,
        path: p,
        setHost: false,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(payload !== null && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type") ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { /* not JSON */ }
          resolve({ status: res.statusCode, headers: res.headers, json, text });
        });
      });
      req.on("error", reject);
      if (payload !== null) req.write(payload);
      req.end();
    });

  const pair = async (origin = TRUSTED) => {
    const start = await request({ method: "POST", path: "/pair/start", headers: { Origin: origin }, body: { label: "test till" } });
    const code = codes[codes.length - 1].code;
    const done = await request({ method: "POST", path: "/pair/complete", headers: { Origin: origin }, body: { pairingId: start.json.pairingId, code } });
    return done.json.token;
  };

  const authed = (token, extra = {}) => ({ Origin: TRUSTED, Authorization: `Bearer ${token}`, ...extra });

  const close = async () => {
    await new Promise((r) => server.close(r));
    await printer.close();
    await labelPrinter.close();
    fs.rmSync(home, { recursive: true, force: true });
  };

  // Network jobs land when the socket closes, a moment after the HTTP reply.
  const settle = () => new Promise((r) => setTimeout(r, 250));

  return { server, port, home, config, request, pair, authed, printer, labelPrinter, queueJobs, textJobs, codes, settle, close };
};

// A receipt shaped like escPosReceipt.js output: init, heating, code page,
// text, logo raster, QR, Code 39 barcode, feed, feed-and-cut.
const ESC = 0x1b, GS = 0x1d;
const receiptBytes = (rasterData = Buffer.alloc(44 * 8, 0x55)) => {
  const bpr = 44, rows = rasterData.length / bpr;
  const qr = Buffer.from("TAX INVOICE INV-1 AED 10.00", "latin1");
  return Buffer.concat([
    Buffer.from([ESC, 0x40, ESC, 0x37, 9, 255, 2, ESC, 0x74, 16, ESC, 0x4d, 0, ESC, 0x33, 30, ESC, 0x61, 1]),
    Buffer.from([GS, 0x76, 0x30, 0x00, bpr, 0, rows & 0xff, rows >> 8]), rasterData,
    Buffer.from("ACME TRADING\nTotal  AED 10.00\n", "latin1"),
    Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    Buffer.from([GS, 0x28, 0x6b, qr.length + 3, 0x00, 0x31, 0x50, 0x30]), qr,
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    Buffer.from([GS, 0x68, 90, GS, 0x77, 3, GS, 0x48, 2, GS, 0x66, 1, GS, 0x6b, 0x04]), Buffer.from("INV-1", "latin1"), Buffer.from([0x00, 0x0a]),
    Buffer.from([ESC, 0x4a, 12, ESC, 0x64, 2, GS, 0x56, 66, 120]),
  ]);
};

module.exports = { startAgent, receiptBytes, TRUSTED, ESC, GS };
