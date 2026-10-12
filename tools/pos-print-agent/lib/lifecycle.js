"use strict";

// Process lifecycle: one agent per PC on 127.0.0.1:19777.
//
// Starting — the port is the single-instance lock. listen() either binds or
// fails; on failure the occupant is identified by GET /health (every agent
// version answers with service "billbull-pos-print-agent") and is never
// touched. A second copy of the same version exits ("already running"); any
// other occupant leaves this agent waiting and retrying, with the reason in
// the tray, the log and the status file, until the port is free.
//
// Status — %APPDATA%\BillBull\PrintAgent\agent-status.json records what the
// last agent to start did: running, stopped, or failed with a code and a
// message. The installer reads it (through `--status`) to tell "the agent is
// up" from "the agent could not bind its port".
//
// Stopping — `--stop` (the installer before replacing files, the uninstaller,
// support) first asks politely: it writes <home>\stop-request, which a running
// agent of this version notices within a second and answers by finishing the
// requests it is serving and exiting. Agents before this version do not look
// for the file, so after a grace period the BillBullPrintAgent.exe processes in
// this Windows session are ended. It then confirms that no agent answers on
// the port and no such process is left, and reports failure otherwise so the
// installer can abort instead of replacing files that are in use. It never
// ends a process with another name (a `node tray.js` agent must be quit from
// its tray icon) or a process in another Windows session.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

const SERVICE = "billbull-pos-print-agent";
const EXE_NAME = "BillBullPrintAgent.exe";
const STATUS_FILE = "agent-status.json";
const STOP_FILE = "stop-request";

class StartupError extends Error {
  constructor(code, message, { occupant = null, retryable = true } = {}) {
    super(message);
    this.code = code;
    this.occupant = occupant;
    this.retryable = retryable;
  }
}

/**
 * What answers on host:port: { state: "free" } (nothing listening),
 * { state: "agent", version, protocol } (a BillBull Print Agent of any
 * version), { state: "other" } (something else) or { state: "unresponsive" }
 * (accepts connections but does not answer in time).
 */
const probeAgent = ({ host = "127.0.0.1", port, timeoutMs = 1500 }) => new Promise((resolve) => {
  let settled = false;
  const done = (result) => { if (!settled) { settled = true; resolve(result); } };
  const req = http.get({ host, port, path: "/health", agent: false, setHost: false, headers: { Host: `${host}:${port}` }, timeout: timeoutMs }, (res) => {
    const chunks = [];
    let size = 0;
    res.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) { req.destroy(); done({ state: "other" }); } else chunks.push(chunk);
    });
    res.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (body && body.service === SERVICE) {
          return done({
            state: "agent",
            version: typeof body.version === "string" ? body.version.slice(0, 32) : null,
            protocol: Number.isInteger(body.protocol) ? body.protocol : null,
          });
        }
      } catch { /* not JSON: not an agent */ }
      return done({ state: "other" });
    });
    res.on("error", () => done({ state: "other" }));
  });
  req.on("timeout", () => { done({ state: "unresponsive" }); req.destroy(); });
  req.on("error", (err) => done(err.code === "ECONNREFUSED" ? { state: "free" } : { state: "other" }));
});

const describeOccupant = (occupant, { host, port, version }) => {
  const where = `${host}:${port}`;
  if (occupant.state === "agent" && occupant.version === version) {
    return new StartupError("AGENT_ALREADY_RUNNING",
      `BillBull Print Agent ${version} is already running on this PC (${where}). Look for its icon in the taskbar notification area.`,
      { occupant, retryable: false });
  }
  if (occupant.state === "agent") {
    return new StartupError("AGENT_PORT_HELD_BY_AGENT",
      `Another BillBull Print Agent (version ${occupant.version || "unknown"}) is running on ${where}, so ${version} cannot start. ` +
      `Quit it from its tray icon (or run: BillBullPrintAgent.exe --stop), then choose Retry in this agent's tray menu.`,
      { occupant });
  }
  if (occupant.state === "unresponsive") {
    return new StartupError("AGENT_PORT_IN_USE",
      `A program on ${where} accepts connections but does not answer, so the print agent cannot start. ` +
      `If it is an old print agent, end BillBullPrintAgent.exe in Task Manager; otherwise find the program with: netstat -ano | findstr :${port}`,
      { occupant });
  }
  return new StartupError("AGENT_PORT_IN_USE",
    `Port ${port} on this PC is used by another program, so the print agent cannot start and BillBull cannot print. ` +
    `Close that program (find it with: netstat -ano | findstr :${port}), then choose Retry in the print agent's tray menu.`,
    { occupant });
};

/** Binds server to host:port, or rejects with a StartupError naming who holds the port. */
const listenExclusive = (server, { host, port, version, probe = probeAgent }) => new Promise((resolve, reject) => {
  const onListening = () => {
    server.off("error", onError);
    resolve();
  };
  const onError = async (err) => {
    server.off("listening", onListening);
    if (err.code !== "EADDRINUSE" && err.code !== "EACCES") {
      reject(new StartupError("AGENT_LISTEN_FAILED", `The print agent cannot listen on ${host}:${port} (${err.code || err.message}).`));
      return;
    }
    const occupant = await probe({ host, port });
    if (occupant.state === "free") {
      // EACCES with nobody listening: Windows has reserved the port (an
      // excluded port range, e.g. for Hyper-V or Docker).
      reject(new StartupError("AGENT_PORT_RESERVED",
        `Windows does not allow the print agent to use port ${port} (${err.code}). ` +
        `Check with: netsh interface ipv4 show excludedportrange protocol=tcp`, { occupant }));
      return;
    }
    reject(describeOccupant(occupant, { host, port, version }));
  };
  server.once("listening", onListening);
  server.once("error", onError);
  server.listen(port, host);
});

const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
};

const writeStatus = (home, status, { now = Date.now, pid = process.pid } = {}) => {
  try {
    writeJsonAtomic(path.join(home, STATUS_FILE), { ...status, pid, at: new Date(now()).toISOString() });
  } catch (err) {
    console.warn(`[lifecycle] status not saved: ${err.message}`);
  }
};

const readStatus = (home) => {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(home, STATUS_FILE), "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

/**
 * Binds the agent's port and records the outcome in the status file. A port
 * held by anything but a copy of this same version is retried every retryMs
 * (null: give up after one attempt) until it binds or stop() is called. The
 * occupant is never touched. onChange receives every state, for the tray.
 */
const createStarter = ({
  server, home, host, port, version,
  retryMs = 15000, probe = probeAgent, onChange = () => {},
  timers = { setTimeout, clearTimeout }, saveStatus = writeStatus,
}) => {
  let state = { state: "starting", version, port };
  let timer = null;
  let inFlight = null;
  let stopped = false;

  const attempt = async () => {
    try {
      await listenExclusive(server, { host, port, version, probe });
      state = { state: "running", version, port };
      saveStatus(home, state);
    } catch (error) {
      if (!(error instanceof StartupError)) throw error;
      state = { state: "failed", code: error.code, message: error.message, version, port, retryable: error.retryable && retryMs != null };
      // A duplicate launch must not overwrite the running copy's "running".
      if (error.code !== "AGENT_ALREADY_RUNNING") saveStatus(home, state);
      if (state.retryable && !stopped) {
        timer = timers.setTimeout(() => { timer = null; return run(); }, retryMs);
        timer?.unref?.();
      }
    }
    onChange(state);
    return state;
  };

  const run = () => {
    if (!inFlight) inFlight = attempt().finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    start: run,
    retryNow: () => {
      if (state.state === "running") return Promise.resolve(state);
      if (timer) { timers.clearTimeout(timer); timer = null; }
      return run();
    },
    stop: () => {
      stopped = true;
      if (timer) { timers.clearTimeout(timer); timer = null; }
    },
    current: () => state,
  };
};

/** Stops accepting connections, lets in-flight requests finish (up to timeoutMs), then drops the rest. */
const closeGracefully = (server, timeoutMs = 8000) => new Promise((resolve) => {
  if (!server.listening) { resolve(); return; }
  const force = setTimeout(() => server.closeAllConnections?.(), timeoutMs);
  server.close(() => { clearTimeout(force); resolve(); });
  server.closeIdleConnections?.();
});

const requestStop = (home) => writeJsonAtomic(path.join(home, STOP_FILE), { requestedAt: new Date().toISOString() });

const clearStopRequest = (home) => {
  try { fs.unlinkSync(path.join(home, STOP_FILE)); } catch { /* not there */ }
};

/**
 * Calls onStop once when a stop request newer than this agent appears. A
 * request left over from before the agent started (older than startedAt by
 * more than staleMs) is deleted instead.
 */
const watchForStopRequest = ({ home, startedAt, onStop, intervalMs = 1000, staleMs = 2000 }) => {
  const file = path.join(home, STOP_FILE);
  const timer = setInterval(() => {
    let stat;
    try { stat = fs.statSync(file); } catch { return; }
    if (stat.mtimeMs < startedAt - staleMs) {
      clearStopRequest(home);
      return;
    }
    clearInterval(timer);
    onStop();
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
};

// BillBullPrintAgent.exe processes in the caller's Windows session, as
// [{ pid, path }]. Session-scoped: another user's agent is never listed.
const listAgentProcesses = () => new Promise((resolve) => {
  if (process.platform !== "win32") { resolve([]); return; }
  const script = `$s=(Get-Process -Id $PID).SessionId; Get-CimInstance Win32_Process -Filter "Name='${EXE_NAME}'" | Where-Object { $_.SessionId -eq $s } | ForEach-Object { "$($_.ProcessId)\`t$($_.ExecutablePath)" }`;
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, timeout: 20000 }, (error, stdout) => {
      if (error) { resolve(null); return; } // unknown, not "none"
      resolve(String(stdout).split(/\r?\n/).filter(Boolean).map((line) => {
        const [pid, exe] = line.split("\t");
        return { pid: Number(pid), path: exe || null };
      }).filter((p) => Number.isInteger(p.pid)));
    });
});

const killProcess = (pid) => new Promise((resolve) => {
  execFile("taskkill.exe", ["/F", "/PID", String(pid)], { windowsHide: true, timeout: 15000 }, (error) => resolve(!error));
});

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Stops every running agent (see the header). Resolves
 * { ok, code, message, forced } — ok false means files may still be in use.
 */
const stopAgents = async ({
  home, host = "127.0.0.1", port,
  graceMs = 6000, timeoutMs = 15000, pollMs = 500,
  probe = probeAgent, listProcesses = listAgentProcesses, kill = killProcess,
  sleep = sleepMs, now = Date.now, selfPid = process.pid, log = () => {},
}) => {
  const others = async () => {
    const list = await listProcesses();
    return list === null ? null : list.filter((p) => p.pid !== selfPid);
  };
  const gone = async () => {
    const [occupant, procs] = await Promise.all([probe({ host, port }), others()]);
    return { occupant, procs, done: occupant.state !== "agent" && Array.isArray(procs) && procs.length === 0 };
  };

  let check = await gone();
  if (check.procs === null) {
    return { ok: false, code: "AGENT_STOP_FAILED", forced: false,
      message: "Could not list the running print agent processes on this PC (PowerShell did not answer). Quit the print agent from its tray icon, then try again." };
  }
  if (check.done) {
    clearStopRequest(home);
    return { ok: true, code: "AGENT_NOT_RUNNING", forced: false, message: "No BillBull Print Agent is running." };
  }

  log(`stop requested (port: ${check.occupant.state}${check.occupant.version ? ` ${check.occupant.version}` : ""}; processes: ${check.procs.map((p) => p.pid).join(", ") || "none"})`);
  requestStop(home);
  let forced = false;
  const graceUntil = now() + graceMs;
  const deadline = now() + timeoutMs;
  while (!check.done && now() < deadline) {
    if (!forced && now() >= graceUntil && check.procs?.length) {
      forced = true;
      for (const p of check.procs) {
        log(`ending process ${p.pid}${p.path ? ` (${p.path})` : ""}`);
        await kill(p.pid);
      }
    }
    await sleep(pollMs);
    check = await gone();
  }
  clearStopRequest(home);

  if (check.done) {
    return { ok: true, code: "AGENT_STOPPED", forced,
      message: forced ? "The print agent did not stop when asked and was ended." : "The print agent stopped." };
  }
  if (check.occupant.state === "agent" && !(check.procs?.length)) {
    return { ok: false, code: "AGENT_STOP_FAILED", forced,
      message: `A BillBull Print Agent (version ${check.occupant.version || "unknown"}) is still answering on ${host}:${port}, ` +
        "but it was not started from BillBullPrintAgent.exe in this Windows session (for example `node tray.js`, or another user's session), so it was not ended. " +
        "Quit it from its tray icon, then try again." };
  }
  return { ok: false, code: "AGENT_STOP_FAILED", forced,
    message: `The print agent did not exit (process ${(check.procs || []).map((p) => p.pid).join(", ") || "unknown"}). ` +
      "End BillBullPrintAgent.exe in Task Manager (Details tab), then try again." };
};

/**
 * Whether this version of the agent is up: { ok, code, message }. With waitMs
 * it keeps checking until the agent answers, a startup failure newer than
 * `since` is recorded, or the time is up.
 */
const checkStatus = async ({
  home, host = "127.0.0.1", port, version, waitMs = 0, since = Date.now(),
  probe = probeAgent, sleep = sleepMs, now = Date.now, pollMs = 500,
}) => {
  const deadline = now() + waitMs;
  for (;;) {
    const occupant = await probe({ host, port });
    if (occupant.state === "agent" && occupant.version === version) {
      return { ok: true, code: "AGENT_RUNNING", message: `BillBull Print Agent ${version} is running on ${host}:${port}.` };
    }
    const status = readStatus(home);
    // The launch and this check start within moments of each other; a failure
    // from a few seconds before `since` is still this launch's.
    const recentFailure = status?.state === "failed" && Date.parse(status.at) >= since - 5000;
    if (now() >= deadline || recentFailure) {
      if (recentFailure && status.message) {
        return { ok: false, code: status.code || "AGENT_START_FAILED", message: `The print agent could not start: ${status.message}` };
      }
      if (occupant.state === "agent") {
        return { ok: false, code: "AGENT_PORT_HELD_BY_AGENT",
          message: `BillBull Print Agent ${occupant.version || "(unknown version)"} is running on ${host}:${port}, not ${version}.` };
      }
      if (occupant.state !== "free") return { ok: false, code: "AGENT_PORT_IN_USE", message: describeOccupant(occupant, { host, port, version }).message };
      const why = status?.state === "stopped" ? ` It was stopped ${status.at}${status.reason ? ` (${status.reason})` : ""}.` : "";
      return { ok: false, code: "AGENT_NOT_RUNNING",
        message: `BillBull Print Agent is not running.${why} Start it from the Start menu (BillBull Print Agent).` };
    }
    await sleep(pollMs);
  }
};

module.exports = {
  StartupError, probeAgent, listenExclusive, createStarter, closeGracefully,
  writeStatus, readStatus, requestStop, clearStopRequest, watchForStopRequest,
  listAgentProcesses, killProcess, stopAgents, checkStatus,
  SERVICE, EXE_NAME, STATUS_FILE, STOP_FILE,
};
