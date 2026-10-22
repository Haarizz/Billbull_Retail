"use strict";

// The agent's HTTP interface, end to end: a real server, real requests.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startAgent, receiptBytes, TRUSTED, ESC, GS } = require("./helpers");
const { createTokenStore } = require("../lib/pairing");
const { runCli } = require("../lib/cli");

const b64 = (buf) => Buffer.from(buf).toString("base64");

let agent;
test.beforeEach(async () => { agent = await startAgent(); });
test.afterEach(async () => { await agent.close(); });

const escpos = (token, bytes, target = { printerName: "POS-80C", connectionType: "USB" }) => agent.request({
  method: "POST", path: "/print/escpos", headers: agent.authed(token), body: { ...target, dataBase64: b64(bytes) },
});
const nothingPrinted = () => {
  assert.equal(agent.queueJobs.length, 0, "no queue job");
  assert.equal(agent.textJobs.length, 0, "no text job");
  assert.equal(agent.printer.jobs.length, 0, "no bytes at the network printer");
  assert.equal(agent.labelPrinter.jobs.length, 0, "no bytes at the network label printer");
};

test.describe("origin allow-list and CORS", () => {
  test("an exact trusted origin gets its own origin back, never *", async () => {
    const res = await agent.request({ headers: { Origin: TRUSTED } });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], TRUSTED);
    assert.match(res.headers.vary, /Origin/);
  });

  test("health without an Origin answers (monitoring, curl) and sends no CORS header", async () => {
    const res = await agent.request();
    assert.equal(res.status, 200);
    assert.deepEqual({ ok: res.json.ok, service: res.json.service, protocol: res.json.protocol },
      { ok: true, service: "billbull-pos-print-agent", protocol: 2 });
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  for (const origin of [
    "https://evil.example",
    "https://acme.billbull.app.evil.example", // suffix trick
    "https://evil.acme.billbull.app",         // subdomain of a trusted host
    "http://acme.billbull.app",               // wrong scheme
    "https://acme.billbull.app:8443",         // wrong port
    "null",                                   // sandboxed iframe / file://
  ]) {
    test(`untrusted origin ${origin} is refused with no CORS header on every route`, async () => {
      const token = await agent.pair();
      for (const [method, p] of [["GET", "/health"], ["GET", "/printers"], ["POST", "/print/escpos"], ["POST", "/pair/start"]]) {
        const res = await agent.request({
          method, path: p, headers: { Origin: origin, Authorization: `Bearer ${token}` },
          body: method === "POST" ? { printerName: "POS-80C", dataBase64: b64(receiptBytes()) } : undefined,
        });
        assert.equal(res.status, 403, `${method} ${p}`);
        assert.equal(res.json.code, "AGENT_ORIGIN_NOT_ALLOWED");
        assert.equal(res.headers["access-control-allow-origin"], undefined);
      }
      nothingPrinted();
    });
  }

  test("a request with no Origin cannot print even with a valid token", async () => {
    const token = await agent.pair();
    const res = await agent.request({ method: "POST", path: "/print/escpos", headers: { Authorization: `Bearer ${token}` },
      body: { printerName: "POS-80C", dataBase64: b64(receiptBytes()) } });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "AGENT_ORIGIN_REQUIRED");
    nothingPrinted();
  });

  test("the wildcard is never emitted, on success, error or preflight", async () => {
    const token = await agent.pair();
    const responses = [
      await agent.request({ headers: { Origin: TRUSTED } }),
      await agent.request({ path: "/nope", headers: { Origin: TRUSTED } }),
      await agent.request({ path: "/printers", headers: { Origin: TRUSTED } }),
      await agent.request({ path: "/printers", headers: agent.authed(token) }),
      await agent.request({ method: "OPTIONS", path: "/print/escpos", headers: { Origin: TRUSTED, "Access-Control-Request-Method": "POST" } }),
    ];
    for (const res of responses) assert.notEqual(res.headers["access-control-allow-origin"], "*");
  });
});

test.describe("preflight", () => {
  const preflight = (headers) => agent.request({ method: "OPTIONS", path: "/print/escpos", headers: {
    "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type", ...headers,
  } });

  test("a trusted origin may send Authorization and Content-Type, and preflight prints nothing", async () => {
    const res = await preflight({ Origin: TRUSTED, "Access-Control-Request-Private-Network": "true" });
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], TRUSTED);
    assert.match(res.headers["access-control-allow-headers"], /Authorization/);
    assert.match(res.headers["access-control-allow-methods"], /POST/);
    assert.equal(res.headers["access-control-allow-private-network"], "true");
    nothingPrinted();
  });

  test("an untrusted origin's preflight fails, including the private-network grant", async () => {
    const res = await preflight({ Origin: "https://evil.example", "Access-Control-Request-Private-Network": "true" });
    assert.equal(res.status, 403);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
    assert.equal(res.headers["access-control-allow-private-network"], undefined);
  });

  test("unexpected request headers are not granted", async () => {
    const res = await preflight({ Origin: TRUSTED, "Access-Control-Request-Headers": "authorization,x-forwarded-host" });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "AGENT_HEADERS_NOT_ALLOWED");
  });

  test("a simple text/plain POST (no preflight in a browser) is refused before parsing", async () => {
    const token = await agent.pair();
    const res = await agent.request({ method: "POST", path: "/print/escpos", headers: agent.authed(token, { "Content-Type": "text/plain" }),
      rawBody: JSON.stringify({ printerName: "POS-80C", dataBase64: b64(receiptBytes()) }) });
    assert.equal(res.status, 415);
    nothingPrinted();
  });
});

test.describe("host header and DNS rebinding", () => {
  for (const host of ["evil.example:PORT", "acme.billbull.app:PORT", "127.0.0.1.nip.io:PORT", "127.0.0.1:1", ""]) {
    test(`Host ${JSON.stringify(host)} is refused even with a trusted origin and valid token`, async () => {
      const token = await agent.pair();
      const res = await agent.request({ method: "POST", path: "/print/escpos",
        headers: { ...agent.authed(token), Host: host.replace("PORT", agent.port) },
        body: { printerName: "POS-80C", dataBase64: b64(receiptBytes()) } });
      assert.equal(res.status, 421);
      assert.equal(res.json.code, "AGENT_HOST_REJECTED");
      nothingPrinted();
    });
  }

  test("a rebinding page (same-origin to its own name) cannot read health either", async () => {
    const res = await agent.request({ headers: { Host: `evil.example:${agent.port}`, Origin: `http://evil.example:${agent.port}` } });
    assert.equal(res.status, 421);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  test("localhost:<port> is accepted", async () => {
    const res = await agent.request({ headers: { Host: `localhost:${agent.port}` } });
    assert.equal(res.status, 200);
  });
});

test.describe("credentials", () => {
  test("missing, malformed, unknown, revoked and expired tokens cannot print or list printers", async () => {
    const good = await agent.pair();
    const revoked = await agent.pair();
    assert.equal((await agent.request({ method: "POST", path: "/pair/revoke", headers: agent.authed(revoked), body: {} })).status, 200);

    const cases = [
      [{ Origin: TRUSTED }, "AGENT_AUTH_REQUIRED"],
      [{ Origin: TRUSTED, Authorization: "Basic abc" }, "AGENT_AUTH_REQUIRED"],
      [agent.authed("bbpa_notarealtoken"), "AGENT_TOKEN_INVALID"],
      [agent.authed(good.slice(0, -2) + "xx"), "AGENT_TOKEN_INVALID"],
      [agent.authed(revoked), "AGENT_TOKEN_REVOKED"],
    ];
    for (const [headers, code] of cases) {
      for (const [method, p] of [["GET", "/printers"], ["POST", "/print/escpos"], ["POST", "/print/receipt"], ["POST", "/test-print"]]) {
        const res = await agent.request({ method, path: p, headers,
          body: method === "POST" ? { printerName: "POS-80C", text: "hi", dataBase64: b64(receiptBytes()) } : undefined });
        assert.equal(res.status, 401, `${code} ${method} ${p}`);
        assert.equal(res.json.code, code);
        assert.equal(res.headers["access-control-allow-origin"], TRUSTED, "the BillBull page can read why");
      }
    }
    nothingPrinted();
  });

  test("an expired token is refused explicitly", async () => {
    await agent.close();
    let clock = Date.now();
    agent = await startAgent({ now: () => clock, config: { tokenTtlDays: 1 } });
    const token = await agent.pair();
    assert.equal((await agent.request({ path: "/printers", headers: agent.authed(token) })).status, 200);
    clock += 2 * 24 * 60 * 60 * 1000;
    const res = await agent.request({ path: "/printers", headers: agent.authed(token) });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, "AGENT_TOKEN_EXPIRED");
  });

  test("a token is bound to the origin that paired it", async () => {
    agent.config.update((raw) => { raw.allowedOrigins.push("https://other.billbull.app"); });
    const token = await agent.pair("https://other.billbull.app");
    const res = await agent.request({ path: "/printers", headers: agent.authed(token) });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, "AGENT_TOKEN_INVALID");
  });

  test("revoke-all from another process takes effect on the running agent", async () => {
    const token = await agent.pair();
    createTokenStore({ home: agent.home }).revokeAll();
    const res = await agent.request({ path: "/printers", headers: agent.authed(token) });
    assert.equal(res.json.code, "AGENT_TOKEN_REVOKED");
  });

  test("tokens are stored only as hashes", async () => {
    const token = await agent.pair();
    const file = require("node:fs").readFileSync(require("node:path").join(agent.home, "tokens.json"), "utf8");
    assert.ok(!file.includes(token));
    assert.ok(!file.includes(token.slice(5)));
  });

  test("auth/status reports the pairing to its own origin", async () => {
    const token = await agent.pair();
    const res = await agent.request({ path: "/auth/status", headers: agent.authed(token) });
    assert.equal(res.status, 200);
    assert.equal(res.json.paired, true);
    assert.equal(res.json.origin, TRUSTED);
  });
});

test.describe("pairing", () => {
  const start = (origin = TRUSTED) => agent.request({ method: "POST", path: "/pair/start", headers: { Origin: origin }, body: {} });

  test("the code is shown locally, never returned over HTTP", async () => {
    const res = await start();
    assert.equal(res.status, 200);
    assert.equal(agent.codes.length, 1);
    assert.ok(!res.text.includes(agent.codes[0].code));
  });

  test("wrong codes count down, then the attempt is dead even for the right code", async () => {
    const { json } = await start();
    const wrong = agent.codes[0].code === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 0; left--) {
      const res = await agent.request({ method: "POST", path: "/pair/complete", headers: { Origin: TRUSTED }, body: { pairingId: json.pairingId, code: wrong } });
      assert.equal(res.status, 401);
      assert.equal(res.json.attemptsRemaining, left);
    }
    const res = await agent.request({ method: "POST", path: "/pair/complete", headers: { Origin: TRUSTED }, body: { pairingId: json.pairingId, code: agent.codes[0].code } });
    assert.equal(res.status, 410);
  });

  test("an untrusted origin can neither start pairing nor complete someone else's", async () => {
    assert.equal((await start("https://evil.example")).status, 403);
    assert.equal(agent.codes.length, 0);
    const { json } = await start();
    const res = await agent.request({ method: "POST", path: "/pair/complete", headers: { Origin: "https://evil.example" },
      body: { pairingId: json.pairingId, code: agent.codes[0].code } });
    assert.equal(res.status, 403);
  });

  test("pairing starts are rate limited", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await start()).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
  });

  test("an agent with no screen refuses to pair", async () => {
    await agent.close();
    agent = await startAgent();
    const { createAgentServer } = require("../server");
    const headless = createAgentServer({ config: agent.config, displayPairingCode: () => false });
    await new Promise((r) => headless.listen(0, "127.0.0.1", r));
    const port = headless.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/pair/start`, { method: "POST", headers: { Origin: TRUSTED, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, "AGENT_PAIRING_UNAVAILABLE");
    await new Promise((r) => headless.close(r));
  });
});

test.describe("printing with a valid pairing", () => {
  test("a receipt reaches the Windows queue byte for byte, with the integrity hash", async () => {
    const token = await agent.pair();
    const bytes = receiptBytes();
    const res = await escpos(token, bytes);
    assert.equal(res.status, 200, res.text);
    assert.equal(agent.queueJobs.length, 1);
    assert.deepEqual(agent.queueJobs[0].buffer, bytes);
    assert.equal(agent.queueJobs[0].printerName, "POS-80C");
    assert.equal(res.json.sha256, require("node:crypto").createHash("sha256").update(bytes).digest("hex"));
  });

  test("a receipt reaches an allowed network printer byte for byte", async () => {
    const token = await agent.pair();
    const bytes = receiptBytes();
    const res = await escpos(token, bytes, { connectionType: "NETWORK_IP", ipAddress: "127.0.0.1", portNumber: agent.printer.port });
    assert.equal(res.status, 200, res.text);
    assert.equal(agent.printer.jobs.length, 1);
    assert.deepEqual(agent.printer.jobs[0], bytes);
  });

  test("text receipts and test prints still print", async () => {
    const token = await agent.pair();
    for (const p of ["/print/receipt", "/test-print"]) {
      const res = await agent.request({ method: "POST", path: p, headers: agent.authed(token), body: { printerName: "POS-80C", text: "Total 10.00", paperWidthMm: 80 } });
      assert.equal(res.status, 200, res.text);
    }
    assert.equal(agent.textJobs.length, 2);
    const listed = await agent.request({ path: "/printers", headers: agent.authed(token) });
    assert.equal(listed.json.printers[0].Name, "POS-80C");
  });

  test("text cannot smuggle a command to a network printer", async () => {
    const token = await agent.pair();
    const res = await agent.request({ method: "POST", path: "/print/receipt", headers: agent.authed(token),
      body: { connectionType: "NETWORK_IP", ipAddress: "127.0.0.1", portNumber: agent.printer.port, text: "Hi\x1bp\x00\x19\xfa\x10\x14\x01\x00\x05" } });
    assert.equal(res.status, 200, res.text);
    const sent = agent.printer.jobs[0];
    assert.equal(sent.indexOf(Buffer.from([ESC, 0x70])), -1);
    assert.equal(sent.indexOf(Buffer.from([0x10, 0x14])), -1);
  });
});

test.describe("physical commands", () => {
  const refused = async (bytes, category) => {
    const token = await agent.pair();
    for (const target of [{ printerName: "POS-80C", connectionType: "USB" }, { connectionType: "NETWORK_IP", ipAddress: "127.0.0.1", portNumber: agent.printer.port }]) {
      const res = await escpos(token, bytes, target);
      assert.equal(res.status, 403, `${target.connectionType}: ${res.text}`);
      assert.equal(res.json.code, "AGENT_COMMAND_FORBIDDEN");
      assert.equal(res.json.category, category);
    }
    nothingPrinted();
  };
  const withReceipt = (cmd) => Buffer.concat([receiptBytes().subarray(0, 19), Buffer.from(cmd), Buffer.from("tail\n")]);

  test("ESC p drawer pulse sends no bytes", () => refused(withReceipt([ESC, 0x70, 0, 25, 250]), "DRAWER"));
  test("real-time DLE DC4 1 drawer pulse sends no bytes", () => refused(withReceipt([0x10, 0x14, 1, 0, 1]), "DRAWER"));
  test("a strict drawer pulse hidden inside raster data is still found", () => {
    const raster = Buffer.alloc(44 * 2, 0);
    Buffer.from([0x10, 0x14, 1, 0, 3]).copy(raster, 30);
    return refused(receiptBytes(raster), "DRAWER");
  });
  test("ESC B and ESC ( A buzzers send no bytes", async () => {
    await refused(withReceipt([ESC, 0x42, 3, 2]), "BUZZER");
    await refused(withReceipt([ESC, 0x28, 0x41, 4, 0, 48, 48, 1, 1]), "BUZZER");
  });
  test("DLE DC4 2 power-off sends no bytes", () => refused(withReceipt([0x10, 0x14, 2, 1, 8]), "POWER"));
  test("GS ( E user setup and NV graphics writes send no bytes", async () => {
    await refused(withReceipt([GS, 0x28, 0x45, 3, 0, 1, 73, 78]), "NV_WRITE");
    await refused(withReceipt([GS, 0x28, 0x4c, 6, 0, 48, 67, 48, 32, 32, 1]), "NV_WRITE");
  });
  test("Star-mode BEL / FS drawer drives send no bytes", async () => {
    await refused(withReceipt([0x07]), "DRAWER");
    await refused(withReceipt([0x1c]), "DRAWER");
  });
  test("an unknown command is refused rather than guessed at", () => refused(withReceipt([GS, 0x3a]), "UNKNOWN"));
  test("a job ending part-way through a command is refused (it would combine with the next job)", () =>
    refused(Buffer.concat([receiptBytes(), Buffer.from([ESC])]), "INCOMPLETE"));
  test("a raster whose length runs past the end is refused", () =>
    refused(Buffer.from([ESC, 0x40, GS, 0x76, 0x30, 0, 44, 0, 200, 0, 1, 2, 3]), "INCOMPLETE"));

  test("logo and QR bytes that contain drawer-kick patterns do not trigger a false positive", async () => {
    const raster = Buffer.alloc(44 * 4, 0);
    Buffer.from([ESC, 0x70, 0, 25, 250]).copy(raster, 0);       // ESC p in image data
    Buffer.from([0x10, 0x14, 1, 0, 0]).copy(raster, 50);         // non-strict real-time pattern
    Buffer.from([0x07, 0x1a, 0x1c, GS, 0x28, 0x45]).copy(raster, 100);
    const token = await agent.pair();
    const res = await escpos(token, receiptBytes(raster));
    assert.equal(res.status, 200, res.text);
    assert.equal(agent.queueJobs.length, 1);
  });

  test("feed and cut are ordinary print operations", async () => {
    const token = await agent.pair();
    const res = await escpos(token, Buffer.from([ESC, 0x40, ESC, 0x64, 5, ESC, 0x4a, 40, GS, 0x56, 1, GS, 0x56, 66, 120, ESC, 0x6d]));
    assert.equal(res.status, 200, res.text);
  });
});

test.describe("label (ZPL) printing", () => {
  const LABEL = "^XA\n^CI28\n^PW400\n^LL200\n^FO16,16^FB368,1,0,C,0^A0N,22,22^FH^FDACME^FS\n^BY2,2,50\n^FO40,86^BCN,50,Y,N,N^FH^FDBB-1^FS\n^XZ";
  const zpl = (token, text, target = { printerName: "ZD220", connectionType: "USB" }) => agent.request({
    method: "POST", path: "/print/zpl", headers: agent.authed(token), body: { ...target, dataBase64: b64(Buffer.from(text, "utf8")) },
  });
  const NET = () => ({ connectionType: "NETWORK_IP", ipAddress: "127.0.0.1", portNumber: agent.labelPrinter.port });

  test("a BillBull label reaches the queue byte for byte", async () => {
    const token = await agent.pair();
    const res = await zpl(token, LABEL);
    assert.equal(res.status, 200, res.text);
    assert.equal(agent.queueJobs[0].buffer.toString("utf8"), LABEL);
    assert.equal(agent.queueJobs[0].title, "BillBull Labels");
  });

  for (const [what, text, category] of [
    ["~JR power-cycle", `${LABEL}~JR`, "POWER"],
    ["^JUF factory reset", LABEL.replace("^XZ", "^JUF^XZ"), "CONFIG_WRITE"],
    ["^NS network settings", LABEL.replace("^XZ", "^NS,10.0.0.9^XZ"), "NETWORK"],
    ["~DY file download", "~DYE:FW,B,T,1,,A", "STORAGE"],
    ["^ID delete files", LABEL.replace("^XZ", "^IDE:*.*^XZ"), "STORAGE"],
    ["a truncated label", LABEL.slice(0, -3), "INCOMPLETE"],
    ["an unknown command", LABEL.replace("^XZ", "^QQ^XZ"), "UNKNOWN"],
    ["field data that breaks out", LABEL.replace("^FDACME", "^FDACME\\^JUF"), "CONFIG_WRITE"],
  ]) {
    test(`${what} is refused and sends nothing, to a queue or a network printer`, async () => {
      const token = await agent.pair();
      for (const target of [{ printerName: "ZD220", connectionType: "USB" }, NET()]) {
        const res = await zpl(token, text, target);
        assert.equal(res.status, 403, res.text);
        assert.equal(res.json.code, "AGENT_COMMAND_FORBIDDEN");
        assert.equal(res.json.protocol, "zpl");
        assert.equal(res.json.category, category);
      }
      nothingPrinted();
    });
  }

  test("ZPL relabelled as ESC/POS does not get through the receipt route to a label printer", async () => {
    const token = await agent.pair();
    for (const target of [{ printerName: "ZD220", connectionType: "USB" }, NET()]) {
      const res = await escpos(token, Buffer.from("^XA^JUF^XZ~JR"), target);
      assert.equal(res.status, 409, res.text);
      assert.equal(res.json.code, "AGENT_PROTOCOL_MISMATCH");
      assert.equal(res.json.destinationProtocol, "zpl");
    }
    nothingPrinted();
  });

  test("the label route needs the same origin and pairing as every other print", async () => {
    const token = await agent.pair();
    const body = { printerName: "ZD220", dataBase64: b64(Buffer.from(LABEL)) };
    assert.equal((await agent.request({ method: "POST", path: "/print/zpl", headers: { Origin: TRUSTED }, body })).status, 401);
    assert.equal((await agent.request({ method: "POST", path: "/print/zpl", headers: { Origin: "https://evil.example", Authorization: `Bearer ${token}` }, body })).status, 403);
    assert.equal((await agent.request({ method: "POST", path: "/print/zpl", headers: { Authorization: `Bearer ${token}` }, body })).status, 403);
    await agent.request({ method: "POST", path: "/pair/revoke", headers: agent.authed(token), body: {} });
    assert.equal((await agent.request({ method: "POST", path: "/print/zpl", headers: agent.authed(token), body })).status, 401);
    nothingPrinted();
  });

  test("a label printer on a refused network address is not dialled", async () => {
    const token = await agent.pair();
    const res = await zpl(token, LABEL, { connectionType: "NETWORK_IP", ipAddress: "8.8.8.8", portNumber: agent.printer.port });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "AGENT_PRINTER_ADDRESS_REFUSED");
    nothingPrinted();
  });
});

test.describe("network targets", () => {
  for (const [ip, port, why] of [
    ["8.8.8.8", "PRINTER", "public address"],
    ["169.254.169.254", "PRINTER", "link-local / cloud metadata"],
    ["192.168.1.50", 22, "non-printer port"],
    ["0.0.0.0", "PRINTER", "unspecified"],
  ]) {
    test(`${ip}:${port} (${why}) is refused before connecting`, async () => {
      const token = await agent.pair();
      const res = await escpos(token, receiptBytes(), { connectionType: "NETWORK_IP", ipAddress: ip, portNumber: port === "PRINTER" ? agent.printer.port : port });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, "AGENT_PRINTER_ADDRESS_REFUSED");
      nothingPrinted();
    });
  }

  test("loopback is refused unless the till's config allows it", async () => {
    agent.config.update((raw) => { raw.network.allowLoopback = false; });
    const token = await agent.pair();
    const res = await escpos(token, receiptBytes(), { connectionType: "NETWORK_IP", ipAddress: "localhost", portNumber: agent.printer.port });
    assert.equal(res.status, 400);
    nothingPrinted();
  });
});

test.describe("surface", () => {
  test("the Zebra proxy is gone and diagnostics are off by default", async () => {
    const token = await agent.pair();
    for (const [method, p] of [["POST", "/print/label/zebra"], ["POST", "/probe/capabilities"], ["POST", "/probe/echo"], ["GET", "/diagnostics/probe"]]) {
      const res = await agent.request({ method, path: p, headers: agent.authed(token), body: method === "POST" ? { device: "x", zpl: "^XA^XZ", printerName: "POS-80C" } : undefined });
      assert.equal(res.status, 404, p);
    }
    nothingPrinted();
  });

  test("diagnostics, when switched on locally, still need a token and pass the command policy", async () => {
    agent.config.update((raw) => { raw.diagnostics = true; });
    const page = await agent.request({ path: "/diagnostics/probe" });
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    const anon = await agent.request({ method: "POST", path: "/probe/echo", headers: { Origin: TRUSTED }, body: { dataBase64: "AA==" } });
    assert.equal(anon.status, 401);
    const own = `http://127.0.0.1:${agent.port}`;
    const ownHealth = await agent.request({ headers: { Origin: own } });
    assert.equal(ownHealth.headers["access-control-allow-origin"], own);
    // The probe page's same-origin GETs carry no Origin; they still need its token.
    const sameOrigin = { "Sec-Fetch-Site": "same-origin" };
    assert.equal((await agent.request({ path: "/printers", headers: sameOrigin })).status, 401);
    const ownToken = await agent.pair(own);
    assert.equal((await agent.request({ path: "/printers", headers: { ...sameOrigin, Authorization: `Bearer ${ownToken}` } })).status, 200);
    assert.equal((await agent.request({ path: "/printers", headers: agent.authed(ownToken) })).status, 401, "not valid for the tenant origin");
    agent.config.update((raw) => { raw.diagnostics = false; });
    assert.equal((await agent.request({ path: "/printers", headers: { ...sameOrigin, Authorization: `Bearer ${ownToken}` } })).status, 403);
    assert.equal((await agent.request({ headers: { Origin: own } })).status, 403);
  });

  test("oversized bodies are refused", async () => {
    agent.config.update((raw) => { raw.maxBodyBytes = 1024; });
    const token = await agent.pair();
    const res = await escpos(token, Buffer.alloc(4096, 0x41));
    assert.equal(res.status, 413);
    nothingPrinted();
  });

  test("CLI origin changes reach the running agent without a restart, and bad origins are rejected", async () => {
    const out = [];
    const codes = [];
    const io = { config: agent.config, out: (m) => out.push(m), err: (m) => out.push(m), exit: (c) => codes.push(c) };
    for (const bad of ["*.billbull.app", "https://*.billbull.app", "http://acme.billbull.app", "https://acme.billbull.app/pos", "ftp://x"]) {
      runCli(["--add-origin", bad], io);
    }
    assert.deepEqual(codes, [2, 2, 2, 2, 2]);
    runCli(["--add-origin", "https://new.billbull.app/"], io);
    assert.equal((await agent.request({ headers: { Origin: "https://new.billbull.app" } })).status, 200);
    runCli(["--remove-origin", "https://new.billbull.app"], io);
    assert.equal((await agent.request({ headers: { Origin: "https://new.billbull.app" } })).status, 403);
    // An unknown or mistyped command is refused; it never starts a second agent.
    codes.length = 0;
    assert.equal(runCli(["--not-a-command"], io), true);
    assert.deepEqual(codes, [2]);
    assert.equal(runCli([], io), false);
  });
});
