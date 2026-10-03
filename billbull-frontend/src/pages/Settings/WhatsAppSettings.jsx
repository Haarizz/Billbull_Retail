import React, { useState, useEffect } from 'react';
import {
    MessageCircle,
    Hash,
    KeyRound,
    Lock,
    Globe,
    FileText,
    Languages,
    Webhook,
    Copy,
    RefreshCw,
    PlugZap,
    CheckCircle2,
    AlertCircle,
    Eye,
    EyeOff,
    Save
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { getWhatsAppConfig, saveWhatsAppConfig, testWhatsAppConnection } from '../../api/whatsappApi';

const MASK = '••••••••••••••••';

const EMPTY_FORM = {
    enabled: false,
    graphApiVersion: 'v21.0',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    appSecret: '',
    webhookVerifyToken: '',
    defaultCountryCode: '971',
    quotationTemplateName: 'quotation_document',
    salesOrderTemplateName: 'sales_order_document',
    salesInvoiceTemplateName: 'sales_invoice_document',
    templateLanguage: 'en',
};

// Body variables must stay in this order: the backend fills {{1}}..{{4}} positionally.
const TEMPLATE_FIELDS = [
    { key: 'quotationTemplateName', label: 'Quotation Template', placeholder: 'quotation_document', hint: 'Header: Document. {{1}} customer, {{2}} quotation no, {{3}} amount, {{4}} valid until.' },
    { key: 'salesOrderTemplateName', label: 'Sales Order Template', placeholder: 'sales_order_document', hint: 'Header: Document. {{1}} customer, {{2}} order no, {{3}} amount, {{4}} expected delivery.' },
    { key: 'salesInvoiceTemplateName', label: 'Sales Invoice Template', placeholder: 'sales_invoice_document', hint: 'Header: Document. {{1}} customer, {{2}} invoice no, {{3}} amount, {{4}} due date.' },
];

const randomToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export default function WhatsAppSettings() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [revealed, setRevealed] = useState({});
    const [toast, setToast] = useState(null);

    const webhookUrl = `${(api.defaults.baseURL || window.location.origin).replace(/\/$/, '')}/api/whatsapp/webhook`;

    useEffect(() => {
        getWhatsAppConfig()
            .then((res) => setForm({ ...EMPTY_FORM, ...stripNulls(res.data) }))
            .catch(() => setForm(EMPTY_FORM))
            .finally(() => setLoading(false));
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (form.enabled && (!form.phoneNumberId || !form.accessToken)) {
            showToast('Phone Number ID and Access Token are required to enable WhatsApp.', 'error');
            return;
        }
        setSaving(true);
        try {
            const res = await saveWhatsAppConfig(form);
            setForm({ ...EMPTY_FORM, ...stripNulls(res.data) });
            showToast('WhatsApp settings saved successfully.');
        } catch {
            showToast('Failed to save WhatsApp settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await testWhatsAppConnection();
            setTestResult({ ok: true, data: res.data });
        } catch (err) {
            setTestResult({ ok: false, message: err?.response?.data || 'Connection test failed.' });
        } finally {
            setTesting(false);
        }
    };

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard.');
        } catch {
            showToast('Could not copy — select and copy it manually.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                Loading WhatsApp settings...
            </div>
        );
    }

    const configured = Boolean(form.phoneNumberId && form.accessToken);
    const templatesSet = TEMPLATE_FIELDS.filter(f => form[f.key]).length;

    return (
        <div className="min-h-full bg-[#F5F7FA]">
            {toast && (
                <div
                    className={`fixed right-5 top-5 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
                        toast.type === 'error'
                            ? 'border border-red-200 bg-red-50 text-red-700'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                >
                    {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    {toast.message}
                </div>
            )}

            <header className="border-b border-[#DCE3EB] bg-white px-7 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <MessageCircle size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-950">WhatsApp Settings</h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Send quotation, sales order and invoice PDFs to customers on WhatsApp through the WhatsApp Business (Meta Cloud) API.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C742] px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#e7b936] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                        {saving ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            <Save size={16} />
                        )}
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </header>

            <main className="grid gap-6 p-7 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <section className="space-y-6">
                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Enable WhatsApp Business API</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    When off, the WhatsApp button downloads the PDF and opens the chat so the user attaches it manually.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleChange('enabled', !form.enabled)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                                    form.enabled ? 'bg-[#F5C742]' : 'bg-slate-200'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                        form.enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    <Card title="Meta API Credentials" subtitle="From developers.facebook.com → your app → WhatsApp → API Setup.">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Phone Number ID" icon={Hash} hint="The numeric ID, not the phone number itself.">
                                <input value={form.phoneNumberId} onChange={(e) => handleChange('phoneNumberId', e.target.value)} placeholder="e.g. 106540352242922" className={inputCls} />
                            </Field>
                            <Field label="WhatsApp Business Account ID" icon={Hash}>
                                <input value={form.businessAccountId} onChange={(e) => handleChange('businessAccountId', e.target.value)} placeholder="e.g. 102290129340398" className={inputCls} />
                            </Field>
                            <div className="md:col-span-2">
                                <SecretField
                                    label="Permanent Access Token"
                                    icon={KeyRound}
                                    hint="System User token with whatsapp_business_messaging and whatsapp_business_management. Temporary 24-hour tokens stop working the next day."
                                    value={form.accessToken}
                                    onChange={(v) => handleChange('accessToken', v)}
                                    revealed={revealed.accessToken}
                                    onToggle={() => setRevealed((r) => ({ ...r, accessToken: !r.accessToken }))}
                                />
                            </div>
                            <SecretField
                                label="App Secret"
                                icon={Lock}
                                hint="App settings → Basic. Used to verify webhook calls really come from Meta."
                                value={form.appSecret}
                                onChange={(v) => handleChange('appSecret', v)}
                                revealed={revealed.appSecret}
                                onToggle={() => setRevealed((r) => ({ ...r, appSecret: !r.appSecret }))}
                            />
                            <Field label="Graph API Version" icon={Globe}>
                                <input value={form.graphApiVersion} onChange={(e) => handleChange('graphApiVersion', e.target.value)} placeholder="v21.0" className={inputCls} />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Message Templates" subtitle="One approved template per document. Names and language must match WhatsApp Manager exactly. Leave a name blank to keep that document on the manual download-and-attach flow.">
                        <div className="grid gap-4 md:grid-cols-3">
                            {TEMPLATE_FIELDS.map(({ key, label, placeholder, hint }) => (
                                <div key={key} className="md:col-span-3">
                                    <Field label={label} icon={FileText} hint={hint}>
                                        <input value={form[key] || ''} onChange={(e) => handleChange(key, e.target.value)} placeholder={placeholder} className={inputCls} />
                                    </Field>
                                </div>
                            ))}
                            <Field label="Language Code" icon={Languages}>
                                <input value={form.templateLanguage} onChange={(e) => handleChange('templateLanguage', e.target.value)} placeholder="en" className={inputCls} />
                            </Field>
                            <Field label="Default Country Code" icon={Globe} hint="Added to local numbers like 050 123 4567.">
                                <div className="flex w-full items-center gap-1">
                                    <span className="text-sm text-slate-400">+</span>
                                    <input value={form.defaultCountryCode} onChange={(e) => handleChange('defaultCountryCode', e.target.value.replace(/\D/g, ''))} placeholder="971" maxLength={4} className={inputCls} />
                                </div>
                            </Field>
                        </div>
                    </Card>

                    <Card title="Delivery Webhook" subtitle="Lets BillBull show Sent → Delivered → Read on each quotation. Configure in your Meta app → WhatsApp → Configuration.">
                        <div className="space-y-4">
                            <Field label="Callback URL" icon={Webhook} hint="Must be public HTTPS. Subscribe to the “messages” field.">
                                <span className="flex-1 truncate text-sm text-slate-700">{webhookUrl}</span>
                                <button type="button" onClick={() => copy(webhookUrl)} className="text-slate-400 hover:text-slate-600" title="Copy"><Copy size={15} /></button>
                            </Field>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <SecretField
                                        label="Verify Token"
                                        icon={Lock}
                                        hint="Paste the same value into Meta's “Verify token” box."
                                        value={form.webhookVerifyToken}
                                        onChange={(v) => handleChange('webhookVerifyToken', v)}
                                        revealed={revealed.webhookVerifyToken}
                                        onToggle={() => setRevealed((r) => ({ ...r, webhookVerifyToken: !r.webhookVerifyToken }))}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { handleChange('webhookVerifyToken', randomToken()); setRevealed((r) => ({ ...r, webhookVerifyToken: true })); }}
                                    className="mb-6 inline-flex h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <RefreshCw size={14} /> Generate
                                </button>
                            </div>
                        </div>
                    </Card>
                </section>

                <aside className="space-y-6">
                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <h2 className="text-base font-bold text-slate-950">Setup Status</h2>
                        <div className="mt-4 space-y-3">
                            <StatusRow label="WhatsApp API" value={form.enabled ? 'Enabled' : 'Disabled'} tone={form.enabled ? 'success' : 'muted'} />
                            <StatusRow label="Credentials" value={form.phoneNumberId && form.accessToken ? 'Saved' : 'Missing'} tone={form.phoneNumberId && form.accessToken ? 'success' : 'warning'} />
                            <StatusRow label="Templates" value={`${templatesSet} of ${TEMPLATE_FIELDS.length} set`} tone={templatesSet === TEMPLATE_FIELDS.length ? 'success' : templatesSet ? 'muted' : 'warning'} />
                            <StatusRow label="Webhook security" value={form.appSecret && form.webhookVerifyToken ? 'Ready' : 'Missing'} tone={form.appSecret && form.webhookVerifyToken ? 'success' : 'warning'} />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <h2 className="text-base font-bold text-slate-950">Test Connection</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Save first, then check the saved credentials against Meta. No message is sent.
                        </p>
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={testing || !configured}
                            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            <PlugZap size={14} />
                            {testing ? 'Testing...' : 'Test Connection'}
                        </button>
                        {testResult && (
                            <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                                {testResult.ok ? (
                                    <div className="space-y-0.5">
                                        <div className="font-semibold">Connected</div>
                                        <div>{testResult.data?.verified_name} · {testResult.data?.display_phone_number}</div>
                                        {testResult.data?.quality_rating && <div className="text-xs">Quality rating: {testResult.data.quality_rating}</div>}
                                    </div>
                                ) : (
                                    String(testResult.message)
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <h2 className="text-base font-bold text-amber-900">Before you start</h2>
                        <ol className="mt-3 space-y-2 text-sm text-amber-800">
                            <li>1. Verify the business in Meta Business Manager.</li>
                            <li>2. Add a WhatsApp number that is not on the WhatsApp phone app.</li>
                            <li>3. Get the document templates approved (Utility, Document header): <span className="font-semibold">quotation_document</span>, <span className="font-semibold">sales_order_document</span>, <span className="font-semibold">sales_invoice_document</span>.</li>
                            <li>4. Create a System User and a permanent token.</li>
                            <li>5. Paste the values here, save, then Test Connection.</li>
                        </ol>
                        <p className="mt-3 text-xs text-amber-700">Full guide: docs/whatsapp-business-api-integration-2026-10-01.md</p>
                    </div>
                </aside>
            </main>
        </div>
    );
}

const inputCls = 'flex-1 min-w-0 bg-transparent text-sm text-slate-700 outline-none';

const stripNulls = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined));

function Card({ title, subtitle, children }) {
    return (
        <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-5">
                <h2 className="text-base font-bold text-slate-950">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function Field({ label, icon: Icon, hint, children }) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#F5C742] focus-within:ring-4 focus-within:ring-[#F5C742]/15">
                {Icon && <Icon size={15} className="shrink-0 text-slate-400" />}
                {children}
            </div>
            {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
        </div>
    );
}

// A saved secret arrives as MASK. Focusing clears it so the user can type a replacement;
// leaving it blank restores MASK, which the backend reads as "keep the stored value".
function SecretField({ label, icon, hint, value, onChange, revealed, onToggle }) {
    const isMasked = value === MASK;
    const [hadSaved, setHadSaved] = useState(false);
    return (
        <Field label={label} icon={icon} hint={hint}>
            <input
                type={revealed && !isMasked ? 'text' : 'password'}
                value={value || ''}
                onFocus={() => { if (isMasked) { setHadSaved(true); onChange(''); } }}
                onBlur={() => { if (hadSaved && !value) onChange(MASK); setHadSaved(false); }}
                onChange={(e) => onChange(e.target.value)}
                placeholder={isMasked ? 'Saved — type to replace' : ''}
                className={inputCls}
                autoComplete="off"
            />
            {!isMasked && (
                <button type="button" onClick={onToggle} className="text-slate-400 hover:text-slate-600">
                    {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            )}
        </Field>
    );
}

function StatusRow({ label, value, tone }) {
    const toneClasses = {
        success: 'bg-emerald-100 text-emerald-700',
        warning: 'bg-amber-100 text-amber-700',
        muted: 'bg-slate-100 text-slate-600'
    };

    return (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="text-sm text-slate-600">{label}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone] || toneClasses.muted}`}>
                {value}
            </span>
        </div>
    );
}
