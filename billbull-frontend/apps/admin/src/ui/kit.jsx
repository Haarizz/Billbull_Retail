import { useState } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm' };
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    accent: 'bg-[#F5C742] text-slate-900 hover:bg-amber-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  return <button type="button" className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

export function Card({ title, actions, children, className }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  UP: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ONBOARDING: 'bg-sky-50 text-sky-700 ring-sky-200',
  READ_ONLY: 'bg-amber-50 text-amber-800 ring-amber-200',
  DEGRADED: 'bg-amber-50 text-amber-800 ring-amber-200',
  STALE: 'bg-amber-50 text-amber-800 ring-amber-200',
  NOT_CONFIGURED: 'bg-slate-100 text-slate-600 ring-slate-200',
  AGENT_OFF: 'bg-slate-100 text-slate-600 ring-slate-200',
  NEVER: 'bg-slate-100 text-slate-600 ring-slate-200',
  UNKNOWN: 'bg-slate-100 text-slate-600 ring-slate-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
  SUSPENDED: 'bg-red-50 text-red-700 ring-red-200',
  DOWN: 'bg-red-50 text-red-700 ring-red-200',
  UNREACHABLE: 'bg-red-50 text-red-700 ring-red-200',
  AUTH_FAILED: 'bg-red-50 text-red-700 ring-red-200',
  ERROR: 'bg-red-50 text-red-700 ring-red-200',
  FAILED: 'bg-red-50 text-red-700 ring-red-200',
  OWNER: 'bg-violet-50 text-violet-700 ring-violet-200',
  OPERATOR: 'bg-sky-50 text-sky-700 ring-sky-200',
  VIEWER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Badge({ value, label }) {
  const key = value || 'UNKNOWN';
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', STATUS_STYLES[key] || STATUS_STYLES.UNKNOWN)}>
      {label || key.replace(/_/g, ' ')}
    </span>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block text-sm', className)}>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50';

export const Input = (props) => <input className={inputCls} {...props} />;
export const Textarea = (props) => <textarea className={inputCls} rows={3} {...props} />;
export const Select = ({ children, ...props }) => <select className={inputCls} {...props}>{children}</select>;

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-3 py-2 text-sm', styles[kind])}>{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx('max-h-[90vh] w-full overflow-auto rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {onClose && <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>}
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function CopyBlock({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="relative">
      <pre className="max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-all">{text}</pre>
      <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={copy}>{copied ? 'Copied' : label}</Button>
    </div>
  );
}

/** Shows a secret exactly once, with the warning that it can't be shown again. */
export function SecretOnce({ title, secret, children, onClose }) {
  return (
    <Modal title={title} onClose={onClose} footer={<Button onClick={onClose}>I have stored it</Button>}>
      <Alert kind="warn">This is shown <b>once</b>. Copy it now — it can&apos;t be displayed again. Rotate it if it is lost.</Alert>
      <CopyBlock text={secret} />
      {children}
    </Modal>
  );
}

export function Table({ columns, rows, empty = 'Nothing here yet.', rowKey = (r) => r.id, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => <th key={c.key} className={cx('px-3 py-2 font-medium', c.className)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>
          )}
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={cx('border-b border-slate-100 last:border-0', onRowClick && 'cursor-pointer hover:bg-amber-50/40')}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => <td key={c.key} className={cx('px-3 py-2 align-top', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, tone }) {
  const tones = { red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600' };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold text-slate-900', tones[tone])}>{value}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Spinner = () => <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;
