const SEVERITY_STYLES = {
  CRITICAL: 'bg-red-600 text-white ring-red-600',
  HIGH: 'bg-red-50 text-red-700 ring-red-200',
  MEDIUM: 'bg-amber-50 text-amber-800 ring-amber-200',
  LOW: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const STATUS_STYLES = {
  OPEN: 'bg-sky-50 text-sky-700 ring-sky-200',
  ACKNOWLEDGED: 'bg-violet-50 text-violet-700 ring-violet-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  IGNORED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap';

export function SeverityBadge({ value }) {
  return <span className={`${pill} ${SEVERITY_STYLES[value] || SEVERITY_STYLES.LOW}`}>{value ? value.charAt(0) + value.slice(1).toLowerCase() : '—'}</span>;
}

export function ErrorStatusBadge({ value, regressed }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`${pill} ${STATUS_STYLES[value] || STATUS_STYLES.OPEN}`}>{value ? value.charAt(0) + value.slice(1).toLowerCase() : '—'}</span>
      {regressed && <span className={`${pill} bg-orange-50 text-orange-700 ring-orange-200`} title="It was marked resolved and has happened again">Regressed</span>}
    </span>
  );
}

export function Tag({ children, title }) {
  return <span title={title} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 whitespace-nowrap">{children}</span>;
}

/** Tiny bar strip for per-day occurrences. */
export function DailyBars({ series }) {
  const max = Math.max(1, ...series.map((d) => d.n));
  return (
    <div className="flex h-12 items-end gap-0.5" role="img" aria-label="Occurrences per day, last 14 days">
      {series.map((d) => (
        <div key={d.day} className="flex-1" title={`${d.day}: ${d.n}`}>
          <div className={`w-full rounded-sm ${d.n ? 'bg-amber-400' : 'bg-slate-100'}`} style={{ height: `${Math.max(8, (d.n / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}
