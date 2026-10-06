import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * Replaces the browser's blocking `window.alert` with an in-app modal.
 *
 * <p>Two call shapes are supported, deliberately. Plain `alert('text')` keeps working
 * everywhere it is already used and gets its tone guessed from the wording. A call site that
 * knows what it is announcing can instead pass a descriptor —
 * `alert({ tone, title, message, details })` — and say so outright rather than hoping the
 * keyword guesser reads its sentence the way it meant it. `details` renders as a label/value
 * list, which is what a till operator actually scans for: the document number and the money.
 */

const KNOWN_TONES = new Set(['success', 'warning', 'error', 'info']);

const normalizeMessage = (message) => {
  if (message instanceof Error) return message.message;
  if (message === null || message === undefined) return '';
  return String(message);
};

/** Keeps only the rows that have something to show, so callers can pass conditionals inline. */
const normalizeDetails = (details) => {
  if (!Array.isArray(details)) return [];
  return details
    .filter((row) => row && row.value !== null && row.value !== undefined && row.value !== '')
    .map((row) => ({
      label: normalizeMessage(row.label),
      value: normalizeMessage(row.value),
      emphasis: Boolean(row.emphasis)
    }));
};

const normalizeAlert = (input) => {
  if (input && typeof input === 'object' && !(input instanceof Error)) {
    return {
      tone: KNOWN_TONES.has(input.tone) ? input.tone : null,
      title: input.title ? normalizeMessage(input.title) : null,
      message: normalizeMessage(input.message),
      details: normalizeDetails(input.details)
    };
  }
  return { tone: null, title: null, message: normalizeMessage(input), details: [] };
};

const getAlertTone = (message) => {
  const value = message.toLowerCase();
  if (value.includes('failed') || value.includes('error') || value.includes('cannot')
      || value.includes('invalid') || value.includes('required')) {
    return 'error';
  }
  if (value.includes('success') || value.includes('saved') || value.includes('created')
      || value.includes('updated') || value.includes('approved') || value.includes('posted')
      || value.includes('completed')) {
    return 'success';
  }
  return 'info';
};

const toneConfig = {
  success: {
    title: 'Done',
    icon: CheckCircle2,
    iconClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    accentClass: 'bg-emerald-500',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500 text-white'
  },
  warning: {
    title: 'Check this',
    icon: AlertTriangle,
    iconClass: 'bg-amber-50 text-amber-600 border-amber-100',
    accentClass: 'bg-amber-500',
    buttonClass: 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-700 text-white'
  },
  error: {
    title: "Couldn't complete",
    icon: AlertCircle,
    iconClass: 'bg-red-50 text-red-600 border-red-100',
    accentClass: 'bg-red-500',
    buttonClass: 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-700 text-white'
  },
  info: {
    title: 'Notice',
    icon: Info,
    iconClass: 'bg-amber-50 text-amber-600 border-amber-100',
    accentClass: 'bg-[#F5C742]',
    buttonClass: 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-700 text-white'
  }
};

const AppAlertBridge = () => {
  const [alerts, setAlerts] = useState([]);
  const activeAlert = alerts[0] || null;
  const okButtonRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalAlert = window.alert;
    window.alert = (message = '') => {
      setAlerts((prev) => [...prev, { id: Date.now() + Math.random(), ...normalizeAlert(message) }]);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  const close = useCallback(() => setAlerts((prev) => prev.slice(1)), []);

  // A till is driven from the keyboard and the scanner, not the mouse: a modal that can only be
  // dismissed by clicking stops the next scan dead. Enter and Escape both acknowledge it, and the
  // OK button takes focus so a scanner's trailing Enter lands here rather than in the cart behind.
  useEffect(() => {
    if (!activeAlert) return undefined;
    okButtonRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeAlert, close]);

  const config = useMemo(() => {
    if (!activeAlert) return toneConfig.info;
    return toneConfig[activeAlert.tone || getAlertTone(activeAlert.message)];
  }, [activeAlert]);

  if (!activeAlert) return null;

  const Icon = config.icon;
  const queued = alerts.length - 1;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] print:hidden">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-alert-title"
        aria-describedby="app-alert-message"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className={`h-1 w-full ${config.accentClass}`} />
        <div className="flex items-start gap-3 p-5">
          <div className={`mt-0.5 shrink-0 rounded-full border p-2 ${config.iconClass}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="app-alert-title" className="text-sm font-bold text-slate-900">
              {activeAlert.title || config.title}
            </h3>
            <p id="app-alert-message" className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
              {activeAlert.message || 'Action completed.'}
            </p>
            {activeAlert.details.length > 0 && (
              <dl className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70">
                {activeAlert.details.map((row, i) => (
                  <div key={`${row.label}-${i}`} className="flex items-baseline justify-between gap-4 px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{row.label}</dt>
                    <dd className={`text-right tabular-nums ${row.emphasis
                      ? 'text-sm font-bold text-slate-900'
                      : 'text-sm font-medium text-slate-700'}`}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close notice"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <span className="text-[11px] text-slate-400">
            {queued > 0 ? `${queued} more notice${queued === 1 ? '' : 's'}` : 'Press Enter to continue'}
          </span>
          <button
            ref={okButtonRef}
            type="button"
            onClick={close}
            className={`rounded-md px-4 py-2 text-xs font-bold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${config.buttonClass}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppAlertBridge;
