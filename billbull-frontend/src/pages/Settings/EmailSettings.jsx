import React, { useState, useEffect } from 'react';
import {
    Mail,
    Server,
    Lock,
    User,
    Tag,
    Send,
    CheckCircle2,
    AlertCircle,
    Eye,
    EyeOff,
    Save
} from 'lucide-react';
import { getEmailConfig, saveEmailConfig, sendTestEmail } from '../../api/emailConfigApi';

const EMPTY_FORM = {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    username: '',
    password: '',
    fromName: 'BillBull ERP',
    enabled: false,
};

export default function EmailSettings() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [testSending, setTestSending] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        getEmailConfig()
            .then((res) => setForm({ ...EMPTY_FORM, ...res.data }))
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
        if (!form.username) {
            showToast('Email Address is required.', 'error');
            return;
        }

        setSaving(true);
        try {
            const res = await saveEmailConfig({ ...form, smtpHost: 'smtp.gmail.com', smtpPort: 587 });
            setForm((prev) => ({ ...prev, ...res.data }));
            showToast('Email settings saved successfully.');
        } catch {
            showToast('Failed to save email settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail.trim()) {
            showToast('Enter a test email address.', 'error');
            return;
        }

        setTestSending(true);
        try {
            await sendTestEmail(testEmail.trim());
            showToast(`Test email sent to ${testEmail}`);
        } catch (err) {
            const msg = err?.response?.data || 'Failed to send test email.';
            showToast(msg, 'error');
        } finally {
            setTestSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                Loading email settings...
            </div>
        );
    }

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
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF6D8] text-[#C98A00]">
                            <Mail size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Email Settings</h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Configure outgoing email for quotations, invoices, and other customer documents.
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
                                <p className="text-sm font-semibold text-slate-800">Enable Email</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Turn this on to allow sending documents directly from the system.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleChange('enabled', !form.enabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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

                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className="mb-5">
                            <h2 className="text-base font-bold text-slate-950">SMTP Configuration</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                These details control the sender account used for invoices, quotations, and receipt emails.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    SMTP Host
                                </label>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <Server size={15} className="shrink-0 text-slate-400" />
                                    <span className="text-sm text-slate-600">smtp.gmail.com</span>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Port
                                </label>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                                    587
                                </div>
                            </div>

                            <div className="md:col-span-3">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Email Address
                                </label>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#F5C742] focus-within:ring-4 focus-within:ring-[#F5C742]/15">
                                    <User size={15} className="shrink-0 text-slate-400" />
                                    <input
                                        type="email"
                                        value={form.username || ''}
                                        onChange={(e) => handleChange('username', e.target.value)}
                                        placeholder="your@gmail.com"
                                        className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    App Password
                                </label>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#F5C742] focus-within:ring-4 focus-within:ring-[#F5C742]/15">
                                    <Lock size={15} className="shrink-0 text-slate-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.password || ''}
                                        onChange={(e) => handleChange('password', e.target.value)}
                                        placeholder="16-character app password"
                                        className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        className="text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                <p className="mt-1.5 text-xs text-slate-400">
                                    For Gmail, use an App Password instead of your normal login password.
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Sender Name
                                </label>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#F5C742] focus-within:ring-4 focus-within:ring-[#F5C742]/15">
                                    <Tag size={15} className="shrink-0 text-slate-400" />
                                    <input
                                        type="text"
                                        value={form.fromName || ''}
                                        onChange={(e) => handleChange('fromName', e.target.value)}
                                        placeholder="BillBull ERP"
                                        className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <aside className="space-y-6">
                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <div className="mb-4 flex items-center gap-3">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                    form.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                <CheckCircle2 size={18} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-950">Delivery Status</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    A quick read on whether outgoing email is ready to use.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <StatusRow
                                label="Email sending"
                                value={form.enabled ? 'Enabled' : 'Disabled'}
                                tone={form.enabled ? 'success' : 'muted'}
                            />
                            <StatusRow
                                label="Sender account"
                                value={form.username ? 'Configured' : 'Missing'}
                                tone={form.username ? 'success' : 'warning'}
                            />
                            <StatusRow
                                label="App password"
                                value={form.password ? 'Saved' : 'Missing'}
                                tone={form.password ? 'success' : 'warning'}
                            />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                        <h2 className="text-base font-bold text-slate-950">Send Test Email</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Save your settings first, then send a quick test to confirm the mailbox is working.
                        </p>
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-[#F5C742] focus-within:ring-4 focus-within:ring-[#F5C742]/15">
                                <Mail size={15} className="shrink-0 text-slate-400" />
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                    placeholder="Send test to this email..."
                                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleTestEmail}
                                disabled={testSending || !testEmail.trim()}
                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                            >
                                <Send size={14} />
                                {testSending ? 'Sending...' : 'Send Test Email'}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <h2 className="text-base font-bold text-amber-900">Gmail App Password</h2>
                        <ol className="mt-3 space-y-2 text-sm text-amber-800">
                            <li>1. Open <span className="font-semibold">myaccount.google.com</span>.</li>
                            <li>2. Go to Security and enable 2-Step Verification.</li>
                            <li>3. Open App Passwords and create one for BillBull.</li>
                            <li>4. Paste the generated 16-character password here.</li>
                        </ol>
                    </div>
                </aside>
            </main>
        </div>
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
