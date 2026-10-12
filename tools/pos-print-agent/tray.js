"use strict";

const Tray = require("trayicon");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { runCli } = require("./lib/cli");
const { createAgentServer, logStartup, listPrinters, HOST, PORT, VERSION, START_EXIT } = require("./server.js");
const { setQueue, queueProtocol, describeDestinations } = require("./lib/destinations");
const { createStarter, closeGracefully, writeStatus, watchForStopRequest } = require("./lib/lifecycle");
const { createLog, teeConsole } = require("./lib/log");

const iconPath = path.join(__dirname, "assets", "tray.ico");
const icon = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : undefined;
const RETRY_MS = 15000;

// The pairing code currently on offer, shown in the menu as well as the
// notification so a missed toast does not mean a failed pairing.
let pendingPairing = null;
let tray = null;
let agent = null;
let server = null;
let starter = null;
let log = null;

const openLogFolder = () => {
  spawn("explorer.exe", [log.dir], { detached: true, stdio: "ignore" }).unref();
};

// Quit from the tray, or a stop request from --stop (the installer): finish
// the requests being served, record why the agent stopped, and exit.
let stopping = false;
const shutdown = async (reason) => {
  if (stopping) return;
  stopping = true;
  console.log(`[billbull-pos-print-agent] stopping: ${reason}`);
  starter?.stop();
  if (server) await closeGracefully(server);
  writeStatus(agent.config.home, { state: "stopped", reason, version: VERSION, port: PORT });
  try { tray?.kill(); } catch { /* helper already gone */ }
  process.exit(0);
};

// Menu while the port is unavailable: why, and how to recover. The agent
// keeps retrying on its own; nothing that holds the port is ever ended.
const blockedMenu = (state) => [
  tray.item(`BillBull Print Agent ${VERSION} — NOT RUNNING`, { disabled: true }),
  tray.separator(),
  ...state.message.match(/.{1,90}(\s|$)/g).map((line) => tray.item(line.trim(), { disabled: true })),
  tray.separator(),
  tray.item(`Retrying every ${RETRY_MS / 1000} seconds`, { disabled: true }),
  tray.item("Retry now", { action: () => starter.retryNow() }),
  tray.item("Open log folder", { action: openLogFolder }),
  tray.separator(),
  tray.item("Quit", { action: () => shutdown("quit from the tray menu") }),
];

const KIND_TEXT = { escpos: "Receipts (ESC/POS)", zpl: "Labels (ZPL)", conflict: "REFUSED — conflicting settings" };

// Choosing what a Windows printer is used for. This menu is on this PC's
// desktop, so only someone at the till can change it — the same trust as the
// CLI (--set-printer). Web pages cannot. Nothing is set up automatically.
const setPrinterKind = (name, kind) => {
  try {
    agent.config.update((raw) => setQueue(raw, name, kind));
    tray.notify("BillBull Print Agent", kind
      ? `${name} now prints ${kind === "zpl" ? "Zebra labels (ZPL)" : "receipts (ESC/POS)"}.`
      : `BillBull no longer prints to ${name}.`);
  } catch (error) {
    tray.notify("BillBull Print Agent", error?.message || String(error));
  }
  draw();
};

const buildMenu = async () => {
  if (starter.current().state !== "running") return blockedMenu(starter.current());
  const cfg = agent.config.current();
  let printerItems;
  try {
    const printers = await listPrinters();
    printerItems = printers.length
      ? printers.map((p) => {
          const kind = queueProtocol(cfg.destinations, p.Name);
          const item = tray.item(`${p.IsDefault ? "★ " : ""}${p.Name} — ${p.StatusLabel} — ${KIND_TEXT[kind] || "not used by BillBull"}`);
          item.add(
            tray.item("Receipt printer (ESC/POS)", { checked: kind === "escpos", action: () => setPrinterKind(p.Name, "escpos") }),
            tray.item("Zebra label printer (ZPL)", { checked: kind === "zpl", action: () => setPrinterKind(p.Name, "zpl") }),
            tray.item("Not used by BillBull", { checked: !kind, action: () => setPrinterKind(p.Name, null) }),
          );
          return item;
        })
      : [tray.item("No printers found", { disabled: true })];
  } catch (error) {
    printerItems = [tray.item(`Error listing printers: ${error?.message || error}`, { disabled: true })];
  }
  // Network printers are set up with --set-network-printer; listed for reference.
  const networkItems = describeDestinations(cfg.destinations)
    .filter((line) => line.startsWith("network"))
    .map((line) => tray.item(`Set up: ${line.replace(/\s+/g, " ")}`, { disabled: true }));
  const problemItems = [
    ...(cfg.fileProblem ? [tray.item("config.json is damaged — nothing prints until it is fixed (see the log)", { disabled: true })] : []),
    ...(cfg.destinations.problems.length
      ? [tray.item(`Printer settings have ${cfg.destinations.problems.length} problem(s) — choose each printer's kind again below`, { disabled: true })]
      : []),
  ];

  const origins = [...cfg.allowedOrigins];
  const siteItems = origins.length
    ? origins.map((o) => tray.item(`Trusted site: ${o}`, { disabled: true }))
    : [tray.item("No BillBull site trusted — reinstall or run --add-origin", { disabled: true })];
  const paired = agent.store.active().length;

  const pairingItems = pendingPairing && pendingPairing.expiresAt > Date.now()
    ? [tray.item(`Pairing code: ${pendingPairing.code}  (for ${pendingPairing.origin})`, { disabled: true }), tray.separator()]
    : [];

  return [
    tray.item(`BillBull Print Agent ${VERSION} — 127.0.0.1:${PORT}`, { disabled: true }),
    ...(cfg.diagnostics ? [tray.item("Diagnostics ON — receipts saved to Desktop", { disabled: true })] : []),
    tray.separator(),
    ...pairingItems,
    ...siteItems,
    tray.item(`${paired} paired browser${paired === 1 ? "" : "s"}`, { disabled: true }),
    tray.item("Unpair all browsers", {
      action: () => {
        const n = agent.store.revokeAll();
        tray.notify("BillBull Print Agent", `Unpaired ${n} browser${n === 1 ? "" : "s"}. Pair again from BillBull → POS → Devices.`);
        draw();
      },
    }),
    tray.separator(),
    tray.item("Printers (click one to choose what BillBull prints on it):", { disabled: true }),
    ...printerItems,
    ...networkItems,
    ...problemItems,
    tray.separator(),
    tray.item("Refresh", { action: () => draw() }),
    tray.item("Open log folder", { action: openLogFolder }),
    tray.separator(),
    tray.item("Quit", { action: () => shutdown("quit from the tray menu") }),
  ];
};

const draw = async () => {
  if (tray) tray.setMenu(...(await buildMenu()));
};

const displayPairingCode = (event) => {
  if (!tray) return false;
  if (event.done) {
    pendingPairing = null;
    tray.notify("BillBull Print Agent", `Paired with ${event.origin}.`);
  } else {
    pendingPairing = event;
    tray.notify("BillBull pairing code", `${event.code}\nEnter this code in BillBull. Requested by ${event.origin}; expires in 2 minutes.`);
    setTimeout(() => { if (pendingPairing === event) { pendingPairing = null; draw(); } }, Math.max(0, event.expiresAt - Date.now()));
  }
  draw();
  return true;
};

const createTray = async () => {
  tray = await Tray.create({
    title: "BillBull Print Agent",
    icon,
    useTempDir: true,
  });
  // The HTTP server must keep serving print jobs even if the native tray
  // helper process dies (e.g. explorer.exe restart) — only log, don't exit.
  tray.on("error", (err) => {
    console.error("[billbull-pos-print-agent] tray icon error:", err);
  });
};

// Each change of startup state: tell whoever is at the till.
const onStartState = async (state) => {
  if (!tray) return; // the first attempt runs before the tray exists
  if (state.state === "running") {
    logStartup(server);
    tray.notify("BillBull Print Agent", `Running on ${HOST}:${PORT}`);
  }
  await draw();
};

const main = async () => {
  server = createAgentServer({ displayPairingCode });
  agent = server.agent;
  log = createLog({ home: agent.config.home });
  teeConsole(log);
  const startedAt = Date.now();

  starter = createStarter({
    server, home: agent.config.home, host: HOST, port: PORT, version: VERSION, retryMs: RETRY_MS, onChange: onStartState,
  });
  const first = await starter.start();

  if (first.code === "AGENT_ALREADY_RUNNING") {
    // Started twice (the Startup shortcut and a double-click, say). The copy
    // that is running keeps the port; this one says so and leaves.
    console.log(`[billbull-pos-print-agent] ${first.message}`);
    try {
      await createTray();
      tray.notify("BillBull Print Agent", first.message);
      await new Promise((r) => setTimeout(r, 8000));
      tray.kill();
    } catch { /* the message is in the log */ }
    process.exit(START_EXIT.ALREADY_RUNNING);
  }

  await createTray();
  watchForStopRequest({ home: agent.config.home, startedAt, onStop: () => shutdown("stop requested (--stop, e.g. by setup)") });
  await draw();
  if (first.state === "running") {
    logStartup(server);
    tray.notify("BillBull Print Agent", `Running on ${HOST}:${PORT}`);
  } else {
    console.error(`[billbull-pos-print-agent] cannot start: ${first.message}`);
    tray.notify("BillBull Print Agent cannot start", first.message);
  }
};

if (!runCli(process.argv.slice(2))) {
  main().catch((error) => {
    console.error("[billbull-pos-print-agent] tray failed to start:", error?.message || error);
    process.exit(START_EXIT.FAILED);
  });
}
