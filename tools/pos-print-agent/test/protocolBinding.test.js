"use strict";

// Every job is checked against the protocol of the destination it is going
// to, as set up on this PC — never against what the request says. These run
// against the real HTTP server with the fake queue recorder and the fake
// network printers from helpers.js; nothing reaches a physical printer.

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { startAgent, receiptBytes, ESC, GS } = require("./helpers");

const b64 = (buf) => Buffer.from(buf).toString("base64");
const LABEL = "^XA\n^CI28\n^PW400\n^LL200\n^FO16,16^FB368,1,0,C,0^A0N,22,22^FH^FDGift Box_7EDeluxe^FS\n^XZ";

let agent;
let token;
test.beforeEach(async () => { agent = await startAgent(); token = await agent.pair(); });
test.afterEach(async () => { await agent.close(); });

const post = (route, body) => agent.request({ method: "POST", path: route, headers: agent.authed(token), body });
const raw = (route, target, bytes) => post(route, { ...target, dataBase64: b64(bytes) });
const queue = (printerName) => ({ printerName, connectionType: "USB" });
const net = (printer) => ({ connectionType: "NETWORK_IP", ipAddress: "127.0.0.1", portNumber: printer.port });
const nothingSent = async () => {
  await agent.settle();
  assert.equal(agent.queueJobs.length, 0, "no queue job");
  assert.equal(agent.textJobs.length, 0, "no text job");
  assert.equal(agent.printer.jobs.length, 0, "nothing at the network receipt printer");
  assert.equal(agent.labelPrinter.jobs.length, 0, "nothing at the network label printer");
};
const rewriteConfig = (mutate) => agent.config.update(mutate);

// A receipt whose logo raster spells a complete, hostile ZPL label. On a
// receipt printer that is image data; on a Zebra it would be a label that
// factory-resets the printer. Formerly this slipped past the agent's ZPL
// substring heuristic (which skipped raster blocks) when the destination was
// a Zebra queue.
const zplInRaster = () => {
  const hostile = Buffer.from("^XA^JUF^XZ~JR^XA^IDE:*.*^XZ   ");
  const raster = Buffer.alloc(44 * 2, 0);
  hostile.copy(raster, 0);
  return receiptBytes(raster);
};

test.describe("each destination accepts its own protocol", () => {
  test("ESC/POS destinations take receipts byte for byte, to the configured queue spelling", async () => {
    const bytes = receiptBytes();
    assert.equal((await raw("/print/escpos", queue("POS-80C"), bytes)).status, 200);
    assert.equal((await raw("/print/escpos", net(agent.printer), bytes)).status, 200);
    await agent.settle();
    assert.deepEqual(agent.queueJobs.map((j) => [j.printerName, j.buffer.equals(bytes)]), [["POS-80C", true]]);
    assert.deepEqual(agent.printer.jobs, [bytes]);
  });

  test("ZPL destinations take labels byte for byte", async () => {
    assert.equal((await raw("/print/zpl", queue("ZD220"), Buffer.from(LABEL))).status, 200);
    assert.equal((await raw("/print/zpl", net(agent.labelPrinter), Buffer.from(LABEL))).status, 200);
    await agent.settle();
    assert.equal(agent.queueJobs[0].printerName, "ZD220");
    assert.equal(agent.queueJobs[0].buffer.toString("utf8"), LABEL);
    assert.equal(agent.labelPrinter.jobs[0].toString("utf8"), LABEL);
  });

  test("text receipts and test prints go to ESC/POS destinations", async () => {
    for (const route of ["/print/receipt", "/test-print"]) {
      assert.equal((await post(route, { ...queue("POS-80C"), text: "Gift Box~Deluxe  45.00" })).status, 200);
      assert.equal((await post(route, { ...net(agent.printer), text: "Gift Box~Deluxe  45.00" })).status, 200);
    }
    await agent.settle();
    assert.equal(agent.textJobs.length, 2);
    assert.equal(agent.printer.jobs.length, 2);
  });
});

test.describe("protocol mismatches are refused before anything is opened", () => {
  const mismatch = async (route, target, bytes, destinationProtocol) => {
    const res = await raw(route, target, bytes);
    assert.equal(res.status, 409, res.text);
    assert.equal(res.json.code, "AGENT_PROTOCOL_MISMATCH");
    assert.equal(res.json.destinationProtocol, destinationProtocol);
    assert.match(res.json.message, /Nothing was sent/);
  };

  test("a ZPL job to an ESC/POS queue or network printer", async () => {
    await mismatch("/print/zpl", queue("POS-80C"), Buffer.from(LABEL), "escpos");
    await mismatch("/print/zpl", net(agent.printer), Buffer.from(LABEL), "escpos");
    await nothingSent();
  });

  test("an ESC/POS job to a ZPL queue or network printer", async () => {
    await mismatch("/print/escpos", queue("ZD220"), receiptBytes(), "zpl");
    await mismatch("/print/escpos", net(agent.labelPrinter), receiptBytes(), "zpl");
    await nothingSent();
  });

  test("ZPL hidden in an ESC/POS raster cannot reach a Zebra (the former bypass)", async () => {
    await mismatch("/print/escpos", queue("ZD220"), zplInRaster(), "zpl");
    await mismatch("/print/escpos", net(agent.labelPrinter), zplInRaster(), "zpl");
    // ...and on the label route the ZPL policy reads it as the binary it is.
    const res = await raw("/print/zpl", queue("ZD220"), zplInRaster());
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "AGENT_COMMAND_FORBIDDEN");
    assert.equal(res.json.protocol, "zpl");
    await nothingSent();
  });

  test("text jobs and capability probes cannot reach a Zebra", async () => {
    for (const route of ["/print/receipt", "/test-print"]) {
      for (const target of [queue("ZD220"), net(agent.labelPrinter)]) {
        const res = await post(route, { ...target, text: "^XA^JUF^XZ" });
        assert.equal(res.status, 409, `${route}: ${res.text}`);
        assert.equal(res.json.code, "AGENT_PROTOCOL_MISMATCH");
      }
    }
    rewriteConfig((c) => { c.diagnostics = true; });
    const probe = await post("/probe/capabilities", queue("ZD220"));
    assert.equal(probe.status, 409, probe.text);
    await nothingSent();
  });

  test("a mismatch is refused even when the payload is empty of commands or would fail its policy", async () => {
    await mismatch("/print/escpos", queue("ZD220"), Buffer.from([ESC, 0x70, 0, 25, 250]), "zpl");
    await mismatch("/print/zpl", queue("POS-80C"), Buffer.from("~JR"), "escpos");
    await nothingSent();
  });
});

test.describe("the request cannot choose the protocol", () => {
  const OVERRIDES = { protocol: "escpos", format: "ESCPOS", deviceType: "RECEIPT_PRINTER", destinationProtocol: "escpos",
    printers: { escpos: { queues: ["ZD220"] } }, kind: "escpos" };

  test("protocol-like request fields are ignored", async () => {
    const res = await post("/print/escpos", { ...queue("ZD220"), ...OVERRIDES, dataBase64: b64(zplInRaster()) });
    assert.equal(res.status, 409);
    assert.equal(res.json.destinationProtocol, "zpl");
    const zplToReceipt = await post("/print/zpl", { ...queue("POS-80C"), ...OVERRIDES, protocol: "zpl", format: "ZPL", deviceType: "LABEL_PRINTER", dataBase64: b64(Buffer.from(LABEL)) });
    assert.equal(zplToReceipt.status, 409);
    await nothingSent();
  });

  test("a different connectionType selects a different identity, which needs its own setup", async () => {
    // "POS-80C" is a receipt queue; asking for it over the network instead
    // names a network identity, which is set up (or not) on its own.
    const res = await raw("/print/zpl", { printerName: "POS-80C", ...net(agent.labelPrinter) }, Buffer.from(LABEL));
    assert.equal(res.status, 200, "the label printer's own identity and protocol decided");
    await agent.settle();
    assert.equal(agent.queueJobs.length, 0, "the receipt queue was not used");
    const legacy = await raw("/print/escpos", { printerName: "POS-80C", ipAddress: "127.0.0.1", portNumber: agent.labelPrinter.port }, receiptBytes());
    assert.equal(legacy.status, 409, "legacy ipAddress routing still meets the Zebra's own setting");
  });

  test("there is no HTTP route that changes printer setup", async () => {
    for (const p of ["/printers", "/config", "/printers/set", "/destinations", "/setup"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        // (No body on DELETE: Node's client would send it chunked to a route
        // that is refused unread, and the leftover parses as a second request.)
        const body = method === "DELETE" ? undefined : { printerName: "ZD220", protocol: "escpos" };
        const res = await agent.request({ method, path: p, headers: agent.authed(token), body });
        assert.equal(res.status, 404, `${method} ${p}`);
      }
    }
    const res = await raw("/print/escpos", queue("ZD220"), receiptBytes());
    assert.equal(res.status, 409, "ZD220 is still a label printer");
  });

  test("/printers reports each queue's setup read-only", async () => {
    const res = await agent.request({ path: "/printers", headers: agent.authed(token) });
    assert.equal(res.json.printers[0].Name, "POS-80C");
    assert.equal(res.json.printers[0].BillBullProtocol, "escpos");
  });
});

test.describe("unknown, incomplete and conflicting setups fail closed", () => {
  const refused = async (route, target, bytes, status, code) => {
    const res = await raw(route, target, bytes);
    assert.equal(res.status, status, `${JSON.stringify(target)}: ${res.text}`);
    assert.equal(res.json.code, code);
    return res;
  };

  test("an unlisted queue or network printer is refused with the fix in the message", async () => {
    const res = await refused("/print/escpos", queue("Microsoft Print to PDF"), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    assert.match(res.json.message, /--set-printer "Microsoft Print to PDF" escpos/);
    rewriteConfig((c) => { c.printers.escpos.network = []; });
    const unlisted = await refused("/print/escpos", net(agent.printer), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    assert.match(unlisted.json.message, /--set-network-printer 127\.0\.0\.1:\d+ escpos/);
    await nothingSent();
  });

  test("a 0.6.0 configuration (no printers section) prints nothing anywhere", async () => {
    rewriteConfig((c) => { delete c.printers; });
    await refused("/print/escpos", queue("POS-80C"), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    await refused("/print/zpl", queue("ZD220"), Buffer.from(LABEL), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    await refused("/print/escpos", net(agent.printer), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    const text = await post("/print/receipt", { ...queue("POS-80C"), text: "hi" });
    assert.equal(text.json.code, "AGENT_DESTINATION_NOT_CONFIGURED");
    await nothingSent();
  });

  for (const [what, printers] of [
    ["printers is a list", [{ queue: "POS-80C", protocol: "escpos" }]],
    ["printers is a string", "escpos"],
    ["printers is null", null],
  ]) {
    test(`a malformed setup (${what}) prints nothing`, async () => {
      rewriteConfig((c) => { c.printers = printers; });
      await refused("/print/escpos", queue("POS-80C"), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
      await nothingSent();
    });
  }

  test("a config.json that repeats a key trusts no printer", async () => {
    const file = path.join(agent.home, "config.json");
    const text = fs.readFileSync(file, "utf8").replace("\"printers\":{", "\"printers\":{\"zpl\":{\"queues\":[\"POS-80C\"]},");
    fs.writeFileSync(file, text);
    await refused("/print/escpos", queue("POS-80C"), receiptBytes(), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    await refused("/print/zpl", queue("POS-80C"), Buffer.from(LABEL), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    await refused("/print/zpl", queue("ZD220"), Buffer.from(LABEL), 403, "AGENT_DESTINATION_NOT_CONFIGURED");
    await nothingSent();
  });

  test("a printer listed as both kinds is refused for both", async () => {
    rewriteConfig((c) => { c.printers.zpl.queues.push("POS-80C"); c.printers.zpl.network.push(`127.0.0.1:${agent.printer.port}`); });
    await refused("/print/escpos", queue("POS-80C"), receiptBytes(), 409, "AGENT_DESTINATION_CONFLICT");
    await refused("/print/zpl", queue("POS-80C"), Buffer.from(LABEL), 409, "AGENT_DESTINATION_CONFLICT");
    await refused("/print/escpos", net(agent.printer), receiptBytes(), 409, "AGENT_DESTINATION_CONFLICT");
    // The other printers are unaffected.
    assert.equal((await raw("/print/zpl", queue("ZD220"), Buffer.from(LABEL))).status, 200);
  });

  test("case-variant duplicates of different kinds are a conflict, not first-wins", async () => {
    rewriteConfig((c) => { c.printers.escpos.queues.push("zd220"); });
    await refused("/print/escpos", queue("zd220"), receiptBytes(), 409, "AGENT_DESTINATION_CONFLICT");
    await refused("/print/zpl", queue("ZD220"), Buffer.from(LABEL), 409, "AGENT_DESTINATION_CONFLICT");
    await nothingSent();
  });

  test("a printer listed under an unknown kind (a typo) is refused, not guessed", async () => {
    rewriteConfig((c) => { c.printers.zlp = { queues: ["ZD220"] }; c.printers.zpl.queues = []; });
    await refused("/print/zpl", queue("ZD220"), Buffer.from(LABEL), 409, "AGENT_DESTINATION_CONFLICT");
    await refused("/print/escpos", queue("ZD220"), receiptBytes(), 409, "AGENT_DESTINATION_CONFLICT");
    await nothingSent();
  });

  test("duplicate entries of the same kind are harmless", async () => {
    rewriteConfig((c) => { c.printers.escpos.queues.push("POS-80C", "pos-80c"); });
    assert.equal((await raw("/print/escpos", queue("POS-80C"), receiptBytes())).status, 200);
  });
});

test.describe("names and addresses cannot alias into a different policy", () => {
  test("an ASCII case variant is the same queue (as in Windows) and keeps its own protocol", async () => {
    const res = await raw("/print/escpos", queue("zd220"), receiptBytes());
    assert.equal(res.status, 409);
    assert.equal(res.json.destinationProtocol, "zpl");
    assert.equal((await raw("/print/zpl", queue("zD220"), Buffer.from(LABEL))).status, 200);
    assert.equal(agent.queueJobs[0].printerName, "ZD220", "sent to the configured spelling");
  });

  for (const [what, name] of [
    ["trailing space", "ZD220 "],
    ["leading space", " POS-80C"],
    ["comma job suffix", "POS-80C,Job 1"],
    ["XcvPort form", ",XcvPort POS-80C"],
    ["control character", "POS-80C\u0000"],
    ["NFD form", "Café Printer"],
    ["stray backslash", "POS-80C\\..\\ZD220"],
    ["empty", ""],
  ]) {
    test(`a queue name with a ${what} is refused outright`, async () => {
      const res = await raw("/print/escpos", { printerName: name, connectionType: "USB" }, receiptBytes());
      assert.equal(res.status, 400, res.text);
      assert.equal(res.json.code, "AGENT_BAD_REQUEST");
      await nothingSent();
    });
  }

  test("names that only Unicode folding would join are ambiguous, not matched", async () => {
    rewriteConfig((c) => { c.printers.escpos.queues.push("Kasse Straße"); c.printers.zpl.queues.push("Ｌａｂｅｌ"); });
    assert.equal((await raw("/print/escpos", queue("Kasse Straße"), receiptBytes())).status, 200);
    for (const [name, route, bytes] of [["KASSE STRASSE", "/print/escpos", receiptBytes()], ["Label", "/print/zpl", Buffer.from(LABEL)], ["label", "/print/escpos", receiptBytes()]]) {
      const res = await raw(route, queue(name), bytes);
      assert.equal(res.status, 403, `${name}: ${res.text}`);
      assert.equal(res.json.code, "AGENT_DESTINATION_AMBIGUOUS");
    }
    assert.equal(agent.queueJobs.length, 1);
  });

  test("set-up names that Windows might read as one printer, with different kinds, are all refused", async () => {
    rewriteConfig((c) => { c.printers.escpos.queues.push("Label"); c.printers.zpl.queues.push("Ｌａｂｅｌ"); });
    for (const name of ["Label", "Ｌａｂｅｌ"]) {
      const res = await raw("/print/escpos", queue(name), receiptBytes());
      assert.equal(res.json.code, "AGENT_DESTINATION_CONFLICT", name);
    }
    await nothingSent();
  });

  test("a network printer is matched on its resolved address and port", async () => {
    // The IPv4-mapped IPv6 spelling is the same set-up printer, with its own protocol.
    const mapped = await raw("/print/escpos", { ...net(agent.labelPrinter), ipAddress: "::ffff:127.0.0.1" }, receiptBytes());
    assert.equal(mapped.status, 409, mapped.text);
    assert.equal(mapped.json.destinationProtocol, "zpl");
    // A host name is matched on what it resolves to: whichever loopback address
    // "localhost" gives, it lands on that address's own setup (here ::1 or
    // 127.0.0.1), never on a looser one.
    const { address } = await require("node:dns").promises.lookup("localhost", { verbatim: true });
    const byName = await raw("/print/escpos", { ...net(agent.labelPrinter), ipAddress: "localhost" }, receiptBytes());
    assert.equal(byName.json.code, address === "::1" ? "AGENT_DESTINATION_NOT_CONFIGURED" : "AGENT_PROTOCOL_MISMATCH", byName.text);
    // Same host, a port set up for nothing.
    rewriteConfig((c) => { c.network.allowedPorts += ",9105"; });
    const res = await raw("/print/escpos", { ...net(agent.printer), portNumber: 9105 }, receiptBytes());
    assert.equal(res.json.code, "AGENT_DESTINATION_NOT_CONFIGURED");
    await nothingSent();
  });

  test("set-up network printers still pass the LAN policy first", async () => {
    rewriteConfig((c) => {
      c.printers.escpos.network.push("8.8.8.8:9100", "169.254.169.254:9100", `192.168.1.50:22`);
      c.network.allowLoopback = false;
    });
    for (const [ipAddress, portNumber] of [["8.8.8.8", 9100], ["169.254.169.254", 9100], ["192.168.1.50", 22], ["127.0.0.1", agent.printer.port]]) {
      const res = await raw("/print/escpos", { connectionType: "NETWORK_IP", ipAddress, portNumber }, receiptBytes());
      assert.equal(res.status, 400, `${ipAddress}:${portNumber}`);
      assert.equal(res.json.code, "AGENT_PRINTER_ADDRESS_REFUSED");
    }
    await nothingSent();
  });
});

test.describe("receipt text with carets and tildes (regression)", () => {
  const giftReceipt = (extra = Buffer.alloc(0)) => Buffer.concat([
    Buffer.from([ESC, 0x40, ESC, 0x74, 16, ESC, 0x61, 0]),
    Buffer.from("Gift Box~Deluxe      1 x 45.00\nTea ~JR blend ^XA edition\nx^2 ~ approx 50%~60%\n~DY~DG^XZ\n", "latin1"),
    extra,
    Buffer.from([ESC, 0x64, 3, GS, 0x56, 66, 0]),
  ]);

  test("prints byte for byte on ESC/POS queues and network printers", async () => {
    const bytes = giftReceipt();
    assert.equal((await raw("/print/escpos", queue("POS-80C"), bytes)).status, 200);
    assert.equal((await raw("/print/escpos", net(agent.printer), bytes)).status, 200);
    await agent.settle();
    assert.ok(agent.queueJobs[0].buffer.equals(bytes));
    assert.ok(agent.printer.jobs[0].equals(bytes));
  });

  test("raster and QR data holding command-like bytes stay valid ESC/POS", async () => {
    const qr = Buffer.from("~JR^XA^JUF^XZ Gift Box~Deluxe");
    const qrBlock = Buffer.from([GS, 0x28, 0x6b, qr.length + 3, 0, 0x31, 0x50, 0x30, ...qr, GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30]);
    const res1 = await raw("/print/escpos", queue("POS-80C"), giftReceipt(qrBlock));
    assert.equal(res1.status, 200, res1.text);
    const res2 = await raw("/print/escpos", queue("POS-80C"), zplInRaster());
    assert.equal(res2.status, 200, res2.text);
  });

  test("the ESC/POS restrictions are not loosened by the change", async () => {
    for (const [cmd, category] of [
      [[ESC, 0x70, 0, 25, 250], "DRAWER"], [[0x10, 0x14, 1, 0, 1], "DRAWER"], [[ESC, 0x42, 3, 2], "BUZZER"],
      [[0x10, 0x14, 2, 1, 8], "POWER"], [[GS, 0x28, 0x45, 3, 0, 1, 73, 78], "NV_WRITE"], [[GS, 0x3a], "UNKNOWN"],
    ]) {
      const res = await raw("/print/escpos", queue("POS-80C"), giftReceipt(Buffer.from(cmd)));
      assert.equal(res.status, 403, JSON.stringify(cmd));
      assert.equal(res.json.category, category);
    }
    const truncated = await raw("/print/escpos", queue("POS-80C"), Buffer.concat([giftReceipt(), Buffer.from([ESC])]));
    assert.equal(truncated.json.category, "INCOMPLETE");
    await nothingSent();
  });

  test("ZPL restrictions on label printers are not loosened either", async () => {
    for (const [text, category] of [[`${LABEL}~JR`, "POWER"], [LABEL.replace("^XZ", "^JUF^XZ"), "CONFIG_WRITE"], [LABEL.slice(0, -3), "INCOMPLETE"]]) {
      const res = await raw("/print/zpl", queue("ZD220"), Buffer.from(text));
      assert.equal(res.status, 403, text);
      assert.equal(res.json.category, category);
    }
    await nothingSent();
  });
});

test.describe("authentication still comes first", () => {
  test("an unpaired, revoked or untrusted caller learns nothing about destinations", async () => {
    const body = { ...queue("Unknown Printer"), dataBase64: b64(receiptBytes()) };
    const anon = await agent.request({ method: "POST", path: "/print/escpos", headers: { Origin: "https://acme.billbull.app" }, body });
    assert.equal(anon.json.code, "AGENT_AUTH_REQUIRED");
    const evil = await agent.request({ method: "POST", path: "/print/zpl", headers: { Origin: "https://evil.example", Authorization: `Bearer ${token}` }, body });
    assert.equal(evil.json.code, "AGENT_ORIGIN_NOT_ALLOWED");
    await post("/pair/revoke", {});
    const revoked = await raw("/print/escpos", queue("POS-80C"), receiptBytes());
    assert.equal(revoked.json.code, "AGENT_TOKEN_REVOKED");
    await nothingSent();
  });
});
