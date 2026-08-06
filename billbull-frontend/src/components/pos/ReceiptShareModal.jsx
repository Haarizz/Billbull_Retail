import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Mail, MessageCircle, Smartphone, X } from 'lucide-react';

/**
 * One modal drives all three POS "Share Receipt" channels (SMS, WhatsApp,
 * Email). Everything that differs between them — header colour, icon, title,
 * input type/placeholder, validation and the send call — comes from
 * `RECEIPT_SHARE_CHANNELS` below, so there is a single dialog implementation to
 * keep accessible and responsive rather than three near-copies.
 *
 * The modal owns only presentation and validation. The actual send is whatever
 * `onSend(value)` the caller passes: the existing wa.me / SMS / e-mail calls are
 * reused untouched.
 */

const MOBILE_DIGITS = /\d/g;

const isValidMobile = (raw) => {
  const digits = (raw || '').match(MOBILE_DIGITS)?.length || 0;
  return digits >= 7 && digits <= 15;
};

// Deliberately permissive — the backend is the authority on deliverability;
// this only stops obviously malformed input from being submitted.
const isValidEmail = (raw) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw || '').trim());

const RECEIPT_SHARE_CHANNELS = {
  sms: {
    key: 'sms',
    title: 'Send by SMS',
    label: 'Mobile Number',
    placeholder: '+971 5X XXX XXXX',
    inputType: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    icon: Smartphone,
    headerClass: 'bg-[#16A34A]',
    sendClass: 'bg-[#16A34A] hover:bg-[#15803D] focus-visible:ring-[#16A34A]',
    validate: isValidMobile,
    invalidMessage: 'Enter a valid mobile number.',
  },
  whatsapp: {
    key: 'whatsapp',
    title: 'Send via WhatsApp',
    label: 'Mobile Number',
    placeholder: '+971 5X XXX XXXX',
    inputType: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    icon: MessageCircle,
    headerClass: 'bg-[#16A34A]',
    sendClass: 'bg-[#16A34A] hover:bg-[#15803D] focus-visible:ring-[#16A34A]',
    validate: isValidMobile,
    invalidMessage: 'Enter a valid mobile number.',
  },
  email: {
    key: 'email',
    title: 'Send by Email',
    label: 'Email Address',
    placeholder: 'customer@email.com',
    inputType: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    icon: Mail,
    headerClass: 'bg-[#2563EB]',
    sendClass: 'bg-[#2563EB] hover:bg-[#1D4ED8] focus-visible:ring-[#2563EB]',
    validate: isValidEmail,
    invalidMessage: 'Enter a valid email address.',
  },
};

/**
 * Render this keyed by `channel` and only while a channel is open — the field
 * is seeded from `initialValue` on mount, so remounting is what re-seeds it for
 * the next sale.
 *
 * @param {string}   channel  key of RECEIPT_SHARE_CHANNELS
 * @param {string}   initialValue  pre-filled customer mobile/email ('' for walk-in)
 * @param {Function} onSend  async (value) => void; throwing keeps the dialog open
 * @param {Function} onClose
 */
export default function ReceiptShareModal({ channel, initialValue = '', onSend, onClose }) {
  const config = channel ? RECEIPT_SHARE_CHANNELS[channel] : null;
  const [value, setValue] = useState(initialValue || '');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  // Focus on open and select the pre-filled text so typing replaces it in one go.
  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const valid = !!config && config.validate(value);

  const close = useCallback(() => {
    if (sending) return;
    onClose?.();
  }, [sending, onClose]);

  const submit = useCallback(async () => {
    if (!config || sending) return;
    if (!config.validate(value)) {
      setTouched(true);
      return;
    }
    setSending(true);
    setError('');
    try {
      await onSend?.(value.trim());
      onClose?.();
    } catch (err) {
      // Keep the dialog — and the typed value — so the cashier can retry.
      setError(err?.response?.data?.message || err?.message || 'Failed to send. Please try again.');
      setSending(false);
    }
  }, [config, sending, value, onSend, onClose]);

  useEffect(() => {
    if (!config) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config, close]);

  if (!config) return null;

  const Icon = config.icon;
  const showInvalid = touched && !valid && value.length > 0;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden my-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Colored header */}
        <div className={`${config.headerClass} px-5 py-4 flex items-center gap-3`}>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h2 id={`${fieldId}-title`} className="flex-1 min-w-0 text-white font-bold text-base sm:text-lg truncate">
            {config.title}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={sending}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="px-5 sm:px-6 py-5 space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor={fieldId} className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {config.label}
            </label>
            <input
              ref={inputRef}
              id={fieldId}
              type={config.inputType}
              inputMode={config.inputMode}
              autoComplete={config.autoComplete}
              value={value}
              disabled={sending}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              onBlur={() => setTouched(true)}
              onFocus={(e) => e.target.select()}
              placeholder={config.placeholder}
              aria-invalid={showInvalid || !!error}
              aria-describedby={showInvalid || error ? errorId : undefined}
              className={`w-full h-11 rounded-xl border-2 px-3.5 text-sm sm:text-base text-[#1E293B] placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none transition-colors ${
                showInvalid || error
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 focus:border-slate-400'
              }`}
            />
            {(showInvalid || error) && (
              <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
                {error || config.invalidMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={close}
              disabled={sending}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || sending}
              className={`h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors ${
                !valid || sending
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : config.sendClass
              }`}
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
