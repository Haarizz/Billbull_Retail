import { describe, expect, it } from 'vitest';

import {
  acceptsPaymentHotkeys,
  acceptsScanner,
  POS_OVERLAY_IDS,
  POS_SCOPES,
  resolvePosScope,
} from '../posScope';
import { createPosInputRegistry } from '../posInputRegistry';
import { isPosInputV2Enabled } from '../posInputFlag';

const overlay = (scope, seq, extra = {}) => ({ id: `${scope}-${seq}`, scope, seq, open: true, suppressScan: true, ...extra });

describe('resolvePosScope — explicit state, deterministic priority', () => {
  it('nothing open is SALE; the item keypad in a mode is ITEM_ENTRY', () => {
    expect(resolvePosScope().scope).toBe(POS_SCOPES.SALE);
    expect(resolvePosScope({ itemEntryActive: true }).scope).toBe(POS_SCOPES.ITEM_ENTRY);
  });

  it('MODAL → PAYMENT → full-screen flows → ITEM_ENTRY → SALE, regardless of open order', () => {
    const all = [
      overlay(POS_SCOPES.CHECKOUT, 5),
      overlay(POS_SCOPES.MODAL, 1),
      overlay(POS_SCOPES.PAYMENT, 9),
    ];
    expect(resolvePosScope({ overlays: all, itemEntryActive: true }).scope).toBe(POS_SCOPES.MODAL);
    expect(resolvePosScope({ overlays: all.slice(0, 1).concat(all[2]) }).scope).toBe(POS_SCOPES.PAYMENT);
    expect(resolvePosScope({ overlays: [all[0]], itemEntryActive: true }).scope).toBe(POS_SCOPES.CHECKOUT);
  });

  it('inside one tier the most recently opened overlay wins', () => {
    const r = resolvePosScope({ overlays: [overlay(POS_SCOPES.CHECKOUT, 2), overlay(POS_SCOPES.RETURN, 7)] });
    expect(r.scope).toBe(POS_SCOPES.RETURN);
    expect(r.overlay.seq).toBe(7);
  });

  it('closed overlays are ignored', () => {
    expect(resolvePosScope({ overlays: [overlay(POS_SCOPES.MODAL, 3, { open: false })] }).scope).toBe(POS_SCOPES.SALE);
  });

  it('the DOM is a migration fallback only: consulted when no registered overlay is open', () => {
    let asked = 0;
    const isDomBlocked = () => { asked += 1; return true; };
    const registered = resolvePosScope({ overlays: [overlay(POS_SCOPES.CHECKOUT, 1)], isDomBlocked });
    expect(registered.scope).toBe(POS_SCOPES.CHECKOUT);
    expect(registered.fallback).toBe(false);
    expect(asked).toBe(0);

    const unregistered = resolvePosScope({ isDomBlocked });
    expect(unregistered).toMatchObject({ scope: POS_SCOPES.MODAL, scanBlocked: true, fallback: true });
    expect(asked).toBe(1);
  });

  it('suppressScan: false lets an overlay own the scope without blocking the scanner', () => {
    expect(resolvePosScope({ overlays: [overlay(POS_SCOPES.MODAL, 1, { suppressScan: false })] }).scanBlocked).toBe(false);
    expect(resolvePosScope({ overlays: [overlay(POS_SCOPES.MODAL, 1)] }).scanBlocked).toBe(true);
  });

  it('scanner input is accepted only in SALE', () => {
    for (const scope of Object.values(POS_SCOPES)) {
      expect(acceptsScanner(scope), scope).toBe(scope === POS_SCOPES.SALE);
    }
  });

  it('payment hotkeys only where a payment panel lives: checkout, layaway deposit, delivery settlement', () => {
    const allowed = Object.values(POS_SCOPES).filter(acceptsPaymentHotkeys);
    expect(allowed.sort()).toEqual([
      POS_SCOPES.CHECKOUT, POS_SCOPES.DELIVERY_SETTLEMENT, POS_SCOPES.LAYAWAY_DEPOSIT,
    ].sort());
  });
});

describe('createPosInputRegistry', () => {
  it('declared overlays open and close from POSSales flags, keeping their sequence while open', () => {
    const reg = createPosInputRegistry();
    reg.syncDeclared({ [POS_OVERLAY_IDS.CHECKOUT]: true });
    const first = reg.list('overlay')[0];
    expect(first).toMatchObject({ id: 'checkout', scope: POS_SCOPES.CHECKOUT, suppressScan: true });
    reg.syncDeclared({ [POS_OVERLAY_IDS.CHECKOUT]: true, [POS_OVERLAY_IDS.RETURN]: true });
    expect(reg.list('overlay')[0]).toBe(first);
    expect(resolvePosScope({ overlays: reg.list('overlay') }).scope).toBe(POS_SCOPES.RETURN);
    reg.syncDeclared({});
    expect(reg.list('overlay')).toEqual([]);
  });

  it('unregister with a stale record does not remove a newer registration of the same id', () => {
    const reg = createPosInputRegistry();
    const old = reg.register('overlay', 'x', { scope: POS_SCOPES.MODAL });
    reg.register('overlay', 'x', { scope: POS_SCOPES.MODAL });
    reg.unregister('overlay', 'x', old);
    expect(reg.list('overlay')).toHaveLength(1);
  });
});

describe('posInputV2 flag', () => {
  it('is on by default', () => {
    expect(isPosInputV2Enabled({ stored: null, env: undefined })).toBe(true);
  });
  it('a build can turn it off', () => {
    expect(isPosInputV2Enabled({ stored: null, env: 'false' })).toBe(false);
  });
  it('a terminal override beats the build, both ways', () => {
    expect(isPosInputV2Enabled({ stored: 'off', env: 'true' })).toBe(false);
    expect(isPosInputV2Enabled({ stored: 'on', env: 'false' })).toBe(true);
  });
});
