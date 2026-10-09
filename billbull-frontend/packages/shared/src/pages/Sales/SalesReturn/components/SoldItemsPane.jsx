import { Package, Layers, Barcode } from 'lucide-react';
import StatusPill from './StatusPill';
import { C } from '../constants';

const COLUMNS = [
   'Item / Barcode', 'Qty', 'Price', 'Disc', 'VAT', 'Total', 'Returned', 'Available', '',
];

const money = (v) => (Number(v) || 0).toFixed(2);

/**
 * §10 LEFT pane — everything sold on the original invoice, with what remains returnable.
 *
 * Read-only apart from the row "Add" affordance, which is a convenience for items whose
 * barcode won't scan (damaged label). Scanning remains the primary path (§11).
 */
export default function SoldItemsPane({ lines, onAdd, disabled }) {
   return (
      <div className="flex flex-col h-full">
         {/* Soft amber, against the solid amber of the Return Items header opposite it. This pane
             is the reference side — the cashier reads from it but works in the right-hand one —
             and two identical solid headers at the same height merged into a single band that
             hid the split. */}
         <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0"
            style={{ background: C.accentSoft, borderColor: C.accentBorder }}>
            <Package className="h-4 w-4" style={{ color: C.accentInk }} />
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.accentInk }}>
               Sold Items
            </p>
            <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full"
               style={{ background: C.white, color: C.accentInk, border: `1px solid ${C.accentBorder}` }}>
               {lines.length} {lines.length === 1 ? 'item' : 'items'}
            </span>
         </div>

         <div className="overflow-auto flex-1">
            <table className="w-full text-xs min-w-[680px]">
               <thead className="sticky top-0 z-10">
                  {/* Neutral, so it does not become a second soft-amber band directly under the
                      pane header — it is a column strip, not a heading. */}
                  <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                     {COLUMNS.map((h, i) => (
                        <th key={h || `blank-${i}`}
                           className="px-3 py-2.5 text-left font-black uppercase tracking-wider whitespace-nowrap"
                           style={{ color: C.muted, fontSize: 9 }}>
                           {h}
                        </th>
                     ))}
                  </tr>
               </thead>
               <tbody>
                  {lines.map((line, i) => (
                     <tr key={line.itemCode ?? i} className="group transition-colors"
                        style={{
                           background: i % 2 === 0 ? C.white : '#FFFDF7',
                           borderBottom: `1px solid ${C.border}`,
                        }}>
                        <td className="px-3 py-3">
                           <p className="font-semibold leading-tight" style={{ color: C.dark }}>
                              {line.itemName}
                           </p>
                           <p className="font-mono text-[10px] mt-0.5 flex items-center gap-1.5"
                              style={{ color: C.muted }}>
                              {line.barcode
                                 ? <><Barcode className="h-3 w-3" />{line.barcode}</>
                                 : line.itemCode}
                              {line.batchControlled && (
                                 <span className="inline-flex items-center gap-0.5 ml-1"
                                    title="Batch-controlled — batch selection required">
                                    <Layers className="h-3 w-3" style={{ color: C.accentInk }} />
                                 </span>
                              )}
                           </p>
                        </td>
                        <td className="px-3 py-3 font-black" style={{ color: C.slate }}>
                           {line.soldQty}
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold" style={{ color: C.slate }}>
                           {money(line.unitPrice)}
                        </td>
                        <td className="px-3 py-3" style={{ color: C.muted }}>
                           {Number(line.lineDiscount) > 0 ? money(line.lineDiscount) : '—'}
                        </td>
                        <td className="px-3 py-3" style={{ color: C.muted }}>
                           {money(line.lineVat)}
                        </td>
                        <td className="px-3 py-3 font-mono font-black" style={{ color: C.dark }}>
                           {money(line.lineTotal)}
                        </td>
                        <td className="px-3 py-3">
                           {line.returnedQty > 0
                              ? <span className="font-black" style={{ color: C.warnInk }}>{line.returnedQty}</span>
                              : <span style={{ color: `${C.muted}66` }}>—</span>}
                        </td>
                        <td className="px-3 py-3">
                           <div className="flex items-center gap-1.5">
                              <span className="font-black"
                                 style={{ color: line.availableQty > 0 ? C.green : C.muted }}>
                                 {line.availableQty}
                              </span>
                              <StatusPill status={line.status} />
                           </div>
                        </td>
                        <td className="px-3 py-3">
                           {line.availableQty > 0 && !line.lineBlocked && !disabled && (
                              <button
                                 onClick={() => onAdd(line.itemCode)}
                                 className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-1 rounded-lg text-[10px] font-black"
                                 style={{ background: C.accent, color: C.onAccent }}
                              >
                                 Add
                              </button>
                           )}
                        </td>
                     </tr>
                  ))}
                  {lines.length === 0 && (
                     <tr>
                        <td colSpan={COLUMNS.length} className="px-3 py-8 text-center"
                           style={{ background: C.white, color: C.muted }}>
                           No returnable lines on this invoice.
                        </td>
                     </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
   );
}
