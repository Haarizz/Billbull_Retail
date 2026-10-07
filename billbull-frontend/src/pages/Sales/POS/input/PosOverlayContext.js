import { createContext, createElement, useContext, useId, useLayoutEffect, useRef } from 'react';

import { POS_OVERLAY_IDS, POS_SCOPES } from './posScope';

/**
 * PosOverlayContext carries the POS input registry (posInputRegistry.js) from POSSales to the
 * components that own keyboard input: overlays, the mounted template's scan surface and the
 * payment panels.
 *
 * Outside a provider (a component rendered on its own, as most tests do) or with posInputV2
 * off, every hook here is inert and usePosInputV2() is false, so the component keeps its legacy
 * window listener. That is the whole migration switch: a listener is either registered with the
 * controller or attached by the component itself, never both.
 */
export const PosOverlayContext = createContext(null);

export function PosOverlayProvider({ registry, children }) {
  return createElement(PosOverlayContext.Provider, { value: registry || null }, children);
}

export const usePosInputRegistry = () => useContext(PosOverlayContext);

/** True when the centralized controller owns POS keyboard input for this subtree. */
export const usePosInputV2 = () => Boolean(useContext(PosOverlayContext)?.v2);

/**
 * Registers one entry while `active`, keeping its fields (callbacks included) current on every
 * render. Registration happens in a layout effect, so it is in place before any keystroke can
 * be dispatched against the newly committed screen.
 */
function useRegistryEntry(kind, id, active, fields) {
  const registry = useContext(PosOverlayContext);
  const fieldsRef = useRef(fields);
  const recordRef = useRef(null);

  useLayoutEffect(() => {
    fieldsRef.current = fields;
    if (recordRef.current) Object.assign(recordRef.current, fields);
  });

  const enabled = Boolean(registry?.v2) && Boolean(active);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const record = registry.register(kind, id, fieldsRef.current);
    recordRef.current = record;
    return () => {
      registry.unregister(kind, id, record);
      if (recordRef.current === record) recordRef.current = null;
    };
  }, [registry, kind, id, enabled]);
}

/**
 * Registers an overlay while it is open.
 *
 * @param open          whether the overlay is on screen
 * @param scope         POS_SCOPES value; MODAL by default
 * @param suppressScan  scanner input must not reach the sale while it is open (default true)
 * @param onEscape      set only when this overlay owns Escape; called with the keydown event
 */
export function usePosOverlay({
  id = null,
  open = true,
  scope = POS_SCOPES.MODAL,
  suppressScan = true,
  onEscape = null,
} = {}) {
  const autoId = useId();
  useRegistryEntry('overlay', id || `overlay${autoId}`, open, { scope, open: true, suppressScan, onEscape });
}

/**
 * Registers the mounted POS template's scan surface.
 *  - 'wedge'    Classic/Cart Focus: keystrokes on no field are buffered and Enter scans them.
 *  - 'redirect' compact Trade POS: a printable key on no field moves into the search box.
 */
export function usePosScanSurface({
  kind,
  enabled = true,
  inputRef,
  onScan = null,
  setBarcodeInput = null,
  itemEntryActive = false,
}) {
  const autoId = useId();
  useRegistryEntry('surface', `surface${autoId}`, true, {
    kind, enabled, inputRef, onScan, setBarcodeInput, itemEntryActive,
  });
}

/**
 * Registers a payment panel's method hotkeys. The controller sends a key to exactly one panel:
 * the newest one whose `owner` is the overlay currently on top.
 */
export function usePosPaymentHotkeys({
  owner = POS_OVERLAY_IDS.CHECKOUT,
  enabled = true,
  methods = [],
  onSelect,
}) {
  const autoId = useId();
  useRegistryEntry('payment', `payment${autoId}`, true, { owner, enabled, methods, onSelect });
}
