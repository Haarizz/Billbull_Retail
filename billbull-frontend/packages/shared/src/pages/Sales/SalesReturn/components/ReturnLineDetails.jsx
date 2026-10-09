import { C } from '../constants';

/**
 * §12 per-line condition and reason.
 *
 * These are per line, never global: one return can legitimately mix a Good/Changed Mind
 * line with a Defective/Damaged Goods line, and they have different inventory outcomes —
 * only a restockable condition returns the unit to saleable stock.
 */
export default function ReturnLineDetails({ line, conditions, reasons, onChange }) {
   const selectedCondition = conditions.find((c) => c.value === line.condition);

   return (
      <div className="px-3 py-3 space-y-2.5" style={{ background: C.bg }}>
         {/* Condition */}
         <div>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>
               Condition <span style={{ color: C.red }}>*</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
               {conditions.map((c) => {
                  const sel = line.condition === c.value;
                  const tone = c.restockable ? C.green : C.orange;
                  return (
                     <button
                        key={c.value}
                        onClick={() => onChange({ condition: c.value })}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 transition-all"
                        style={{
                           borderColor: sel ? tone : C.border,
                           background: sel ? `${tone}15` : 'white',
                           color: sel ? tone : C.muted,
                        }}
                     >
                        {c.label}
                     </button>
                  );
               })}
            </div>
            {selectedCondition && !selectedCondition.restockable && (
               <p className="text-[10px] mt-1.5" style={{ color: C.orange }}>
                  Not returned to saleable stock — this unit is scrapped or quarantined.
               </p>
            )}
         </div>

         {/* Reason */}
         <div>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>
               Reason <span style={{ color: C.red }}>*</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
               {reasons.map((r) => {
                  const sel = line.reason === r.value;
                  return (
                     <button
                        key={r.value}
                        onClick={() => onChange({ reason: r.value })}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 transition-all"
                        style={{
                           borderColor: sel ? C.accent : C.border,
                           background: sel ? C.accentSoft : 'white',
                           color: sel ? C.accentInk : C.muted,
                        }}
                     >
                        {r.label}
                     </button>
                  );
               })}
            </div>
         </div>

         {/* Remarks — required when the reason is Other, since the code carries no detail. */}
         <div>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>
               Remarks {line.reason === 'OTHER' && <span style={{ color: C.red }}>*</span>}
            </p>
            <textarea
               value={line.remarks || ''}
               onChange={(e) => onChange({ remarks: e.target.value })}
               rows={2}
               placeholder={line.reason === 'OTHER'
                  ? 'Describe the reason for this return…'
                  : 'Optional notes for this line…'}
               className="w-full text-xs px-2.5 py-2 rounded-lg border resize-none focus:outline-none"
               style={{ borderColor: C.border }}
            />
         </div>
      </div>
   );
}
