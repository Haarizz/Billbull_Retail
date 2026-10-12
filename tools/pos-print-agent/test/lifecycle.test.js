"use strict";

// Startup, port conflicts, status, stop requests and the installer's --stop /
// --status, on ephemeral loopback ports with temporary homes. Process listing
// and taskkill are always replaced by fakes: a real `--stop` would end the
// BillBullPrintAgent.exe that runs on the developer's own PC.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  probeAgent, createStarter, stopAgents, checkStatus, readStatus, writeStatus,
  requestStop, watchForStopRequest, STOP_FILE, SERVICE,
} = require("../lib/lifecycle");
const { createAgentServer, VERSION } = require("../server");
const { createConfig } = require("../lib/config");
const { runCli } = require("../lib/cli");
const { createLog, redact } = require("../lib/log");

const HOST = "127.0.0.1";
const tempHome = () => fs.mkdtempSync(path.join(os.tmpdir(), "bbpa-life-"));

// Something holding a port: an HTTP server that answers /health like an agent
// of `version`, a plain web server, or a TCP listener that never answers.
const occupy = ({ kind, version } = {}) => new Promise((resolve) => {
  const sockets = new Set();
  const server = kind === "silent"
    ? net.createServer((s) => { sockets.add(s); s.on("error", () => {}); })
    : http.createServer((req, res) => {
      if (kind === "agent") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: SERVICE, version, ...(version >= "0.6.0" ? { protocol: 2 } : {}) }));
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html>some other program</html>");
      }
    });
  server.listen(0, HOST, () => resolve({
    port: server.address().port,
    close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); }),
  }));
});

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const get = (port, p = "/health") => new Promise((resolve, reject) => {
  http.get({ host: HOST, port, path: p }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
  }).on("error", reject);
});

// A starter with the retry timer under the test's control.
const manualTimers = () => {
  const pending = [];
  return {
    pending,
    timers: { setTimeout: (fn) => { pending.push(fn); return { unref() {} }; }, clearTimeout: () => { pending.length = 0; } },
    fire: () => pending.splice(0).map((fn) => fn()),
  };
};

const newAgent = (home) => createAgentServer({ config: createConfig({ home, env: {} }), displayPairingCode: () => true });

test.describe("probe", () => {
  test("tells a free port, an agent, another program and a silent listener apart", async () => {
    assert.deepEqual(await probeAgent({ port: await freePort() }), { state: "free" });

    const old = await occupy({ kind: "agent", version: "0.5.3" });
    assert.deepEqual(await probeAgent({ port: old.port }), { state: "agent", version: "0.5.3", protocol: null });
    await old.close();

    const web = await occupy({ kind: "web" });
    assert.deepEqual(await probeAgent({ port: web.port }), { state: "other" });
    await web.close();

    const silent = await occupy({ kind: "silent" });
    assert.deepEqual(await probeAgent({ port: silent.port, timeoutMs: 200 }), { state: "unresponsive" });
    await silent.close();
  });
});

test.describe("startup", () => {
  let home;
  test.beforeEach(() => { home = tempHome(); });
  test.afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("a port held by another program: not healthy, the reason recorded, then recovery once it is freed", async () => {
    const holder = await occupy({ kind: "web" });
    const server = newAgent(home);
    const clock = manualTimers();
    const states = [];
    const starter = createStarter({
      server, home, host: HOST, port: holder.port, version: VERSION, retryMs: 15000, timers: clock.timers, onChange: (s) => states.push(s.state),
    });

    const first = await starter.start();
    assert.equal(first.state, "failed");
    assert.equal(first.code, "AGENT_PORT_IN_USE");
    assert.match(first.message, new RegExp(`Port ${holder.port} on this PC is used by another program`));
    assert.equal(server.listening, false, "never reports healthy while another program holds the port");
    // What /health on that port says is the other program's answer, not ours.
    assert.equal((await probeAgent({ port: holder.port })).state, "other");
    const recorded = readStatus(home);
    assert.equal(recorded.state, "failed");
    assert.equal(recorded.code, "AGENT_PORT_IN_USE");
    assert.equal(recorded.pid, process.pid);
    assert.ok(!recorded.message.includes(home) && !recorded.message.includes(os.userInfo().username), "no paths or user names");
    assert.equal(clock.pending.length, 1, "a retry is scheduled");

    // Still held at the retry: still failed, retried again, holder untouched.
    await Promise.all(clock.fire());
    assert.equal(starter.current().state, "failed");
    assert.equal((await probeAgent({ port: holder.port })).state, "other");

    await holder.close();
    await Promise.all(clock.fire());
    assert.equal(starter.current().state, "running");
    assert.equal(readStatus(home).state, "running");
    const health = await get(holder.port);
    assert.equal(health.json.service, SERVICE);
    assert.equal(health.json.version, VERSION);
    assert.deepEqual(states, ["failed", "failed", "running"]);
    await new Promise((r) => server.close(r));
  });

  test("Retry now binds as soon as the port is free, without waiting for the timer", async () => {
    const holder = await occupy({ kind: "silent" });
    const server = newAgent(home);
    const clock = manualTimers();
    const starter = createStarter({
      server, home, host: HOST, port: holder.port, version: VERSION, timers: clock.timers,
      probe: (o) => probeAgent({ ...o, timeoutMs: 200 }),
    });
    assert.equal((await starter.start()).code, "AGENT_PORT_IN_USE");
    await holder.close();
    assert.equal((await starter.retryNow()).state, "running");
    assert.equal(clock.pending.length, 0, "the pending retry was cancelled");
    await new Promise((r) => server.close(r));
  });

  test("a second copy of the same version leaves the running one alone and does not retry", async () => {
    const running = newAgent(home);
    const port = await freePort();
    const one = createStarter({ server: running, home, host: HOST, port, version: VERSION });
    assert.equal((await one.start()).state, "running");
    const before = readStatus(home);

    const clock = manualTimers();
    const duplicate = newAgent(home);
    const two = createStarter({ server: duplicate, home, host: HOST, port, version: VERSION, timers: clock.timers });
    const state = await two.start();
    assert.equal(state.code, "AGENT_ALREADY_RUNNING");
    assert.equal(state.retryable, false);
    assert.equal(clock.pending.length, 0);
    assert.deepEqual(readStatus(home), before, "the running copy's status is not overwritten");
    assert.equal((await get(port)).json.version, VERSION, "the first copy still answers");
    await new Promise((r) => running.close(r));
  });

  test("an older agent still on the port is named, waited for and never touched", async () => {
    const old = await occupy({ kind: "agent", version: "0.5.3" });
    const server = newAgent(home);
    const clock = manualTimers();
    const starter = createStarter({ server, home, host: HOST, port: old.port, version: VERSION, timers: clock.timers });
    const state = await starter.start();
    assert.equal(state.code, "AGENT_PORT_HELD_BY_AGENT");
    assert.match(state.message, /version 0\.5\.3/);
    assert.match(state.message, /Quit it from its tray icon/);
    assert.equal(clock.pending.length, 1);
    assert.equal((await probeAgent({ port: old.port })).version, "0.5.3");
    starter.stop();
    assert.equal(clock.pending.length, 0, "stop() cancels the retry");
    await old.close();
  });

  test("the headless agent: a duplicate exits 3, a foreign port exits 4, a stop request ends it cleanly", async () => {
    const port = await freePort();
    const env = { ...process.env, BILLBULL_PRINT_AGENT_PORT: String(port), BILLBULL_PRINT_AGENT_HOME: home };
    const serverJs = path.join(__dirname, "..", "server.js");
    const run = (extraEnv = {}) => spawn(process.execPath, [serverJs], { env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    const exited = (child) => new Promise((resolve) => {
      let output = "";
      child.stdout.on("data", (d) => { output += d; });
      child.stderr.on("data", (d) => { output += d; });
      child.on("exit", (code) => resolve({ code, output }));
    });

    const first = run();
    const firstExit = exited(first);
    for (let i = 0; i < 100 && (await probeAgent({ port })).state !== "agent"; i += 1) await new Promise((r) => setTimeout(r, 100));
    assert.equal(readStatus(home).state, "running");

    const second = await exited(run());
    assert.equal(second.code, 3);
    assert.match(second.output, /already running/);
    assert.equal(readStatus(home).pid, first.pid);

    const holder = await occupy({ kind: "web" });
    const third = await exited(run({ BILLBULL_PRINT_AGENT_PORT: String(holder.port) }));
    assert.equal(third.code, 4);
    assert.match(third.output, /used by another program/);
    await holder.close();

    requestStop(home);
    const { code } = await firstExit;
    assert.equal(code, 0);
    assert.equal(readStatus(home).state, "stopped");
    assert.equal((await probeAgent({ port })).state, "free");
  });
});

test.describe("stop requests", () => {
  test("a fresh request stops the agent; one left over from before it started is discarded", async () => {
    const home = tempHome();
    try {
      requestStop(home);
      const old = (Date.now() - 60000) / 1000;
      fs.utimesSync(path.join(home, STOP_FILE), old, old);
      let stops = 0;
      const unwatch = watchForStopRequest({ home, startedAt: Date.now(), onStop: () => { stops += 1; }, intervalMs: 20 });
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(stops, 0);
      assert.equal(fs.existsSync(path.join(home, STOP_FILE)), false, "stale request removed");

      requestStop(home);
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(stops, 1);
      unwatch();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

// The installer's view: a fake Windows with processes that do or do not
// honour the stop request, and a fake clock.
const fakeMachine = ({ processes = [], port = { state: "free" }, honoursStop = true, killable = true, home }) => {
  let t = 0;
  const killed = [];
  const alive = new Map(processes.map((p) => [p.pid, p]));
  const stopFile = () => fs.existsSync(path.join(home, STOP_FILE));
  let occupant = port;
  const tick = () => {
    if (honoursStop && stopFile()) { alive.clear(); occupant = { state: "free" }; }
  };
  return {
    killed,
    deps: {
      now: () => t,
      sleep: async (ms) => { t += ms; tick(); },
      probe: async () => occupant,
      listProcesses: async () => [...alive.values()],
      kill: async (pid) => {
        killed.push(pid);
        if (killable) {
          alive.delete(pid);
          if (![...alive.keys()].some((p) => p !== 4242)) occupant = { state: "free" };
        }
        return killable;
      },
      selfPid: 4242,
    },
  };
};

test.describe("--stop (before files are replaced)", () => {
  let home;
  test.beforeEach(() => { home = tempHome(); });
  test.afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("nothing running: nothing ended", async () => {
    const m = fakeMachine({ home, processes: [{ pid: 4242, path: "C:\\tmp\\BillBullPrintAgent.exe" }] }); // only setup's own copy
    const result = await stopAgents({ home, port: 19777, ...m.deps });
    assert.equal(result.code, "AGENT_NOT_RUNNING");
    assert.deepEqual(m.killed, []);
  });

  test("an agent of this version stops when asked; nothing is killed", async () => {
    const m = fakeMachine({ home, processes: [{ pid: 100 }], port: { state: "agent", version: VERSION } });
    const result = await stopAgents({ home, port: 19777, ...m.deps });
    assert.deepEqual([result.ok, result.code, result.forced], [true, "AGENT_STOPPED", false]);
    assert.deepEqual(m.killed, []);
    assert.equal(fs.existsSync(path.join(home, STOP_FILE)), false, "the request is cleared for the next agent");
  });

  test("an older agent that ignores the request is ended after the grace period — never setup's own process", async () => {
    const m = fakeMachine({
      home, honoursStop: false, processes: [{ pid: 100 }, { pid: 4242 }], port: { state: "agent", version: "0.5.3" },
    });
    const result = await stopAgents({ home, port: 19777, graceMs: 6000, ...m.deps });
    assert.deepEqual([result.ok, result.code, result.forced], [true, "AGENT_STOPPED", true]);
    assert.deepEqual(m.killed, [100]);
  });

  test("a process that cannot be ended fails the stop (exit 5) so setup aborts", async () => {
    const m = fakeMachine({ home, honoursStop: false, killable: false, processes: [{ pid: 100 }], port: { state: "agent", version: "0.6.0" } });
    const result = await stopAgents({ home, port: 19777, ...m.deps });
    assert.equal(result.ok, false);
    assert.equal(result.code, "AGENT_STOP_FAILED");
    assert.match(result.message, /process 100/);
    assert.match(result.message, /Task Manager/);
  });

  test("an agent answering on the port without a BillBullPrintAgent.exe process (node tray.js) is never killed", async () => {
    const m = fakeMachine({ home, honoursStop: false, processes: [], port: { state: "agent", version: "0.5.3" } });
    const result = await stopAgents({ home, port: 19777, ...m.deps });
    assert.equal(result.ok, false);
    assert.match(result.message, /Quit it from its tray icon/);
    assert.deepEqual(m.killed, []);
  });

  test("another program on the port is not ours to stop: reported as not running, nothing ended", async () => {
    const m = fakeMachine({ home, processes: [], port: { state: "other" } });
    const result = await stopAgents({ home, port: 19777, ...m.deps });
    assert.equal(result.code, "AGENT_NOT_RUNNING");
    assert.deepEqual(m.killed, []);
  });

  test("when the process list is unavailable it fails rather than guessing", async () => {
    const m = fakeMachine({ home, port: { state: "agent", version: VERSION } });
    const result = await stopAgents({ home, port: 19777, ...m.deps, listProcesses: async () => null });
    assert.equal(result.ok, false);
    assert.deepEqual(m.killed, []);
  });
});

test.describe("--status (after the new agent is launched)", () => {
  let home;
  test.beforeEach(() => { home = tempHome(); });
  test.afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const clock = () => { let t = 1_000_000; return { now: () => t, sleep: async (ms) => { t += ms; } }; };

  test("running only when this version answers", async () => {
    const c = clock();
    assert.equal((await checkStatus({ home, port: 1, version: VERSION, probe: async () => ({ state: "agent", version: VERSION }), ...c })).ok, true);
    const older = await checkStatus({ home, port: 1, version: VERSION, probe: async () => ({ state: "agent", version: "0.5.3" }), ...c });
    assert.deepEqual([older.ok, older.code], [false, "AGENT_PORT_HELD_BY_AGENT"]);
  });

  test("a startup failure recorded while waiting is reported at once, with its reason", async () => {
    const c = clock();
    writeStatus(home, { state: "failed", code: "AGENT_PORT_IN_USE", message: "Port 19777 on this PC is used by another program" }, { now: c.now });
    const result = await checkStatus({ home, port: 19777, version: VERSION, waitMs: 20000, since: c.now(), probe: async () => ({ state: "other" }), ...c });
    assert.equal(result.code, "AGENT_PORT_IN_USE");
    assert.match(result.message, /could not start: Port 19777/);
    assert.ok(c.now() < 1_000_000 + 20000, "did not wait out the timeout");
  });

  test("an old failure is not blamed on a new launch; a quit agent says so", async () => {
    const c = clock();
    writeStatus(home, { state: "failed", code: "AGENT_PORT_IN_USE", message: "old" }, { now: () => c.now() - 3_600_000 });
    const notUp = await checkStatus({ home, port: 19777, version: VERSION, waitMs: 2000, since: c.now(), probe: async () => ({ state: "free" }), ...c });
    assert.equal(notUp.code, "AGENT_NOT_RUNNING");
    writeStatus(home, { state: "stopped", reason: "quit from the tray menu" }, { now: c.now });
    assert.match((await checkStatus({ home, port: 19777, version: VERSION, probe: async () => ({ state: "free" }), ...c })).message, /quit from the tray menu/);
  });
});

test.describe("CLI on a copied configuration directory", () => {
  let home;
  let config;
  let shown;
  let codes;
  const io = (extra = {}) => ({ config, out: (m) => shown.push(m), err: (m) => shown.push(m), exit: (c) => codes.push(c), ...extra });
  const fixture = {
    allowedOrigins: ["https://acme.billbull.app"],
    tokenTtlDays: 90,
    printers: { escpos: { queues: ["POS-80C"], network: [] }, zpl: { queues: ["ZD220"], network: [] } },
  };
  const token = `bbpa_${"x".repeat(43)}`;

  test.beforeEach(() => {
    home = tempHome();
    fs.writeFileSync(path.join(home, "config.json"), JSON.stringify(fixture, null, 2));
    const t = Date.now();
    fs.writeFileSync(path.join(home, "tokens.json"), JSON.stringify({ tokens: [{
      id: "a1b2c3d4e5f6", hash: require("node:crypto").createHash("sha256").update(token).digest("hex"),
      origin: fixture.allowedOrigins[0], label: "till 1", createdAt: t, expiresAt: t + 86400000, lastUsedAt: null, revokedAt: null,
    }] }));
    config = createConfig({ home, env: {} });
    shown = [];
    codes = [];
  });
  test.afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("valid commands: exit 0, results in --out and cli.log, no token material anywhere", () => {
    const outFile = path.join(home, "result.txt");
    runCli(["--list-printers", "--out", outFile], io());
    runCli(["--set-printer", "Back Office Zebra", "zpl"], io());
    runCli(["--list-pairings"], io());
    runCli(["--revoke-all"], io());
    assert.deepEqual(codes, [0, 0, 0, 0]);
    assert.match(fs.readFileSync(outFile, "utf8"), /"POS-80C"\s+receipt printer \(ESC\/POS\)/);
    const cliLog = fs.readFileSync(path.join(home, "logs", "cli.log"), "utf8");
    assert.match(cliLog, /--list-printers --out .* -> exit 0/);
    assert.match(cliLog, /--revoke-all -> exit 0\n {2}Revoked 1 pairing/);
    const tokensFile = JSON.parse(fs.readFileSync(path.join(home, "tokens.json"), "utf8"));
    for (const text of [cliLog, shown.join("\n")]) {
      assert.ok(!text.includes(token) && !text.includes("bbpa_") && !text.includes(tokensFile.tokens[0].hash));
    }
    // Earlier settings survive every command.
    const after = JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8"));
    assert.deepEqual(after.allowedOrigins, fixture.allowedOrigins);
    assert.equal(after.tokenTtlDays, 90);
    assert.deepEqual(after.printers.escpos.queues, ["POS-80C"]);
  });

  test("invalid kind, unsafe destination, unknown command and a bad --wait are refused with exit 2 and logged", () => {
    runCli(["--set-printer", "POS-80C", "raw"], io());
    runCli(["--set-printer", "POS-80C,Job 7", "escpos"], io());
    runCli(["--set-network-printer", "printer.example.com:9100", "zpl"], io());
    runCli(["--add-origin", "http://acme.billbull.app"], io());
    runCli(["--lst-printers"], io());
    runCli(["--status", "--wait", "soon"], io());
    assert.deepEqual(codes, [2, 2, 2, 2, 2, 2]);
    const cliLog = fs.readFileSync(path.join(home, "logs", "cli.log"), "utf8");
    assert.equal((cliLog.match(/-> exit 2/g) || []).length, 6);
    assert.match(cliLog, /Unknown command: --lst-printers/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")), fixture, "nothing changed");
  });

  test("a damaged config.json is reported and never overwritten", () => {
    const damaged = '{ "allowedOrigins": ["https://acme.billbull.app"], ';
    fs.writeFileSync(path.join(home, "config.json"), damaged);
    runCli(["--add-origin", "https://acme.billbull.app"], io());
    runCli(["--set-printer", "POS-80C", "escpos"], io());
    assert.deepEqual(codes, [2, 2]);
    assert.match(shown[0], /%APPDATA%\\BillBull\\PrintAgent\\config\.json cannot be read because it is not valid JSON/);
    assert.ok(!shown.join("\n").includes(home), "names the file without the user's profile path");
    assert.equal(fs.readFileSync(path.join(home, "config.json"), "utf8"), damaged);

    shown = [];
    runCli(["--list-printers"], io());
    assert.equal(codes.at(-1), 0);
    assert.match(shown[0], /problem: config\.json cannot be used/);
    assert.equal(config.current().allowedOrigins.size, 0, "the agent trusts nothing until it is fixed");
  });

  test("a missing config.json is created by the first command", () => {
    fs.rmSync(path.join(home, "config.json"));
    runCli(["--add-origin", "https://acme.billbull.app"], io());
    assert.deepEqual(codes, [0]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).allowedOrigins, ["https://acme.billbull.app"]);
  });

  test("--stop and --status keep their exit codes and write --out (fakes only)", async () => {
    const outFile = path.join(home, "stop.txt");
    const stuck = fakeMachine({ home, honoursStop: false, killable: false, processes: [{ pid: 7 }], port: { state: "agent", version: "0.6.0" } });
    assert.equal(await runCli(["--stop", "--out", outFile], io({ agent: { port: 19777, version: VERSION, deps: stuck.deps } })), 5);
    assert.match(fs.readFileSync(outFile, "utf8"), /did not exit/);
    const fine = fakeMachine({ home, processes: [{ pid: 7 }], port: { state: "agent", version: VERSION } });
    assert.equal(await runCli(["--stop"], io({ agent: { port: 19777, version: VERSION, deps: fine.deps } })), 0);
    const up = { probe: async () => ({ state: "agent", version: VERSION }) };
    assert.equal(await runCli(["--status"], io({ agent: { port: 19777, version: VERSION, deps: up } })), 0);
    const down = { probe: async () => ({ state: "free" }) };
    assert.equal(await runCli(["--status"], io({ agent: { port: 19777, version: VERSION, deps: down } })), 1);
    assert.deepEqual(codes, [5, 0, 0, 1]);
  });
});

test.describe("logs", () => {
  test("tokens, bearer headers and pairing codes are redacted; the file is capped", () => {
    const home = tempHome();
    try {
      assert.equal(redact("Authorization: Bearer bbpa_abcDEF-123_x"), "Authorization: Bearer [redacted]");
      assert.equal(redact("token bbpa_abcDEF-123_x issued"), "token bbpa_[redacted] issued");
      assert.equal(redact("Code: 482913 (expires)"), "Code: [redacted] (expires)");
      const log = createLog({ home, maxBytes: 300 });
      for (let i = 0; i < 20; i += 1) log.write("info", `line ${i} bbpa_secret${i}`);
      const text = fs.readFileSync(log.file, "utf8");
      assert.ok(fs.statSync(log.file).size <= 300);
      assert.ok(fs.existsSync(`${log.file}.1`));
      assert.ok(!text.includes("secret") && !fs.readFileSync(`${log.file}.1`, "utf8").includes("secret"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
