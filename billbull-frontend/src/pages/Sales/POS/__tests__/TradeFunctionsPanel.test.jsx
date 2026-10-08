import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TradeFunctionsPanel } from '../TradePOS/components/layout/TradeFunctionsPanel';
import { buildPosFunctionButtons } from '../lib/posFunctionButtons';

/**
 * The compact Trade POS template has no permanent right-hand action column — the cart owns
 * that space — so every shared POS function used to be unreachable from it. The header's
 * Functions button opens this slide-over instead. These assertions exist so the panel cannot
 * drift into a second, divergent copy of the Actions list.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

afterEach(cleanup);

// Every setter the builder destructures, as spies.
const makeCtx = (overrides = {}) => ({
  salespersonRequired: false,
  verifiedSalesperson: null,
  openSalespersonScanModal: vi.fn(),
  setShowQuickProductModal: vi.fn(),
  setShowLayawaysList: vi.fn(),
  setShowSaveLayaway: vi.fn(),
  setShowSaveOrderDialog: vi.fn(),
  setShowAddShippingDialog: vi.fn(),
  setShowCouponsDialog: vi.fn(),
  setShowPromotionsDialog: vi.fn(),
  setShowReturn: vi.fn(),
  setShowProductSearch: vi.fn(),
  setProductSearchQuery: vi.fn(),
  setProductSearchResults: vi.fn(),
  setShowPriceCheck: vi.fn(),
  setPriceCheckQuery: vi.fn(),
  setPriceCheckResult: vi.fn(),
  setShowCreditBalance: vi.fn(),
  setCreditBalanceQuery: vi.fn(),
  setCreditBalanceResult: vi.fn(),
  setShowSerialBatch: vi.fn(),
  setSerialBatchQuery: vi.fn(),
  setSerialBatchResult: vi.fn(),
  setSerialBatchSubView: vi.fn(),
  setSerialBatchInvoiceNo: vi.fn(),
  setSerialBatchItemCode: vi.fn(),
  setSerialBatchCustomerMobile: vi.fn(),
  setSerialBatchSelectedItem: vi.fn(),
  setShowCashDropDialog: vi.fn(),
  setShowLastReceiptDialog: vi.fn(),
  setShowOrdersListDialog: vi.fn(),
  setShowReprintModal: vi.fn(),
  openDeliveryModal: vi.fn(),
  setShowDeliverySettleModal: vi.fn(),
  setDeliverySettleSearch: vi.fn(),
  setDeliverySettlePersonFilter: vi.fn(),
  setDeliverySettleSelected: vi.fn(),
  setShowLockPOS: vi.fn(),
  currentSession: { status: 'OPEN' },
  setCurrentView: vi.fn(),
  ...overrides,
});

describe('TradeFunctionsPanel', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<TradeFunctionsPanel open={false} onClose={vi.fn()} {...makeCtx()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders every shared function button, and only those', () => {
    const ctx = makeCtx();
    render(<TradeFunctionsPanel open onClose={vi.fn()} {...ctx} />);
    const expected = buildPosFunctionButtons(ctx).map((b) => b.label);
    // Scoped to buttons: the group headings reuse some labels ("Delivery" is both).
    const rendered = screen.getAllByRole('button')
      .map((b) => b.textContent.trim())
      .filter((t) => t.length > 0);
    expected.forEach((label) => expect(rendered, label).toContain(label));
    // No invented extras: one button per shared definition, plus the close button
    // (the scrim and the X carry only aria-labels, so they drop out above).
    expect(rendered).toHaveLength(expected.length);
  });

  it('a function closes the panel and runs its action — the dialog never opens behind it', () => {
    const onClose = vi.fn();
    const ctx = makeCtx();
    render(<TradeFunctionsPanel open onClose={onClose} {...ctx} />);
    fireEvent.click(screen.getByText('Price Check'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ctx.setShowPriceCheck).toHaveBeenCalledWith(true);
    expect(ctx.setPriceCheckQuery).toHaveBeenCalledWith('');
    expect(ctx.setPriceCheckResult).toHaveBeenCalledWith(null);
  });

  it('honours the POS configuration hidden-button set, exactly as the Actions panel does', () => {
    const ctx = makeCtx();
    render(
      <TradeFunctionsPanel open onClose={vi.fn()} hiddenPanelButtons={new Set(['price-chk', 'coupons'])} {...ctx} />
    );
    expect(screen.queryByText('Price Check')).toBeNull();
    expect(screen.queryByText('Coupons')).toBeNull();
    expect(screen.getByText('Cash Drawer')).toBeTruthy();
  });

  it('shows the salesperson entry only while verification is required', () => {
    const { rerender } = render(<TradeFunctionsPanel open onClose={vi.fn()} {...makeCtx()} />);
    expect(screen.queryByText(/^Salesperson/)).toBeNull();
    rerender(<TradeFunctionsPanel open onClose={vi.fn()} {...makeCtx({ salespersonRequired: true })} />);
    expect(screen.getByText('Salesperson')).toBeTruthy();
  });

  it('Escape and the scrim both close it', () => {
    const onClose = vi.fn();
    render(<TradeFunctionsPanel open onClose={onClose} {...makeCtx()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Close functions'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('source contract', () => {
  const PANEL = read('../TradePOS/components/layout/TradeFunctionsPanel.jsx');
  const HEADER = read('../TradePOS/components/layout/TradeHeader.jsx');
  const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');

  it('the panel defines no buttons of its own — it only renders the shared builder', () => {
    expect(PANEL).toContain("import { buildPosFunctionButtons } from '../../../lib/posFunctionButtons';");
    // A second copy of the list is the failure mode this whole module exists to prevent.
    expect(PANEL).not.toMatch(/\bid: '(price-chk|coupons|cash-drop|layaways)'/);
    expect(PANEL).not.toMatch(/setShow\w+\(true\)/);
  });

  it('the header owns the only launcher, and the template owns the open state', () => {
    expect(HEADER).toContain('onOpenFunctions');
    expect(HEADER.match(/onOpenFunctions/g)).toHaveLength(3); // the prop, and its one guarded onClick
    expect(TRADE).toContain('const [showFunctions, setShowFunctions] = useState(false);');
    expect(TRADE).toContain('onOpenFunctions: openFunctions,');
    expect(TRADE.match(/<TradeFunctionsPanel/g)).toHaveLength(1);
  });

  it('the template owns none of the dialog state it forwards', () => {
    // Every setter reaching the panel is POSSales-owned and arrives through the shared prop bag.
    expect(TRADE).not.toMatch(/const \[show(PriceCheck|Coupons|SerialBatch|ProductSearch)/);
    // showFunctions is this template's own presentation state and the only setShow* it calls.
    expect(TRADE.match(/setShow\w+\(true\)/g)).toEqual(['setShowFunctions(true)']);
  });

  it('renders the Quick Add Product dialog its Functions button opens (it used to open nothing)', () => {
    // The button only sets POSSales' showQuickProductModal; with no renderer in this template the
    // flag flipped and nothing appeared. The dialog is driven by that same POSSales-owned state.
    expect(TRADE.match(/<QuickAddProductModal/g)).toHaveLength(1);
    expect(TRADE).toContain('isOpen={Boolean(showQuickProductModal)}');
    expect(TRADE).toContain('onCreated={handleQuickProductCreated}');
  });
});
