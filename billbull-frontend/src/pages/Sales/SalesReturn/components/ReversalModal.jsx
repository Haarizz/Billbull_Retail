import { useEffect, useRef, useState } from 'react';
import { Undo2, X, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/**
 * Reversal of an approved Sales Return.
 *
 * <p>Deliberately heavier than the approval dialog. Approving posts a return the operator has
 * just built and is looking at; reversing unwinds one that is already in the books — contra
 * journals, stock back out, the receivable allocation reversed, and any voucher or drawer cash
 * given back. So this asks for a typed reason as well as credentials, and says plainly what will
 * happen before it happens.
 *
 * <p>Like the authorization dialog, this grants nothing by itself: the backend re-checks the
 * status, requires the reason, verifies the supervisor, and refuses a batch-tracked return or a
 * redeemed voucher outright. Closing or bypassing this cannot push a reversal through.
 */
export default function ReversalModal({
   salesReturn, submitting, error, onCancel, onReverse,
}) {
   const [reason, setReason] = useState('');
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const reasonRef = useRef(null);

   // One supervisor's typed credentials must never survive into the next prompt. That is handled
   // by the caller rendering this only while a reversal is in flight, so closing it unmounts the
   // component and the next open starts from the initial state above — rather than clearing the
   // fields from an effect, which costs a second render on every open and is what
   // react-hooks/set-state-in-effect is warning about in the sibling AuthorizationModal.
   useEffect(() => {
      const timer = setTimeout(() => reasonRef.current?.focus(), 50);
      return () => clearTimeout(timer);
   }, []);

   const refundMethod = salesReturn?.refundMethod || null;
   const canSubmit = reason.trim().length >= 3 && username.trim() && password && !submitting;

   const submit = () => {
      if (!canSubmit) return;
      onReverse({
         reason: reason.trim(),
         supervisorUsername: username.trim(),
         supervisorPassword: password,
      });
   };

   // What the operator should expect to happen, in their language rather than the ledger's.
   const consequences = [
      'The revenue and VAT this return reversed go back onto the books.',
      'Any stock it put back is taken out again.',
      'The invoice balance returns to what it was before the return.',
   ];
   if (refundMethod === 'CARD_REFUND' || refundMethod === 'BANK_TRANSFER') {
      consequences.push('The refund is recorded as recovered from the card processor or bank — '
         + 'collecting it back is a separate, manual step.');
   }
   if (refundMethod === 'CREDIT_VOUCHER') {
      consequences.push('The credit voucher is cancelled. If the customer has already spent any '
         + 'of it, the reversal is refused.');
   }
   if (refundMethod === 'CASH_REFUND') {
      consequences.push('Cash goes back into the drawer, which needs an open POS session.');
   }

   return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         role="dialog"
         aria-modal="true"
         aria-label="Reverse sales return">
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            <div className="px-5 py-4 flex items-center justify-between" style={{ background: C.red }}>
               <div className="flex items-center gap-2.5">
                  <Undo2 className="h-5 w-5 text-white" />
                  <p className="text-sm font-black text-white">Reverse Sales Return</p>
               </div>
               <button onClick={onCancel} disabled={submitting}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                  aria-label="Cancel reversal">
                  <X className="h-4 w-4 text-white" />
               </button>
            </div>

            <div className="p-5 space-y-4">
               <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: '#FEF2F2' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-px" style={{ color: C.red }} />
                  <div className="space-y-1">
                     <p className="text-xs font-black" style={{ color: C.red }}>
                        This posts accounting entries and cannot be undone from here.
                     </p>
                     <ul className="text-[11px] font-semibold space-y-0.5" style={{ color: C.warnInk }}>
                        {consequences.map((line) => <li key={line}>• {line}</li>)}
                     </ul>
                  </div>
               </div>

               <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Return</span>
                     <span className="font-semibold" style={{ color: C.dark }}>
                        {salesReturn?.returnNumber || '—'}
                     </span>
                  </div>
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Original invoice</span>
                     <span className="font-semibold" style={{ color: C.dark }}>
                        {salesReturn?.linkedInvoice || '—'}
                     </span>
                  </div>
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Return value</span>
                     <span className="font-black" style={{ color: C.dark }}>
                        <CurrencyAmount value={Number(salesReturn?.totalAmount) || 0} />
                     </span>
                  </div>
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Settled by</span>
                     <span className="font-semibold" style={{ color: C.dark }}>
                        {refundMethod || '—'}
                     </span>
                  </div>
               </div>

               <div className="space-y-2.5">
                  <div>
                     <label htmlFor="sr-rev-reason"
                        className="text-[10px] font-black uppercase tracking-widest block mb-1"
                        style={{ color: C.muted }}>
                        Why is this being reversed?
                     </label>
                     <textarea
                        id="sr-rev-reason"
                        ref={reasonRef}
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. entered twice, wrong item scanned"
                        disabled={submitting}
                        maxLength={500}
                        className="w-full text-sm px-3 py-2.5 rounded-xl border-2 focus:outline-none disabled:bg-slate-50 resize-none"
                        style={{ borderColor: C.border }}
                     />
                     <p className="text-[10px] mt-1" style={{ color: C.muted }}>
                        Recorded against the return. A reversal restates a period that may already
                        have been reported on, so this is required.
                     </p>
                  </div>
                  <div>
                     <label htmlFor="sr-rev-user"
                        className="text-[10px] font-black uppercase tracking-widest block mb-1"
                        style={{ color: C.muted }}>
                        Supervisor username or email
                     </label>
                     <input
                        id="sr-rev-user"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        autoComplete="off"
                        disabled={submitting}
                        className="w-full text-sm px-3 py-2.5 rounded-xl border-2 focus:outline-none disabled:bg-slate-50"
                        style={{ borderColor: C.border }}
                     />
                  </div>
                  <div>
                     <label htmlFor="sr-rev-pass"
                        className="text-[10px] font-black uppercase tracking-widest block mb-1"
                        style={{ color: C.muted }}>
                        Password
                     </label>
                     <input
                        id="sr-rev-pass"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        autoComplete="off"
                        disabled={submitting}
                        className="w-full text-sm px-3 py-2.5 rounded-xl border-2 focus:outline-none disabled:bg-slate-50"
                        style={{ borderColor: C.border }}
                     />
                  </div>
               </div>

               {error && (
                  <div className="flex items-start gap-1.5 rounded-xl px-3 py-2"
                     style={{ background: '#FEF2F2' }}>
                     <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" style={{ color: C.red }} />
                     <p className="text-[11px] font-semibold" style={{ color: C.red }}>{error}</p>
                  </div>
               )}

               <div className="flex gap-2 pt-1">
                  <button onClick={onCancel} disabled={submitting}
                     className="px-4 py-2.5 rounded-xl text-xs font-black border-2 hover:bg-gray-50 disabled:opacity-50"
                     style={{ borderColor: C.border, color: C.muted }}>
                     Cancel
                  </button>
                  <button onClick={submit} disabled={!canSubmit}
                     className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black text-white transition-all"
                     style={{ background: canSubmit ? C.red : C.muted }}>
                     {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Reversing…</>
                        : <><Undo2 className="h-4 w-4" /> Reverse Return</>}
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
}
