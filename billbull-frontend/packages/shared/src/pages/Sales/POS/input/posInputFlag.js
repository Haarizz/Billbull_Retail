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

const readStorage = (key = POS_INPUT_V2_STORAGE_KEY) => {
  try {
    return typeof window !== 'undefined' ? window.localStorage?.getItem(key) : null;
  } catch {
    return null;
  }
};

const resolveFlag = (stored, env) => {
  const local = String(stored ?? '').trim().toLowerCase();
  if (ON.has(local)) return true;
  if (OFF.has(local)) return false;
  const built = String(env ?? '').trim().toLowerCase();
  if (OFF.has(built)) return false;
  return true;
};

export function isPosInputV2Enabled({
  stored = readStorage(),
  env = import.meta.env?.VITE_POS_INPUT_V2,
} = {}) {
  return resolveFlag(stored, env);
}

/**
 * posFocusV2 — whether the state-driven focus controller (usePosFocusController) owns where the
 * caret goes. Needs posInputV2 (it reads the same registry); with either off, the legacy focus
 * mechanisms run instead: the Trade POS sticky retry loop, the Cart Focus 80 ms refocus and the
 * payment panel's method-bar refocus.
 *
 * Rollback, independent of posInputV2: localStorage['billbull.pos.focusV2'] = 'off', reload; or
 * build with VITE_POS_FOCUS_V2=false.
 */
export const POS_FOCUS_V2_STORAGE_KEY = 'billbull.pos.focusV2';

export function isPosFocusV2Enabled({
  stored = readStorage(POS_FOCUS_V2_STORAGE_KEY),
  env = import.meta.env?.VITE_POS_FOCUS_V2,
} = {}) {
  return resolveFlag(stored, env);
}
