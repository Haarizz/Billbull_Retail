import { CheckCircle2, XCircle, AlertTriangle, Ban } from 'lucide-react';
import { C, SCAN_STATE } from '../constants';

/**
 * §10 scan result banner. Distinguishes the three outcomes a cashier needs to tell apart:
 * the item isn't on the invoice, the item is on the invoice but fully returned, and the
 * item is blocked for another reason (voided line, ineligible invoice).
 */
const STYLES = {
   [SCAN_STATE.FOUND]: { bg: '#ECFDF5', color: C.green, Icon: CheckCircle2 },
   [SCAN_STATE.NOT_FOUND]: { bg: '#FEF2F2', color: C.red, Icon: XCircle },
   [SCAN_STATE.MAX_REACHED]: { bg: '#FEF9ED', color: C.warnInk, Icon: AlertTriangle },
   [SCAN_STATE.BLOCKED]: { bg: '#FEF2F2', color: C.red, Icon: Ban },
};

export default function ScanFeedback({ state, message }) {
   if (state === SCAN_STATE.IDLE || !STYLES[state]) return null;
   const { bg, color, Icon } = STYLES[state];
   return (
      <div
         className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mt-2"
         style={{ background: bg, color }}
         role="status"
         aria-live="polite"
      >
         <Icon className="h-4 w-4 shrink-0" />
         {message}
      </div>
   );
}
