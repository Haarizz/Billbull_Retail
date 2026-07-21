import React, { useMemo } from 'react';
import { Package, Box } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getImageUrl } from '../../../utils/urlUtils';

// Items table for the Quotation Transaction Preview. Parallels
// SalesOrderItemsTable, but the totals footer is quote-shaped: a quotation has
// no advance/balance, so it terminates at the grand total. Field fallbacks cover
// both the raw getQuotationById entity (itemName/quantity/lineTotal) and any
// pre-mapped shape.

const num = (v) => Number(v ?? 0);
const qtyOf = (it) => it.quantity ?? it.qty ?? 0;
const nameOf = (it) => it.itemName || it.name || it.productName || it.desc || '';
const skuOf = (it) => `${it.itemCode || it.code || ''}${it.barcode ? ` · ${it.barcode}` : ''}`.trim();
const lineOf = (it) => it.lineTotal ?? it.netAmount ?? it.net ?? it.total;

function ItemThumb({ it }) {
    const img = it.primaryImage || it.image;
    return (
        <div className="w-9 h-9 rounded-lg border border-slate-200 bg-[#F8F9FA] shrink-0 overflow-hidden flex items-center justify-center">
            {img ? (
                <img src={getImageUrl(img)} alt={nameOf(it)} className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <Box size={16} className="text-slate-300" />
            )}
        </div>
    );
}

function TotalsFooter({ qtn, currency, subTotal, discountTotal, taxTotal, grandTotal }) {
    return (
        <div className="w-full sm:w-72 ml-auto space-y-1 text-xs">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><CurrencyAmount value={subTotal} currency={currency} className="tabular-nums" /></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><CurrencyAmount value={discountTotal} currency={currency} className="text-red-500 tabular-nums" /></div>
            <div className="flex justify-between text-slate-500"><span>Tax (VAT)</span><CurrencyAmount value={taxTotal} currency={currency} className="tabular-nums" /></div>
            {num(qtn.deliveryCharge) > 0 && <div className="flex justify-between text-slate-500"><span>Delivery Charges</span><CurrencyAmount value={qtn.deliveryCharge} currency={currency} className="tabular-nums" /></div>}
            {num(qtn.roundOff) !== 0 && <div className="flex justify-between text-slate-500"><span>Round Off</span><CurrencyAmount value={qtn.roundOff} currency={currency} className="tabular-nums" /></div>}
            <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-800 text-sm"><span>Grand Total</span><CurrencyAmount value={grandTotal} currency={currency} className="tabular-nums" /></div>
        </div>
    );
}

function ItemsTableView({ items, currency }) {
    return (
        <div className="overflow-y-auto max-h-[58vh]">
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
                    {items.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                            <td className="px-2 py-2.5 hidden xl:table-cell"><ItemThumb it={it} /></td>
                            <td className="px-2 py-2.5 max-w-[220px]">
                                <div className="font-medium text-slate-700 line-clamp-2" title={nameOf(it)}>{nameOf(it)}</div>
                                <div className="text-[10px] text-slate-400 xl:hidden truncate" title={skuOf(it)}>{skuOf(it)}</div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 text-[10px] hidden xl:table-cell whitespace-nowrap max-w-[160px] truncate" title={skuOf(it)}>{skuOf(it)}</td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{it.unit || 'PCS'}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap">{qtyOf(it)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap hidden lg:table-cell"><CurrencyAmount value={it.price} currency={currency} /></td>
                            <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums hidden lg:table-cell">{num(it.discount ?? it.disc)}%</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums hidden xl:table-cell">{num(it.taxRate ?? it.tax)}%</td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap"><CurrencyAmount value={lineOf(it)} currency={currency} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ItemsCardView({ items, currency }) {
    return (
        <div className="overflow-y-auto max-h-[60vh] p-3 space-y-2">
            {items.map((it, idx) => (
                <div key={it.id || idx} className="border border-slate-200 rounded-lg p-3 bg-white">
                    <div className="flex items-start gap-3">
                        <ItemThumb it={it} />
                        <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-700 text-sm line-clamp-2" title={nameOf(it)}>{nameOf(it)}</div>
                            {skuOf(it) && <div className="text-[10px] text-slate-400 truncate" title={skuOf(it)}>{skuOf(it)}</div>}
                        </div>
                        <CurrencyAmount value={lineOf(it)} currency={currency} className="font-bold text-slate-800 text-sm tabular-nums whitespace-nowrap" />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pl-12">
                        <div className="flex justify-between"><span className="text-slate-400">Qty</span><span className="text-slate-700 tabular-nums">{qtyOf(it)} {it.unit || ''}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Price</span><CurrencyAmount value={it.price} currency={currency} className="text-slate-700 tabular-nums" /></div>
                        <div className="flex justify-between"><span className="text-slate-400">Disc</span><span className="text-slate-500 tabular-nums">{num(it.discount ?? it.disc)}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Tax</span><span className="text-slate-500 tabular-nums">{num(it.taxRate ?? it.tax)}%</span></div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function QuotationItemsTable({ quotation, currency }) {
    const items = useMemo(() => quotation?.items || [], [quotation]);
    const itemCount = items.length;
    const totalQty = useMemo(() => items.reduce((s, i) => s + num(qtyOf(i)), 0), [items]);

    const grandTotal = num(quotation?.totalAmount ?? quotation?.total ?? quotation?.grandTotal);
    const discountTotal = num(quotation?.billDiscountAmount ?? quotation?.discountAmount);
    const taxTotal = num(quotation?.taxTotal ?? quotation?.totalTax ?? quotation?.taxAmount
        ?? items.reduce((s, i) => s + num(i.taxAmount ?? i.taxAmt), 0));
    const subTotal = num(quotation?.subTotal ?? quotation?.grossTotal ?? (grandTotal - taxTotal + discountTotal));

    if (!quotation) return null;

    return (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Package size={15} className="text-[#D99A00]" /> Items</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">{itemCount} items · {totalQty} qty</span>
            </div>

            {itemCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <Box size={22} className="mb-1.5 text-slate-300" />
                    <span className="text-sm">No items on this quotation.</span>
                </div>
            ) : (
                <>
                    <div className="hidden md:block"><ItemsTableView items={items} currency={currency} /></div>
                    <div className="md:hidden"><ItemsCardView items={items} currency={currency} /></div>
                    <div className="px-4 md:px-5 py-3 border-t border-slate-100 bg-slate-50/60 sticky bottom-0">
                        <TotalsFooter
                            qtn={quotation}
                            currency={currency}
                            subTotal={subTotal}
                            discountTotal={discountTotal}
                            taxTotal={taxTotal}
                            grandTotal={grandTotal}
                        />
                    </div>
                </>
            )}
        </section>
    );
}
