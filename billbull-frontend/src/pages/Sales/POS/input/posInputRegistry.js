import { DECLARED_OVERLAY_SCOPES } from './posScope';

/**
 * The POS input registry: what is on screen that owns, or may receive, keyboard input.
 *
 * Four kinds of entry:
 *  - overlay  { scope, open, suppressScan, onEscape? } — a dialog, flow or panel over the sale
 *  - surface  { kind: 'wedge'|'redirect', enabled, inputRef, onScan?, setBarcodeInput?,
 *               itemEntryActive?, itemEntryMode? } — the mounted POS template's scan target
 *  - payment  { owner, enabled, methods, onSelect } — a PaymentAllocationPanel's method hotkeys,
 *               owned by the overlay it is rendered in
 *  - focus    { targets, ref, owner?, active?, ready? } — the element implementing one or more
 *               POS focus targets (posFocus.js), owned by the overlay it is rendered in, if any
 *
 * Entries are plain mutable records read synchronously by the input controller when a key
 * arrives; registering never re-renders anything. Every registration gets a sequence number,
 * so "most recently opened / mounted" is an explicit fact rather than a render-order accident.
 * Subscribers (the focus controller) are told that something changed — an entry registered,
 * left, or had its fields refreshed by a render — and re-read the registry themselves.
 */
export function createPosInputRegistry({ v2 = true, focusV2 = v2 } = {}) {
  let seq = 0;
  const kinds = { overlay: new Map(), surface: new Map(), payment: new Map(), focus: new Map() };
  const listeners = new Set();

  /** Tells subscribers the registry changed. They re-read it; nothing is passed. */
  const touch = () => {
    listeners.forEach((fn) => fn());
  };
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  const register = (kind, id, fields = {}) => {
    seq += 1;
    const record = { ...fields, id, seq };
    kinds[kind].set(id, record);
    touch();
    return record;
  };

  /** Removes the entry, but only if it is still the given record (a re-registration wins). */
  const unregister = (kind, id, record = null) => {
    if (record && kinds[kind].get(id) !== record) return;
    if (kinds[kind].delete(id)) touch();
  };

  const list = (kind) => Array.from(kinds[kind].values());

  /** Newest record of a kind that passes `accept`. */
  const newest = (kind, accept = () => true) => {
    let best = null;
    for (const record of kinds[kind].values()) {
      if (!accept(record)) continue;
      if (!best || record.seq > best.seq) best = record;
    }
    return best;
  };

  /**
   * Opens/closes the overlays POSSales owns through boolean flags (checkout, return, delivery,
   * delivery settlement, layaway deposit, and the POSSales dialogs). An overlay keeps its
   * sequence number while it stays open; reopening it makes it the newest.
   */
  const syncDeclared = (flags = {}) => {
    for (const [id, scope] of Object.entries(DECLARED_OVERLAY_SCOPES)) {
      const open = Boolean(flags[id]);
      const existing = kinds.overlay.get(id);
      if (open && !existing) register('overlay', id, { scope, open: true, suppressScan: true, declared: true });
      else if (!open && existing?.declared) unregister('overlay', id, existing);
    }
  };

  return {
    v2,
    // Focus control rides on the input registry, so it can only be on when V2 input is.
    focusV2: Boolean(v2 && focusV2),
    register, unregister, list, newest, syncDeclared, subscribe, touch,
  };
}
