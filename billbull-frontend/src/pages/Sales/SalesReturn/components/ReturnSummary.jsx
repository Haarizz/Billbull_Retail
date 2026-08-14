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
 */
export default function ReturnSummary({ summary }) {
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
               <span className="font-black text-sm" style={{ color: C.dark }}>Total Refund</span>
               <span className="font-black text-lg" style={{ color: C.accentInk }}>
                  <CurrencyAmount value={summary.totalRefund} />
               </span>
            </div>
         </div>
      </div>
   );
}
