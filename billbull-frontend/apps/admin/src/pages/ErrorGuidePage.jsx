import { useState } from 'react';
import { Link } from 'react-router-dom';
import { platformApi } from '../api/client';
import { Alert, Card, Input, PageHeader, Spinner } from '../ui/kit';
import { useLoad } from '../ui/useLoad';
import { SeverityBadge, Tag } from './errors/errorUi';

/** Filters catalogue rules by free text across title, explanation, causes and actions. */
export function filterRules(rules, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rules;
  return rules.filter((r) => [r.title, r.code, r.categoryLabel, r.whatHappened, ...(r.likelyCauses || []), ...(r.recommendedActions || [])]
    .some((t) => String(t || '').toLowerCase().includes(q)));
}

/** The error catalogue: every kind of error BillBull recognises and how to handle it. */
export default function ErrorGuidePage() {
  const { data, loading, error } = useLoad(() => platformApi.errorCatalog(), []);
  const [q, setQ] = useState('');
  if (loading && !data) return <Spinner />;
  if (!data) return <Alert>{error}</Alert>;
  const rules = filterRules(data.rules, q);

  return (
    <div className="space-y-4">
      <div className="text-sm"><Link to="/errors" className="text-slate-500 hover:text-slate-800">← Error logs</Link></div>
      <PageHeader
        title="Error guide"
        subtitle="Every kind of error BillBull recognises, in order of precedence: what it means, why it happens and who fixes it."
      />
      <Card title="Kinds of error">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {data.categories.map((c) => (
            <div key={c.code}>
              <dt className="font-medium text-slate-800">{c.label}</dt>
              <dd className="text-slate-600">{c.description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Severity: <b>Critical</b> stops trading or sign-in for the client · <b>High</b> a defect or data problem that will
          keep failing · <b>Medium</b> needs follow-up · <b>Low</b> expected refusals and harmless noise. Business-rule
          refusals are hidden from the error list by default.
        </p>
      </Card>
      <Input placeholder="Search the guide (e.g. stock, printer, period, duplicate)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the guide" />
      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.code}>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge value={r.severity} />
              <h3 className="text-sm font-semibold text-slate-900">{r.title}</h3>
              <Tag>{r.categoryLabel}</Tag>
              <span className="ml-auto font-mono text-[11px] text-slate-400">{r.code}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{r.whatHappened}</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Usual causes</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">{r.likelyCauses.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">What to do · {r.ownerLabel}</div>
                <ol className="list-decimal space-y-1 pl-5 text-slate-700">{r.recommendedActions.map((a) => <li key={a}>{a}</li>)}</ol>
              </div>
            </div>
          </Card>
        ))}
        {rules.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nothing in the guide matches “{q}”.</p>}
      </div>
    </div>
  );
}
