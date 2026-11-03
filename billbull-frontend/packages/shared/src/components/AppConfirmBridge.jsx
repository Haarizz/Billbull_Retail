import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';

/**
 * In-app replacement for the browser's `window.confirm`, the companion of AppAlertBridge.
 *
 * <p>`window.confirm` is synchronous, so it cannot be swapped out underneath existing callers the
 * way `alert` is. Callers await `confirmDialog(...)` instead:
 *
 *   if (!(await confirmDialog({ title: 'Delete counter?', message: 'This cannot be undone.',
 *                               confirmLabel: 'Delete', tone: 'danger' }))) return;
 *
 * A plain string works too. When no <AppConfirmBridge /> is mounted (unit tests, a page rendered
 * on its own) it falls back to the native confirm, so a caller never silently loses its guard.
 *
 * <p>Built on Radix Dialog so it stacks correctly over another open dialog (the POS Orders list,
 * for example): Radix keeps a single layer stack, so focus and outside-clicks go to the top one.
 */

const KNOWN_TONES = new Set(['danger', 'warning', 'default']);

const text = (value) => (value === null || value === undefined ? '' : String(value));

const normalizeConfirm = (input) => {
  if (input && typeof input === 'object') {
    return {
      tone: KNOWN_TONES.has(input.tone) ? input.tone : 'default',
      title: text(input.title),
      message: text(input.message),
      confirmLabel: text(input.confirmLabel) || 'Confirm',
      cancelLabel: text(input.cancelLabel) || 'Cancel',
    };
  }
  return { tone: 'default', title: '', message: text(input), confirmLabel: 'OK', cancelLabel: 'Cancel' };
};

/** The text a native confirm would show for the same request. */
const fallbackText = ({ title, message }) => [title, message].filter(Boolean).join('\n\n');

let enqueueConfirm = null;

/** Opens the confirm modal; resolves true on confirm, false on cancel / Escape / dismiss. */
export function confirmDialog(input) {
  const request = normalizeConfirm(input);
  if (!enqueueConfirm) {
    const native = typeof window !== 'undefined' ? window.confirm : null;
    return Promise.resolve(Boolean(native && native(fallbackText(request))));
  }
  return new Promise((resolve) => enqueueConfirm({ ...request, resolve }));
}

const toneConfig = {
  danger: {
    icon: Trash2,
    defaultTitle: 'Are you sure?',
    iconClass: 'bg-red-50 text-red-600 border-red-100',
    accentClass: 'bg-red-500',
    confirmClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
  },
  warning: {
    icon: AlertTriangle,
    defaultTitle: 'Please confirm',
    iconClass: 'bg-[#FFF8E7] text-[#d9a91f] border-[#FDE6A9]',
    accentClass: 'bg-[#F5C742]',
    confirmClass: 'bg-[#F5C742] hover:bg-[#e6b838] focus:ring-[#F5C742] text-[#1E293B]',
  },
  default: {
    icon: HelpCircle,
    defaultTitle: 'Please confirm',
    iconClass: 'bg-[#FFF8E7] text-[#d9a91f] border-[#FDE6A9]',
    accentClass: 'bg-[#F5C742]',
    confirmClass: 'bg-[#F5C742] hover:bg-[#e6b838] focus:ring-[#F5C742] text-[#1E293B]',
  },
};

const AppConfirmBridge = () => {
  const [queue, setQueue] = useState([]);
  const active = queue[0] || null;
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    enqueueConfirm = (request) => {
      setQueue((prev) => [...prev, { id: Date.now() + Math.random(), ...request }]);
    };
    return () => {
      enqueueConfirm = null;
      // Unmounting with a question still open answers it "no" rather than leaving the caller hanging.
      setQueue((prev) => { prev.forEach((r) => r.resolve(false)); return []; });
    };
  }, []);

  const answer = useCallback((value) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      prev[0].resolve(value);
      return prev.slice(1);
    });
  }, []);

  // A till is keyboard- and scanner-driven. Enter answers whichever button has focus and Escape
  // cancels; both are swallowed here so they never reach the cart or a dialog underneath.
  // Destructive questions start on Cancel, so a stray scanner Enter cannot delete anything.
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { answer(false); return; }
      if (document.activeElement === confirmRef.current) answer(true);
      else if (document.activeElement === cancelRef.current) answer(false);
      else answer(active.tone !== 'danger');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, answer]);

  if (!active) return null;

  const config = toneConfig[active.tone];
  const Icon = config.icon;
  const title = active.title || config.defaultTitle;

  return (
    <DialogPrimitive.Root key={active.id} open onOpenChange={(open) => { if (!open) answer(false); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-slate-950/40 backdrop-blur-[2px] print:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          {...(active.message ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (active.tone === 'danger' ? cancelRef : confirmRef).current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[10000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none print:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-150"
        >
          <div className={`h-1 w-full ${config.accentClass}`} />
          <div className="flex items-start gap-3 px-6 pb-4 pt-5">
            <div className={`mt-0.5 shrink-0 rounded-xl border p-2.5 ${config.iconClass}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-bold text-[#1E293B]">
                {title}
              </DialogPrimitive.Title>
              {active.message && (
                <DialogPrimitive.Description className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-600">
                  {active.message}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => answer(false)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              {active.cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => answer(true)}
              className={`h-10 rounded-xl px-5 text-sm font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${config.confirmClass}`}
            >
              {active.confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default AppConfirmBridge;
