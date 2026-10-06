import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, PackageX, RotateCcw } from 'lucide-react';

import { getReturnOptions } from '../../../../../api/salesReturnApi';
import { FALLBACK_CONDITIONS, FALLBACK_REASONS } from '../../../SalesReturn/constants';

/**
 * Returning a refused delivery, from the Delivery Settlement row itself.
 *
 * A retail delivery has exactly two endings: the customer pays for it, or they send it back.
 * The settle panel next to this one is the first; this is the second. Routing a refused
 * delivery through the back-office Sales Return module instead would ask the cashier to go
 * find an order that is sitting in front of them, on a screen built for a different job.
 *
 * Deliberately a short form. On an unpaid order the entire return value cancels a receivable —
 * no money moves, so there is no refund method to choose and nothing to count out of the
 * drawer. That leaves genuinely two questions (why, and what condition) and one that only some
 * branches ask (the delivery charge), which is why this fits under a settlement row instead of
 * needing the full four-step return screen.
 *
 * Every amount shown here is indicative. The server pro-rates the real figures from the invoice
 * the customer was billed, so a line discount or an inclusive-VAT split cannot drift between
 * what the till displays and what the credit note posts.
 */
export default function DeliveryReturnPanel({
   order,
   // 'WAIVE' | 'RETAIN' | 'ASK' — the branch policy. Only ASK lets the cashier decide.
   chargePolicy = 'WAIVE',
   submitting = false,
   onCancel,
   onConfirm,
}) {
   const [reason, setReason] = useState('CUSTOMER_RETURN');
   const [condition, setCondition] = useState('GOOD');
   const [remarks, setRemarks] = useState('');
   const [waiveCharge, setWaiveCharge] = useState(true);
   // Whole order by default: a refusal at the door is the common case, and making the cashier
   // tick every line to express "they sent it all back" is work for the rare case.
   const [partial, setPartial] = useState(false);
   const [qtyByCode, setQtyByCode] = useState({});

   // The reason and condition vocabularies are backend-owned: an admin who adds a reason must
   // not have to wait for a frontend release to see it here. The constants are only the first
   // paint, so the dropdowns are never momentarily empty if the lookup is slow or fails.
   const [reasons, setReasons] = useState(FALLBACK_REASONS);
   const [conditions, setConditions] = useState(FALLBACK_CONDITIONS);
   useEffect(() => {
      let cancelled = false;
      getReturnOptions()
         .then((opts) => {
            if (cancelled || !opts) return;
            if (opts.reasons?.length) setReasons(opts.reasons);
            if (opts.conditions?.length) setConditions(opts.conditions);
         })
         .catch(() => { /* fallbacks already in state */ });
      return () => { cancelled = true; };
   }, []);

   const items = order?.items || [];

   const lines = useMemo(() => {
      if (!partial) return items.map(it => ({ ...it, returnQty: it.soldQty }));
      return items
         .map(it => ({ ...it, returnQty: Math.max(0, Math.min(it.soldQty, Number(qtyByCode[it.itemCode] ?? 0))) }))
         .filter(it => it.returnQty > 0);
   }, [partial, items, qtyByCode]);

   const goodsValue = useMemo(() => lines.reduce((sum, l) => (
      sum + (l.soldQty > 0 ? (l.lineTotal * l.returnQty) / l.soldQty : 0)
   ), 0), [lines]);

   const fullReturn = useMemo(() => (
      items.length > 0 && items.every(it => {
         const l = lines.find(x => x.itemCode === it.itemCode);
         return l && l.returnQty >= it.soldQty;
      })
   ), [items, lines]);

   // A partial return never waives the charge — the customer kept something, so the trip was
   // made for goods they still have. This mirrors the same rule on the server; it is repeated
   // here so the figures the cashier is looking at are the ones that will actually post.
   const chargeWaived = fullReturn
      && (chargePolicy === 'WAIVE' || (chargePolicy === 'ASK' && waiveCharge));
   const deliveryCharge = order?.deliveryCharge || 0;
   const remainingBalance = Math.max(0, (order?.invoiceAmt || 0) + deliveryCharge
      - goodsValue - (chargeWaived ? deliveryCharge : 0));

   const canConfirm = lines.length > 0 && !submitting;

   const submit = () => {
      if (!canConfirm) return;
      onConfirm({
         reason,
         condition,
         remarks: remarks.trim() || null,
         waiveDeliveryCharge: chargePolicy === 'ASK' ? waiveCharge : null,
         lines: partial ? lines.map(l => ({ itemCode: l.itemCode, returnQty: l.returnQty })) : [],
      });
   };

   return (
      <div className="space-y-3">
         <div className="flex items-start gap-3 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3">
            <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="min-w-0 flex-1">
               <p className="text-sm font-black text-rose-700">Return this delivery</p>
               <p className="mt-0.5 text-xs text-rose-700">
                  The goods go back to stock and {order?.customer} is credited. Nothing is paid out —
                  this order was never paid for, so the return simply cancels what they owe.
               </p>
            </div>
         </div>

         {/* Reason + condition. Two questions, side by side, both answerable in one tap. */}
         <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
               <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Reason</span>
               <select value={reason} onChange={e => setReason(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-[#1E293B] focus:border-[#F5C742] focus:outline-none">
                  {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
               </select>
            </label>
            <label className="block">
               <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Condition</span>
               <select value={condition} onChange={e => setCondition(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-[#1E293B] focus:border-[#F5C742] focus:outline-none">
                  {conditions.map(c => (
                     <option key={c.value} value={c.value}>
                        {c.label}{c.restockable ? ' — back to stock' : ' — scrapped'}
                     </option>
                  ))}
               </select>
            </label>
         </div>

         {/* The condition decides whether stock comes back, so saying so plainly matters more
             than the dropdown label does. */}
         {condition !== 'GOOD' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
               <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
               <p className="text-[11px] text-amber-800">
                  These goods will be scrapped, not returned to saleable stock. The customer is still
                  credited in full.
               </p>
            </div>
         )}

         {/* Line picker, opt-in. Collapsed by default so the common case stays one decision. */}
         <div className="rounded-xl border-2 border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
               <div>
                  <p className="text-xs font-bold text-[#1E293B]">
                     {partial ? 'Returning selected items' : 'Returning the whole order'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                     {partial ? 'Set the quantity coming back for each item.' : `All ${items.length} item${items.length === 1 ? '' : 's'} on this order.`}
                  </p>
               </div>
               <button type="button"
                  onClick={() => {
                     const next = !partial;
                     setPartial(next);
                     // Seed the quantities from what was sold, so switching to partial starts
                     // from the full order and the cashier reduces — rather than starting at
                     // zero and making them re-enter everything the customer did send back.
                     if (next) {
                        setQtyByCode(Object.fromEntries(items.map(it => [it.itemCode, it.soldQty])));
                     }
                  }}
                  className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-600 hover:border-[#F5C742] hover:text-[#1E293B]">
                  {partial ? 'Return everything' : 'Choose items'}
               </button>
            </div>

            {partial && (
               <div className="mt-3 space-y-1.5">
                  {items.map(it => (
                     <div key={it.itemCode} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="min-w-0">
                           <p className="truncate text-xs font-semibold text-[#1E293B]">{it.itemName}</p>
                           <p className="text-[10px] text-gray-400">{it.itemCode} · {it.soldQty} sold</p>
                        </div>
                        <input type="number" min={0} max={it.soldQty}
                           value={qtyByCode[it.itemCode] ?? 0}
                           onChange={e => setQtyByCode(q => ({ ...q, [it.itemCode]: e.target.value }))}
                           className="w-20 rounded-lg border-2 border-gray-200 px-2 py-1.5 text-right text-sm font-bold text-[#1E293B] focus:border-[#F5C742] focus:outline-none" />
                     </div>
                  ))}
               </div>
            )}
         </div>

         {/* The delivery charge, only where the branch has left it to the cashier. */}
         {chargePolicy === 'ASK' && (
            <label className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 ${
               fullReturn ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
               <div className="min-w-0 pr-3">
                  <p className="text-xs font-bold text-[#1E293B]">Waive the delivery charge</p>
                  <p className="text-[10px] text-gray-400">
                     {fullReturn
                        ? `Cancel the AED ${deliveryCharge.toFixed(2)} charge along with the goods.`
                        : 'Only available on a full return — the customer is keeping part of this order.'}
                  </p>
               </div>
               <input type="checkbox" checked={fullReturn && waiveCharge} disabled={!fullReturn}
                  onChange={e => setWaiveCharge(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[#F5C742]" />
            </label>
         )}

         {/* What this will do, in the two numbers the cashier is accountable for. */}
         <div className="rounded-xl border-2 border-[#FDE6A9] bg-[#FFF8E7] px-4 py-3">
            <div className="flex items-center justify-between">
               <span className="text-xs font-semibold text-gray-600">Credited back</span>
               <span className="text-sm font-black text-[#1E293B]">AED {goodsValue.toFixed(2)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-[#FDE6A9] pt-1.5">
               <span className="text-xs font-semibold text-gray-600">
                  {remainingBalance > 0 ? 'Still to collect' : 'Order closed — nothing to collect'}
               </span>
               <span className={`text-sm font-black ${remainingBalance > 0 ? 'text-red-600' : 'text-[#327F74]'}`}>
                  AED {remainingBalance.toFixed(2)}
               </span>
            </div>
            {remainingBalance > 0 && (
               <p className="mt-1.5 text-[10px] text-gray-500">
                  This order stays in the delivery list until that balance is settled.
               </p>
            )}
         </div>

         <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={submitting}
               className="flex-1 rounded-xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40">
               Cancel
            </button>
            <button type="button" onClick={submit} disabled={!canConfirm}
               className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-30">
               {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Returning…</>
                  : <><RotateCcw className="h-4 w-4" />Confirm Return — AED {goodsValue.toFixed(2)}</>}
            </button>
         </div>
      </div>
   );
}
