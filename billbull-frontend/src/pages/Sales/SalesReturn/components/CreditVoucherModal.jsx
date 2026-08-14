import { useEffect, useRef } from 'react';
import { Gift, X, Copy, Printer, RefreshCw, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/**
 * §24 Credit Voucher confirmation card, shown after a return is settled as CREDIT_VOUCHER.
 *
 * <p>Every value rendered here is persisted, backend-generated data (§25). The frontend does not
 * decide the code, number, balance, expiry or status — the prototype's local
 * `Math.random()`/`Date.now()` generation is gone.
 *
 * <p>The barcode is drawn from the backend's `barcodeValue` as a real Code-39 symbol, not the
 * decorative random bars of the prototype: a scanner reading this resolves to the actual voucher.
 */
export default function CreditVoucherModal({
   voucher, branchName, onClose, onPrint, printing = false,
   loading = false, error = null, onRetry,
}) {
   const canvasRef = useRef(null);

   useEffect(() => {
      if (voucher?.barcodeValue && canvasRef.current) {
         drawCode39(canvasRef.current, voucher.barcodeValue);
      }
   }, [voucher]);

   // Three terminal states, and nothing in between: the voucher, the wait for it, or a plain
   // statement that it could not be read. There is deliberately no fourth state in which the
   // card is shown filled with anything the frontend made up (§6).
   if (!voucher && !loading && !error) return null;
   if (!voucher) {
      return (
         <Shell onClose={onClose}>
            <div className="p-6 text-center">
               {loading ? (
                  <>
                     <Loader2 className="h-7 w-7 animate-spin mx-auto mb-3" style={{ color: C.accent }} />
                     <p className="text-sm font-black" style={{ color: C.dark }}>Loading voucher…</p>
                     <p className="text-xs mt-1" style={{ color: C.muted }}>
                        The return is already confirmed.
                     </p>
                  </>
               ) : (
                  <>
                     <AlertTriangle className="h-7 w-7 mx-auto mb-3" style={{ color: C.amber }} />
                     <p className="text-sm font-black mb-1" style={{ color: C.dark }}>
                        Return confirmed, but voucher details could not be loaded.
                     </p>
                     {error?.returnNumber && (
                        <p className="text-xs font-semibold" style={{ color: C.dark }}>
                           Return {error.returnNumber}
                        </p>
                     )}
                     <p className="text-xs mt-2" style={{ color: C.muted }}>{error?.message}</p>
                     <p className="text-[11px] mt-3" style={{ color: C.muted }}>
                        The voucher has been issued and is safe. Retry, or find it on the return in
                        the Sales Return register — do not raise a second return.
                     </p>
                     <div className="flex gap-2 mt-4">
                        <button onClick={onRetry}
                           className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black"
                           style={{ background: C.accent, color: C.onAccent }}>
                           <RefreshCw className="h-4 w-4" />Retry
                        </button>
                        <button onClick={onClose}
                           className="flex-1 py-2.5 rounded-xl text-xs font-black border-2 hover:bg-gray-50"
                           style={{ borderColor: C.border, color: C.muted }}>
                           Close
                        </button>
                     </div>
                  </>
               )}
            </div>
         </Shell>
      );
   }

   const copyCode = async () => {
      try {
         await navigator.clipboard.writeText(voucher.voucherCode);
         toast.success('Voucher code copied');
      } catch {
         toast.error('Could not copy — select the code and copy manually.');
      }
   };

   const details = [
      ['Customer', voucher.customerName || 'Walk-in Customer'],
      ['Original Invoice', voucher.sourceInvoiceNumber || '—'],
      ['Return No.', voucher.sourceReturnNumber || '—'],
      ['Voucher No.', voucher.voucherNumber],
      ['Issue Date', voucher.issueDate || '—'],
      ['Expiry Date', voucher.expiryDate || 'No expiry'],
   ];

   const fullBalance = Number(voucher.remainingAmount) === Number(voucher.originalAmount);

   return (
      <Shell onClose={onClose}>
         <div className="p-5">
               <div className="border-2 border-dashed rounded-2xl p-5 text-center"
                  style={{ borderColor: C.accent, background: C.accentSoft }}>

                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5"
                     style={{ color: C.accentInk }}>BillBull Retail</p>
                  <p className="text-xs font-semibold mb-3" style={{ color: C.muted }}>
                     {branchName || voucher.branchName || ''}
                  </p>

                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.muted }}>
                     Credit Voucher
                  </p>
                  <p className="text-3xl font-black mb-1" style={{ color: C.dark }}>
                     <CurrencyAmount value={Number(voucher.originalAmount) || 0} />
                  </p>
                  {!fullBalance && (
                     <p className="text-xs font-bold mb-2" style={{ color: C.warnInk }}>
                        Remaining <CurrencyAmount value={Number(voucher.remainingAmount) || 0} />
                     </p>
                  )}

                  {/* Real Code-39 barcode rendered from the persisted barcodeValue. */}
                  <div className="my-3 flex justify-center">
                     <div className="px-4 py-2 rounded-xl border bg-white"
                        style={{ borderColor: C.accentBorder }}>
                        <canvas ref={canvasRef} height={44} aria-label="Voucher barcode" />
                     </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-4">
                     <p className="text-base font-mono font-black tracking-widest" style={{ color: C.dark }}>
                        {voucher.voucherCode}
                     </p>
                     <button onClick={copyCode}
                        className="p-1 rounded-lg hover:bg-amber-50 transition-colors"
                        aria-label="Copy voucher code">
                        <Copy className="h-3.5 w-3.5" style={{ color: C.accentInk }} />
                     </button>
                  </div>

                  <div className="space-y-1.5 text-left border-t pt-3" style={{ borderColor: C.accentBorder }}>
                     {details.map(([label, value]) => (
                        <div key={label} className="flex justify-between text-[11px] gap-3">
                           <span style={{ color: C.muted }}>{label}</span>
                           <span className="font-semibold text-right" style={{ color: C.dark }}>{value}</span>
                        </div>
                     ))}
                  </div>

                  <p className="text-[9px] mt-3 pt-2.5 border-t"
                     style={{ color: `${C.muted}90`, borderColor: C.accentBorder }}>
                     Valid for in-store purchase only. Non-transferable. Not redeemable for cash.
                  </p>
               </div>

               {/* Live status straight from the backend, not assumed. */}
               <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: voucher.redeemable ? '#ECFDF5' : '#FEF9ED' }}>
                  {voucher.redeemable
                     ? <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: C.green }} />
                     : <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: C.amber }} />}
                  <p className="text-xs font-semibold"
                     style={{ color: voucher.redeemable ? C.green : C.warnInk }}>
                     {voucher.redeemable
                        ? (fullBalance
                           ? 'Voucher Active · Full balance available'
                           : 'Voucher Active · Partial balance available')
                        : (voucher.notRedeemableReason || 'Voucher not currently redeemable')}
                  </p>
               </div>

               <div className="flex gap-2 mt-4">
                  <button onClick={() => onPrint?.(voucher, { reprint: false })}
                     disabled={printing}
                     className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black disabled:opacity-60"
                     style={{ background: C.accent, color: C.onAccent }}>
                     {printing
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Printing…</>
                        : <><Printer className="h-4 w-4" />Print Voucher</>}
                  </button>
                  {/* Reprint stamps the copy as a reprint but is otherwise the same document,
                      built from the same persisted voucher — it never re-issues anything. */}
                  <button onClick={() => onPrint?.(voucher, { reprint: true })}
                     disabled={printing}
                     className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black border-2 disabled:opacity-60"
                     style={{ borderColor: C.accent, color: C.accentInk }}>
                     <RefreshCw className="h-4 w-4" />Reprint
                  </button>
               </div>

               <button onClick={onClose}
                  className="w-full mt-2 py-2.5 rounded-xl text-xs font-black border-2 hover:bg-gray-50"
                  style={{ borderColor: C.border, color: C.muted }}>
                  Done
               </button>
         </div>
      </Shell>
   );
}

/**
 * The modal chrome, shared by all three states so the header and dismiss affordance do not
 * shift as the voucher resolves.
 */
function Shell({ onClose, children }) {
   return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         role="dialog" aria-modal="true" aria-label="Credit voucher issued">
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 flex items-center justify-between sticky top-0"
               style={{ background: C.dark }}>
               <div className="flex items-center gap-2.5">
                  <Gift className="h-5 w-5" style={{ color: C.accent }} />
                  <p className="text-sm font-black text-white">Credit Voucher Generated</p>
               </div>
               <button onClick={onClose}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  aria-label="Close voucher">
                  <X className="h-4 w-4 text-white" />
               </button>
            </div>
            {children}
         </div>
      </div>
   );
}

/**
 * Renders `value` as a genuine Code 39 barcode onto the canvas.
 *
 * <p>Code 39 is used because it needs no check digit, encodes the A–Z/0–9 alphabet the voucher
 * code is drawn from, and is read by every retail scanner — including the cheap ones already
 * deployed. The voucher code alphabet deliberately excludes the ambiguous glyphs, so nothing here
 * needs escaping.
 *
 * <p>Drawn locally rather than via a library because the repo has no frontend barcode dependency
 * and adding one for ~40 lines of well-specified encoding would be a heavier change than this.
 */
const CODE39 = {
   '0': 'bwbWBwBwb', '1': 'BwbWbwbwB', '2': 'bwBWbwbwB', '3': 'BwBWbwbwb',
   '4': 'bwbWBwbwB', '5': 'BwbWBwbwb', '6': 'bwBWBwbwb', '7': 'bwbWbwBwB',
   '8': 'BwbWbwBwb', '9': 'bwBWbwBwb', 'A': 'BwbwbWbwB', 'B': 'bwBwbWbwB',
   'C': 'BwBwbWbwb', 'D': 'bwbwBWbwB', 'E': 'BwbwBWbwb', 'F': 'bwBwBWbwb',
   'G': 'bwbwbWBwB', 'H': 'BwbwbWBwb', 'I': 'bwBwbWBwb', 'J': 'bwbwBWBwb',
   'K': 'BwbwbwbWB', 'L': 'bwBwbwbWB', 'M': 'BwBwbwbWb', 'N': 'bwbwBwbWB',
   'O': 'BwbwBwbWb', 'P': 'bwBwBwbWb', 'Q': 'bwbwbwBWB', 'R': 'BwbwbwBWb',
   'S': 'bwBwbwBWb', 'T': 'bwbwBwBWb', 'U': 'BWbwbwbwB', 'V': 'bWBwbwbwB',
   'W': 'BWBwbwbwb', 'X': 'bWbwBwbwB', 'Y': 'BWbwBwbwb', 'Z': 'bWBwBwbwb',
   '-': 'bWbwbwBwB', '*': 'bWbwBwBwb',
};

function drawCode39(canvas, rawValue) {
   const value = String(rawValue || '').toUpperCase();
   // Code 39 requires the '*' start/stop sentinel around the payload.
   const chars = ['*', ...value.split('').filter((c) => CODE39[c]), '*'];

   const NARROW = 2;
   const WIDE = NARROW * 3;
   const GAP = NARROW; // inter-character gap
   const height = canvas.height || 44;

   let width = 0;
   for (const ch of chars) {
      for (const el of CODE39[ch]) width += (el === el.toUpperCase() ? WIDE : NARROW);
      width += GAP;
   }

   canvas.width = width;
   const ctx = canvas.getContext('2d');
   if (!ctx) return;
   ctx.clearRect(0, 0, width, height);
   ctx.fillStyle = '#FFFFFF';
   ctx.fillRect(0, 0, width, height);
   ctx.fillStyle = '#1E293B';

   let x = 0;
   for (const ch of chars) {
      // In each pattern: the letter says bar ('b') or space ('w'); the case says wide or narrow.
      for (const el of CODE39[ch]) {
         const w = el === el.toUpperCase() ? WIDE : NARROW;
         if (el.toLowerCase() === 'b') ctx.fillRect(x, 0, w, height);
         x += w;
      }
      x += GAP;
   }
}
