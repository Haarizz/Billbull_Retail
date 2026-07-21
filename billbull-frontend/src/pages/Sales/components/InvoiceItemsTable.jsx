import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Package, Box } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getImageUrl } from '../../../utils/urlUtils';

// Above this row count we window the list (render only the visible slice) so a
// 300-item invoice stays smooth. Below it we render everything — cheaper than the
// scroll bookkeeping, and normal invoices never hit the threshold.
const WINDOW_THRESHOLD = 60;
const ROW_H = 57; // approx table row height (px) used for windowing math
const CARD_H = 128; // approx card height (px) for the mobile card list
const OVERSCAN = 8;

const num = (v) => Number(v ?? 0);
const qtyOf = (it) => it.quantity ?? it.qty ?? 0;
const skuOf = (it) => `${it.itemCode || it.code || ''}${it.barcode ? ` · ${it.barcode}` : ''}`.trim();

function ItemThumb({ it }) {
    return (
        <div className="w-9 h-9 rounded-lg border border-slate-200 bg-[#F8F9FA] shrink-0 overflow-hidden flex items-center justify-center">
            {it.image ? (
                <img src={getImageUrl(it.image)} alt={it.itemName || it.name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <Box size={16} className="text-slate-300" />
            )}
        </div>
    );
}

// Shared scroll+window hook: returns the slice of rows to render plus the top/
// bottom spacer heights that keep the scrollbar honest.
function useWindowed(items, rowHeight, enabled) {
    const scrollRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewH, setViewH] = useState(0);

    const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);

    const measure = useCallback((node) => {
        scrollRef.current = node;
        if (node) setViewH(node.clientHeight);
    }, []);

    return useMemo(() => {
        if (!enabled || viewH === 0) {
            return { scrollRef: measure, onScroll, start: 0, end: items.length, padTop: 0, padBottom: 0 };
        }
        const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
        const visible = Math.ceil(viewH / rowHeight) + OVERSCAN * 2;
        const end = Math.min(items.length, start + visible);
        return {
            scrollRef: measure,
            onScroll,
            start,
            end,
            padTop: start * rowHeight,
            padBottom: (items.length - end) * rowHeight,
        };
    }, [enabled, viewH, scrollTop, rowHeight, items.length, measure, onScroll]);
}

// Totals footer content — rendered both under the table and under the card list.
function TotalsFooter({ invoice, currency, discountTotal, taxTotal }) {
    return (
        <div className="w-full sm:w-72 ml-auto space-y-1 text-xs">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><CurrencyAmount value={invoice.subTotal ?? invoice.grossTotal} currency={currency} className="tabular-nums" /></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><CurrencyAmount value={discountTotal} currency={currency} className="text-red-500 tabular-nums" /></div>
            <div className="flex justify-between text-slate-500"><span>Tax (VAT)</span><CurrencyAmount value={taxTotal} currency={currency} className="tabular-nums" /></div>
            {num(invoice.deliveryCharge) > 0 && <div className="flex justify-between text-slate-500"><span>Delivery Charges</span><CurrencyAmount value={invoice.deliveryCharge} currency={currency} className="tabular-nums" /></div>}
            {num(invoice.roundOff) !== 0 && <div className="flex justify-between text-slate-500"><span>Round Off</span><CurrencyAmount value={invoice.roundOff} currency={currency} className="tabular-nums" /></div>}
            <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-800 text-sm"><span>Net Total</span><CurrencyAmount value={invoice.invoiceTotal} currency={currency} className="tabular-nums" /></div>
        </div>
    );
}

// ── Desktop / tablet: table with priority columns ──
// Column visibility tiers (kills horizontal scroll on narrower widths):
//   Always: #, Product, Qty, Unit, Total
//   ≥lg   : Price, Discount
//   ≥xl   : Image, SKU, Tax
function ItemsTableView({ items, currency, windowed }) {
    const { scrollRef, onScroll, start, end, padTop, padBottom } = windowed;
    const slice = items.slice(start, end);

    return (
        <div ref={scrollRef} onScroll={onScroll} className="overflow-y-auto max-h-[58vh]">
            <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px] sticky top-0 z-10">
                    <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left hidden xl:table-cell" aria-label="Image" />
                        <th className="px-2 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left hidden xl:table-cell">SKU</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Price</th>
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Disc</th>
                        <th className="px-3 py-2 text-right hidden xl:table-cell">Tax</th>
                        <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {padTop > 0 && <tr style={{ height: padTop }} aria-hidden="true"><td colSpan={10} /></tr>}
                    {slice.map((it, i) => {
                        const idx = start + i;
                        return (
                            <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                                <td className="px-2 py-2.5 hidden xl:table-cell"><ItemThumb it={it} /></td>
                                <td className="px-2 py-2.5 max-w-[220px]">
                                    <div className="font-medium text-slate-700 line-clamp-2" title={it.itemName || it.name}>{it.itemName || it.name}</div>
                                    {/* SKU folds under the name when its own column is hidden */}
                                    <div className="text-[10px] text-slate-400 xl:hidden truncate" title={skuOf(it)}>{skuOf(it)}</div>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 text-[10px] hidden xl:table-cell whitespace-nowrap max-w-[160px] truncate" title={skuOf(it)}>{skuOf(it)}</td>
                                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{it.unit || 'PCS'}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap">{qtyOf(it)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap hidden lg:table-cell"><CurrencyAmount value={it.price} currency={currency} /></td>
                                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums hidden lg:table-cell">{num(it.discount ?? it.disc)}%</td>
                                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums hidden xl:table-cell">{num(it.taxRate ?? it.tax)}%</td>
                                <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap"><CurrencyAmount value={it.netAmount ?? it.net} currency={currency} /></td>
                            </tr>
                        );
                    })}
                    {padBottom > 0 && <tr style={{ height: padBottom }} aria-hidden="true"><td colSpan={10} /></tr>}
                </tbody>
            </table>
        </div>
    );
}

// ── Mobile: card list ──
function ItemsCardView({ items, currency, windowed }) {
    const { scrollRef, onScroll, start, end, padTop, padBottom } = windowed;
    const slice = items.slice(start, end);

    return (
        <div ref={scrollRef} onScroll={onScroll} className="overflow-y-auto max-h-[60vh] p-3 space-y-2">
            {padTop > 0 && <div style={{ height: padTop }} aria-hidden="true" />}
            {slice.map((it, i) => {
                const idx = start + i;
                return (
                    <div key={it.id || idx} className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="flex items-start gap-3">
                            <ItemThumb it={it} />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-700 text-sm line-clamp-2" title={it.itemName || it.name}>{it.itemName || it.name}</div>
                                {skuOf(it) && <div className="text-[10px] text-slate-400 truncate" title={skuOf(it)}>{skuOf(it)}</div>}
                            </div>
                            <CurrencyAmount value={it.netAmount ?? it.net} currency={currency} className="font-bold text-slate-800 text-sm tabular-nums whitespace-nowrap" />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pl-12">
                            <div className="flex justify-between"><span className="text-slate-400">Qty</span><span className="text-slate-700 tabular-nums">{qtyOf(it)} {it.unit || ''}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Price</span><CurrencyAmount value={it.price} currency={currency} className="text-slate-700 tabular-nums" /></div>
                            <div className="flex justify-between"><span className="text-slate-400">Disc</span><span className="text-slate-500 tabular-nums">{num(it.discount ?? it.disc)}%</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Tax</span><span className="text-slate-500 tabular-nums">{num(it.taxRate ?? it.tax)}%</span></div>
                        </div>
                    </div>
                );
            })}
            {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden="true" />}
        </div>
    );
}

export default function InvoiceItemsTable({ invoice, currency }) {
    const items = useMemo(() => invoice?.items || [], [invoice]);
    const itemCount = items.length;
    const totalQty = useMemo(() => items.reduce((s, i) => s + num(qtyOf(i)), 0), [items]);
    const discountTotal = num(invoice?.billDiscountAmount);
    const taxTotal = num(invoice?.taxTotal ?? invoice?.totalTax ?? invoice?.taxAmount);
    const enableWindow = itemCount > WINDOW_THRESHOLD;

    // Two independent windowers — the table and the card list scroll separately
    // (only one is visible at a time via CSS, so only one ever mounts a scroller).
    const tableWindow = useWindowed(items, ROW_H, enableWindow);
    const cardWindow = useWindowed(items, CARD_H, enableWindow);

    if (!invoice) return null;

    return (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Package size={15} className="text-[#D99A00]" /> Items</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">{itemCount} items · {totalQty} qty</span>
            </div>

            {itemCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <Box size={22} className="mb-1.5 text-slate-300" />
                    <span className="text-sm">No items on this invoice.</span>
                </div>
            ) : (
                <>
                    <div className="hidden md:block"><ItemsTableView items={items} currency={currency} windowed={tableWindow} /></div>
                    <div className="md:hidden"><ItemsCardView items={items} currency={currency} windowed={cardWindow} /></div>
                    {/* Sticky totals footer — pinned so it's visible while scrolling long item lists */}
                    <div className="px-4 md:px-5 py-3 border-t border-slate-100 bg-slate-50/60 sticky bottom-0">
                        <TotalsFooter invoice={invoice} currency={currency} discountTotal={discountTotal} taxTotal={taxTotal} />
                    </div>
                </>
            )}
        </section>
    );
}
