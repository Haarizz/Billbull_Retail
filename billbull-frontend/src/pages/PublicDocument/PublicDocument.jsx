import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    AlertTriangle, CheckCircle2, Download, FileText, Link2Off, Loader2, Mail, Phone, Printer, Wallet, XCircle,
} from 'lucide-react';
import { getPublicDocument, publicAssetUrl, publicDocumentPdfUrl } from '@billbull/shared/api/documentLinkApi';
import { formatLinkDate, formatLinkMoney } from '@billbull/shared/utils/whatsappLinkMessages';

// Public page the customer opens from the WhatsApp message: /d/:token (no login).
// Backend: document/share/PublicDocumentController. Summary and status are live; the document
// below is the snapshot taken when the link was sent, shown in a sandboxed frame (no scripts).

const TONE = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-red-50 text-red-600 ring-red-200',
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const A4_WIDTH = 794; // px at 96 dpi — the width the print HTML is laid out for

function useNoIndex() {
    useEffect(() => {
        const meta = document.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex, nofollow';
        document.head.appendChild(meta);
        const referrer = document.createElement('meta');
        referrer.name = 'referrer';
        referrer.content = 'no-referrer';
        document.head.appendChild(referrer);
        return () => { meta.remove(); referrer.remove(); };
    }, []);
}

export default function PublicDocument() {
    const { token } = useParams();
    const [state, setState] = useState({ phase: 'loading' });
    useNoIndex();

    useEffect(() => {
        let alive = true;
        getPublicDocument(token)
            .then(data => { if (alive) setState({ phase: 'ready', data }); })
            .catch(err => { if (alive) setState({ phase: 'error', status: err.status, message: err.message }); });
        return () => { alive = false; };
    }, [token]);

    useEffect(() => {
        if (state.phase !== 'ready') return;
        const { summary, company } = state.data;
        document.title = `${summary.label} ${summary.documentNo || ''}${company?.name ? ` · ${company.name}` : ''}`;
    }, [state]);

    return (
        <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#F4F2EC] text-slate-900 font-sans">
            {state.phase === 'loading' && (
                <div className="min-h-full flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin" /> Loading document…
                </div>
            )}
            {state.phase === 'error' && <ErrorState status={state.status} message={state.message} />}
            {state.phase === 'ready' && <DocumentView token={token} data={state.data} />}
        </div>
    );
}

function ErrorState({ status, message }) {
    const gone = status === 410;
    const Icon = gone ? Link2Off : AlertTriangle;
    const title = status === 404 ? 'This link is not valid'
        : gone ? 'This link is no longer available'
            : status === 429 ? 'Too many requests'
                : 'Could not load this document';
    return (
        <div className="min-h-full flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                    <Icon size={20} className="text-slate-500" />
                </div>
                <h1 className="text-base font-bold text-slate-800">{title}</h1>
                <p className="mt-1.5 text-sm text-slate-500">
                    {status === 404 ? 'Check that the whole link was copied, or ask the sender to share it again.' : message}
                </p>
            </div>
        </div>
    );
}

function CompanyMark({ company }) {
    const [logoFailed, setLogoFailed] = useState(false);
    const name = company?.name || 'Your supplier';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    if (company?.logoPath && !logoFailed) {
        return (
            <img
                src={publicAssetUrl(company.logoPath)}
                alt=""
                onError={() => setLogoFailed(true)}
                className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-white/20"
            />
        );
    }
    return (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F5C742] text-sm font-bold text-slate-900">
            {initials || 'B'}
        </div>
    );
}

function Row({ label, children, strong }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className={`text-right ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{children}</dd>
        </div>
    );
}

function DocumentView({ token, data }) {
    const { summary: s, company, html, expiresAt } = data;
    const money = (v) => formatLinkMoney(s.currency, v);
    const balanceDue = s.balance != null && Number(s.balance) > 0.004 && s.status !== 'CANCELLED';
    const paidInFull = s.balance != null && !balanceDue && Number(s.total) > 0 && s.status !== 'CANCELLED';
    const contactPhone = company?.mobile || company?.phone;

    return (
        <div className="mx-auto w-full max-w-[860px] px-4 py-5 sm:py-8">
            {/* Company */}
            <header className="flex items-center gap-3 rounded-t-2xl bg-slate-900 px-5 py-4 text-white">
                <CompanyMark company={company} />
                <div className="min-w-0">
                    <div className="break-words text-base font-bold leading-snug">{company?.name || 'Document'}</div>
                    <div className="mt-0.5 break-words text-xs text-slate-300">
                        {[company?.city, company?.country].filter(Boolean).join(', ')}
                        {company?.trn ? `${company?.city || company?.country ? ' · ' : ''}TRN ${company.trn}` : ''}
                    </div>
                </div>
            </header>

            {/* Summary */}
            <section className="rounded-b-2xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="px-5 pt-6 pb-5 text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{s.label}</div>
                    <div className="mt-1 text-sm font-semibold text-[#a16207]">{s.documentNo}</div>
                    <div className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{money(s.total)}</div>
                    <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONE[s.statusTone] || TONE.neutral}`}>
                        {s.statusTone === 'success' && <CheckCircle2 size={12} />}
                        {s.status === 'CANCELLED' && <XCircle size={12} />}
                        {s.statusLabel}
                    </span>
                </div>

                {balanceDue && (
                    <div className="mx-5 mb-4 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200/70">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 ring-1 ring-amber-200">
                            <Wallet size={16} />
                        </div>
                        <div className="text-sm">
                            <div className="font-semibold text-slate-900">Balance due: {money(s.balance)}</div>
                            {s.dueDate && s.documentType !== 'QUOTATION' && (
                                <div className="text-xs text-slate-600">
                                    {s.statusLabel === 'Overdue' ? `Was due on ${formatLinkDate(s.dueDate)}.` : `Please pay by ${formatLinkDate(s.dueDate)}.`}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {paidInFull && (
                    <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                        <CheckCircle2 size={16} /> Paid in full — thank you!
                    </div>
                )}

                <dl className="divide-y divide-slate-100 border-t border-slate-100 px-5">
                    <Row label="Customer">{s.customerName}</Row>
                    {s.date && <Row label="Date">{formatLinkDate(s.date)}</Row>}
                    {s.dueDate && <Row label={s.dueLabel}>{formatLinkDate(s.dueDate)}</Row>}
                    <Row label="Total" strong>{money(s.total)}</Row>
                    {s.paid != null && Number(s.paid) > 0 && <Row label={s.documentType === 'SALES_ORDER' ? 'Advance paid' : 'Paid'}>{money(s.paid)}</Row>}
                    {s.balance != null && <Row label="Balance" strong>{money(s.balance)}</Row>}
                </dl>

                {(contactPhone || company?.email) && (
                    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 px-5 py-3">
                        <span className="text-xs text-slate-400">Questions?</span>
                        {contactPhone && (
                            <a href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                                <Phone size={13} /> {contactPhone}
                            </a>
                        )}
                        {company?.email && (
                            <a href={`mailto:${company.email}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                                <Mail size={13} /> {company.email}
                            </a>
                        )}
                    </div>
                )}
            </section>

            {/* Document */}
            <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <FileText size={16} className="text-slate-400" /> {s.label}
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={publicDocumentPdfUrl(token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                        >
                            <Printer size={14} /> Print
                        </a>
                        <a
                            href={publicDocumentPdfUrl(token, true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                            <Download size={14} /> PDF
                        </a>
                    </div>
                </div>
                <div className="p-3 sm:p-4">
                    <ScaledDocument html={html} title={`${s.label} ${s.documentNo || ''}`} />
                </div>
            </section>

            <footer className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
                Shared by {company?.name || 'the sender'} via BillBull
                {expiresAt ? ` · link valid until ${formatLinkDate(expiresAt)}` : ''}
            </footer>
        </div>
    );
}

/**
 * The print HTML is laid out for A4 width; scale it down to fit a phone. sandbox="allow-same-origin"
 * without allow-scripts: nothing in the document runs, but its height can still be measured.
 */
function ScaledDocument({ html, title }) {
    const boxRef = useRef(null);
    const frameRef = useRef(null);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(1123); // one A4 page until measured

    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return undefined;
        const update = () => setWidth(el.clientWidth);
        update();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);

    const measure = useCallback(() => {
        try {
            const d = frameRef.current?.contentDocument;
            if (d?.documentElement) setHeight(Math.max(400, d.documentElement.scrollHeight));
        } catch { /* keep the default height */ }
    }, []);

    const scale = width > 0 ? Math.min(1, width / A4_WIDTH) : 1;

    return (
        <div ref={boxRef} className="w-full overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200" style={{ height: height * scale }}>
            <iframe
                ref={frameRef}
                title={title}
                srcDoc={html}
                sandbox="allow-same-origin"
                onLoad={measure}
                scrolling="no"
                style={{
                    display: 'block',
                    margin: scale === 1 ? '0 auto' : 0,
                    width: A4_WIDTH,
                    height,
                    border: 0,
                    background: '#fff',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            />
        </div>
    );
}
