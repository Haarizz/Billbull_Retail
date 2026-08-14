import { useRef, useState } from 'react';
import {
   RotateCcw, Scan, Plus, Minus, Trash2, ChevronDown, ChevronRight, AlertCircle, Layers,
} from 'lucide-react';
import ScanFeedback from './ScanFeedback';
import ReturnLineDetails from './ReturnLineDetails';
import { C } from '../constants';

const money = (v) => (Number(v) || 0).toFixed(2);

/**
 * §10 RIGHT pane — the return basket, driven by scanning (§11).
 *
 * Each row expands to its own condition/reason controls (§12). Rows that still need those
 * answers are flagged inline and auto-expanded, so a cashier is never left guessing why
 * Confirm is disabled.
 */
export default function ReturnItemsPane({
   returnLines, conditions, reasons, scanState, scanMessage,
   onScan, onQtyChange, onQtySet, onRemove, onUpdateLine, disabled,
}) {
   const [scanInput, setScanInput] = useState('');
   const [collapsed, setCollapsed] = useState({});
   const inputRef = useRef(null);

   const fire = () => {
      const token = scanInput.trim();
      if (!token) return;
      onScan(token);
      setScanInput('');
      inputRef.current?.focus();
   };

   const isIncomplete = (rl) => !rl.condition || !rl.reason
      || (rl.reason === 'OTHER' && !rl.remarks?.trim());

   const toggle = (itemCode) => setCollapsed((c) => ({ ...c, [itemCode]: !c[itemCode] }));

   // The basket does not scroll on its own — it flows inside the right column's single scroll
   // region, so a long list of return lines pushes the summary and settlement controls down
   // rather than being crushed into a sliver. The header and scan bar stay stuck to the top so
   // the scan-first workflow survives scrolling.
   return (
      <div className="flex flex-col">
         <div className="sticky top-0 z-20">
         <div className="px-4 py-2.5 border-b flex items-center gap-2"
            style={{ background: C.accent, borderColor: C.accentHover }}>
            <RotateCcw className="h-4 w-4" style={{ color: C.onAccent }} />
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.onAccent }}>
               Return Items
            </p>
            <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full"
               style={{ background: 'rgba(30,41,59,0.14)', color: C.onAccent }}>
               {returnLines.length} selected
            </span>
         </div>

         {/* Scan bar — the primary interaction. Opaque (not a translucent tint) because rows
             now scroll underneath it, and white rather than the amber tint so it reads as a
             separate band from the solid-amber pane header directly above it. */}
         <div className="px-4 py-2.5 border-b"
            style={{ background: C.white, borderColor: C.accentBorder }}>
            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: C.accentInk }}>
               Scan Return Item
            </p>
            <div className="flex gap-2">
               <div className="relative flex-1">
                  <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: C.accentInk }} />
                  <input
                     ref={inputRef}
                     value={scanInput}
                     onChange={(e) => setScanInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && fire()}
                     disabled={disabled}
                     placeholder="Scan barcode or type item code…"
                     className="w-full pl-10 pr-3 py-3 text-sm font-semibold rounded-xl border-2 focus:outline-none disabled:bg-slate-100"
                     style={{ borderColor: C.accent, background: 'white' }}
                     autoFocus
                     aria-label="Scan an item to return"
                  />
               </div>
               <button
                  onClick={fire}
                  disabled={disabled || !scanInput.trim()}
                  className="px-4 py-3 rounded-xl text-sm font-black flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: C.accent, color: C.onAccent }}
               >
                  <Plus className="h-4 w-4" />Add
               </button>
            </div>
            <ScanFeedback state={scanState} message={scanMessage} />
         </div>
         </div>

         {/* Return basket */}
         <div>
            {returnLines.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-32 text-center px-6">
                  <Scan className="h-7 w-7 mb-2" style={{ color: `${C.muted}60` }} />
                  <p className="text-xs font-semibold" style={{ color: C.muted }}>
                     Scan items to add to the return
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: `${C.muted}80` }}>
                     Items must exist on the original invoice
                  </p>
               </div>
            ) : (
               <div className="divide-y" style={{ borderColor: C.border }}>
                  {returnLines.map((rl) => {
                     const incomplete = isIncomplete(rl);
                     // Incomplete rows stay open until answered; completed rows collapse away.
                     const open = incomplete ? !collapsed[rl.itemCode] : Boolean(collapsed[rl.itemCode]);

                     return (
                        <div key={rl.itemCode}>
                           <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                              <button
                                 onClick={() => toggle(rl.itemCode)}
                                 className="p-0.5 rounded hover:bg-slate-200 shrink-0"
                                 aria-label={open ? 'Collapse line details' : 'Expand line details'}
                              >
                                 {open
                                    ? <ChevronDown className="h-4 w-4" style={{ color: C.muted }} />
                                    : <ChevronRight className="h-4 w-4" style={{ color: C.muted }} />}
                              </button>

                              <div className="flex-1 min-w-0">
                                 <p className="text-xs font-bold truncate" style={{ color: C.dark }}>
                                    {rl.itemName}
                                    {rl.batchControlled && (
                                       <Layers className="inline h-3 w-3 ml-1.5" style={{ color: C.amber }} />
                                    )}
                                 </p>
                                 <p className="font-mono text-[10px]" style={{ color: C.muted }}>
                                    {rl.barcode || rl.itemCode} · sold {rl.soldQty} · avail {rl.availableQty}
                                 </p>
                                 {incomplete && (
                                    <p className="flex items-center gap-1 text-[10px] font-bold mt-0.5"
                                       style={{ color: C.warnInk }}>
                                       <AlertCircle className="h-3 w-3" />
                                       {!rl.condition ? 'Condition required'
                                          : !rl.reason ? 'Reason required'
                                             : 'Remarks required for “Other”'}
                                    </p>
                                 )}
                              </div>

                              {/* Quantity — capped at availableQty (§11) */}
                              <div className="flex items-center gap-1 shrink-0">
                                 <button
                                    onClick={() => onQtyChange(rl.itemCode, -1)}
                                    disabled={disabled || rl.returnQty <= 1}
                                    className="w-6 h-6 rounded-md flex items-center justify-center border hover:bg-gray-100 disabled:opacity-40"
                                    style={{ borderColor: C.border }}
                                    aria-label={`Decrease quantity for ${rl.itemName}`}
                                 >
                                    <Minus className="h-3 w-3" style={{ color: C.muted }} />
                                 </button>
                                 <input
                                    type="number"
                                    value={rl.returnQty}
                                    min={1}
                                    max={rl.availableQty}
                                    onChange={(e) => onQtySet(rl.itemCode, e.target.value)}
                                    disabled={disabled}
                                    className="w-11 text-center font-black text-sm rounded-md border py-0.5 focus:outline-none"
                                    style={{ borderColor: C.border, color: C.dark }}
                                    aria-label={`Return quantity for ${rl.itemName}`}
                                 />
                                 <button
                                    onClick={() => onQtyChange(rl.itemCode, 1)}
                                    disabled={disabled || rl.returnQty >= rl.availableQty}
                                    className="w-6 h-6 rounded-md flex items-center justify-center border hover:bg-gray-100 disabled:opacity-40"
                                    style={{ borderColor: rl.returnQty < rl.availableQty ? C.accent : C.border }}
                                    aria-label={`Increase quantity for ${rl.itemName}`}
                                 >
                                    <Plus className="h-3 w-3"
                                       style={{ color: rl.returnQty < rl.availableQty ? C.accentInk : C.muted }} />
                                 </button>
                              </div>

                              <div className="w-20 text-right shrink-0">
                                 <p className="font-mono font-black text-xs" style={{ color: C.accentInk }}>
                                    {money(rl.returnQty * rl.unitPrice)}
                                 </p>
                                 <p className="font-mono text-[10px]" style={{ color: C.muted }}>
                                    @ {money(rl.unitPrice)}
                                 </p>
                              </div>

                              <button
                                 onClick={() => onRemove(rl.itemCode)}
                                 disabled={disabled}
                                 className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 shrink-0 disabled:opacity-40"
                                 aria-label={`Remove ${rl.itemName} from the return`}
                              >
                                 <Trash2 className="h-3.5 w-3.5" style={{ color: C.red }} />
                              </button>
                           </div>

                           {open && (
                              <ReturnLineDetails
                                 line={rl}
                                 conditions={conditions}
                                 reasons={reasons}
                                 onChange={(patch) => onUpdateLine(rl.itemCode, patch)}
                              />
                           )}
                        </div>
                     );
                  })}
               </div>
            )}
         </div>
      </div>
   );
}
