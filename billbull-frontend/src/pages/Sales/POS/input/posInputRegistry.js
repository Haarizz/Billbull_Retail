import { DECLARED_OVERLAY_SCOPES } from './posScope';

/**
 * The POS input registry: what is on screen that owns, or may receive, keyboard input.
 *
 * Three kinds of entry:
 *  - overlay  { scope, open, suppressScan, onEscape? } — a dialog, flow or panel over the sale
 *  - surface  { kind: 'wedge'|'redirect', enabled, inputRef, onScan?, setBarcodeInput?,
 *               itemEntryActive? } — the mounted POS template's scan target
 *  - payment  { owner, enabled, methods, onSelect } — a PaymentAllocationPanel's method hotkeys,
 *               owned by the overlay it is rendered in
 *
 * Entries are plain mutable records read synchronously by the input controller when a key
 * arrives; registering never re-renders anything. Every registration gets a sequence number,
 * so "most recently opened / mounted" is an explicit fact rather than a render-order accident.
 */
export function createPosInputRegistry({ v2 = true } = {}) {
  let seq = 0;
  const kinds = { overlay: new Map(), surface: new Map(), payment: new Map() };

  const register = (kind, id, fields = {}) => {
    seq += 1;
    const record = { ...fields, id, seq };
    kinds[kind].set(id, record);
    return record;
  };

  /** Removes the entry, but only if it is still the given record (a re-registration wins). */
  const unregister = (kind, id, record = null) => {
    if (record && kinds[kind].get(id) !== record) return;
    kinds[kind].delete(id);
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
   * delivery settlement, layaway deposit). An overlay keeps its sequence number while it stays
   * open; reopening it makes it the newest.
   */
  const syncDeclared = (flags = {}) => {
    for (const [id, scope] of Object.entries(DECLARED_OVERLAY_SCOPES)) {
      const open = Boolean(flags[id]);
      const existing = kinds.overlay.get(id);
      if (open && !existing) register('overlay', id, { scope, open: true, suppressScan: true, declared: true });
      else if (!open && existing?.declared) kinds.overlay.delete(id);
    }
  };

  return { v2, register, unregister, list, newest, syncDeclared };
}
