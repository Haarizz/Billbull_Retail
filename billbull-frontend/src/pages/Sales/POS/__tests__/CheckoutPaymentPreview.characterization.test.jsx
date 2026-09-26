import fs from 'node:fs';
import path from 'node:path';
import { useEffect, useMemo, useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ShoppingCart } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { A4ScaledPreview, ThermalScaledPreview, useA4BlobUrl } from '../POSPrintPreview';
import { useA4BlobUrl as sharedUseA4BlobUrl } from '../../../../components/print/DocumentA4Preview';
import CheckoutPaymentPreview from '../features/checkout/CheckoutPaymentPreview';

/**
 * Characterization of the POSSales.jsx CHECKOUT PREVIEW region — the payment phase's LEFT column
 * ("LEFT: Invoice Preview") and the top-level state that feeds it (checkoutSettling,
 * checkoutPreviewFreezeRef, checkoutThermalHtml / checkoutA4Html and their useA4BlobUrl hooks).
 * The column's INNER content has since moved to CheckoutPaymentPreview (Candidate A below); the outer
 * column <div> stays inline in POSSales. The copies here are the pre-extraction markup; sections G and
 * H compare the real component against them and pin the new source.
 *
 * Structure:
 *   1. `renderOriginalPreviewColumn` — the column JSX copied VERBATIM (enforced byte for byte by the
 *      source block). It is a plain render FUNCTION, not a component, so its call site yields the
 *      same unkeyed <div> element in the same child slot as the inline JSX in POSSales.
 *   2. `renderCheckoutOverlay` — the IIFE's two-phase shape (payment root + left + right, complete
 *      root + card + optional share modal) with the column in slot 0, plus two hypothetical
 *      extraction boundaries for comparison ('inner' and 'outer').
 *   3. `PreviewOwnerHarness` — owns the preview state exactly as POSSales does (settling state,
 *      freeze ref, thermal memo shape, A4 memo gate, the real useA4BlobUrl, the unfreeze effect) and
 *      drives it with the two useCheckout freeze lines, the success resets, the deferred phase switch
 *      and closeComplete. Every copied line is anchored by the source block.
 *
 * Already owned elsewhere and NOT repeated in depth: root DOM reuse / z-index (CheckoutScreen §2),
 * the three preview branches against stubs (CheckoutScreen §13), the R3 column lifecycle basics and
 * the freeze declarations' location (CheckoutPaymentRegions).
 *
 * Known current behaviours/defects pinned as-is (do NOT fix here):
 *   - showA4CheckoutPreview is a hard-coded `false`; the A4 branch and checkoutA4Html are dormant and
 *     checkoutA4BlobUrl is always ''.
 *   - The dormant A4 branch guards on checkoutA4Html but renders checkoutA4BlobUrl, so for one commit
 *     it would mount an <iframe> with no src.
 *   - The dormant A4 memo's freeze returns checkoutPreviewFreezeRef.current — the THERMAL html.
 *   - The freeze ref is written during render, inside the thermal memo.
 *   - A thermal builder throw returns '' WITHOUT clearing the ref, and useCheckout only snapshots a
 *     truthy checkoutThermalHtml, so settling then freezes the PREVIOUS html (a stale receipt).
 *   - The thermal memo and both blob hooks run while the checkout overlay is hidden.
 *   - On the first commit after html appears the column shows the placeholder (the blob URL is set
 *     in an effect), then the iframe.
 *   - A failed settle leaves the preview frozen until the dialog closes.
 */

// ── 1. the verbatim LEFT preview column ────────────────────────────────────────────────
function renderOriginalPreviewColumn({
  showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl, checkoutPreviewBlobUrl,
}) {
  return (
    /* PREVIEW-START */
            <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
              showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
              'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
            }`}>
              {showA4CheckoutPreview ? (
                checkoutA4Html ? (
                  <A4ScaledPreview src={checkoutA4BlobUrl} fillWidth />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">Add items to preview</p>
                  </div>
                )
              ) : checkoutPreviewBlobUrl ? (
                // User request: always use 80mm print preview in the checkout window.
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} paperSize="80mm" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )}
            </div>
    /* PREVIEW-END */
  );
}

// ── hypothetical boundaries (test-only; NOT production components) ─────────────────────
/** Candidate A — inner content: the column's child expression, verbatim, as a module-level component. */
function PreviewContentCandidate({
  showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl, checkoutPreviewBlobUrl,
}) {
  return (
    <>
      {/* CONTENT-START */}
              {showA4CheckoutPreview ? (
                checkoutA4Html ? (
                  <A4ScaledPreview src={checkoutA4BlobUrl} fillWidth />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">Add items to preview</p>
                  </div>
                )
              ) : checkoutPreviewBlobUrl ? (
                // User request: always use 80mm print preview in the checkout window.
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} paperSize="80mm" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )}
      {/* CONTENT-END */}
    </>
  );
}
/** The column <div> kept inline (in POSSales), with Candidate A as its only child. */
function renderColumnWithInnerCandidate(preview) {
  return (
    <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
      preview.showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
      'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
    }`}>
      <PreviewContentCandidate {...preview} />
    </div>
  );
}
/** Candidate B — the entire column as a module-level component. */
function PreviewColumnCandidate(preview) {
  return renderOriginalPreviewColumn(preview);
}
/** The live shape: the column <div> inline (as POSSales keeps it) with the real CheckoutPaymentPreview as its only child. */
function renderColumnWithExtracted({ showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl, checkoutPreviewBlobUrl }) {
  return (
    <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
      showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
      'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
    }`}>
      <CheckoutPaymentPreview
        showA4CheckoutPreview={showA4CheckoutPreview}
        checkoutA4Html={checkoutA4Html}
        checkoutA4BlobUrl={checkoutA4BlobUrl}
        checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}
      />
    </div>
  );
}

// ── 2. the checkout overlay shape ──────────────────────────────────────────────────────
const PAYMENT_ROOT = 'fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]';
const COMPLETE_ROOT = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
const COMPLETE_CARD = 'bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]';
const RIGHT = 'flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0';
const LEFT_BASE = 'w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300';
const LEFT_THERMAL = `${LEFT_BASE} lg:w-[280px] xl:w-[340px] 2xl:w-[400px]`;
const LEFT_A4 = `${LEFT_BASE} lg:w-[400px] xl:w-[500px] 2xl:w-[600px]`;
const PLACEHOLDER = 'flex-1 flex flex-col items-center justify-center text-gray-300';
const THERMAL_OUTER = 'flex-1 flex justify-center bg-[#f0f2f5] p-6 overflow-y-auto';
const THERMAL_CARD = 'w-[340px] max-w-full bg-white shadow-2xl p-4 rounded-xl border border-gray-200 shrink-0 flex flex-col transition-all duration-300';

/** Stands in for ReceiptShareModal: a COMPONENT in slot 1, so React never recycles the right column's <div> for it. */
function ShareModalStub() {
  return <div data-testid="share" />;
}

function renderLeft(boundary, preview) {
  if (boundary === 'inner') return renderColumnWithInnerCandidate(preview);
  if (boundary === 'outer') return <PreviewColumnCandidate {...preview} />;
  if (boundary === 'extracted') return renderColumnWithExtracted(preview);
  return renderOriginalPreviewColumn(preview);
}

function renderCheckoutOverlay({ showPaymentDialog, checkoutPhase, lastPaidInvoice, receiptShareChannel, boundary = 'inline', preview }) {
  return showPaymentDialog && (() => {
    if (checkoutPhase === 'complete' && lastPaidInvoice) {
      return (
        <div className={COMPLETE_ROOT}>
          <div className={COMPLETE_CARD}><p>Payment Complete</p></div>
          {receiptShareChannel && <ShareModalStub />}
        </div>
      );
    }
    return (
      <div className={PAYMENT_ROOT}>
        {renderLeft(boundary, preview)}
        <div className={RIGHT}><p>Checkout</p></div>
      </div>
    );
  })();
}

function Overlay(props) {
  return <div data-testid="host">{renderCheckoutOverlay(props)}</div>;
}

// ── 3. the owner harness ───────────────────────────────────────────────────────────────
const buildPreviewHtml = (invoice) => {
  if (invoice.bad) throw new Error('builder failed');
  return `<html>${invoice.label}</html>`;
};

function PreviewOwnerHarness({ initialInvoice = null, initialOpen = true, boundary = 'inline', onApi, onRender }) {
  const [currentInvoice, setCurrentInvoice] = useState(initialInvoice);
  const [showPaymentDialog, setShowPaymentDialog] = useState(initialOpen);
  const [checkoutPhase, setCheckoutPhase] = useState('payment');
  const [lastPaidInvoice, setLastPaidInvoice] = useState(null);

  const [checkoutSettling, setCheckoutSettling] = useState(false);
  const checkoutPreviewFreezeRef = useRef('');

  // The ref read/write during render is POSSales' own freeze pattern, reproduced on purpose (pinned
  // as a known behaviour above) — the harness must not "fix" what it characterizes.
  const checkoutThermalHtml = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs
    if (checkoutSettling) return checkoutPreviewFreezeRef.current;
    if (!currentInvoice) return '';
    try {
      const html = buildPreviewHtml(currentInvoice);
      // eslint-disable-next-line react-hooks/refs
      checkoutPreviewFreezeRef.current = html;
      return html;
    } catch (e) {
      console.warn('Checkout Thermal preview failed:', e);
      return '';
    }
  }, [checkoutSettling, currentInvoice]);

  const checkoutPreviewBlobUrl = useA4BlobUrl(checkoutThermalHtml);

  const showA4CheckoutPreview = false;
  const checkoutA4Html = useMemo(() => {
    if (!showA4CheckoutPreview) return '';
    if (checkoutSettling) return checkoutPreviewFreezeRef.current || '';
    return currentInvoice ? '<html>a4</html>' : '';
  }, [showA4CheckoutPreview, checkoutSettling, currentInvoice]);
  const checkoutA4BlobUrl = useA4BlobUrl(checkoutA4Html);

  useEffect(() => {
    if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false);
  }, [showPaymentDialog, checkoutSettling]);

  useEffect(() => {
    onApi?.({
      setCurrentInvoice,
      setShowPaymentDialog,
      readFreezeRef: () => checkoutPreviewFreezeRef.current,
      // useCheckout.processPayment — the two freeze lines, verbatim.
      beginSettle: () => {
        if (checkoutThermalHtml) checkoutPreviewFreezeRef.current = checkoutThermalHtml;
        setCheckoutSettling(true);
      },
      // useCheckout success path: the synchronous resets (clearInvoice among them)…
      settleSucceeded: (paid) => { setLastPaidInvoice(paid); setCurrentInvoice(null); },
      // …then queueMicrotask(() => setCheckoutPhase('complete')) as its own commit.
      showComplete: () => setCheckoutPhase('complete'),
      // POSSales closeComplete — its first three statements.
      closeComplete: () => {
        setShowPaymentDialog(false);
        setCheckoutPhase('payment');
        setCheckoutSettling(false);
      },
    });
  }, [onApi, checkoutThermalHtml]);

  onRender?.({ checkoutSettling, checkoutThermalHtml, checkoutPreviewBlobUrl, checkoutA4Html, checkoutA4BlobUrl, showPaymentDialog, checkoutPhase });

  return (
    <div data-testid="host">
      {renderCheckoutOverlay({
        showPaymentDialog, checkoutPhase, lastPaidInvoice, boundary,
        preview: { showA4CheckoutPreview, checkoutA4Html, checkoutA4BlobUrl, checkoutPreviewBlobUrl },
      })}
    </div>
  );
}

// ── fixtures / helpers ─────────────────────────────────────────────────────────────────
const blobs = new Map();
const revoked = [];
let blobSeq = 0;
const ORIGINAL_CREATE = URL.createObjectURL;
const ORIGINAL_REVOKE = URL.revokeObjectURL;

class FakeBlob {
  constructor(parts, options) { this.parts = parts; this.type = options?.type; }
}
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

const host = () => screen.getByTestId('host');
const root = () => host().firstElementChild;
const column = () => root()?.children[0] ?? null;
const iframe = () => host().querySelector('iframe');
const srcOf = (frame) => frame?.getAttribute('src') ?? null;
const htmlOf = (url) => blobs.get(url)?.parts.join('') ?? null;
const PAID = { id: 'SI-1' };

const preview = (overrides = {}) => ({
  showA4CheckoutPreview: false, checkoutA4Html: '', checkoutA4BlobUrl: '', checkoutPreviewBlobUrl: 'blob:thermal-1',
  ...overrides,
});
const overlay = (overrides = {}) => ({
  showPaymentDialog: true, checkoutPhase: 'payment', lastPaidInvoice: null, receiptShareChannel: null, boundary: 'inline',
  ...overrides,
  preview: preview(overrides.preview),
});

function mountOwner(props = {}) {
  const log = [];
  let api;
  const utils = render(<PreviewOwnerHarness onApi={(a) => { api = a; }} onRender={(r) => log.push(r)} {...props} />);
  return { ...utils, log, api: () => api };
}

beforeEach(() => {
  blobs.clear();
  revoked.length = 0;
  blobSeq = 0;
  vi.stubGlobal('Blob', FakeBlob);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:mock-${++blobSeq}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url) => { revoked.push(url); });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  URL.createObjectURL = ORIGINAL_CREATE;
  URL.revokeObjectURL = ORIGINAL_REVOKE;
});

// ── A. source selection ────────────────────────────────────────────────────────────────
describe('A. preview source selection (verbatim column, real preview components)', () => {
  it('thermal (default): column > ThermalScaledPreview outer > 340px card > one iframe carrying checkoutPreviewBlobUrl', () => {
    render(<Overlay {...overlay()} />);
    expect(column().className).toBe(LEFT_THERMAL);
    expect(column().children).toHaveLength(1);
    const outer = column().children[0];
    expect(outer.className).toBe(THERMAL_OUTER);
    expect(outer.children).toHaveLength(1);
    expect(outer.children[0].className).toBe(THERMAL_CARD);
    expect(outer.children[0].children).toHaveLength(1);
    expect(outer.children[0].children[0]).toBe(iframe());
    expect(iframe().title).toBe('Thermal Receipt Preview');
    expect(srcOf(iframe())).toBe('blob:thermal-1');
    expect(host().querySelectorAll('iframe')).toHaveLength(1);
  });

  it.each([[''], [null], [undefined], [0], [false]])('thermal with checkoutPreviewBlobUrl %j → placeholder only, no iframe', (blank) => {
    render(<Overlay {...overlay({ preview: { checkoutPreviewBlobUrl: blank } })} />);
    expect(column().className).toBe(LEFT_THERMAL);
    expect(column().children).toHaveLength(1);
    const placeholder = column().children[0];
    expect(placeholder.className).toBe(PLACEHOLDER);
    expect([...placeholder.children].map((c) => c.tagName.toLowerCase())).toEqual(['svg', 'p']);
    expect(placeholder.children[1].className).toBe('text-xs');
    expect(placeholder.textContent).toBe('Add items to preview');
    expect(iframe()).toBeNull();
  });

  it('with showA4CheckoutPreview false the A4 html/blob are ignored entirely', () => {
    render(<Overlay {...overlay({ preview: { checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    expect(iframe().title).toBe('Thermal Receipt Preview');
    expect(srcOf(iframe())).toBe('blob:thermal-1');
    expect(column().className).toBe(LEFT_THERMAL);
  });

  it('(dormant) A4: checkoutA4Html is the guard, checkoutA4BlobUrl the src; wider column; thermal blob ignored', () => {
    render(<Overlay {...overlay({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    expect(column().className).toBe(LEFT_A4);
    expect(host().querySelectorAll('iframe')).toHaveLength(1);
    expect(iframe().title).toBe('Invoice Preview');
    expect(srcOf(iframe())).toBe('blob:a4');
  });

  it('(dormant) A4 with html but no blob yet mounts an iframe WITHOUT a src (guard and src disagree)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Overlay {...overlay({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: '' } })} />);
    expect(iframe().title).toBe('Invoice Preview');
    expect(iframe().hasAttribute('src')).toBe(false);
  });

  it.each([[''], [null], [undefined]])('(dormant) A4 with checkoutA4Html %j → placeholder, even with an A4 blob and a thermal blob', (blank) => {
    render(<Overlay {...overlay({ preview: { showA4CheckoutPreview: true, checkoutA4Html: blank, checkoutA4BlobUrl: 'blob:a4' } })} />);
    expect(column().className).toBe(LEFT_A4);
    expect(column().children[0].className).toBe(PLACEHOLDER);
    expect(iframe()).toBeNull();
  });
});

// ── B. identity inside the payment phase ───────────────────────────────────────────────
describe('B. DOM identity inside the payment phase', () => {
  it('same src → every node (column, thermal wrappers, iframe) is kept', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const nodes = [column(), column().children[0], column().children[0].children[0], iframe()];
    rerender(<Overlay {...overlay()} />);
    expect([column(), column().children[0], column().children[0].children[0], iframe()]).toEqual(nodes);
    nodes.forEach((n, i) => expect(n, String(i)).toBe([column(), column().children[0], column().children[0].children[0], iframe()][i]));
  });

  it('blob URL replaced → the SAME iframe, src attribute updated in place', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const frame = iframe();
    rerender(<Overlay {...overlay({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-2' } })} />);
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:thermal-2');
  });

  it('blob URL emptied → iframe and thermal wrappers unmount; restored → brand-new iframe; column kept throughout', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const col = column();
    const frame = iframe();
    const outer = col.children[0];
    rerender(<Overlay {...overlay({ preview: { checkoutPreviewBlobUrl: '' } })} />);
    expect(frame.isConnected).toBe(false);
    expect(outer.isConnected).toBe(false);
    expect(column()).toBe(col);
    rerender(<Overlay {...overlay()} />);
    expect(iframe()).not.toBe(frame);
    expect(column()).toBe(col);
  });

  it('thermal ↔ A4 mode switch REMOUNTS the iframe (different component type), column kept, class swapped', () => {
    const { rerender } = render(<Overlay {...overlay({ preview: { checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    const col = column();
    const thermalFrame = iframe();
    rerender(<Overlay {...overlay({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    const a4Frame = iframe();
    expect(a4Frame).not.toBe(thermalFrame);
    expect(thermalFrame.isConnected).toBe(false);
    expect(column()).toBe(col);
    expect(col.className).toBe(LEFT_A4);
    rerender(<Overlay {...overlay({ preview: { checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    expect(iframe()).not.toBe(a4Frame);
    expect(col.className).toBe(LEFT_THERMAL);
  });

  it('placeholder ↔ placeholder across modes keeps the SAME placeholder node (same element type/slot)', () => {
    const { rerender } = render(<Overlay {...overlay({ preview: { checkoutPreviewBlobUrl: '' } })} />);
    const placeholder = column().children[0];
    rerender(<Overlay {...overlay({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '' } })} />);
    expect(column().children[0]).toBe(placeholder);
  });

  it('`transition-all duration-300` sits on the column AND on ThermalScaledPreview\'s own card', () => {
    render(<Overlay {...overlay()} />);
    const transitioned = [...host().querySelectorAll('.transition-all.duration-300')];
    expect(transitioned).toEqual([column(), column().children[0].children[0]]);
  });
});

// ── C. phase switch ────────────────────────────────────────────────────────────────────
describe('C. payment ↔ complete phase and hide/show', () => {
  it('payment → complete: root kept; the column <div> is RECYCLED as the complete card; its class is fully replaced (no transition); iframe and right column removed', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const rootNode = root();
    const col = column();
    const frame = iframe();
    const right = rootNode.children[1];
    rerender(<Overlay {...overlay({ checkoutPhase: 'complete', lastPaidInvoice: PAID })} />);
    expect(root()).toBe(rootNode);
    expect(rootNode.className).toBe(COMPLETE_ROOT);
    expect(rootNode.children[0]).toBe(col);
    expect(col.className).toBe(COMPLETE_CARD);
    expect(col.classList.contains('transition-all')).toBe(false);
    expect(col.classList.contains('duration-300')).toBe(false);
    expect(frame.isConnected).toBe(false);
    expect(iframe()).toBeNull();
    expect(right.isConnected).toBe(false);
    expect(rootNode.children).toHaveLength(1);
  });

  it('payment → complete with a share channel: the share modal is a NEW second child; the column is still recycled as the card', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const col = column();
    const right = root().children[1];
    rerender(<Overlay {...overlay({ checkoutPhase: 'complete', lastPaidInvoice: PAID, receiptShareChannel: 'sms' })} />);
    expect(root().children[0]).toBe(col);
    expect(root().children[1]).not.toBe(right);
    expect(right.isConnected).toBe(false);
    expect(root().children[1].dataset.testid).toBe('share');
    expect(REGION).toContain('                <ReceiptShareModal\n                  key={receiptShareChannel}\n');
  });

  it('complete → payment: the card node becomes the column again, regaining `transition-all duration-300`; the iframe is NEW', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const firstFrame = iframe();
    rerender(<Overlay {...overlay({ checkoutPhase: 'complete', lastPaidInvoice: PAID })} />);
    const card = root().children[0];
    rerender(<Overlay {...overlay()} />);
    expect(column()).toBe(card);
    expect(card.className).toBe(LEFT_THERMAL);
    expect(iframe()).not.toBe(firstFrame);
    expect(iframe()).not.toBeNull();
  });

  it.each([['complete', null], ['Complete', PAID], [undefined, PAID]])('phase %j with lastPaidInvoice %j stays on payment: column and iframe kept', (checkoutPhase, lastPaidInvoice) => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const col = column();
    const frame = iframe();
    rerender(<Overlay {...overlay({ checkoutPhase, lastPaidInvoice })} />);
    expect(column()).toBe(col);
    expect(iframe()).toBe(frame);
  });

  it('hidden (showPaymentDialog false): no root, no column, no iframe; reopening creates new column and iframe nodes', () => {
    const { rerender } = render(<Overlay {...overlay()} />);
    const col = column();
    const frame = iframe();
    rerender(<Overlay {...overlay({ showPaymentDialog: false })} />);
    expect(host().children).toHaveLength(0);
    expect(col.isConnected).toBe(false);
    expect(frame.isConnected).toBe(false);
    rerender(<Overlay {...overlay()} />);
    expect(column()).not.toBe(col);
    expect(iframe()).not.toBe(frame);
  });
});

// ── D. candidate boundaries ────────────────────────────────────────────────────────────
describe('D. hypothetical extraction boundaries', () => {
  const STATES = [
    ['thermal', {}],
    ['thermal blank', { checkoutPreviewBlobUrl: '' }],
    ['a4', { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }],
    ['a4 blank', { showA4CheckoutPreview: true, checkoutA4Html: '' }],
  ];

  it.each(STATES)('%s: inline, inner (content component) and outer (column component) render identical HTML', (_name, p) => {
    const html = (boundary) => {
      const { container } = render(<Overlay {...overlay({ boundary, preview: p })} />);
      const out = container.innerHTML;
      cleanup();
      return out;
    };
    const inline = html('inline');
    expect(html('inner')).toBe(inline);
    expect(html('outer')).toBe(inline);
  });

  it('inner candidate: column recycled across payment → complete → payment exactly like inline', () => {
    for (const boundary of ['inline', 'inner']) {
      const { rerender } = render(<Overlay {...overlay({ boundary })} />);
      const col = column();
      rerender(<Overlay {...overlay({ boundary, checkoutPhase: 'complete', lastPaidInvoice: PAID })} />);
      expect(root().children[0], boundary).toBe(col);
      rerender(<Overlay {...overlay({ boundary })} />);
      expect(column(), boundary).toBe(col);
      cleanup();
    }
  });

  it('inner candidate: iframe kept across src changes, remounted across blank and mode switches — same as inline', () => {
    const trace = (boundary) => {
      const { rerender } = render(<Overlay {...overlay({ boundary })} />);
      const steps = [];
      let prev = iframe();
      const step = (props) => {
        rerender(<Overlay {...overlay({ boundary, ...props })} />);
        const now = iframe();
        steps.push(now === null ? 'none' : now === prev ? 'kept' : 'new');
        if (now) prev = now;
      };
      step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-2' } });
      step({ preview: { checkoutPreviewBlobUrl: '' } });
      step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-3' } });
      step({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } });
      step({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4-2' } });
      step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-3' } });
      cleanup();
      return steps;
    };
    const inline = trace('inline');
    expect(inline).toEqual(['kept', 'none', 'new', 'new', 'kept', 'new']);
    expect(trace('inner')).toEqual(inline);
    expect(trace('outer')).toEqual(inline);
  });

  it('HAZARD outer candidate: the column is NOT recycled as the complete card (and vice versa) — node identity changes', () => {
    const { rerender } = render(<Overlay {...overlay({ boundary: 'outer' })} />);
    const rootNode = root();
    const col = column();
    rerender(<Overlay {...overlay({ boundary: 'outer', checkoutPhase: 'complete', lastPaidInvoice: PAID })} />);
    expect(root()).toBe(rootNode);
    expect(root().children[0]).not.toBe(col);
    expect(col.isConnected).toBe(false);
    const card = root().children[0];
    rerender(<Overlay {...overlay({ boundary: 'outer' })} />);
    expect(root()).toBe(rootNode);
    expect(column()).not.toBe(card);
    expect(card.isConnected).toBe(false);
  });

  it('inner candidate under the real owner: freeze + success + close sequence yields the same iframe trace as inline', () => {
    const trace = (boundary) => {
      const o = mountOwner({ boundary, initialInvoice: { label: 'A' } });
      const out = [];
      let prev = iframe();
      const snap = () => {
        const now = iframe();
        out.push(now === null ? 'none' : now === prev ? `kept:${htmlOf(srcOf(now))}` : `new:${htmlOf(srcOf(now))}`);
        if (now) prev = now;
      };
      act(() => o.api().beginSettle()); snap();
      act(() => o.api().settleSucceeded(PAID)); snap();
      act(() => o.api().showComplete()); snap();
      act(() => o.api().closeComplete()); snap();
      act(() => o.api().setCurrentInvoice({ label: 'B' })); snap();
      act(() => o.api().setShowPaymentDialog(true)); snap();
      cleanup();
      return out;
    };
    const inline = trace('inline');
    expect(inline).toEqual(['kept:<html>A</html>', 'kept:<html>A</html>', 'none', 'none', 'none', 'new:<html>B</html>']);
    expect(trace('inner')).toEqual(inline);
  });
});

// ── E. owner lifecycle: blob hook + freeze ─────────────────────────────────────────────
describe('E. blob URL lifecycle (real useA4BlobUrl)', () => {
  it('POSPrintPreview re-exports the shared DocumentA4Preview hook (same function)', () => {
    expect(useA4BlobUrl).toBe(sharedUseA4BlobUrl);
  });

  it('first commit renders the placeholder (url still \'\'), the effect then creates the blob and the iframe mounts', () => {
    const container = document.body.appendChild(document.createElement('div'));
    const observer = new MutationObserver(() => {});
    observer.observe(container, { childList: true, subtree: true });
    const log = [];
    render(<PreviewOwnerHarness initialInvoice={{ label: 'A' }} onRender={(r) => log.push(r)} />, { container });
    const records = observer.takeRecords();
    observer.disconnect();
    expect(log[0]).toMatchObject({ checkoutThermalHtml: '<html>A</html>', checkoutPreviewBlobUrl: '' });
    expect(log.at(-1)).toMatchObject({ checkoutThermalHtml: '<html>A</html>', checkoutPreviewBlobUrl: 'blob:mock-1' });
    const added = records.flatMap((r) => [...r.addedNodes]).filter((n) => n.nodeType === 1);
    const removed = records.flatMap((r) => [...r.removedNodes]).filter((n) => n.nodeType === 1);
    expect(removed.some((n) => n.className === PLACEHOLDER)).toBe(true);
    expect(added.some((n) => n.className === THERMAL_OUTER)).toBe(true);
    expect(htmlOf(srcOf(iframe()))).toBe('<html>A</html>');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(blobs.get('blob:mock-1').type).toBe('text/html');
  });

  it('while the overlay is hidden the memo and blob hook still run: a blob exists but no iframe', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' }, initialOpen: false });
    expect(host().children).toHaveLength(0);
    expect(o.log.at(-1).checkoutPreviewBlobUrl).toBe('blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    act(() => o.api().setShowPaymentDialog(true));
    expect(srcOf(iframe())).toBe('blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('a new invoice object producing the SAME html creates no blob and keeps the iframe and src', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const frame = iframe();
    act(() => o.api().setCurrentInvoice({ label: 'A' }));
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual([]);
  });

  it('changed html → new blob URL on the SAME iframe; the old URL is revoked 100ms later, not before', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const frame = iframe();
    act(() => o.api().setCurrentInvoice({ label: 'B' }));
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:mock-2');
    expect(htmlOf('blob:mock-2')).toBe('<html>B</html>');
    act(() => { vi.advanceTimersByTime(99); });
    expect(revoked).toEqual([]);
    act(() => { vi.advanceTimersByTime(1); });
    expect(revoked).toEqual(['blob:mock-1']);
  });

  it('cart cleared while NOT settling → html \'\' → url \'\' → placeholder, iframe removed, URL revoked after 100ms', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const frame = iframe();
    act(() => o.api().setCurrentInvoice(null));
    expect(frame.isConnected).toBe(false);
    expect(column().children[0].className).toBe(PLACEHOLDER);
    expect(o.log.at(-1)).toMatchObject({ checkoutThermalHtml: '', checkoutPreviewBlobUrl: '' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(revoked).toEqual(['blob:mock-1']);
  });

  it('the dormant A4 hook never creates a blob: checkoutA4Html and checkoutA4BlobUrl stay \'\' in every render', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    act(() => o.api().beginSettle());
    act(() => o.api().closeComplete());
    expect(o.log.every((r) => r.checkoutA4Html === '' && r.checkoutA4BlobUrl === '')).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('E. freeze behaviour (checkoutSettling + checkoutPreviewFreezeRef)', () => {
  it('the ref tracks the latest successfully built html while not settling (written during render)', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    expect(o.api().readFreezeRef()).toBe('<html>A</html>');
    act(() => o.api().setCurrentInvoice({ label: 'B' }));
    expect(o.api().readFreezeRef()).toBe('<html>B</html>');
    act(() => o.api().setCurrentInvoice(null));
    expect(o.api().readFreezeRef()).toBe('<html>B</html>');
  });

  it('SUCCESS: settle freezes (no new blob, same iframe) → cart clear stays frozen → complete removes the iframe but keeps the URL alive → closeComplete unfreezes and revokes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const col = column();
    const frame = iframe();

    act(() => o.api().beginSettle());
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutThermalHtml: '<html>A</html>', checkoutPreviewBlobUrl: 'blob:mock-1' });
    expect(iframe()).toBe(frame);

    act(() => o.api().settleSucceeded(PAID));
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutThermalHtml: '<html>A</html>', checkoutPreviewBlobUrl: 'blob:mock-1' });
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:mock-1');

    act(() => o.api().showComplete());
    expect(frame.isConnected).toBe(false);
    expect(root().children[0]).toBe(col);
    expect(col.className).toBe(COMPLETE_CARD);
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutPreviewBlobUrl: 'blob:mock-1' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(revoked).toEqual([]);

    act(() => o.api().closeComplete());
    expect(host().children).toHaveLength(0);
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: false, checkoutThermalHtml: '', checkoutPreviewBlobUrl: '', showPaymentDialog: false, checkoutPhase: 'payment' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(revoked).toEqual(['blob:mock-1']);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('SUCCESS: closeComplete batches the close with the unfreeze — no render ever has the overlay open while unfrozen after settling', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const settledAt = o.log.length;
    act(() => o.api().beginSettle());
    act(() => o.api().settleSucceeded(PAID));
    act(() => o.api().showComplete());
    act(() => o.api().closeComplete());
    const after = o.log.slice(settledAt);
    expect(after.filter((r) => r.showPaymentDialog).every((r) => r.checkoutSettling)).toBe(true);
    expect(after.at(-1).checkoutSettling).toBe(false);
  });

  it('next sale after success: the preview tracks the live cart again with a brand-new iframe', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const first = iframe();
    act(() => o.api().beginSettle());
    act(() => o.api().settleSucceeded(PAID));
    act(() => o.api().showComplete());
    act(() => o.api().closeComplete());
    act(() => o.api().setCurrentInvoice({ label: 'B' }));
    act(() => o.api().setShowPaymentDialog(true));
    expect(iframe()).not.toBe(first);
    expect(htmlOf(srcOf(iframe()))).toBe('<html>B</html>');
    expect(o.log.at(-1).checkoutSettling).toBe(false);
  });

  it('FAILURE: the preview stays frozen while the cart/payment inputs keep changing — same iframe, same src, no new blob', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const frame = iframe();
    act(() => o.api().beginSettle());
    act(() => o.api().setCurrentInvoice({ label: 'A+tender' }));
    act(() => o.api().setCurrentInvoice({ label: 'A+tender+2' }));
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:mock-1');
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutThermalHtml: '<html>A</html>' });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(o.api().readFreezeRef()).toBe('<html>A</html>');
  });

  it('FAILURE then close (X): the root unmounts first; the effect unfreezes in a LATER render; the live html is rebuilt only then', () => {
    const o = mountOwner({ initialInvoice: { label: 'A' } });
    const frame = iframe();
    act(() => o.api().beginSettle());
    act(() => o.api().setCurrentInvoice({ label: 'edited' }));
    const before = o.log.length;
    act(() => o.api().setShowPaymentDialog(false));
    const renders = o.log.slice(before);
    expect(renders[0]).toMatchObject({ showPaymentDialog: false, checkoutSettling: true, checkoutThermalHtml: '<html>A</html>' });
    expect(renders.some((r) => !r.showPaymentDialog && !r.checkoutSettling && r.checkoutThermalHtml === '<html>edited</html>')).toBe(true);
    expect(renders.every((r) => !r.showPaymentDialog)).toBe(true);
    expect(frame.isConnected).toBe(false);
    act(() => o.api().setShowPaymentDialog(true));
    expect(iframe()).not.toBe(frame);
    expect(htmlOf(srcOf(iframe()))).toBe('<html>edited</html>');
  });

  it('DEFECT: a builder throw returns \'\' but leaves the ref on the PREVIOUS html, so settling freezes a stale receipt', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = mountOwner({ initialInvoice: { label: 'previous-sale' } });
    act(() => o.api().setCurrentInvoice({ label: 'current', bad: true }));
    expect(iframe()).toBeNull();
    expect(o.log.at(-1).checkoutThermalHtml).toBe('');
    act(() => o.api().beginSettle());
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutThermalHtml: '<html>previous-sale</html>' });
    expect(htmlOf(srcOf(iframe()))).toBe('<html>previous-sale</html>');
  });

  it('settling with an empty ref (no html ever built) freezes \'\' → placeholder, no iframe', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = mountOwner({ initialInvoice: { label: 'x', bad: true } });
    act(() => o.api().beginSettle());
    expect(o.log.at(-1)).toMatchObject({ checkoutSettling: true, checkoutThermalHtml: '', checkoutPreviewBlobUrl: '' });
    expect(iframe()).toBeNull();
    expect(column().children[0].className).toBe(PLACEHOLDER);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

// ── F. source ──────────────────────────────────────────────────────────────────────────
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const USE_CHECKOUT = readSource('../features/checkout/useCheckout.js');
/** useCheckout with whole-line and trailing `//` comments removed (its header/param docs name the same tokens). */
const USE_CHECKOUT_CODE = USE_CHECKOUT.split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\s+\/\/ .*$/, '')).join('\n');
const PRINT_PREVIEW = readSource('../POSPrintPreview.jsx');
const DOC_A4_PREVIEW = readSource('../../../../components/print/DocumentA4Preview.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const count = (src, needle) => src.split(needle).length - 1;
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const PREVIEW = () => between(SELF, '/* PREVIEW-START */\n', '\n    /* PREVIEW-END */');
const CONTENT = () => between(SELF, '{/* CONTENT-START */}\n', '\n      {/* CONTENT-END */}');
/** The call that replaced the column's 18-line inner expression in POSSales. */
const CALL = [
  '              <CheckoutPaymentPreview',
  '                showA4CheckoutPreview={showA4CheckoutPreview}',
  '                checkoutA4Html={checkoutA4Html}',
  '                checkoutA4BlobUrl={checkoutA4BlobUrl}',
  '                checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}',
  '              />',
].join('\n');
/** The live column in POSSales: the verbatim column with only its inner expression swapped for CALL. */
const LIVE_COLUMN = () => {
  const lines = PREVIEW().split('\n');
  return [...lines.slice(0, 4), CALL, ...lines.slice(22)].join('\n');
};
/** CONTENT as a return expression: the JSX-container braces on its first and last line dropped, nothing else. */
const CONTENT_AS_EXPRESSION = () => {
  const lines = CONTENT().split('\n');
  lines[0] = lines[0].replace(/^( +)\{showA4CheckoutPreview \? \($/, '$1showA4CheckoutPreview ? (');
  lines[lines.length - 1] = lines[lines.length - 1].replace(/^( +)\)\}$/, '$1)');
  return lines.join('\n');
};
const COMPONENT = readSource('../features/checkout/CheckoutPaymentPreview.jsx');
/** CheckoutPaymentPreview with whole-line `//` comments removed (its header prose names owner concepts). */
const COMPONENT_CODE = COMPONENT.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const REGION_START = '      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}\n';
const REGION = POS_SALES.slice(POS_SALES.indexOf(REGION_START), POS_SALES.indexOf('\n      })()}', POS_SALES.indexOf(REGION_START)));
const PAYMENT_PHASE = REGION.slice(REGION.indexOf('        const shippingChargeNum = Number(shippingCharge) || 0;\n'));
const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

const PARENT_LOCALS = [
  'showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl', 'checkoutThermalHtml',
  'checkoutSettling', 'setCheckoutSettling', 'checkoutPreviewFreezeRef', 'checkoutPhase', 'lastPaidInvoice',
  'showPaymentDialog', 'currentInvoice', 'checkoutPayment', 'invoiceNo', 'canSettle', 'receiptShareChannel',
];
const readsOf = (src) => PARENT_LOCALS.filter((id) => new RegExp(`\\b${id}\\b`).test(src));

describe('F. source — boundaries', () => {
  it('the verbatim column (23 lines) is now live as its unchanged outer <div> around the CheckoutPaymentPreview call (11 lines), once, framed by the root, LEFT comment and RIGHT comment', () => {
    expect(PREVIEW().split('\n')).toHaveLength(23);
    expect(LIVE_COLUMN().split('\n')).toHaveLength(11);
    expect(count(POS_SALES, PREVIEW())).toBe(0);
    expect(count(POS_SALES, LIVE_COLUMN())).toBe(1);
    expect(PAYMENT_PHASE).toContain(
      `        return (\n          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n\n            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}\n${LIVE_COLUMN()}\n\n            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}\n            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">\n`,
    );
  });

  it('the LEFT comment sits two lines under the z-[60] root and the column closes two lines above the RIGHT comment (line anchors)', () => {
    const rootLine = lineOf(POS_SALES, '          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">\n');
    const leftComment = lineOf(POS_SALES, '{/* ══ LEFT: Invoice Preview');
    const columnOpen = lineOf(POS_SALES, LIVE_COLUMN());
    const rightComment = lineOf(POS_SALES, '{/* ══ RIGHT: Payment & Settlement');
    expect(leftComment).toBe(rootLine + 2);
    expect(columnOpen).toBe(leftComment + 1);
    // was columnOpen + 22 + 2 while the 18-line inner expression was inline
    expect(rightComment).toBe(columnOpen + 10 + 2);
  });

  it('Candidate A copy is exactly the column\'s inner expression (lines 5–22 of the column)', () => {
    expect(CONTENT()).toBe(PREVIEW().split('\n').slice(4, 22).join('\n'));
  });

  it('the column is a raw unkeyed <div> in slot 0 of the payment root; the complete root puts an unkeyed card <div> in slot 0', () => {
    expect(PREVIEW().split('\n')[0]).toMatch(/^ {12}<div className=\{`w-full shrink-0 /);
    expect(PREVIEW()).not.toMatch(/\bkey=|\bref=/);
    const complete = REGION.slice(0, REGION.indexOf('        const shippingChargeNum'));
    expect(complete).toContain(`            <div className="${COMPLETE_ROOT}">\n              <div className="${COMPLETE_CARD}">\n`);
    expect(complete).toContain('              {/* Share Receipt dialog — one component, three configured channels. */}\n              {receiptShareChannel && (\n');
  });

  it('column reads exactly the four preview values; no handlers, refs, keys, hooks, focus or load wiring', () => {
    expect(readsOf(PREVIEW())).toEqual(['showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl']);
    expect(PREVIEW()).not.toMatch(/\bon[A-Z]\w*=|\bref=|\bkey=|\buse[A-Z]\w*\(|tabIndex|autoFocus|srcDoc/);
    expect(PREVIEW().match(/<(A4ScaledPreview|ThermalScaledPreview|ShoppingCart)\b/g)).toEqual(['A4ScaledPreview', 'ShoppingCart', 'ThermalScaledPreview', 'ShoppingCart'].map((t) => `<${t}`));
    expect(PREVIEW()).not.toMatch(/<iframe|DocumentA4Preview|A4PreviewFrame|POSPrintPreview/);
  });

  it('useA4BlobUrl stays a POSSales import from ./POS/POSPrintPreview; A4ScaledPreview, ThermalScaledPreview and ShoppingCart are CheckoutPaymentPreview module imports', () => {
    expect(POS_SALES).toContain("import {\n  ThermalMock, useA4BlobUrl, A4PreviewFrame, A4LivePreview,\n  ServiceJobA4Preview, PaperSizePicker, ImageUploadBox,\n} from './POS/POSPrintPreview';\n");
    expect(POS_SALES).not.toMatch(/\bA4ScaledPreview\b|\bThermalScaledPreview\b/);
    expect(POS_SALES).toMatch(/import \{[^}]*\bShoppingCart\b[^}]*\} from 'lucide-react';/);
    expect(COMPONENT).toContain("import React from 'react';\nimport { ShoppingCart } from 'lucide-react';\n\nimport { A4ScaledPreview, ThermalScaledPreview } from '../../POSPrintPreview';\n");
    expect(PRINT_PREVIEW).toContain("import { useA4BlobUrl, A4PreviewFrame } from '../../../components/print/DocumentA4Preview';\n");
    expect(PRINT_PREVIEW).toContain('export { useA4BlobUrl, A4PreviewFrame };\n');
  });
});

describe('F. source — preview state, freeze and lifecycle ownership', () => {
  const at = (needle) => {
    expect(count(POS_SALES, needle), needle).toBe(1);
    return POS_SALES.indexOf(needle);
  };

  it('top-level order in POSSales: settling state/ref → thermal memo → thermal blob → A4 gate/memo → A4 blob → unfreeze effect → useCheckout(previewFreeze) → region', () => {
    const order = [
      '  const [checkoutSettling, setCheckoutSettling] = useState(false);\n',
      "  const checkoutPreviewFreezeRef = useRef('');\n",
      '  const checkoutThermalHtml = useMemo(() => {\n    if (checkoutSettling) return checkoutPreviewFreezeRef.current;\n    if (!currentInvoice) return \'\';\n    try {\n',
      '  const checkoutPreviewBlobUrl = useA4BlobUrl(checkoutThermalHtml);\n',
      '  const showA4CheckoutPreview = false;\n',
      "  const checkoutA4Html = useMemo(() => {\n    if (!showA4CheckoutPreview) return '';\n    if (checkoutSettling) return checkoutPreviewFreezeRef.current || '';\n    if (!currentInvoice) return '';\n",
      '  const checkoutA4BlobUrl = useA4BlobUrl(checkoutA4Html);\n',
      '  useEffect(() => {\n    if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false);\n  }, [showPaymentDialog, checkoutSettling]);\n',
      '    previewFreeze: { checkoutSettling, setCheckoutSettling, checkoutPreviewFreezeRef },\n',
      REGION_START,
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the thermal memo writes the ref in exactly two places (Template 2 then Template 1), each right before `return html;`; its catch returns \'\' without touching the ref', () => {
    const memo = between(POS_SALES, '  const checkoutThermalHtml = useMemo(() => {\n', '  const checkoutPreviewBlobUrl');
    expect(memo.match(/checkoutPreviewFreezeRef\.current = html;\n\s+return html;/g)).toHaveLength(2);
    expect(memo).toContain("    } catch (e) {\n      console.warn('Checkout Thermal preview failed:', e);\n      return '';\n    }\n");
    expect(memo.slice(memo.indexOf('} catch (e) {'))).not.toContain('checkoutPreviewFreezeRef');
  });

  it('neither preview memo depends on showPaymentDialog or checkoutPhase (they run while hidden / across phases)', () => {
    const thermal = between(POS_SALES, '  const checkoutThermalHtml = useMemo(() => {\n', '  const checkoutPreviewBlobUrl');
    const a4 = between(POS_SALES, '  const checkoutA4Html = useMemo(() => {\n', '  const checkoutA4BlobUrl');
    for (const src of [thermal, a4]) {
      expect(src).not.toMatch(/\bshowPaymentDialog\b|\bcheckoutPhase\b|\blastPaidInvoice\b/);
    }
    expect(thermal).toContain('  }, [checkoutSettling, currentInvoice,');
    expect(a4).toContain('  }, [showA4CheckoutPreview, checkoutSettling, currentInvoice,');
  });

  it('POSSales token counts: setCheckoutSettling ×4 (decl, effect, previewFreeze, closeComplete); checkoutPreviewFreezeRef ×6; checkoutSettling read only outside the region', () => {
    expect(POS_SALES.match(/\bsetCheckoutSettling\b/g)).toHaveLength(4);
    expect(POS_SALES.match(/\bcheckoutPreviewFreezeRef\b/g)).toHaveLength(6);
    expect(REGION.match(/\bsetCheckoutSettling\b/g)).toHaveLength(1);
    expect(REGION).not.toMatch(/\bcheckoutSettling\b|checkoutPreviewFreezeRef|checkoutThermalHtml|useA4BlobUrl/);
  });

  it('closeComplete: close, reset phase, unfreeze — in that order, as its first three statements', () => {
    expect(REGION).toContain("          const closeComplete = () => {\n            setShowPaymentDialog(false);\n            setCheckoutPhase('payment');\n            setCheckoutSettling(false);\n");
  });

  it('useCheckout: the two freeze lines (copied in the harness) sit after the loading/error resets and before `try {`; it only ever sets settling TRUE', () => {
    expect(count(USE_CHECKOUT, '    setCheckoutLoading(true);\n    setCheckoutError(null);\n')).toBe(1);
    const freeze = '    if (checkoutThermalHtml) checkoutPreviewFreezeRef.current = checkoutThermalHtml;\n    setCheckoutSettling(true);\n    try {\n';
    expect(count(USE_CHECKOUT, freeze)).toBe(1);
    expect(USE_CHECKOUT.indexOf(freeze)).toBeGreaterThan(USE_CHECKOUT.indexOf('    setCheckoutError(null);\n'));
    expect(USE_CHECKOUT_CODE.match(/\bsetCheckoutSettling\(/g)).toEqual(['setCheckoutSettling(']);
    expect(USE_CHECKOUT_CODE).toContain('    setCheckoutSettling(true);\n');
    expect(USE_CHECKOUT_CODE.match(/checkoutPreviewFreezeRef\.current\s*=/g)).toHaveLength(1);
    expect(USE_CHECKOUT_CODE.match(/checkoutPreviewFreezeRef\.current(?!\s*=)/g)).toBeNull();
  });

  it('useCheckout success: clearInvoice() before the microtask-deferred phase switch; failure path deliberately does not unfreeze', () => {
    const clear = USE_CHECKOUT.indexOf('      clearInvoice();\n');
    const phase = USE_CHECKOUT.indexOf("      queueMicrotask(() => setCheckoutPhase('complete'));\n");
    expect(clear).toBeGreaterThan(USE_CHECKOUT.indexOf('      const savedInvoice = await posCheckout(payload);\n'));
    expect(phase).toBeGreaterThan(clear);
    expect(USE_CHECKOUT).toContain('      // Do NOT unfreeze the preview here: flipping checkoutSettling false in the\n');
  });

  it('useCheckout never reads or renders the preview blob URLs or html beyond the freeze snapshot', () => {
    expect(USE_CHECKOUT).not.toMatch(/checkoutPreviewBlobUrl|checkoutA4BlobUrl|checkoutA4Html|showA4CheckoutPreview|useA4BlobUrl/);
    expect(USE_CHECKOUT_CODE.match(/\bcheckoutThermalHtml\b/g)).toHaveLength(3); // destructure + guard + assignment
  });

  it('the harness copies the unfreeze effect, memo guards, freeze lines and closeComplete statements (re-indented only)', () => {
    const pairs = [
      [POS_SALES, '    if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false);\n  }, [showPaymentDialog, checkoutSettling]);\n', 0],
      [POS_SALES, "    if (checkoutSettling) return checkoutPreviewFreezeRef.current;\n    if (!currentInvoice) return '';\n", 0],
      [POS_SALES, "    if (!showA4CheckoutPreview) return '';\n    if (checkoutSettling) return checkoutPreviewFreezeRef.current || '';\n", 0],
      [USE_CHECKOUT, '    if (checkoutThermalHtml) checkoutPreviewFreezeRef.current = checkoutThermalHtml;\n    setCheckoutSettling(true);\n', 4],
      [POS_SALES, "            setShowPaymentDialog(false);\n            setCheckoutPhase('payment');\n            setCheckoutSettling(false);\n", -4],
    ];
    for (const [src, text, shift] of pairs) {
      expect(count(src, text), text).toBe(1);
      const harness = text.split('\n').map((l) => (l ? (shift >= 0 ? ' '.repeat(shift) + l : l.slice(-shift)) : l)).join('\n');
      expect(count(SELF, harness), harness).toBe(1);
    }
  });
});

describe('F. source — child components (read-only inventory)', () => {
  const body = (src, start) => {
    const i = src.indexOf(start);
    expect(i, start).toBeGreaterThanOrEqual(0);
    return src.slice(i, src.indexOf('\n}\n', i) + 2);
  };

  it('ThermalScaledPreview: module-level function export, no hooks/effects/handlers; one iframe titled "Thermal Receipt Preview"', () => {
    const src = body(PRINT_PREVIEW, "export function ThermalScaledPreview({ src, paperSize = '80mm' }) {");
    expect(src).not.toMatch(/\buse[A-Z]\w*\(|React\.use|\bon[A-Z]\w*=|\bref=|\bkey=/);
    expect(src.match(/<iframe /g)).toHaveLength(1);
    expect(src).toContain('title="Thermal Receipt Preview"');
    expect(typeof ThermalScaledPreview).toBe('function');
  });

  it('A4ScaledPreview: module-level; owns a container ref, scale/size state and a ResizeObserver effect keyed on fillWidth; no handlers', () => {
    const src = body(PRINT_PREVIEW, 'export function A4ScaledPreview({ src, fillWidth = false }) {');
    expect(src.match(/React\.use\w+/g)).toEqual(['React.useRef', 'React.useState', 'React.useState', 'React.useEffect']);
    expect(src).toContain('    return () => ro.disconnect();\n  }, [fillWidth]);\n');
    expect(src).not.toMatch(/\bon[A-Z]\w*=|\bkey=/);
    expect(src).toContain('title="Invoice Preview"');
  });

  it('useA4BlobUrl: state + one effect on [html]; \'\' for falsy html; revoke deferred 100ms in cleanup', () => {
    const src = between(DOC_A4_PREVIEW, 'export const useA4BlobUrl = (html) => {\n', '\n};\n');
    expect(src.match(/React\.use\w+/g)).toEqual(['React.useState', 'React.useEffect']);
    expect(src).toContain("    if (!html) {\n      setUrl('');\n      return;\n    }\n");
    expect(src).toContain('      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);\n    };\n  }, [html]);');
  });

  it('no iframe load/doc wiring anywhere in the preview modules; DocumentA4Preview/A4PreviewFrame are not rendered by the region', () => {
    for (const src of [PRINT_PREVIEW, DOC_A4_PREVIEW]) {
      expect(src).not.toMatch(/onLoad|contentWindow|contentDocument|srcDoc/);
    }
    expect(REGION).not.toMatch(/<A4PreviewFrame|<DocumentA4Preview|<iframe/);
  });
});

// ── G. extracted component vs the pre-extraction markup ────────────────────────────────
describe('G. CheckoutPaymentPreview renders exactly like the pre-extraction inner markup', () => {
  const FOUR = ['showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl'];
  const BLANKS = [['', "''"], [null, 'null'], [undefined, 'undefined'], [false, 'false'], [0, '0']];
  const STATES = [
    ['thermal with blob', {}],
    ['thermal ignores A4 values', { checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }],
    ['A4 with html and blob', { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }],
    ...BLANKS.flatMap(([blank, label]) => [
      [`thermal blob ${label}`, { checkoutPreviewBlobUrl: blank }],
      [`A4 html ${label}`, { showA4CheckoutPreview: true, checkoutA4Html: blank, checkoutA4BlobUrl: 'blob:a4' }],
      [`A4 html set, blob ${label}`, { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: blank }],
      [`A4 flag ${label}`, { showA4CheckoutPreview: blank, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' }],
    ]),
  ];
  const overlayHtml = (boundary, p) => {
    const { container } = render(<Overlay {...overlay({ boundary, preview: p })} />);
    const out = container.innerHTML;
    cleanup();
    return out;
  };
  const soloHtml = (Component, p) => {
    const { container } = render(<Component {...preview(p)} />);
    const out = container.innerHTML;
    cleanup();
    return out;
  };
  const iframeTrace = (boundary) => {
    const { rerender } = render(<Overlay {...overlay({ boundary })} />);
    const steps = [];
    let prev = iframe();
    const step = (props) => {
      rerender(<Overlay {...overlay({ boundary, ...props })} />);
      const now = iframe();
      steps.push(now === null ? 'none' : now === prev ? 'kept' : 'new');
      if (now) prev = now;
    };
    step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-1' } });
    step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-2' } });
    step({ preview: { checkoutPreviewBlobUrl: '' } });
    step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-3' } });
    step({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } });
    step({ preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4-2' } });
    step({ preview: { checkoutPreviewBlobUrl: 'blob:thermal-3' } });
    step({ checkoutPhase: 'complete', lastPaidInvoice: PAID });
    step({});
    step({ showPaymentDialog: false });
    step({});
    cleanup();
    return steps;
  };

  beforeEach(() => {
    // the dormant A4 branch can mount an <iframe> with an empty/absent src; React's warning is not under test
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('takes exactly the four preview props', () => {
    expect(Object.keys(preview())).toEqual(FOUR);
  });

  it.each(STATES)('%s: the overlay renders identical HTML inline, via Candidate A and via CheckoutPaymentPreview', (_name, p) => {
    const inline = overlayHtml('inline', p);
    expect(overlayHtml('extracted', p)).toBe(inline);
    expect(overlayHtml('inner', p)).toBe(inline);
  });

  it.each(STATES)('%s: rendered alone, CheckoutPaymentPreview matches the verbatim inner expression (no wrapper element)', (_name, p) => {
    expect(soloHtml(CheckoutPaymentPreview, p)).toBe(soloHtml(PreviewContentCandidate, p));
  });

  it('thermal: the component\'s top node is ThermalScaledPreview\'s outer, placed directly in the column', () => {
    render(<Overlay {...overlay({ boundary: 'extracted' })} />);
    expect(column().className).toBe(LEFT_THERMAL);
    expect(column().children).toHaveLength(1);
    expect(column().children[0].className).toBe(THERMAL_OUTER);
    expect(srcOf(iframe())).toBe('blob:thermal-1');
  });

  it.each(BLANKS)('placeholder for thermal blob %j: column > placeholder only, no iframe', (blank) => {
    render(<Overlay {...overlay({ boundary: 'extracted', preview: { checkoutPreviewBlobUrl: blank } })} />);
    expect(column().children).toHaveLength(1);
    expect(column().children[0].className).toBe(PLACEHOLDER);
    expect(column().children[0].textContent).toBe('Add items to preview');
    expect(iframe()).toBeNull();
  });

  it('(dormant) A4 branch: wider column, "Invoice Preview" iframe with the A4 blob; html without blob still mounts a src-less iframe', () => {
    const { rerender } = render(<Overlay {...overlay({ boundary: 'extracted', preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: 'blob:a4' } })} />);
    expect(column().className).toBe(LEFT_A4);
    expect(iframe().title).toBe('Invoice Preview');
    expect(srcOf(iframe())).toBe('blob:a4');
    rerender(<Overlay {...overlay({ boundary: 'extracted', preview: { showA4CheckoutPreview: true, checkoutA4Html: '<html>a4</html>', checkoutA4BlobUrl: '' } })} />);
    expect(iframe().hasAttribute('src')).toBe(false);
  });

  it('unchanged props on rerender keep every node (column, thermal wrappers, iframe)', () => {
    const { rerender } = render(<Overlay {...overlay({ boundary: 'extracted' })} />);
    const nodes = () => [column(), column().children[0], column().children[0].children[0], iframe()];
    const before = nodes();
    rerender(<Overlay {...overlay({ boundary: 'extracted' })} />);
    nodes().forEach((n, i) => expect(n, String(i)).toBe(before[i]));
  });

  it('a new blob URL updates the SAME iframe\'s src in place', () => {
    const { rerender } = render(<Overlay {...overlay({ boundary: 'extracted' })} />);
    const frame = iframe();
    rerender(<Overlay {...overlay({ boundary: 'extracted', preview: { checkoutPreviewBlobUrl: 'blob:thermal-2' } })} />);
    expect(iframe()).toBe(frame);
    expect(srcOf(frame)).toBe('blob:thermal-2');
  });

  it('placeholder ↔ placeholder across modes keeps the SAME placeholder node', () => {
    const { rerender } = render(<Overlay {...overlay({ boundary: 'extracted', preview: { checkoutPreviewBlobUrl: '' } })} />);
    const placeholder = column().children[0];
    rerender(<Overlay {...overlay({ boundary: 'extracted', preview: { showA4CheckoutPreview: true, checkoutA4Html: '' } })} />);
    expect(column().children[0]).toBe(placeholder);
  });

  it('iframe identity trace (src change, blank, mode switch, complete, hide, reopen) is identical to inline', () => {
    const inline = iframeTrace('inline');
    expect(inline).toEqual(['kept', 'kept', 'none', 'new', 'new', 'kept', 'new', 'none', 'new', 'none', 'new']);
    expect(iframeTrace('extracted')).toEqual(inline);
  });

  it('payment → complete: the inline outer column is still RECYCLED as the complete card; complete → payment brings it back with a new iframe', () => {
    for (const receiptShareChannel of [null, 'sms']) {
      const { rerender } = render(<Overlay {...overlay({ boundary: 'extracted' })} />);
      const rootNode = root();
      const col = column();
      const frame = iframe();
      rerender(<Overlay {...overlay({ boundary: 'extracted', checkoutPhase: 'complete', lastPaidInvoice: PAID, receiptShareChannel })} />);
      expect(root()).toBe(rootNode);
      expect(root().children[0]).toBe(col);
      expect(col.className).toBe(COMPLETE_CARD);
      expect(frame.isConnected).toBe(false);
      rerender(<Overlay {...overlay({ boundary: 'extracted' })} />);
      expect(column()).toBe(col);
      expect(col.className).toBe(LEFT_THERMAL);
      expect(iframe()).not.toBe(frame);
      expect(srcOf(iframe())).toBe('blob:thermal-1');
      cleanup();
    }
  });

  it('preview hidden: no root/column/iframe; reopening creates new column and iframe nodes — same as inline', () => {
    const run = (boundary) => {
      const { rerender } = render(<Overlay {...overlay({ boundary })} />);
      const col = column();
      const frame = iframe();
      rerender(<Overlay {...overlay({ boundary, showPaymentDialog: false })} />);
      const hidden = [host().children.length, col.isConnected, frame.isConnected];
      rerender(<Overlay {...overlay({ boundary })} />);
      const out = [...hidden, column() === col, iframe() === frame, srcOf(iframe())];
      cleanup();
      return out;
    };
    expect(run('inline')).toEqual([0, false, false, false, false, 'blob:thermal-1']);
    expect(run('extracted')).toEqual(run('inline'));
  });

  it('under the real owner: first commit placeholder, then the iframe — one blob, same html', () => {
    const o = mountOwner({ boundary: 'extracted', initialInvoice: { label: 'A' } });
    expect(o.log[0]).toMatchObject({ checkoutThermalHtml: '<html>A</html>', checkoutPreviewBlobUrl: '' });
    expect(htmlOf(srcOf(iframe()))).toBe('<html>A</html>');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('under the real owner: freeze → success → complete → close → next sale yields the same iframe trace and html as inline', () => {
    const trace = (boundary) => {
      const o = mountOwner({ boundary, initialInvoice: { label: 'A' } });
      const out = [];
      let prev = iframe();
      const snap = () => {
        const now = iframe();
        out.push(now === null ? 'none' : now === prev ? `kept:${htmlOf(srcOf(now))}` : `new:${htmlOf(srcOf(now))}`);
        if (now) prev = now;
      };
      act(() => o.api().beginSettle()); snap();
      act(() => o.api().setCurrentInvoice({ label: 'A+tender' })); snap();
      act(() => o.api().settleSucceeded(PAID)); snap();
      act(() => o.api().showComplete()); snap();
      act(() => o.api().closeComplete()); snap();
      act(() => o.api().setCurrentInvoice({ label: 'B' })); snap();
      act(() => o.api().setShowPaymentDialog(true)); snap();
      out.push(`settling:${o.log.at(-1).checkoutSettling}`);
      cleanup();
      return out;
    };
    const inline = trace('inline');
    expect(inline).toEqual(['kept:<html>A</html>', 'kept:<html>A</html>', 'kept:<html>A</html>', 'none', 'none', 'none', 'new:<html>B</html>', 'settling:false']);
    expect(trace('extracted')).toEqual(inline);
  });

  it('under the real owner: failed settle stays frozen, close (X) unfreezes later, reopen shows the edited html — same as inline', () => {
    const trace = (boundary) => {
      const o = mountOwner({ boundary, initialInvoice: { label: 'A' } });
      const frame = iframe();
      act(() => o.api().beginSettle());
      act(() => o.api().setCurrentInvoice({ label: 'edited' }));
      const frozen = [iframe() === frame, htmlOf(srcOf(iframe()))];
      act(() => o.api().setShowPaymentDialog(false));
      act(() => o.api().setShowPaymentDialog(true));
      const out = [...frozen, iframe() === frame, htmlOf(srcOf(iframe())), o.log.at(-1).checkoutSettling];
      cleanup();
      return out;
    };
    const inline = trace('inline');
    expect(inline).toEqual([true, '<html>A</html>', false, '<html>edited</html>', false]);
    expect(trace('extracted')).toEqual(inline);
  });
});

// ── H. source — the extraction ─────────────────────────────────────────────────────────
describe('H. source — CheckoutPaymentPreview', () => {
  const FOUR = ['showA4CheckoutPreview', 'checkoutA4Html', 'checkoutA4BlobUrl', 'checkoutPreviewBlobUrl'];

  it('its return value is the column\'s inner expression byte for byte, minus only the JSX-container braces — no wrapper', () => {
    expect(CONTENT_AS_EXPRESSION()).not.toBe(CONTENT());
    expect(CONTENT_AS_EXPRESSION().split('\n')).toHaveLength(18);
    expect(count(COMPONENT, `  return (\n${CONTENT_AS_EXPRESSION()}\n  );\n}\n\nexport default CheckoutPaymentPreview;\n`)).toBe(1);
    expect(COMPONENT_CODE).not.toMatch(/<>|<\/>|Fragment/);
  });

  it('props are exactly the four preview values, destructured in order; one module-level function', () => {
    expect(COMPONENT).toContain('function CheckoutPaymentPreview({\n  showA4CheckoutPreview,\n  checkoutA4Html,\n  checkoutA4BlobUrl,\n  checkoutPreviewBlobUrl,\n}) {\n');
    expect(COMPONENT_CODE.match(/function \w+\(/g)).toEqual(['function CheckoutPaymentPreview(']);
    expect(readsOf(COMPONENT_CODE)).toEqual(FOUR);
    expect(typeof CheckoutPaymentPreview).toBe('function');
    expect(CheckoutPaymentPreview.$$typeof).toBeUndefined();
  });

  it('pure presentation: no hooks, state, refs, effects, context, memo, handlers or keys', () => {
    expect(COMPONENT_CODE).not.toMatch(/\buse[A-Z]\w*|React\.use|\bmemo\b|createContext|useContext|forwardRef|\.Provider|\bref=|\bkey=|\bon[A-Z]\w*=/);
  });

  it('owns none of the preview lifecycle: no freeze ref, checkoutSettling, thermal html or useA4BlobUrl', () => {
    for (const absent of ['checkoutPreviewFreezeRef', 'checkoutSettling', 'setCheckoutSettling', 'checkoutThermalHtml', 'useA4BlobUrl', 'showPaymentDialog', 'checkoutPhase']) {
      expect(COMPONENT, absent).not.toContain(absent);
    }
  });

  it('exactly one call site, passing the four values under their own names, inside the outer column in the payment phase', () => {
    expect(POS_SALES.match(/\bCheckoutPaymentPreview\b/g)).toHaveLength(3); // import binding, import path, JSX tag
    expect(count(POS_SALES, "import CheckoutPaymentPreview from './POS/features/checkout/CheckoutPaymentPreview';\n")).toBe(1);
    expect(count(POS_SALES, '<CheckoutPaymentPreview')).toBe(1);
    expect(readsOf(CALL)).toEqual(FOUR);
    expect(count(PAYMENT_PHASE, CALL)).toBe(1);
    const opener = PREVIEW().split('\n').slice(0, 4).join('\n');
    expect(PAYMENT_PHASE).toContain(`${opener}\n${CALL}\n            </div>\n`);
    expect(REGION.slice(0, REGION.indexOf('        const shippingChargeNum'))).not.toContain('CheckoutPaymentPreview');
  });

  it('the outer column source is unchanged: identical opener (class template incl. transition-all duration-300) and close; still a raw unkeyed <div>', () => {
    const live = LIVE_COLUMN().split('\n');
    const original = PREVIEW().split('\n');
    expect(live.slice(0, 4)).toEqual(original.slice(0, 4));
    expect(live.at(-1)).toBe(original.at(-1));
    expect(live[0]).toContain('transition-all duration-300 ${');
    expect(LIVE_COLUMN()).not.toMatch(/\bkey=|\bref=/);
    expect(count(POS_SALES, LIVE_COLUMN())).toBe(1);
  });
});
