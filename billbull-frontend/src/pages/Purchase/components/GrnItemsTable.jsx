import React, { useMemo } from 'react';
import { Package, Box } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { getImageUrl } from '../../../utils/urlUtils';

// Items table for the GRN Transaction Preview. A GRN is a goods-receipt document
// with a QC gate, so the columns are receipt-centric (Ordered / Received /
// Accepted / Rejected) plus the costing tail (Unit Cost / Line Total). Field
// fallbacks cover both the raw getGrnById entity and the list-mapped shape.

const num = (v) => Number(v ?? 0);
const nameOf = (it) => it.itemName || it.name || it.productName || it.description || it.desc || '';
const skuOf = (it) => `${it.itemCode || it.code || ''}${it.barcode ? ` · ${it.barcode}` : ''}`.trim();
const orderedOf = (it) => it.orderedQty ?? it.ordered ?? it.quantity ?? it.qty ?? 0;
const receivedOf = (it) => it.receivedQty ?? it.received ?? 0;
const acceptedOf = (it) => it.acceptedQty ?? it.accepted ?? receivedOf(it);
const rejectedOf = (it) => it.rejectedQty ?? it.rejected ?? Math.max(num(receivedOf(it)) - num(acceptedOf(it)), 0);
const costOf = (it) => it.unitCost ?? it.cost ?? it.price ?? it.unitPrice;
const lineOf = (it) => it.lineTotal ?? it.netAmount ?? it.total ?? (num(acceptedOf(it)) * num(costOf(it)));

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
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Ordered</th>
                        <th className="px-3 py-2 text-right hidden md:table-cell">Received</th>
                        <th className="px-3 py-2 text-right">Accepted</th>
                        <th className="px-3 py-2 text-right hidden md:table-cell">Rejected</th>
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Unit Cost</th>
                        <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                        const rejected = num(rejectedOf(it));
                        return (
                            <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                                <td className="px-2 py-2.5 hidden xl:table-cell"><ItemThumb it={it} /></td>
                                <td className="px-2 py-2.5 max-w-[220px]">
                                    <div className="font-medium text-slate-700 line-clamp-2" title={nameOf(it)}>{nameOf(it)}</div>
                                    <div className="text-[10px] text-slate-400 xl:hidden truncate" title={skuOf(it)}>{skuOf(it)}</div>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 text-[10px] hidden xl:table-cell whitespace-nowrap max-w-[160px] truncate" title={skuOf(it)}>{skuOf(it)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums whitespace-nowrap hidden lg:table-cell">{num(orderedOf(it))}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap hidden md:table-cell">{num(receivedOf(it))}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-emerald-700 tabular-nums whitespace-nowrap">{num(acceptedOf(it))}</td>
                                <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap hidden md:table-cell ${rejected > 0 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>{rejected}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap hidden lg:table-cell"><CurrencyAmount value={costOf(it)} currency={currency} /></td>
                                <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap"><CurrencyAmount value={lineOf(it)} currency={currency} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ItemsCardView({ items, currency }) {
    return (
        <div className="overflow-y-auto max-h-[60vh] p-3 space-y-2">
            {items.map((it, idx) => {
                const rejected = num(rejectedOf(it));
                return (
                    <div key={it.id || idx} className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="flex items-start gap-3">
                            <ItemThumb it={it} />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-700 text-sm line-clamp-2" title={nameOf(it)}>{nameOf(it)}</div>
                                {skuOf(it) && <div className="text-[10px] text-slate-400 truncate" title={skuOf(it)}>{skuOf(it)}</div>}
                            </div>
                            <CurrencyAmount value={lineOf(it)} currency={currency} className="font-bold text-slate-800 text-sm tabular-nums whitespace-nowrap" />
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 text-[11px] pl-12">
                            <div className="flex flex-col"><span className="text-slate-400">Ordered</span><span className="text-slate-700 tabular-nums">{num(orderedOf(it))}</span></div>
                            <div className="flex flex-col"><span className="text-slate-400">Received</span><span className="text-slate-700 tabular-nums">{num(receivedOf(it))}</span></div>
                            <div className="flex flex-col"><span className="text-slate-400">Accepted</span><span className="text-emerald-700 tabular-nums font-medium">{num(acceptedOf(it))}</span></div>
                            <div className="flex flex-col"><span className="text-slate-400">Rejected</span><span className={`tabular-nums ${rejected > 0 ? 'text-red-500 font-medium' : 'text-slate-500'}`}>{rejected}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function GrnItemsTable({ grn, currency }) {
    const items = useMemo(() => grn?.items || [], [grn]);
    const itemCount = items.length;
    const totalAccepted = useMemo(() => items.reduce((s, i) => s + num(acceptedOf(i)), 0), [items]);
    const totalRejected = useMemo(() => items.reduce((s, i) => s + num(rejectedOf(i)), 0), [items]);
    const totalValue = num(grn?.value ?? grn?.totalValue ?? items.reduce((s, i) => s + num(lineOf(i)), 0));

    if (!grn) return null;

    return (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Package size={15} className="text-[#D99A00]" /> Items</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">{itemCount} lines · {totalAccepted} accepted{totalRejected > 0 ? ` · ${totalRejected} rejected` : ''}</span>
            </div>

            {itemCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <Box size={22} className="mb-1.5 text-slate-300" />
                    <span className="text-sm">No items on this GRN.</span>
                </div>
            ) : (
                <>
                    <div className="hidden md:block"><ItemsTableView items={items} currency={currency} /></div>
                    <div className="md:hidden"><ItemsCardView items={items} currency={currency} /></div>
                    <div className="px-4 md:px-5 py-3 border-t border-slate-100 bg-slate-50/60 sticky bottom-0 flex justify-end gap-6 text-xs">
                        <span className="text-slate-500">Accepted: <span className="font-bold text-emerald-700 tabular-nums">{totalAccepted}</span></span>
                        {totalRejected > 0 && <span className="text-slate-500">Rejected: <span className="font-bold text-red-500 tabular-nums">{totalRejected}</span></span>}
                        <span className="text-slate-500">GRN Value: <CurrencyAmount value={totalValue} currency={currency} className="font-bold text-slate-800 tabular-nums" /></span>
                    </div>
                </>
            )}
        </section>
    );
}
