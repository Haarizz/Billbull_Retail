import { Banknote, CreditCard, Building2, Gift, User, Lock } from 'lucide-react';
import { C } from '../constants';

/**
 * §14 refund method.
 *
 * Note there is a single "Cash Refund" — the old POS wizard offered both "Cash Back" and
 * "Cash Return" for the same physical drawer cash-out, which made the two indistinguishable
 * in reporting.
 *
 * Cash Refund is disabled without a live POS session (§23): cash cannot leave the drawer
 * with nothing to reconcile it against at day close, so the control explains itself rather
 * than failing at confirmation.
 */
const ICONS = {
   CASH_REFUND: { Icon: Banknote, color: C.green },
   CARD_REFUND: { Icon: CreditCard, color: C.blue },
   BANK_TRANSFER: { Icon: Building2, color: C.slate },
   // Gold, matching the credit-voucher card this method issues.
   CREDIT_VOUCHER: { Icon: Gift, color: C.accentInk },
   CUSTOMER_CREDIT: { Icon: User, color: C.orange },
};

export default function RefundMethodSelector({
   methods, value, onChange, hasPosSession, disabled, blockedMethods = {},
}) {
   // Methods the backend says this specific sale cannot settle with — today that is Customer
   // Credit on a walk-in, which has no ledger to credit. The reason is shown rather than left
   // to be guessed at, and Credit Voucher stays available because bearer credit needs no account.
   const walkInBlocked = Object.keys(blockedMethods).length > 0;

   return (
      <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
         <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.muted }}>
            Refund Method <span style={{ color: C.red }}>*</span>
         </p>

         <div className="flex gap-2 flex-wrap">
            {methods.map((m) => {
               const { Icon, color } = ICONS[m.value] || { Icon: Banknote, color: C.slate };
               const noSession = m.affectsCashDrawer && !hasPosSession;
               const noAccount = Boolean(blockedMethods[m.value]);
               const blocked = noSession || noAccount;
               const sel = value === m.value;

               return (
                  <button
                     key={m.value}
                     onClick={() => !blocked && onChange(m.value)}
                     disabled={disabled || blocked}
                     title={noAccount
                        ? blockedMethods[m.value]
                        : noSession ? 'Requires an open POS session' : undefined}
                     className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                     style={{
                        borderColor: sel ? color : C.border,
                        background: sel ? `${color}15` : 'white',
                        color: sel ? color : C.muted,
                     }}
                  >
                     {blocked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                     {m.label}
                  </button>
               );
            })}
         </div>

         {walkInBlocked && (
            <p className="text-[10px] mt-2 flex items-start gap-1" style={{ color: C.warnInk }}>
               <Gift className="h-3 w-3 shrink-0 mt-px" />
               {Object.values(blockedMethods)[0]}
            </p>
         )}

         {!hasPosSession && methods.some((m) => m.affectsCashDrawer) && (
            <p className="text-[10px] mt-2" style={{ color: C.muted }}>
               Cash Refund needs an open POS session so the drawer movement can be reconciled at day close.
            </p>
         )}
      </div>
   );
}
