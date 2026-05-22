import React, { useState, useEffect } from 'react';
import { Mail, Server, Lock, User, Tag, Send, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
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
            .then(res => setForm({ ...EMPTY_FORM, ...res.data }))
            .catch(() => setForm(EMPTY_FORM))
            .finally(() => setLoading(false));
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!form.username) {
            showToast('Email Address is required.', 'error');
            return;
        }
        setSaving(true);
        try {
            const res = await saveEmailConfig({ ...form, smtpHost: 'smtp.gmail.com', smtpPort: 587 });
            setForm(prev => ({ ...prev, ...res.data }));
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
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
                Loading email settings...
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-6">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                    ${toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                    {toast.type === 'error'
                        ? <AlertCircle size={16} />
                        : <CheckCircle2 size={16} />}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 rounded-lg">
                    <Mail size={20} className="text-amber-600" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-800">Email Settings</h1>
                    <p className="text-xs text-slate-400">Configure outgoing email for quotations, invoices, and other documents</p>
                </div>
            </div>

            {/* Enable toggle */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-700">Enable Email</p>
                    <p className="text-xs text-slate-400 mt-0.5">Turn on to allow sending emails from this system</p>
                </div>
                <button
                    onClick={() => handleChange('enabled', !form.enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${form.enabled ? 'bg-amber-400' : 'bg-slate-200'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {/* SMTP Config card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 space-y-4">
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide">SMTP Configuration</h2>

                {/* SMTP Host + Port — read-only, fixed for Gmail */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">SMTP Host</label>
                        <div className="flex items-center gap-2 px-3 py-2 border border-slate-100 rounded-lg bg-slate-100">
                            <Server size={14} className="text-slate-400 shrink-0" />
                            <span className="flex-1 text-sm text-slate-500 select-none">smtp.gmail.com</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Port</label>
                        <div className="flex items-center px-3 py-2 border border-slate-100 rounded-lg bg-slate-100">
                            <span className="text-sm text-slate-500 select-none">587</span>
                        </div>
                    </div>
                </div>

                {/* Email (username) */}
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:border-amber-400 bg-slate-50">
                        <User size={14} className="text-slate-400 shrink-0" />
                        <input
                            type="email"
                            value={form.username || ''}
                            onChange={e => handleChange('username', e.target.value)}
                            placeholder="your@gmail.com"
                            className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                        />
                    </div>
                </div>

                {/* App Password */}
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                        App Password
                        <span className="ml-2 font-normal text-slate-400">(Gmail: use App Password, not your login password)</span>
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:border-amber-400 bg-slate-50">
                        <Lock size={14} className="text-slate-400 shrink-0" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={form.password || ''}
                            onChange={e => handleChange('password', e.target.value)}
                            placeholder="16-character app password"
                            className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                        />
                        <button onClick={() => setShowPassword(p => !p)} className="text-slate-400 hover:text-slate-600">
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                </div>

                {/* From Name */}
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Sender Name</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:border-amber-400 bg-slate-50">
                        <Tag size={14} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            value={form.fromName || ''}
                            onChange={e => handleChange('fromName', e.target.value)}
                            placeholder="BillBull ERP"
                            className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                        />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">This name appears in the customer's inbox as the sender.</p>
                </div>
            </div>

            {/* How to get App Password hint */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">How to get a Gmail App Password</p>
                <ol className="text-xs text-amber-600 space-y-1 list-decimal list-inside">
                    <li>Go to <strong>myaccount.google.com</strong></li>
                    <li>Security → 2-Step Verification → Enable it</li>
                    <li>Security → App Passwords → Create one (name it "BillBull")</li>
                    <li>Copy the 16-character code and paste it above</li>
                </ol>
            </div>

            {/* Save button */}
            <div className="flex justify-end mb-6">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 disabled:bg-slate-200 disabled:text-slate-400 text-slate-900 font-bold rounded-lg text-sm transition-colors shadow-sm"
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {/* Test Email card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-3">Send Test Email</h2>
                <p className="text-xs text-slate-400 mb-3">After saving your settings, send a test email to verify everything is working.</p>
                <div className="flex gap-3">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg focus-within:border-amber-400 bg-slate-50">
                        <Mail size={14} className="text-slate-400 shrink-0" />
                        <input
                            type="email"
                            value={testEmail}
                            onChange={e => setTestEmail(e.target.value)}
                            placeholder="Send test to this email..."
                            className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                        />
                    </div>
                    <button
                        onClick={handleTestEmail}
                        disabled={testSending || !testEmail.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        <Send size={13} />
                        {testSending ? 'Sending...' : 'Send Test'}
                    </button>
                </div>
            </div>

        </div>
    );
}
