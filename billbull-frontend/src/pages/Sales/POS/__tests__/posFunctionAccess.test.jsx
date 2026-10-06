/**
 * Action Button Access — Console -> Behavior -> "Action Button Access".
 *
 * Three modes govern the shared POS Functions/Actions buttons, and the gate is applied in ONE
 * place (buildPosFunctionButtons, via lib/posFunctionAccess.js) so Classic, Cart Focus and the
 * compact Trade POS all enforce it identically. These tests pin both halves: what each mode does
 * to a button, and that no template can bypass it by building the list without the gate.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';

import { buildPosFunctionButtons } from '../lib/posFunctionButtons';
import {
  applyPosFunctionAccess,
  resolvePosFunctionAccessMode,
  isPosSupervisorUser,
  posFunctionDeniedMessage,
  UNGATED_POS_FUNCTION_IDS,
  POS_SUPERVISOR_ROLES,
} from '../lib/posFunctionAccess';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

/** A ctx with every setter the builder destructures, each a spy, so a button's action can be
 *  invoked and observed without a POS. */
const spyCtx = (overrides = {}) => {
  const setters = {};
  const names = [
    'openSalespersonScanModal', 'setShowQuickProductModal', 'setShowLayawaysList',
    'setShowSaveLayaway', 'setShowSaveOrderDialog', 'setShowAddShippingDialog',
    'setShowCouponsDialog', 'setShowPromotionsDialog', 'setShowReturn', 'setShowProductSearch',
    'setProductSearchQuery', 'setProductSearchResults', 'setShowPriceCheck', 'setPriceCheckQuery',
    'setPriceCheckResult', 'setShowCreditBalance', 'setCreditBalanceQuery', 'setCreditBalanceResult',
    'setShowSerialBatch', 'setSerialBatchQuery', 'setSerialBatchResult', 'setSerialBatchSubView',
    'setSerialBatchInvoiceNo', 'setSerialBatchItemCode', 'setSerialBatchCustomerMobile',
    'setSerialBatchSelectedItem', 'setShowCashDropDialog', 'setShowLastReceiptDialog',
    'setShowOrdersListDialog', 'setShowReprintModal', 'openDeliveryModal',
    'setShowDeliverySettleModal', 'setDeliverySettleSearch', 'setDeliverySettlePersonFilter',
    'setDeliverySettleSelected', 'setShowLockPOS', 'setCurrentView',
  ];
  names.forEach((n) => { setters[n] = vi.fn(); });
  return {
    ...setters,
    salespersonRequired: true,
    verifiedSalesperson: null,
    currentSession: { status: 'OPEN' },
    ...overrides,
  };
};

const byId = (buttons, id) => buttons.find((b) => b.id === id);

describe('resolvePosFunctionAccessMode', () => {
  it('passes the two restricted modes through unchanged', () => {
    expect(resolvePosFunctionAccessMode('SUPERVISOR_PASSWORD')).toBe('SUPERVISOR_PASSWORD');
    expect(resolvePosFunctionAccessMode('SUPERVISOR_ONLY')).toBe('SUPERVISOR_ONLY');
  });

  // An unconfigured branch, an older backend, a typo in the column — all mean "as it was".
  it.each([undefined, null, '', 'ALL_USERS', 'supervisor_only', 'NONSENSE', 0, {}])(
    'falls back to ALL_USERS for %s', (raw) => {
      expect(resolvePosFunctionAccessMode(raw)).toBe('ALL_USERS');
    });
});

describe('isPosSupervisorUser', () => {
  it.each(POS_SUPERVISOR_ROLES)('treats %s as a supervisor', (role) => {
    expect(isPosSupervisorUser((...roles) => roles.includes(role))).toBe(true);
  });

  it('a cashier is not a supervisor', () => {
    expect(isPosSupervisorUser((...roles) => roles.includes('CASHIER'))).toBe(false);
  });

  // The safe side: a template rendered outside PermissionContext must not be handed supervisor
  // rights by accident.
  it.each([undefined, null, 'ADMIN', {}])('a non-function hasAnyRole (%s) is not a supervisor', (v) => {
    expect(isPosSupervisorUser(v)).toBe(false);
  });
});

describe('ALL_USERS — the default', () => {
  it('returns the identical list, with no wrapping and no new objects', () => {
    const buttons = buildPosFunctionButtons(spyCtx());
    expect(applyPosFunctionAccess(buttons, { mode: 'ALL_USERS' })).toBe(buttons);
  });

  it('a button opens its dialog directly', () => {
    const ctx = spyCtx({ posFunctionAccessMode: 'ALL_USERS' });
    byId(buildPosFunctionButtons(ctx), 'return').action();
    expect(ctx.setShowReturn).toHaveBeenCalledWith(true);
  });

  it('no button is marked locked or approval-gated', () => {
    buildPosFunctionButtons(spyCtx()).forEach((b) => {
      expect(b.locked).toBeUndefined();
      expect(b.requiresApproval).toBeUndefined();
    });
  });
});

describe('SUPERVISOR_PASSWORD — any user, each use authorized', () => {
  const build = (extra = {}) => {
    const requestFunctionApproval = vi.fn();
    const ctx = spyCtx({
      posFunctionAccessMode: 'SUPERVISOR_PASSWORD',
      isPosSupervisorUser: false,
      requestFunctionApproval,
      ...extra,
    });
    return { ctx, requestFunctionApproval, buttons: buildPosFunctionButtons(ctx) };
  };

  it('holds the action instead of running it, and names the function for the dialog', () => {
    const { ctx, requestFunctionApproval, buttons } = build();
    byId(buttons, 'return').action();
    expect(ctx.setShowReturn).not.toHaveBeenCalled();
    expect(requestFunctionApproval).toHaveBeenCalledTimes(1);
    expect(requestFunctionApproval.mock.calls[0][0]).toMatchObject({ id: 'return', label: 'Return' });
  });

  it('replays the original action verbatim on approval, not just the final open call', () => {
    const { ctx, requestFunctionApproval, buttons } = build();
    byId(buttons, 'serial-batch').action();
    requestFunctionApproval.mock.calls[0][0].run();
    expect(ctx.setSerialBatchQuery).toHaveBeenCalledWith('');
    expect(ctx.setSerialBatchResult).toHaveBeenCalledWith(null);
    expect(ctx.setSerialBatchSubView).toHaveBeenCalledWith('check');
    expect(ctx.setShowSerialBatch).toHaveBeenCalledWith(true);
  });

  it('marks gated buttons requiresApproval and leaves their look alone', () => {
    const { buttons } = build();
    const ret = byId(buttons, 'return');
    expect(ret.requiresApproval).toBe(true);
    expect(ret.locked).toBeUndefined();
    expect(ret.color).not.toContain('opacity-60');
  });

  it('a supervisor is never asked for their own credential', () => {
    const { ctx, requestFunctionApproval, buttons } = build({ isPosSupervisorUser: true });
    byId(buttons, 'return').action();
    expect(requestFunctionApproval).not.toHaveBeenCalled();
    expect(ctx.setShowReturn).toHaveBeenCalledWith(true);
  });
});

describe('SUPERVISOR_ONLY — refused outright', () => {
  const build = (extra = {}) => {
    const onFunctionDenied = vi.fn();
    const requestFunctionApproval = vi.fn();
    const ctx = spyCtx({
      posFunctionAccessMode: 'SUPERVISOR_ONLY',
      isPosSupervisorUser: false,
      onFunctionDenied,
      requestFunctionApproval,
      ...extra,
    });
    return { ctx, onFunctionDenied, requestFunctionApproval, buttons: buildPosFunctionButtons(ctx) };
  };

  it('explains the refusal and offers no credential prompt to work around', () => {
    const { ctx, onFunctionDenied, requestFunctionApproval, buttons } = build();
    byId(buttons, 'cash-drop').action();
    expect(ctx.setShowCashDropDialog).not.toHaveBeenCalled();
    expect(requestFunctionApproval).not.toHaveBeenCalled();
    expect(onFunctionDenied).toHaveBeenCalledWith(posFunctionDeniedMessage('Cash Drawer'));
  });

  it('stays visible but reads as unavailable — a missing button looks like a broken POS', () => {
    const btn = byId(build().buttons, 'cash-drop');
    expect(btn.locked).toBe(true);
    expect(btn.lockReason).toBe(posFunctionDeniedMessage('Cash Drawer'));
    expect(btn.color).toContain('opacity-60');
  });

  it('a supervisor gets the untouched button', () => {
    const { ctx, buttons } = build({ isPosSupervisorUser: true });
    const btn = byId(buttons, 'cash-drop');
    expect(btn.locked).toBeUndefined();
    btn.action();
    expect(ctx.setShowCashDropDialog).toHaveBeenCalledWith(true);
  });
});

describe('what stays available to the cashier in every mode', () => {
  it.each(['SUPERVISOR_PASSWORD', 'SUPERVISOR_ONLY'])('%s leaves salesperson and lock-pos alone', (mode) => {
    const requestFunctionApproval = vi.fn();
    const onFunctionDenied = vi.fn();
    const ctx = spyCtx({
      posFunctionAccessMode: mode, isPosSupervisorUser: false,
      requestFunctionApproval, onFunctionDenied,
    });
    const buttons = buildPosFunctionButtons(ctx);

    // Gating verification would stop the cashier selling at all in a branch that requires it.
    byId(buttons, 'salesperson').action();
    expect(ctx.openSalespersonScanModal).toHaveBeenCalled();
    // Gating Lock POS would simply mean nobody locks the till.
    byId(buttons, 'lock-pos').action();
    expect(ctx.setShowLockPOS).toHaveBeenCalledWith(true);

    expect(requestFunctionApproval).not.toHaveBeenCalled();
    expect(onFunctionDenied).not.toHaveBeenCalled();
  });

  it('exempts exactly those two — everything else is gated', () => {
    expect([...UNGATED_POS_FUNCTION_IDS].sort()).toEqual(['lock-pos', 'salesperson']);
    const gated = buildPosFunctionButtons(spyCtx({
      posFunctionAccessMode: 'SUPERVISOR_ONLY', isPosSupervisorUser: false, onFunctionDenied: vi.fn(),
    }));
    gated.forEach((b) => {
      expect(b.locked, b.id).toBe(UNGATED_POS_FUNCTION_IDS.has(b.id) ? undefined : true);
    });
  });

  it('the gate never adds, drops, renames or reorders a button', () => {
    const open = buildPosFunctionButtons(spyCtx()).map((b) => [b.id, b.label, b.group]);
    ['SUPERVISOR_PASSWORD', 'SUPERVISOR_ONLY'].forEach((mode) => {
      const gated = buildPosFunctionButtons(spyCtx({
        posFunctionAccessMode: mode, isPosSupervisorUser: false,
        requestFunctionApproval: vi.fn(), onFunctionDenied: vi.fn(),
      }));
      expect(gated.map((b) => [b.id, b.label, b.group])).toEqual(open);
    });
  });
});

/**
 * One gate, three templates. The modes above are only enforceable because every template
 * renders the shared builder and forwards the four access props into it — if one template
 * built its own list, or dropped a prop, that template would silently run unrestricted.
 */
describe('no template can bypass the gate', () => {
  const FUNCS = read('../lib/posFunctionButtons.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const TRADE_SCREEN = read('../TradePOS/TradePOSTouchScreen.jsx');
  const TRADE_PANEL = read('../TradePOS/components/layout/TradeFunctionsPanel.jsx');
  const POS_SALES = read('../../POSSales.jsx');

  const ACCESS_PROPS = [
    'posFunctionAccessMode', 'isPosSupervisorUser', 'requestFunctionApproval', 'onFunctionDenied',
  ];

  it('the builder applies the gate to its own output — it is not optional at the call site', () => {
    expect(FUNCS).toContain("import { applyPosFunctionAccess } from './posFunctionAccess';");
    // Exactly one return of the list, so there is no ungated path out of the builder.
    expect(FUNCS.split('return applyPosFunctionAccess(buttons, {').length - 1).toBe(1);
  });

  it.each(ACCESS_PROPS)('POSSales hands %s to every template through touchScreenProps', (prop) => {
    const bag = POS_SALES.slice(POS_SALES.indexOf('const touchScreenProps = {'));
    expect(bag.slice(0, bag.indexOf('\n  };'))).toContain(prop);
  });

  it.each(ACCESS_PROPS)('Classic/Cart Focus forwards %s into the builder', (prop) => {
    const call = TOUCH.slice(TOUCH.indexOf('buildPosFunctionButtons({'));
    expect(call.slice(0, call.indexOf('}, iconCls)'))).toContain(prop);
  });

  it.each(ACCESS_PROPS)('Compact forwards %s to its Functions panel', (prop) => {
    expect(TRADE_SCREEN).toContain(`${prop}={${prop}}`);
  });

  it('the Compact panel passes its whole ctx to the builder, so nothing is filtered out', () => {
    expect(TRADE_PANEL).toContain("import { buildPosFunctionButtons } from '../../../lib/posFunctionButtons';");
    expect(TRADE_PANEL).toContain('buildPosFunctionButtons(ctx,');
  });

  it('the supervisor approval queue replays a POS_FUNCTION once verified', () => {
    const APPROVAL = read('../features/approval/useSupervisorApproval.js');
    expect(APPROVAL).toContain("action.type === 'POS_FUNCTION'");
    expect(APPROVAL).toContain('action.run?.();');
  });

  it('the Console exposes all three modes on the Behavior tab', () => {
    const CONSOLE = read('../POSConsole.jsx');
    expect(CONSOLE).toContain('Action Button Access');
    expect(CONSOLE).toContain('patch({ posFunctionAccessMode: val })');
    ['ALL_USERS', 'SUPERVISOR_PASSWORD', 'SUPERVISOR_ONLY'].forEach((mode) => {
      expect(CONSOLE, mode).toContain(`'${mode}'`);
    });
    // Seeded from the stored value, so saving an unrelated setting cannot relax a restricted branch.
    const DRAFT = read('../features/settings/usePosBehaviourSettings.js');
    expect(DRAFT).toContain("posFunctionAccessMode: posSettings?.posFunctionAccessMode || 'ALL_USERS',");
  });
});
