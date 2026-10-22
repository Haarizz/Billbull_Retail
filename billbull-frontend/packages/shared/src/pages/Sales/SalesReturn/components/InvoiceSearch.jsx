import { useRef } from 'react';
import { Search, FileText, AlertCircle, Loader2, ScanLine } from 'lucide-react';
import CurrencyAmount from '../../../../components/CurrencyAmount';
import { C } from '../constants';

/**
 * §8 "Find Original Invoice".
 *
 * Scanning is the primary interaction: the input is autofocused and Enter-submits, so a
 * receipt barcode scanner works with no clicks. Manual search remains available for the
 * cases a scan cannot cover (customer name, mobile).
 */
export default function InvoiceSearch({
   query, setQuery, results, searching, searched, error, onSearch, onSelect,
}) {
   const inputRef = useRef(null);

   const submit = () => {
      const q = query.trim();
      if (q) onSearch(q);
   };

   return (
      <div className="p-5 bg-white border-b" style={{ borderColor: C.border }}>
         <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.muted }}>
            Find Original Invoice
         </p>

         <div className="flex gap-2">
            <div className="relative flex-1">
               <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: C.accentInk }} />
               <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Scan receipt or enter Invoice No. / Receipt No. / Customer / Mobile"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border-2 focus:outline-none"
                  style={{ borderColor: C.border }}
                  autoFocus
                  aria-label="Search for the original invoice"
               />
            </div>
            <button
               onClick={submit}
               disabled={searching || !query.trim()}
               className="px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 disabled:opacity-50"
               style={{ background: C.accent, color: C.onAccent }}
            >
               {searching
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
               Search
            </button>
         </div>

         {error && (
            <div className="mt-3 flex items-center gap-2 text-xs py-2 px-3 rounded-xl"
               style={{ background: '#FEF2F2', color: C.red }}>
               <AlertCircle className="h-4 w-4 shrink-0" />
               {error}
            </div>
         )}

         {searched && !searching && !error && results.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs py-2 px-3 rounded-xl"
               style={{ background: '#FEF2F2', color: C.red }}>
               <AlertCircle className="h-4 w-4 shrink-0" />
               No invoice found for &quot;{query}&quot;
            </div>
         )}

         {results.length > 0 && (
            <div className="mt-3 border rounded-xl overflow-hidden" style={{ borderColor: C.border }}>
               {results.map((inv, i) => (
                  <button
                     key={inv.invoiceNumber}
                     onClick={() => onSelect(inv)}
                     disabled={!inv.returnEligible}
                     className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                     style={{ borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}
                  >
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                           style={{ background: C.accentSoft, border: `1px solid ${C.accentBorder}` }}>
                           <FileText className="h-4 w-4" style={{ color: C.accentInk }} />
                        </div>
                        <div className="min-w-0">
                           <p className="text-sm font-black truncate" style={{ color: C.dark }}>
                              {inv.invoiceNumber}
                              {inv.receiptNumber && (
                                 <span className="ml-2 font-mono text-[10px] font-normal" style={{ color: C.muted }}>
                                    {inv.receiptNumber}
                                 </span>
                              )}
                           </p>
                           <p className="text-[11px] truncate" style={{ color: C.muted }}>
                              {inv.customerName || 'Walk-in'} · {inv.invoiceDate} · {inv.branchName || '—'}
                           </p>
                        </div>
                     </div>

                     <div className="text-right shrink-0 pl-3">
                        <p className="text-sm font-black" style={{ color: C.dark }}>
                           <CurrencyAmount value={Number(inv.invoiceTotal) || 0} />
                        </p>
                        <p className="text-[11px]" style={{ color: C.muted }}>
                           {inv.paymentMode || '—'} · {inv.itemCount} items
                        </p>
                        {/* Eligibility here is advisory; the backend re-checks on select. */}
                        <p className="text-[10px] font-bold"
                           style={{ color: inv.returnEligible ? C.green : C.muted }}>
                           {inv.returnEligible
                              ? `${inv.returnableQty} returnable`
                              : (inv.ineligibleReason || 'Not returnable')}
                        </p>
                     </div>
                  </button>
               ))}
            </div>
         )}
      </div>
   );
}
