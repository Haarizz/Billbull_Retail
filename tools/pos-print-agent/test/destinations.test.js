"use strict";

// Unit coverage for the destination table (lib/destinations.js) and the local
// setup commands that write it. The HTTP behaviour is in protocolBinding.test.js.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDestinations, hasDuplicateKeys, resolveQueue, resolveNetwork, queueProtocol, parseNetworkSpec, setQueue, setNetwork,
} = require("../lib/destinations");
const { createConfig } = require("../lib/config");
const { runCli } = require("../lib/cli");

const table = (printers) => buildDestinations(printers);
const codeOf = (fn) => { try { fn(); return "ok"; } catch (e) { return e.code; } };

test("queues resolve to their configured spelling and protocol", () => {
  const t = table({ escpos: { queues: ["POS-80C"] }, zpl: { queues: ["ZDesigner ZD220-203dpi ZPL"] } });
  assert.deepEqual(resolveQueue(t, "pos-80c", "escpos"), { kind: "queue", printerName: "POS-80C", protocol: "escpos" });
  assert.equal(resolveQueue(t, "ZDESIGNER zd220-203DPI zpl", "zpl").printerName, "ZDesigner ZD220-203dpi ZPL");
  assert.equal(codeOf(() => resolveQueue(t, "POS-80C", "zpl")), "AGENT_PROTOCOL_MISMATCH");
  assert.equal(codeOf(() => resolveQueue(t, "ZDesigner ZD220-203dpi ZPL", "escpos")), "AGENT_PROTOCOL_MISMATCH");
  assert.equal(codeOf(() => resolveQueue(t, "Other", "escpos")), "AGENT_DESTINATION_NOT_CONFIGURED");
});

test("network printers are IP literals; host names, bad ports and unbracketed IPv6 are not accepted in setup", () => {
  assert.deepEqual(parseNetworkSpec("192.168.1.50:9100"), { address: "192.168.1.50", port: 9100, key: "192.168.1.50|9100" });
  assert.equal(parseNetworkSpec("[FD00:0:0::5]:9100").address, "fd00::5");
  assert.equal(parseNetworkSpec("[::ffff:192.168.1.5]:9100"), null, "a mapped IPv4 is written as IPv4");
  for (const bad of ["printer.local:9100", "192.168.1.50", "192.168.001.050:9100", "192.168.1.50:0", "192.168.1.50:70000", "fd00::5:9100", "[192.168.1.5]:9100", " 192.168.1.50:9100x"]) {
    assert.equal(parseNetworkSpec(bad), null, bad);
  }
  const t = table({ zpl: { network: ["192.168.1.60:9100", "[fd00::5]:9101"] } });
  assert.equal(resolveNetwork(t, "::ffff:192.168.1.60", 9100, "zpl").address, "192.168.1.60");
  assert.equal(resolveNetwork(t, "FD00::0005", 9101, "zpl").address, "fd00::5");
  assert.equal(codeOf(() => resolveNetwork(t, "192.168.1.60", 9101, "zpl")), "AGENT_DESTINATION_NOT_CONFIGURED");
  assert.equal(codeOf(() => resolveNetwork(t, "192.168.1.60", 9100, "escpos")), "AGENT_PROTOCOL_MISMATCH");
});

test("no printers section, or a broken one, trusts nothing", () => {
  for (const printers of [undefined, null, [], "escpos", 5, { escpos: [] }, { escpos: { queues: "POS-80C" } }]) {
    const t = table(printers);
    assert.equal(codeOf(() => resolveQueue(t, "POS-80C", "escpos")), "AGENT_DESTINATION_NOT_CONFIGURED", JSON.stringify(printers));
  }
  assert.ok(table({ escpos: { queues: "POS-80C" } }).problems.some((p) => /must be a list/.test(p)));
});

test("conflicts refuse every protocol for the identity, and only that identity", () => {
  const t = table({
    escpos: { queues: ["POS-80C", "Shared"], network: ["192.168.1.5:9100"] },
    zpl: { queues: ["SHARED", "ZD220"], network: ["192.168.1.5:9100"] },
  });
  for (const p of ["escpos", "zpl"]) {
    assert.equal(codeOf(() => resolveQueue(t, "shared", p)), "AGENT_DESTINATION_CONFLICT");
    assert.equal(codeOf(() => resolveNetwork(t, "192.168.1.5", 9100, p)), "AGENT_DESTINATION_CONFLICT");
  }
  assert.equal(codeOf(() => resolveQueue(t, "POS-80C", "escpos")), "ok");
  assert.equal(codeOf(() => resolveQueue(t, "ZD220", "zpl")), "ok");
  assert.equal(queueProtocol(t, "Shared"), "conflict");
  assert.equal(t.problems.length, 2);
});

test("an unknown kind poisons the printers listed under it", () => {
  const t = table({ escpos: { queues: ["A"] }, zlp: { queues: ["A", "B"] }, zpl: { queues: [] } });
  assert.equal(codeOf(() => resolveQueue(t, "A", "escpos")), "AGENT_DESTINATION_CONFLICT");
  assert.equal(codeOf(() => resolveQueue(t, "B", "zpl")), "AGENT_DESTINATION_CONFLICT");
});

test("Unicode folding never joins two names; it only makes them ambiguous", () => {
  const t = table({ escpos: { queues: ["Straße"] }, zpl: { queues: ["İnvoice"] } });
  assert.equal(codeOf(() => resolveQueue(t, "STRASSE", "escpos")), "AGENT_DESTINATION_AMBIGUOUS");
  assert.equal(codeOf(() => resolveQueue(t, "STRAßE", "escpos")), "ok", "only ASCII letters differ");
  assert.equal(codeOf(() => resolveQueue(t, "Straße", "escpos")), "ok");
  assert.equal(codeOf(() => resolveQueue(t, "i̇nvoice", "zpl")), "AGENT_DESTINATION_AMBIGUOUS", "JS lower-cases İ to i + combining dot");
  assert.equal(codeOf(() => resolveQueue(t, "INVOICE", "zpl")), "AGENT_DESTINATION_NOT_CONFIGURED", "dotless/dotted I are different letters");
  const mixed = table({ escpos: { queues: ["Straße"] }, zpl: { queues: ["STRASSE"] } });
  assert.equal(codeOf(() => resolveQueue(mixed, "Straße", "escpos")), "AGENT_DESTINATION_CONFLICT");
  assert.equal(codeOf(() => resolveQueue(mixed, "strasse", "zpl")), "AGENT_DESTINATION_CONFLICT");
});

test("invalid names in setup are ignored and reported, never matched", () => {
  const t = table({ escpos: { queues: ["POS-80C ", "A,Job 1", "", 5, "B\u0007"] } });
  assert.equal(t.queues.size, 0);
  assert.equal(t.problems.length, 5);
  assert.equal(codeOf(() => resolveQueue(t, "POS-80C", "escpos")), "AGENT_DESTINATION_NOT_CONFIGURED");
  assert.equal(codeOf(() => resolveQueue(t, "\\\\server\\POS", "escpos")), "AGENT_DESTINATION_NOT_CONFIGURED", "UNC names are valid identities");
});

test("repeated JSON keys are detected at any depth", () => {
  assert.equal(hasDuplicateKeys('{"a":1,"b":{"c":[{"d":1}]}}'), false);
  assert.equal(hasDuplicateKeys('{"a":1,"a":2}'), true);
  assert.equal(hasDuplicateKeys('{"printers":{"zpl":{"queues":["X"]},"zpl":{"queues":[]}}}'), true);
  assert.equal(hasDuplicateKeys('{"p":[{"q":"x","q":"y"}]}'), true);
  assert.equal(hasDuplicateKeys('{"a\\u0062":1,"ab":2}'), true, "escapes decoded before comparing");
  assert.equal(hasDuplicateKeys('{"s":"a \\" , \\"s\\":1","t":[1, 2.5e3, true, null, "}"]}'), false);
  assert.equal(hasDuplicateKeys(" {\n \"a\" : 1 ,\r\n \"b\" : [ ] , \"c\" : { } }\n"), false);
});

test("edits never leave a conflict: setting a name replaces every spelling Windows might share", () => {
  const raw = { printers: { escpos: { queues: ["POS-80C", "Straße"], network: ["192.168.1.5:9100"] }, zpl: { queues: ["pos-80c"] } } };
  setQueue(raw, "POS-80C", "zpl");
  setQueue(raw, "STRASSE", "escpos");
  setNetwork(raw, "192.168.1.5:9100", "zpl");
  assert.deepEqual(raw.printers, {
    escpos: { queues: ["STRASSE"], network: [] },
    zpl: { queues: ["POS-80C"], network: ["192.168.1.5:9100"] },
  });
  assert.equal(buildDestinations(raw.printers).problems.length, 0);
  setQueue(raw, "pos-80C", null);
  assert.deepEqual(raw.printers.zpl.queues, []);
  assert.throws(() => setQueue(raw, "x,Job 1", "escpos"), /comma/);
  assert.throws(() => setQueue(raw, "X", "zebra"), /escpos or zpl/);
  assert.throws(() => setNetwork(raw, "printer.local:9100", "zpl"), /IP address and port/);
});

test.describe("setup commands", () => {
  let home;
  let config;
  let lines;
  let codes;
  const run = (...argv) => runCli(argv, { config, out: (m) => lines.push(m), err: (m) => lines.push(m), exit: (c) => codes.push(c) });
  test.beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "bbpa-cli-"));
    config = createConfig({ home, env: {} });
    lines = [];
    codes = [];
  });
  test.afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("set, list and remove printers; refuse anything ambiguous", () => {
    run("--set-printer", "POS-80C", "escpos");
    run("--set-printer", "ZDesigner ZD220", "zpl");
    run("--set-network-printer", "192.168.1.60:9100", "zpl");
    assert.deepEqual(codes, [0, 0, 0]);
    const d = config.current().destinations;
    assert.equal(resolveQueue(d, "POS-80C", "escpos").protocol, "escpos");
    assert.equal(resolveNetwork(d, "192.168.1.60", 9100, "zpl").protocol, "zpl");

    lines = [];
    run("--list-printers");
    assert.match(lines[0], /"POS-80C"\s+receipt printer \(ESC\/POS\)/);
    assert.match(lines[0], /"ZDesigner ZD220"\s+label printer \(ZPL\)/);
    assert.match(lines[0], /192\.168\.1\.60:9100\s+label printer \(ZPL\)/);

    run("--remove-printer", "pos-80c");
    run("--remove-network-printer", "192.168.1.60:9100");
    assert.equal(codeOf(() => resolveQueue(config.current().destinations, "POS-80C", "escpos")), "AGENT_DESTINATION_NOT_CONFIGURED");
    assert.equal(codeOf(() => resolveNetwork(config.current().destinations, "192.168.1.60", 9100, "zpl")), "AGENT_DESTINATION_NOT_CONFIGURED");

    codes = [];
    run("--set-printer", "POS-80C");                    // kind missing
    run("--set-printer", "POS-80C", "ESC/POS");         // not a kind
    run("--set-printer", "POS-80C,Job 7", "escpos");    // not a queue name
    run("--set-network-printer", "printer.local:9100", "zpl");
    assert.deepEqual(codes, [2, 2, 2, 2]);
  });

  test("the list reports problems in a hand-edited file", () => {
    fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ printers: { escpos: { queues: ["A"] }, zpl: { queues: ["a"] } } }));
    run("--list-printers");
    assert.match(lines[0], /REFUSED/);
    assert.match(lines[0], /problem: queue "a" is listed as more than one kind/);
  });

  test("a running agent sees a CLI change on its next request", () => {
    assert.equal(queueProtocol(config.current().destinations, "POS-80C"), null);
    const other = createConfig({ home, env: {} }); // "another process"
    runCli(["--set-printer", "POS-80C", "escpos"], { config: other, out: () => {}, err: () => {}, exit: () => {} });
    assert.equal(queueProtocol(config.current().destinations, "POS-80C"), "escpos");
  });
});
