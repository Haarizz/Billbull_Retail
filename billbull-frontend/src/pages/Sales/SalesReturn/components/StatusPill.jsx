import { LINE_STATUS_STYLE, C } from '../constants';

/**
 * §10 per-line return status chip: Available / Partial / Returned.
 *
 * The classification is computed by the backend (ReturnEligibilityLine.resolveStatus) so
 * both entry points and any report agree on what "partial" means.
 */
export default function StatusPill({ status }) {
   const style = LINE_STATUS_STYLE[status] || { bg: C.bg, color: C.muted, label: status || '—' };
   return (
      <span
         className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
         style={{ background: style.bg, color: style.color }}
      >
         {style.label}
      </span>
   );
}
