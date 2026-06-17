import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Hash, Save, ShoppingCart, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSalesSettings, saveSalesSettings } from '../../api/salesSettingsApi';
import { getPurchaseSettings, savePurchaseSettings } from '../../api/purchaseSettingsApi';

const PAGE_BG = 'bg-[#F5F7FA]';
const PANEL = 'rounded-2xl border border-[#DCE3EB] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]';
const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#F5C742] focus:ring-4 focus:ring-[#F5C742]/15';

const SALES_DEFAULTS = [
    { documentType: 'CUSTOMER', label: 'Customer Code', autoNumberingEnabled: true, prefix: 'CUST', nextNumber: 1 },
    { documentType: 'QUOTATION', label: 'Quotation', autoNumberingEnabled: true, prefix: 'QTN', nextNumber: 1 },
    { documentType: 'SALES_ORDER', label: 'Sales Order', autoNumberingEnabled: true, prefix: 'SO', nextNumber: 1 },
    { documentType: 'PROFORMA_INVOICE', label: 'Proforma Invoice', autoNumberingEnabled: true, prefix: 'PI', nextNumber: 1 },
    { documentType: 'SALES_INVOICE', label: 'Sales Invoice', autoNumberingEnabled: true, prefix: 'INV', nextNumber: 1 },
    { documentType: 'DELIVERY_NOTE', label: 'Delivery/Picking Note', autoNumberingEnabled: true, prefix: 'DN', nextNumber: 1 },
    { documentType: 'SALES_RETURN', label: 'Sales Return', autoNumberingEnabled: true, prefix: 'SR', nextNumber: 1 },
    { documentType: 'SALES_PAYMENT', label: 'Sales Payment', autoNumberingEnabled: true, prefix: 'PAY', nextNumber: 1 }
];

const PURCHASE_DEFAULTS = [
    { documentType: 'LPO', label: 'Local Purchase Order', autoNumberingEnabled: true, prefix: 'LPO', nextNumber: 1 },
    { documentType: 'GRN', label: 'Goods Receipt Note', autoNumberingEnabled: true, prefix: 'GRN', nextNumber: 1 },
    { documentType: 'PURCHASE_INVOICE', label: 'Purchase Invoice', autoNumberingEnabled: true, prefix: 'PINV', nextNumber: 1 },
    { documentType: 'PAYMENT_VOUCHER', label: 'Payment Voucher', autoNumberingEnabled: true, prefix: 'PV', nextNumber: 1 }
];

const buildPreview = (setting) => {
    const prefix = (setting.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'DOC';
    const nextNumber = Math.max(1, Number(setting.nextNumber) || 1);
    return `${prefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(4, '0')}`;
};

const normalize = (defaults, incoming = []) => {
    const byType = new Map((Array.isArray(incoming) ? incoming : []).map((s) => [s.documentType, s]));
    return defaults.map((def) => {
        const s = byType.get(def.documentType) || {};
        const merged = {
            ...def,
            ...s,
            autoNumberingEnabled: s.autoNumberingEnabled ?? def.autoNumberingEnabled,
            prefix: s.prefix || def.prefix,
            nextNumber: Math.max(1, Number(s.nextNumber) || def.nextNumber)
        };
        merged.preview = buildPreview(merged);
        return merged;
    });
};

function Toggle({ checked, onChange }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-[#F5C742]' : 'bg-slate-200'}`}
            aria-pressed={checked}
        >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`} />
        </button>
    );
}

function NumberingRow({ setting, onChange }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">{setting.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        {setting.autoNumberingEnabled
                            ? 'Auto numbering uses the prefix and next sequence value below.'
                            : 'Manual mode lets the user type the document number during entry.'}
                    </p>
                </div>
                <Toggle
                    checked={setting.autoNumberingEnabled}
                    onChange={(next) => onChange(setting.documentType, { autoNumberingEnabled: next })}
                />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[130px_130px_1fr]">
                <input
                    type="text"
                    value={setting.prefix}
                    onChange={(e) => onChange(setting.documentType, { prefix: e.target.value.toUpperCase() })}
                    className={INPUT}
                    placeholder="Prefix"
                />
                <input
                    type="number"
                    min="1"
                    value={setting.nextNumber}
                    onChange={(e) => onChange(setting.documentType, { nextNumber: e.target.value })}
                    className={INPUT}
                    aria-label={`${setting.label} next number`}
                />
                <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono text-slate-700">
                    {setting.preview || buildPreview(setting)}
                </div>
            </div>
        </div>
    );
}

function SectionCard({ icon: Icon, tint, title, subtitle, rows, onChange }) {
    return (
        <section className={`${PANEL} p-6`}>
            <div className="mb-5 flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-950">{title}</h2>
                    <p className="text-sm text-slate-600">{subtitle}</p>
                </div>
            </div>
            <div className="space-y-3">
                {rows.map((setting) => (
                    <NumberingRow key={setting.documentType} setting={setting} onChange={onChange} />
                ))}
            </div>
        </section>
    );
}

const DocumentNumbering = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [salesSettings, setSalesSettings] = useState(null);
    const [salesNumbering, setSalesNumbering] = useState(normalize(SALES_DEFAULTS));
    const [purchaseNumbering, setPurchaseNumbering] = useState(normalize(PURCHASE_DEFAULTS));

    useEffect(() => {
        const load = async () => {
            try {
                const [sales, purchase] = await Promise.all([getSalesSettings(), getPurchaseSettings()]);
                setSalesSettings(sales);
                setSalesNumbering(normalize(SALES_DEFAULTS, sales.documentNumbering));
                setPurchaseNumbering(normalize(PURCHASE_DEFAULTS, purchase.documentNumbering));
            } catch (err) {
                console.error('Failed to load document numbering settings', err);
                toast.error('Failed to load settings');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const updateSales = (documentType, patch) => {
        setSalesNumbering((prev) => prev.map((s) => {
            if (s.documentType !== documentType) return s;
            const next = { ...s, ...patch };
            next.preview = buildPreview(next);
            return next;
        }));
    };

    const updatePurchase = (documentType, patch) => {
        setPurchaseNumbering((prev) => prev.map((s) => {
            if (s.documentType !== documentType) return s;
            const next = { ...s, ...patch };
            next.preview = buildPreview(next);
            return next;
        }));
    };

    const persist = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                // Preserve all the sales-specific policy fields; only override numbering.
                saveSalesSettings({ ...(salesSettings || {}), documentNumbering: salesNumbering }),
                savePurchaseSettings({ documentNumbering: purchaseNumbering })
            ]);
            toast.success('Document numbering saved successfully');
        } catch (err) {
            console.error('Failed to save document numbering settings', err);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const summary = useMemo(
        () => `${salesNumbering.length + purchaseNumbering.length} document types`,
        [salesNumbering.length, purchaseNumbering.length]
    );

    if (isLoading) {
        return (
            <div className={`min-h-screen ${PAGE_BG} flex items-center justify-center`}>
                <div className="text-center">
                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[#F5C742] border-t-transparent" />
                    <p className="text-sm text-slate-500">Loading document numbering...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${PAGE_BG}`}>
            <header className="border-b border-[#DCE3EB] bg-white px-7 py-5">
                <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-semibold text-slate-900">Document Numbering</span>
                </div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF6D8] text-[#C98A00]">
                            <Hash className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Document Numbering</h1>
                            <p className="mt-1 text-sm text-slate-600">Prefixes, sequences, and auto numbering across Sales and Purchase · {summary}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={persist}
                        disabled={isSaving}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C742] px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#e7b936] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                        {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-4 w-4" />}
                        {isSaving ? 'Saving...' : 'Save all'}
                    </button>
                </div>
            </header>

            <main className="space-y-6 p-7">
                <SectionCard
                    icon={ShoppingCart}
                    tint="bg-emerald-100 text-emerald-700"
                    title="Sales Documents"
                    subtitle="Customer codes and all sales-side document numbers."
                    rows={salesNumbering}
                    onChange={updateSales}
                />
                <SectionCard
                    icon={Truck}
                    tint="bg-sky-100 text-sky-700"
                    title="Purchase Documents"
                    subtitle="LPO, GRN, purchase invoice, and payment voucher numbers."
                    rows={purchaseNumbering}
                    onChange={updatePurchase}
                />

                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-800">
                    Turning auto numbering OFF lets users type the number manually on documents that have a number field
                    (Sales documents and Purchase Invoice). LPO, GRN, and Payment Voucher are always system-generated.
                    Existing numbers are never renumbered — the sequence only governs new documents.
                </div>
            </main>
        </div>
    );
};

export default DocumentNumbering;
