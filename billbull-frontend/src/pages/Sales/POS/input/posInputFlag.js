/**
 * posInputV2 — whether the centralized POS input controller owns POS keyboard handling.
 *
 * ON (default): one capture-phase controller resolves the scope and dispatches scanner input,
 * payment hotkeys and owned Escape; the legacy per-component window listeners stand down.
 * OFF: no controller is attached and every legacy listener runs exactly as before.
 *
 * Rollback, most specific first:
 *  - one terminal, no rebuild: localStorage['billbull.pos.inputV2'] = 'off' (or 'on'), reload;
 *  - a build: VITE_POS_INPUT_V2=false.
 *
 * Read once, when POSSales mounts, so a session never runs half of each system.
 */
export const POS_INPUT_V2_STORAGE_KEY = 'billbull.pos.inputV2';

const OFF = new Set(['off', 'false', '0', 'no']);
const ON = new Set(['on', 'true', '1', 'yes']);

const readStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage?.getItem(POS_INPUT_V2_STORAGE_KEY) : null;
  } catch {
    return null;
  }
};

export function isPosInputV2Enabled({
  stored = readStorage(),
  env = import.meta.env?.VITE_POS_INPUT_V2,
} = {}) {
  const local = String(stored ?? '').trim().toLowerCase();
  if (ON.has(local)) return true;
  if (OFF.has(local)) return false;
  const built = String(env ?? '').trim().toLowerCase();
  if (OFF.has(built)) return false;
  return true;
}
