import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X, Loader2, AlertCircle } from 'lucide-react';
import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/** Human wording for the reason codes the backend returns. */
const REASON_TEXT = {
   HIGH_VALUE_CASH_REFUND: 'This cash refund is at or above the amount that requires manager approval.',
   RETURN_WINDOW_EXPIRED: 'The return window for this invoice has expired.',
};

/**
 * §15 supervisor sign-off (§9 flow step).
 *
 * This dialog does not grant anything by itself — it collects credentials that the backend
 * verifies inside the approval transaction. An approval that needs sign-off and arrives
 * without valid credentials is rejected server-side, so closing or bypassing this dialog
 * cannot push the return through.
 */
export default function AuthorizationModal({
   open, reasonCode, refundAmount, returnNumber, submitting, error, onCancel, onAuthorize,
}) {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const usernameRef = useRef(null);

   // Never let one supervisor's typed credentials survive into the next prompt.
   useEffect(() => {
      if (open) {
         setUsername('');
         setPassword('');
         setTimeout(() => usernameRef.current?.focus(), 50);
      }
   }, [open]);

   if (!open) return null;

   const canSubmit = username.trim() && password && !submitting;
   const submit = () => {
      if (!canSubmit) return;
      onAuthorize({ supervisorUsername: username.trim(), supervisorPassword: password });
   };

   return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         role="dialog"
         aria-modal="true"
         aria-label="Supervisor authorization required">
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            <div className="px-5 py-4 flex items-center justify-between" style={{ background: C.amber }}>
               <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-white" />
                  <p className="text-sm font-black text-white">Supervisor Authorization Required</p>
               </div>
               <button onClick={onCancel} disabled={submitting}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                  aria-label="Cancel authorization">
                  <X className="h-4 w-4 text-white" />
               </button>
            </div>

            <div className="p-5 space-y-4">
               <div className="rounded-xl px-3 py-2.5" style={{ background: '#FEF9ED' }}>
                  <p className="text-xs font-semibold" style={{ color: C.warnInk }}>
                     {REASON_TEXT[reasonCode] || 'This return requires manager approval.'}
                  </p>
               </div>

               <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Return</span>
                     <span className="font-semibold" style={{ color: C.dark }}>{returnNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                     <span style={{ color: C.muted }}>Refund amount</span>
                     <span className="font-black" style={{ color: C.dark }}>
                        <CurrencyAmount value={Number(refundAmount) || 0} />
                     </span>
                  </div>
               </div>

               <div className="space-y-2.5">
                  <div>
                     <label htmlFor="sr-auth-user"
                        className="text-[10px] font-black uppercase tracking-widest block mb-1"
                        style={{ color: C.muted }}>
                        Supervisor username or email
                     </label>
                     <input
                        id="sr-auth-user"
                        ref={usernameRef}
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
                     <label htmlFor="sr-auth-pass"
                        className="text-[10px] font-black uppercase tracking-widest block mb-1"
                        style={{ color: C.muted }}>
                        Password
                     </label>
                     <input
                        id="sr-auth-pass"
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
                     className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
                     style={{
                        background: canSubmit ? C.accent : C.muted,
                        color: canSubmit ? C.onAccent : '#FFFFFF',
                        cursor: canSubmit ? 'pointer' : 'not-allowed',
                     }}>
                     {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Authorizing…</>
                        : <><ShieldCheck className="h-4 w-4" />Authorize &amp; Confirm</>}
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
}
