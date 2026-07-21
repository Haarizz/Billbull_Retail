import React, { useMemo } from 'react';
import { Package, Box } from 'lucide-react';
import { getImageUrl } from '../../../utils/urlUtils';

// Items table for the Delivery Note Transaction Preview. A DN is a fulfillment
// document, not a money document — so the columns are quantity-centric
// (Ordered / Prev. Delivered / This DN / Boxes) and there is no price/tax/total
// footer. Field fallbacks cover both the raw getDeliveryNoteById entity and the
// list's normalized shape.

const num = (v) => Number(v ?? 0);
const nameOf = (it) => it.name || it.itemName || it.productName || it.desc || '';
const skuOf = (it) => `${it.itemCode || it.code || ''}${it.barcode ? ` · ${it.barcode}` : ''}`.trim();
const orderedOf = (it) => it.orderedQty ?? it.quantity ?? it.qty ?? it.currentQty ?? 0;
const prevOf = (it) => it.prevDelivered ?? it.prevDeliveredQty ?? it.deliveredQty ?? 0;
const thisOf = (it) => {
    const cur = Number(it.currentQty);
    if (Number.isFinite(cur) && it.currentQty != null) return cur;
    return Math.max(num(orderedOf(it)) - num(prevOf(it)), 0);
};
const boxesOf = (it) => it.boxes ?? it.totalBoxes ?? '';

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

function ItemsTableView({ items }) {
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
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Ordered</th>
                        <th className="px-3 py-2 text-right hidden lg:table-cell">Prev. Del.</th>
                        <th className="px-3 py-2 text-right">This DN</th>
                        <th className="px-3 py-2 text-right hidden md:table-cell">Boxes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                            <td className="px-2 py-2.5 hidden xl:table-cell"><ItemThumb it={it} /></td>
                            <td className="px-2 py-2.5 max-w-[240px]">
                                <div className="font-medium text-slate-700 line-clamp-2" title={nameOf(it)}>{nameOf(it)}</div>
                                <div className="text-[10px] text-slate-400 xl:hidden truncate" title={skuOf(it)}>{skuOf(it)}</div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 text-[10px] hidden xl:table-cell whitespace-nowrap max-w-[160px] truncate" title={skuOf(it)}>{skuOf(it)}</td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{it.unit || 'PCS'}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums whitespace-nowrap hidden lg:table-cell">{num(orderedOf(it))}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums whitespace-nowrap hidden lg:table-cell">{num(prevOf(it))}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">{num(thisOf(it))}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums whitespace-nowrap hidden md:table-cell">{boxesOf(it) === '' ? '—' : num(boxesOf(it))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ItemsCardView({ items }) {
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
                        <div className="text-right shrink-0">
                            <div className="font-bold text-slate-800 text-sm tabular-nums">{num(thisOf(it))}</div>
                            <div className="text-[10px] text-slate-400">{it.unit || ''}</div>
                        </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] pl-12">
                        <div className="flex flex-col"><span className="text-slate-400">Ordered</span><span className="text-slate-700 tabular-nums">{num(orderedOf(it))}</span></div>
                        <div className="flex flex-col"><span className="text-slate-400">Prev. Del.</span><span className="text-slate-700 tabular-nums">{num(prevOf(it))}</span></div>
                        <div className="flex flex-col"><span className="text-slate-400">Boxes</span><span className="text-slate-700 tabular-nums">{boxesOf(it) === '' ? '—' : num(boxesOf(it))}</span></div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function DeliveryNoteItemsTable({ deliveryNote }) {
    const items = useMemo(() => deliveryNote?.items || [], [deliveryNote]);
    const itemCount = items.length;
    const totalThisDn = useMemo(() => items.reduce((s, i) => s + num(thisOf(i)), 0), [items]);
    const totalBoxes = useMemo(() => items.reduce((s, i) => s + num(boxesOf(i)), 0), [items]);

    if (!deliveryNote) return null;

    return (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Package size={15} className="text-[#D99A00]" /> Items</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">{itemCount} lines · {totalThisDn} qty{totalBoxes > 0 ? ` · ${totalBoxes} boxes` : ''}</span>
            </div>

            {itemCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <Box size={22} className="mb-1.5 text-slate-300" />
                    <span className="text-sm">No items on this delivery note.</span>
                </div>
            ) : (
                <>
                    <div className="hidden md:block"><ItemsTableView items={items} /></div>
                    <div className="md:hidden"><ItemsCardView items={items} /></div>
                    <div className="px-4 md:px-5 py-3 border-t border-slate-100 bg-slate-50/60 sticky bottom-0 flex justify-end gap-6 text-xs">
                        <span className="text-slate-500">Total Qty this DN: <span className="font-bold text-slate-800 tabular-nums">{totalThisDn}</span></span>
                        {totalBoxes > 0 && <span className="text-slate-500">Boxes: <span className="font-bold text-slate-800 tabular-nums">{totalBoxes}</span></span>}
                    </div>
                </>
            )}
        </section>
    );
}
