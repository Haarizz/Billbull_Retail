import { describe, expect, it, vi } from 'vitest';

import { deriveFocusTarget, findFocusElement, POS_FOCUS_TARGETS as T } from '../posFocus';
import { POS_OVERLAY_IDS, POS_SCOPES as S } from '../posScope';
import { createPosInputRegistry } from '../posInputRegistry';
import { createPosFocusController } from '../usePosFocusController';
import { isPosFocusV2Enabled } from '../posInputFlag';

describe('deriveFocusTarget — one deterministic answer per POS state', () => {
  it.each([
    [{ scope: S.SALE }, T.SEARCH],
    [{ scope: S.SALE, customerActive: true }, T.CUSTOMER],
    [{ scope: S.ITEM_ENTRY, itemEntryMode: 'qty' }, T.QUANTITY],
    [{ scope: S.ITEM_ENTRY, itemEntryMode: 'discount' }, T.DISCOUNT],
    [{ scope: S.ITEM_ENTRY, itemEntryMode: 'price' }, T.PRICE],
    [{ scope: S.CHECKOUT }, T.PAYMENT_METHOD],
    [{ scope: S.CHECKOUT, settleReady: true }, T.SETTLE],
    [{ scope: S.PAYMENT }, T.PAYMENT_AMOUNT],
    [{ scope: S.COMPLETE }, T.NEW_SALE],
    [{ scope: S.MODAL }, T.NONE],
    [{ scope: S.RETURN }, T.NONE],
    [{ scope: S.DELIVERY }, T.NONE],
    [{ scope: S.DELIVERY_SETTLEMENT }, T.NONE],
    [{ scope: S.LAYAWAY_DEPOSIT }, T.NONE],
  ])('%j → %s', (state, target) => {
    expect(deriveFocusTarget(state)).toBe(target);
  });

  it('the customer search never outranks checkout, payment or a modal', () => {
    for (const scope of [S.CHECKOUT, S.PAYMENT, S.COMPLETE, S.MODAL]) {
      expect(deriveFocusTarget({ scope, customerActive: true })).not.toBe(T.CUSTOMER);
    }
  });
});

const el = (tag = 'input') => {
  const node = document.createElement(tag);
  document.body.appendChild(node);
  return node;
};

describe('focus targets in the registry', () => {
  it('resolves the newest active element for a target, scoped to the owning overlay', () => {
    const registry = createPosInputRegistry();
    const sale = el('button');
    const checkout = el('button');
    registry.register('focus', 'a', { targets: [T.PAYMENT_METHOD], ref: { current: sale }, owner: POS_OVERLAY_IDS.LAYAWAY_DEPOSIT });
    registry.register('focus', 'b', { targets: [T.PAYMENT_METHOD], ref: { current: checkout }, owner: POS_OVERLAY_IDS.CHECKOUT });
    expect(findFocusElement(registry, T.PAYMENT_METHOD, POS_OVERLAY_IDS.CHECKOUT)).toBe(checkout);
    expect(findFocusElement(registry, T.PAYMENT_METHOD, POS_OVERLAY_IDS.LAYAWAY_DEPOSIT)).toBe(sale);
    expect(findFocusElement(registry, T.NONE)).toBeNull();
    sale.remove();
    checkout.remove();
  });

  it('an inactive or unmounted element is no target', () => {
    const registry = createPosInputRegistry();
    registry.register('focus', 'c', { targets: [T.CUSTOMER], ref: { current: el() }, active: false });
    registry.register('focus', 'd', { targets: [T.SEARCH], ref: { current: null } });
    expect(findFocusElement(registry, T.CUSTOMER)).toBeNull();
    expect(findFocusElement(registry, T.SEARCH)).toBeNull();
  });

  it('subscribers hear registrations, removals and declared-overlay changes', () => {
    const registry = createPosInputRegistry();
    const heard = vi.fn();
    registry.subscribe(heard);
    const record = registry.register('focus', 'x', { targets: [T.SEARCH], ref: { current: null } });
    registry.unregister('focus', 'x', record);
    registry.syncDeclared({ [POS_OVERLAY_IDS.CHECKOUT]: true });
    registry.syncDeclared({ [POS_OVERLAY_IDS.CHECKOUT]: true }); // no change, no notification
    registry.syncDeclared({});
    expect(heard).toHaveBeenCalledTimes(4);
  });
});

describe('createPosFocusController — transitions, not polling', () => {
  const setup = () => {
    document.body.innerHTML = '';
    const registry = createPosInputRegistry();
    const search = el();
    const settle = el('button');
    registry.register('surface', 's', { kind: 'wedge', inputRef: { current: search } });
    registry.register('focus', 'search', { targets: [T.SEARCH], ref: { current: search } });
    const controller = createPosFocusController({ registry, isDomBlocked: () => false, schedule: (fn) => fn() });
    return { registry, search, settle, controller };
  };

  it('focuses the target once on a transition and leaves the caret alone while nothing changes', () => {
    const { search, controller } = setup();
    controller.reconcile();
    expect(document.activeElement).toBe(search);
    const other = el('button');
    other.focus();
    controller.reconcile(); // same target, same element: not a transition
    expect(document.activeElement).toBe(other);
  });

  it('never pulls the caret out of a field the previous target did not own', () => {
    const { registry, search, controller } = setup();
    controller.reconcile();
    const pin = el();
    pin.focus();
    registry.syncDeclared({ [POS_OVERLAY_IDS.SUPERVISOR_PIN]: true });
    controller.reconcile();
    registry.syncDeclared({});
    controller.reconcile(); // MODAL → SALE while the cashier is in an unregistered field
    expect(document.activeElement).toBe(pin);
    expect(search).not.toBe(document.activeElement);
  });

  it('moves from the search box to checkout because the search box was the previous target', () => {
    const { registry, settle, controller, search } = setup();
    controller.reconcile();
    expect(document.activeElement).toBe(search);
    registry.syncDeclared({ [POS_OVERLAY_IDS.CHECKOUT]: true });
    registry.register('focus', 'settle', { targets: [T.SETTLE], ref: { current: settle }, owner: POS_OVERLAY_IDS.CHECKOUT, ready: true });
    controller.reconcile();
    expect(document.activeElement).toBe(settle);
  });

  it('a dialog target that already holds the caret inside itself is left alone', () => {
    const { registry, controller } = setup();
    controller.reconcile();
    const dialog = el('div');
    dialog.tabIndex = -1;
    const field = document.createElement('input');
    dialog.appendChild(field);
    field.focus();
    registry.register('overlay', 'pay', { scope: S.PAYMENT });
    registry.register('focus', 'amount', { targets: [T.PAYMENT_AMOUNT], ref: { current: dialog } });
    controller.reconcile();
    expect(document.activeElement).toBe(field);
  });

  it('coalesces a burst of registry changes into one evaluation', () => {
    const registry = createPosInputRegistry();
    const queue = [];
    const controller = createPosFocusController({ registry, isDomBlocked: () => false, schedule: (fn) => queue.push(fn) });
    controller.schedule();
    controller.schedule();
    controller.schedule();
    expect(queue).toHaveLength(1);
  });
});

describe('posFocusV2 flag', () => {
  it('is on by default and has its own per-terminal and per-build rollback', () => {
    expect(isPosFocusV2Enabled({ stored: null, env: undefined })).toBe(true);
    expect(isPosFocusV2Enabled({ stored: 'off', env: undefined })).toBe(false);
    expect(isPosFocusV2Enabled({ stored: null, env: 'false' })).toBe(false);
    expect(isPosFocusV2Enabled({ stored: 'on', env: 'false' })).toBe(true);
  });

  it('needs posInputV2: the registry reports focusV2 only when both are on', () => {
    expect(createPosInputRegistry({ v2: true, focusV2: true }).focusV2).toBe(true);
    expect(createPosInputRegistry({ v2: true, focusV2: false }).focusV2).toBe(false);
    expect(createPosInputRegistry({ v2: false, focusV2: true }).focusV2).toBe(false);
  });
});
