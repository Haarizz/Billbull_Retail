"use strict";

const Tray = require("trayicon");
const path = require("node:path");
const fs = require("node:fs");
const { startServer, listPrinters, PORT } = require("./server.js");

const iconPath = path.join(__dirname, "assets", "tray.ico");
const icon = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : undefined;

const buildMenu = async (tray) => {
  let printerItems;
  try {
    const printers = await listPrinters();
    printerItems = printers.length
      ? printers.map((p) =>
          tray.item(`${p.IsDefault ? "★ " : ""}${p.Name} — ${p.StatusLabel}`, { disabled: true }),
        )
      : [tray.item("No printers found", { disabled: true })];
  } catch (error) {
    printerItems = [tray.item(`Error listing printers: ${error?.message || error}`, { disabled: true })];
  }

  const refresh = tray.item("Refresh printers", { action: () => draw(tray) });
  const separator = tray.separator();
  const status = tray.item(`Agent listening on 127.0.0.1:${PORT}`, { disabled: true });
  const quit = tray.item("Quit", { action: () => process.exit(0) });

  return [status, tray.separator(), ...printerItems, separator, refresh, tray.separator(), quit];
};

const draw = async (tray) => {
  tray.setMenu(...(await buildMenu(tray)));
};

const main = async () => {
  await startServer();

  const tray = await Tray.create({
    title: "BillBull Print Agent",
    icon,
    useTempDir: true,
  });

  // The HTTP server must keep serving print jobs even if the native tray
  // helper process dies (e.g. explorer.exe restart) — only log, don't exit.
  tray.on("error", (err) => {
    console.error("[billbull-pos-print-agent] tray icon error:", err);
  });

  await draw(tray);
  tray.notify("BillBull Print Agent", `Running on 127.0.0.1:${PORT}`);
};

main().catch((error) => {
  console.error("[billbull-pos-print-agent] tray failed to start:", error?.message || error);
  process.exit(1);
});
