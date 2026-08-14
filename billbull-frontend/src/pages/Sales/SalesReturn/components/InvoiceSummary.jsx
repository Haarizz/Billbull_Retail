import {
   Hash, Receipt, User, Phone, Building2, Calendar, CreditCard, X, AlertTriangle, DollarSign,
} from 'lucide-react';
import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/**
 * §8 selected-invoice strip. Carries a coloured edge and icon when the invoice is flagged
 * ineligible or carries warnings, so a cashier cannot miss a blocked return while focused on
 * the scan field.
 *
 * <p>The status is signalled by a heavy left edge on a white strip rather than by washing the
 * whole strip in its tint: this sits directly above the amber pane headers, and a full amber
 * fill made a warning indistinguishable from ordinary screen furniture.
 */
export default function InvoiceSummary({ eligibility, onClear }) {
   const blocked = !eligibility.eligible;
   const hasWarnings = (eligibility.warnings || []).length > 0;

   // Blocked keeps a faint red wash — it stops the workflow outright and has to shout.
   // Warnings and the clean case stay white and speak through the left edge alone.
   const tone = blocked
      ? { bg: '#FEF2F2', border: '#FECACA', accent: C.red }
      : hasWarnings
         ? { bg: C.white, border: C.border, accent: C.amber }
         : { bg: C.white, border: C.border, accent: C.green };

   const meta = [
      [Hash, 'Invoice', eligibility.invoiceNumber],
      [Receipt, 'Receipt', eligibility.receiptNumber || '—'],
      [User, 'Customer', eligibility.customerName || 'Walk-in'],
      [Phone, 'Mobile', eligibility.customerMobile || '—'],
      [Building2, 'Branch', eligibility.branchName || '—'],
      [Calendar, 'Date', eligibility.invoiceDate || '—'],
      [DollarSign, 'Total', <CurrencyAmount key="t" value={Number(eligibility.invoiceTotal) || 0} />],
      [CreditCard, 'Pay Mode', eligibility.paymentMode || '—'],
   ];

   return (
      <div className="border-b"
         style={{
            background: tone.bg,
            borderColor: tone.border,
            borderLeft: `3px solid ${tone.accent}`,
         }}>
         {/* The meta list wraps; the clear button must not wrap with it, or it lands on a row
             of its own and costs the workflow below ~40px of height for nothing. */}
         <div className="px-5 py-2 flex items-start gap-2">
            <div className="flex-1 flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
               {meta.map(([Icon, label, value]) => (
                  <div key={label} className="flex items-center gap-1.5">
                     <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tone.accent }} />
                     <span className="text-[10px]" style={{ color: C.muted }}>{label}:</span>
                     <span className="text-xs font-black" style={{ color: C.dark }}>{value}</span>
                  </div>
               ))}
            </div>
            <button
               onClick={onClear}
               className="p-1.5 rounded-lg hover:bg-white/60 transition-colors shrink-0"
               aria-label="Clear selected invoice"
            >
               <X className="h-4 w-4" style={{ color: C.red }} />
            </button>
         </div>

         {(blocked || hasWarnings) && (
            <div className="px-5 pb-2 space-y-1">
               {blocked && (
                  <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: C.red }}>
                     <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                     {eligibility.ineligibleReason}
                  </p>
               )}
               {(eligibility.warnings || []).map((w) => (
                  <p key={w} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.warnInk }}>
                     <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                     {w}
                  </p>
               ))}
               {eligibility.existingReturnNumbers?.length > 0 && (
                  <p className="text-[11px]" style={{ color: C.muted }}>
                     Prior returns on this invoice: {eligibility.existingReturnNumbers.join(', ')}
                  </p>
               )}
            </div>
         )}
      </div>
   );
}
