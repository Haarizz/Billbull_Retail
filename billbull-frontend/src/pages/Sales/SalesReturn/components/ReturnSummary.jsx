import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/**
 * §13 return summary.
 *
 * Every figure is prorated from the ORIGINAL invoice line — no VAT rate is applied at
 * return time. When the invoice was priced VAT-inclusive the VAT shown is the portion
 * contained within the refund rather than an addition to it, which is why the label
 * changes with the mode; showing "+ VAT" on an inclusive invoice would imply the customer
 * gets tax back twice.
 *
 * The split block below is the Phase 2 addition. A return reverses part of a sale, and the sale
 * created a receivable that cash, card or bank receipts then settled some or all of. Reversing
 * it means undoing both, in proportion to what each actually was — so the return value divides
 * into the part that reduces what the customer still owes and the part that is genuinely owed
 * back to them. Both figures come from the server's canonical invoice outstanding; the cashier
 * needs to see them because they decide which refund methods are even possible.
 */
export default function ReturnSummary({ summary, split }) {
   const tiles = [
      { label: 'Items', value: summary.count, color: C.accentInk },
      { label: 'Qty', value: summary.totalQty, color: C.blue },
      { label: 'Subtotal', value: <CurrencyAmount value={summary.subtotal} />, color: C.slate },
   ];

   return (
      <div className="px-4 py-3 border-b" style={{ borderColor: C.border, background: C.bg }}>
         <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.muted }}>
            Return Summary
         </p>

         <div className="grid grid-cols-3 gap-2 mb-2">
            {tiles.map((t) => (
               <div key={t.label} className="rounded-xl p-2.5 text-center border bg-white"
                  style={{ borderColor: C.border }}>
                  <p className="text-[10px]" style={{ color: C.muted }}>{t.label}</p>
                  <p className="text-sm font-black" style={{ color: t.color }}>{t.value}</p>
               </div>
            ))}
         </div>

         <div className="space-y-1 text-xs">
            <div className="flex justify-between">
               <span style={{ color: C.muted }}>Discount Reversal</span>
               <span className="font-semibold" style={{ color: C.slate }}>
                  − <CurrencyAmount value={summary.discountReversal} />
               </span>
            </div>
            <div className="flex justify-between">
               <span style={{ color: C.muted }}>
                  VAT Reversal
                  {summary.taxInclusive && (
                     <span className="ml-1 text-[10px]">(included)</span>
                  )}
               </span>
               <span className="font-semibold" style={{ color: C.slate }}>
                  {summary.taxInclusive ? '' : '+ '}
                  <CurrencyAmount value={summary.vatReversal} />
               </span>
            </div>
            <div className="flex justify-between pt-1.5 border-t" style={{ borderColor: C.border }}>
               <span className="font-black text-sm" style={{ color: C.dark }}>Return Value</span>
               <span className="font-black text-lg" style={{ color: C.accentInk }}>
                  <CurrencyAmount value={summary.totalRefund} />
               </span>
            </div>
         </div>

         {split && summary.totalRefund > 0 && (
            <div className="mt-2 pt-2 border-t space-y-1 text-xs" style={{ borderColor: C.border }}>
               {split.unpaidPortion > 0 && (
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>
                        Reduces Balance Owed
                        <span className="ml-1 text-[10px]">(not yet paid for)</span>
                     </span>
                     <span className="font-semibold" style={{ color: C.blue }}>
                        <CurrencyAmount value={split.unpaidPortion} />
                     </span>
                  </div>
               )}
               <div className="flex justify-between">
                  <span className="font-black" style={{ color: C.dark }}>Refundable</span>
                  <span className="font-black" style={{ color: split.paidPortion > 0 ? C.accentInk : C.muted }}>
                     <CurrencyAmount value={split.paidPortion} />
                  </span>
               </div>
               {split.refundBlocked && (
                  <p className="text-[10px] leading-snug pt-1" style={{ color: C.muted }}>
                     The customer has not paid for these goods — this return reduces their
                     outstanding balance of <CurrencyAmount value={split.invoiceOutstanding} />{' '}
                     instead of being paid back. No cash, card, bank or voucher refund applies.
                  </p>
               )}
            </div>
         )}
      </div>
   );
}
