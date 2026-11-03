'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Settings live in %APPDATA%\BillBull POS\settings.json (Electron's userData folder), so they
// survive upgrades and uninstall (deleteAppDataOnUninstall is false).

const DEFAULTS = Object.freeze({ serverOrigin: null, fullscreen: false, zoomFactor: 1 });

function createSettingsStore(dir) {
  const file = path.join(dir, 'settings.json');

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function write(patch) {
    const next = { ...read(), ...patch };
    fs.mkdirSync(dir, { recursive: true });
    // Write then rename, so a power cut mid-write never leaves a half-written file.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
    return next;
  }

  return { file, read, write };
}

module.exports = { createSettingsStore, DEFAULTS };
