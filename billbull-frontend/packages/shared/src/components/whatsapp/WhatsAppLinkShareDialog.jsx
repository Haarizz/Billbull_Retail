import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    MessageCircle, X, Copy, Check, ExternalLink, Link2, Download, Loader2, AlertTriangle, Info, Eye, Monitor, Globe,
} from 'lucide-react';
import {
    createDocumentLink, documentLinkUrl, getDocumentLinks, getWhatsAppDefaultCountryCode,
} from '../../api/documentLinkApi';
import {
    buildLinkMessage, formatLinkDate, formatLinkMoney, isPrivateLinkHost, linkMessageKinds, normalizeWhatsAppPhone,
    whatsAppOpenUrl,
} from '../../utils/whatsappLinkMessages';
import { usePosInputV2, usePosOverlay } from '../../pages/Sales/POS/input/PosOverlayContext';
import { POS_SCOPES } from '../../pages/Sales/POS/input/posScope';

// "Send on WhatsApp" without the Meta API: makes a public link to the document (summary + PDF),
// writes the message with that link, and opens the customer's chat in WhatsApp with the message
// typed in. The user presses Send in WhatsApp. See document/share on the backend.
//
// Used by Retail (useWhatsAppDocumentSend: quotation / sales order / invoice) and by the POS
// "Share Receipt → WhatsApp" button (doc.presentation = 'RECEIPT'). Inside the till it registers
// as a POS overlay so typing in the message never reaches the sale.
//
// doc: { documentType, documentId, documentNo, customerName, phone, amountText?, presentation?,
//        buildHtml: async () => html }

const OPEN_MODE_KEY = 'billbull.whatsapp.openIn';
const readMode = () => { try { return localStorage.getItem(OPEN_MODE_KEY) === 'web' ? 'web' : 'app'; } catch { return 'app'; } };
const saveMode = (m) => { try { localStorage.setItem(OPEN_MODE_KEY, m); } catch { /* private mode */ } };

const TONE = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-600 border-red-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** WhatsApp-style rendering: *bold*, clickable links, line breaks. */
function WhatsAppText({ text }) {
    return String(text || '').split('\n').map((line, i) => (
        <div key={i} className="min-h-[1.15em] break-words">
            {line.split(/(\*[^*\n]+\*|https?:\/\/\S+)/g).map((part, j) => {
                if (/^\*[^*\n]+\*$/.test(part)) return <strong key={j}>{part.slice(1, -1)}</strong>;
                if (/^https?:\/\//.test(part)) return <span key={j} className="text-[#027eb5] underline break-all">{part}</span>;
                return <React.Fragment key={j}>{part}</React.Fragment>;
            })}
        </div>
    ));
}

/**
 * @param defaultCountryCode  tenant code for local numbers; fetched from /api/whatsapp/status when omitted
 * @param onDownloadInstead   optional: the older "download the PDF and attach it" path
 * @param zClassName          stacking class; the POS completion screen needs it above its own overlays
 */
export default function WhatsAppLinkShareDialog({
    doc, defaultCountryCode: givenCountryCode, onClose, onDownloadInstead, notify, zClassName = 'z-[120]',
}) {
    const [fetchedCountryCode, setFetchedCountryCode] = useState('971');
    const defaultCountryCode = givenCountryCode || fetchedCountryCode;
    const [phase, setPhase] = useState('loading'); // loading | ready | error
    const [error, setError] = useState('');
    const [link, setLink] = useState(null);         // { url, expiresAt, summary, company }
    const [history, setHistory] = useState([]);
    const [kind, setKind] = useState('');
    const [message, setMessage] = useState('');
    const [phone, setPhone] = useState(doc.phone || '');
    const [mode, setMode] = useState(readMode);
    const [copied, setCopied] = useState('');
    const [opened, setOpened] = useState(false);
    const started = useRef(false);

    const label = doc.presentation === 'RECEIPT' ? 'Receipt'
        : { QUOTATION: 'Quotation', SALES_ORDER: 'Sales Order', SALES_INVOICE: 'Invoice' }[doc.documentType] || 'Document';
    const normalized = normalizeWhatsAppPhone(phone, defaultCountryCode);

    useEffect(() => {
        if (givenCountryCode) return undefined;
        let alive = true;
        getWhatsAppDefaultCountryCode().then(code => { if (alive && code) setFetchedCountryCode(code); });
        return () => { alive = false; };
    }, [givenCountryCode]);

    useEffect(() => {
        if (started.current) return; // StrictMode double-mount: make one link, not two
        started.current = true;
        (async () => {
            try {
                // Earlier links first, so the one made now isn't listed as "earlier".
                const earlier = await getDocumentLinks(doc.documentType, doc.documentId).catch(() => []);
                setHistory(earlier);
                await new Promise(r => setTimeout(r, 30)); // let a page that just loaded the doc re-render
                const html = await doc.buildHtml();
                if (!html) throw new Error(`No default print template is set for this ${label.toLowerCase()}. Set one in Print & Email Templates.`);
                const created = await createDocumentLink(doc.documentType, doc.documentId, html, doc.presentation);
                const data = { ...created, url: documentLinkUrl(created.path) };
                const firstKind = linkMessageKinds(created.summary)[0].key;
                setLink(data);
                setKind(firstKind);
                setMessage(buildLinkMessage(firstKind, { summary: created.summary, link: data.url, companyName: created.company?.name }));
                setPhase('ready');
            } catch (err) {
                setError(err?.message || 'Could not create the document link.');
                setPhase('error');
            }
        })();
    }, [doc, label]);

    // Esc closes. In the till (posInputV2) the POS input controller delivers it through this
    // overlay registration, which also keeps scans/shortcuts away from the sale; elsewhere the
    // window listener does it. Outside the till usePosOverlay is a no-op.
    const posInputV2 = usePosInputV2();
    usePosOverlay({ open: true, scope: POS_SCOPES.MODAL, onEscape: (e) => { e.preventDefault(); onClose(); } });
    useEffect(() => {
        if (posInputV2) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, posInputV2]);

    const kinds = useMemo(() => (link ? linkMessageKinds(link.summary) : []), [link]);

    const chooseKind = (k) => {
        setKind(k);
        setMessage(buildLinkMessage(k, { summary: link.summary, link: link.url, companyName: link.company?.name }));
    };

    const copy = async (what, text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            setTimeout(() => setCopied(''), 1800);
        } catch {
            notify?.('Copy failed — select the text and copy it manually.', 'info');
        }
    };

    const openWhatsApp = () => {
        const url = whatsAppOpenUrl(mode, normalized, message);
        if (url.startsWith('whatsapp:')) window.location.href = url;
        else window.open(url, '_blank', 'noopener');
        setOpened(true);
    };

    const switchMode = (m) => { setMode(m); saveMode(m); };

    const s = link?.summary;
    const linkMissing = phase === 'ready' && !message.includes(link.url);

    return (
        <div className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/50 p-3 sm:p-4`} onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="wa-link-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[94vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={18} className="text-emerald-600 shrink-0" />
                            <h3 id="wa-link-title" className="font-bold text-slate-800 text-base truncate">
                                WhatsApp {s?.customerName || doc.customerName || 'customer'}
                            </h3>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {label} {doc.documentNo}{s ? ` · ${formatLinkMoney(s.currency, s.total)}` : doc.amountText ? ` · ${doc.amountText}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-slate-100">
                        <X size={18} className="text-slate-400" />
                    </button>
                </div>

                <div className="grid md:grid-cols-[minmax(0,1fr)_330px] gap-5 px-5 py-4 overflow-y-auto">
                    {/* Left: compose */}
                    <div className="space-y-4 min-w-0">
                        {phase === 'ready' && (
                            <>
                                <div className="flex flex-wrap items-center gap-2">
                                    {kinds.map(k => (
                                        <button
                                            key={k.key}
                                            onClick={() => chooseKind(k.key)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                                                kind === k.key ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {k.label}
                                        </button>
                                    ))}
                                    <span className={`ml-auto px-2 py-0.5 rounded-full border text-[11px] font-semibold ${TONE[s.statusTone] || TONE.neutral}`}>
                                        {s.statusLabel}
                                        {s.balance != null && Number(s.balance) > 0 && s.status !== 'CANCELLED' ? ` · due ${formatLinkMoney(s.currency, s.balance)}` : ''}
                                    </span>
                                </div>
                            </>
                        )}

                        <div>
                            <label htmlFor="wa-link-phone" className="block text-xs font-semibold text-slate-500 mb-1.5">WhatsApp number</label>
                            <input
                                id="wa-link-phone"
                                type="tel"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="+971 50 123 4567"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                            <p className={`mt-1 text-xs ${normalized ? 'text-slate-400' : 'text-amber-600'}`}>
                                {normalized ? `Opens the chat with +${normalized}` : phone ? 'Not a valid number — WhatsApp will ask you to pick the chat.' : 'No number — WhatsApp will ask you to pick the chat.'}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="wa-link-message" className="block text-xs font-semibold text-slate-500 mb-1.5">Message</label>
                            {phase === 'loading' ? (
                                <div className="h-64 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-2 text-sm text-slate-500">
                                    <Loader2 size={16} className="animate-spin" /> Preparing the document link…
                                </div>
                            ) : phase === 'error' ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 space-y-2">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                    <p className="text-xs text-red-600/80">You can still send it the old way: download the PDF and attach it in the chat.</p>
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        id="wa-link-message"
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        rows={13}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
                                    />
                                    {linkMissing && (
                                        <p className="mt-1 text-xs text-amber-600">The document link is no longer in the message.</p>
                                    )}
                                </>
                            )}
                        </div>

                        {phase === 'ready' && isPrivateLinkHost(link.url) && (
                            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <span>
                                    This link points to <strong>{new URL(link.url).host}</strong>, which only works on this
                                    computer or network — the customer&apos;s phone can&apos;t open it. Open BillBull from its
                                    public address (e.g. https://yourcompany.billbull.app) to send links customers can open.
                                </span>
                            </div>
                        )}

                        {phase === 'ready' && (
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <Link2 size={14} className="text-slate-400 shrink-0" />
                                <span className="font-mono text-xs text-slate-600 truncate flex-1" title={link.url}>{link.url}</span>
                                <button onClick={() => copy('link', link.url)} className="p-1 rounded hover:bg-slate-200 text-slate-500" title="Copy link" aria-label="Copy link">
                                    {copied === 'link' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                </button>
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-slate-200 text-slate-500" title="Open the customer's page" aria-label="Open the customer's page">
                                    <ExternalLink size={14} />
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Right: preview + notes */}
                    <div className="space-y-3 min-w-0">
                        <div className="rounded-xl bg-[#EFE7DD] p-3">
                            <div className="mx-auto mb-2 w-fit rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">Preview</div>
                            <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#D9FDD3] px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm">
                                {phase === 'ready' ? <WhatsAppText text={message} /> : (
                                    <div className="space-y-1.5 py-1">
                                        <div className="h-2.5 w-1/3 rounded bg-emerald-900/10" />
                                        <div className="h-2.5 w-5/6 rounded bg-emerald-900/10" />
                                        <div className="h-2.5 w-2/3 rounded bg-emerald-900/10" />
                                    </div>
                                )}
                                <div className="mt-1 text-right text-[10px] text-slate-500">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                            <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
                            <span>
                                Opens this customer&apos;s chat in WhatsApp with the message typed in — press <strong>Send</strong> there.
                                The link shows the {label.toLowerCase()}, its current balance and the PDF
                                {link?.expiresAt ? `, until ${formatLinkDate(link.expiresAt)}` : ''}.
                                {mode === 'app' && ' The first time, your browser asks to open WhatsApp: tick "Always allow".'}
                            </span>
                        </div>

                        {history.length > 0 && (
                            <div className="rounded-lg border border-slate-200 px-3 py-2.5">
                                <p className="text-xs font-semibold text-slate-500 mb-1.5">Shared before</p>
                                <div className="space-y-1">
                                    {history.slice(0, 4).map(h => (
                                        <div key={h.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                            <span className="truncate">
                                                {h.createdAt ? new Date(h.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                                                {h.createdBy ? ` · ${h.createdBy}` : ''}
                                            </span>
                                            <span className={`flex items-center gap-1 shrink-0 ${h.viewCount ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                <Eye size={12} /> {h.viewCount ? `Opened ${h.viewCount}×` : 'Not opened'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-slate-100">
                    <button
                        onClick={() => copy('message', message)}
                        disabled={phase !== 'ready'}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                        {copied === 'message' ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                        {copied === 'message' ? 'Copied' : 'Copy message'}
                    </button>
                    {onDownloadInstead && (
                        <button
                            onClick={onDownloadInstead}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                                phase === 'error' ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'text-slate-500 hover:bg-slate-100'
                            }`}
                            title="Download the PDF and open the chat to attach it yourself"
                        >
                            <Download size={15} /> Attach PDF instead
                        </button>
                    )}

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs" role="group" aria-label="Open in">
                            <span className="px-2 text-slate-400 hidden sm:inline">Open in</span>
                            <button
                                onClick={() => switchMode('app')}
                                aria-pressed={mode === 'app'}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md font-semibold ${mode === 'app' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Monitor size={13} /> WhatsApp app
                            </button>
                            <button
                                onClick={() => switchMode('web')}
                                aria-pressed={mode === 'web'}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md font-semibold ${mode === 'web' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Globe size={13} /> WhatsApp Web
                            </button>
                        </div>
                        <button
                            onClick={openWhatsApp}
                            disabled={phase !== 'ready' || !message.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                            <MessageCircle size={15} />
                            {opened ? 'Open again' : 'Open in WhatsApp'}
                        </button>
                    </div>
                </div>
                {opened && mode === 'app' && (
                    <p className="px-5 pb-3 -mt-1 text-right text-[11px] text-slate-400">
                        Nothing opened? The WhatsApp app may not be installed — switch to WhatsApp Web.
                    </p>
                )}
            </div>
        </div>
    );
}
