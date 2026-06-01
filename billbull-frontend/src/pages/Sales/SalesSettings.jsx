import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Check,
    CheckCircle,
    ChevronRight,
    CreditCard,
    Hash,
    Info,
    Package,
    Save,
    Settings,
    Tag,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getSalesSettings, saveSalesSettings } from '../../api/salesSettingsApi';

const DEFAULT_DOCUMENT_NUMBERING = [
    { documentType: 'CUSTOMER', label: 'Customer Code', autoNumberingEnabled: true, prefix: 'CUST', nextNumber: 1 },
    { documentType: 'QUOTATION', label: 'Quotation', autoNumberingEnabled: true, prefix: 'QTN', nextNumber: 1 },
    { documentType: 'SALES_ORDER', label: 'Sales Order', autoNumberingEnabled: true, prefix: 'SO', nextNumber: 1 },
    { documentType: 'PROFORMA_INVOICE', label: 'Proforma Invoice', autoNumberingEnabled: true, prefix: 'PI', nextNumber: 1 },
    { documentType: 'SALES_INVOICE', label: 'Sales Invoice', autoNumberingEnabled: true, prefix: 'INV', nextNumber: 1 },
    { documentType: 'DELIVERY_NOTE', label: 'Delivery/Picking Note', autoNumberingEnabled: true, prefix: 'DN', nextNumber: 1 },
    { documentType: 'SALES_RETURN', label: 'Sales Return', autoNumberingEnabled: true, prefix: 'SR', nextNumber: 1 },
    { documentType: 'SALES_PAYMENT', label: 'Sales Payment', autoNumberingEnabled: true, prefix: 'PAY', nextNumber: 1 }
];

const PAGE_BG = 'bg-[#F5F7FA]';
const PANEL = 'rounded-2xl border border-[#DCE3EB] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]';
const CARD = 'rounded-2xl border border-[#DCE3EB] bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]';
const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#F5C742] focus:ring-4 focus:ring-[#F5C742]/15';

const buildPreview = (setting) => {
    const prefix = (setting.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'DOC';
    const nextNumber = Math.max(1, Number(setting.nextNumber) || 1);
    return `${prefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(4, '0')}`;
};

const normalizeDocumentNumbering = (incoming = []) => {
    const byType = new Map((Array.isArray(incoming) ? incoming : []).map((setting) => [setting.documentType, setting]));
    return DEFAULT_DOCUMENT_NUMBERING.map((defaultSetting) => {
        const setting = byType.get(defaultSetting.documentType) || {};
        return {
            ...defaultSetting,
            ...setting,
            autoNumberingEnabled: setting.autoNumberingEnabled ?? defaultSetting.autoNumberingEnabled,
            prefix: setting.prefix || defaultSetting.prefix,
            nextNumber: Math.max(1, Number(setting.nextNumber) || defaultSetting.nextNumber),
            preview: buildPreview({ ...defaultSetting, ...setting })
        };
    });
};

const creditPolicies = [
    {
        value: 'NO_IMPACT',
        label: 'No Impact',
        description: 'Invoices can be posted freely, even if the customer is over their credit limit.',
        icon: Info,
        tint: 'bg-slate-100 text-slate-600'
    },
    {
        value: 'WARNING',
        label: 'Warning',
        description: 'Users see a warning if the customer exceeds their credit limit, but posting is still allowed.',
        icon: AlertTriangle,
        tint: 'bg-amber-100 text-amber-700'
    },
    {
        value: 'BLOCK',
        label: 'Block',
        description: 'Posting is blocked until the outstanding balance is back within the allowed limit.',
        icon: Ban,
        tint: 'bg-rose-100 text-rose-700'
    }
];

const pricePolicies = [
    {
        value: 'RETAIL',
        label: 'Retail Price',
        description: 'Uses the product master retail price as the default line price.',
        tint: 'bg-emerald-100 text-emerald-700'
    },
    {
        value: 'MAX_SALE',
        label: 'Maximum Sale Price',
        description: 'Uses the product maximum sale price when available, otherwise falls back to retail.',
        tint: 'bg-sky-100 text-sky-700'
    },
    {
        value: 'MIN_SALE',
        label: 'Minimum Sale Price',
        description: 'Uses the product minimum sale price when available, otherwise falls back to retail.',
        tint: 'bg-orange-100 text-orange-700'
    }
];

const salesModes = [
    {
        value: 'WORKFLOW_DRIVEN',
        label: 'Workflow Driven',
        description: 'Invoices pass through picking and delivery steps before stock and revenue are finalized.',
        tint: 'bg-slate-100 text-slate-700'
    },
    {
        value: 'FAST_SALE',
        label: 'Fast Sale',
        description: 'Posting the invoice automatically completes picking, dispatch, delivery, and stock deduction.',
        tint: 'bg-amber-100 text-amber-700'
    }
];

const roundingModes = [
    {
        value: 'NONE',
        label: 'No Rounding',
        description: 'Invoice totals keep their exact value, including fractional amounts.',
        tint: 'bg-slate-100 text-slate-700'
    },
    {
        value: 'NEAREST',
        label: 'Nearest',
        description: 'Snap the total to the closest rounding step (e.g. 716.40 → 716.00).',
        tint: 'bg-emerald-100 text-emerald-700'
    },
    {
        value: 'UP',
        label: 'Always Round Up',
        description: 'Round the total up to the next step (e.g. 716.10 → 717.00).',
        tint: 'bg-sky-100 text-sky-700'
    },
    {
        value: 'DOWN',
        label: 'Always Round Down',
        description: 'Round the total down to the previous step (e.g. 716.90 → 716.00).',
        tint: 'bg-orange-100 text-orange-700'
    }
];

const roundingPrecisions = [
    { value: 1, label: '1.00' },
    { value: 0.5, label: '0.50' },
    { value: 0.25, label: '0.25' },
    { value: 0.05, label: '0.05' }
];

const sectionMeta = {
    stockCheck: {
        title: 'Stock Check',
        subtitle: 'Control stock validation before posting',
        description: 'Choose whether invoice posting should enforce warehouse availability checks.',
        icon: Package,
        tint: 'bg-blue-100 text-blue-700'
    },
    creditLimit: {
        title: 'Credit Limit Policy',
        subtitle: 'Handle overdue or over-limit customers',
        description: 'Define what the system should do when a customer exceeds their credit limit.',
        icon: CreditCard,
        tint: 'bg-violet-100 text-violet-700'
    },
    executionMode: {
        title: 'Sales Execution Mode',
        subtitle: 'Control how delivery completes',
        description: 'Pick between a controlled workflow and one-step fast sale processing.',
        icon: Zap,
        tint: 'bg-amber-100 text-amber-700'
    },
    itemPrice: {
        title: 'Default Item Price',
        subtitle: 'Choose the default pricing source',
        description: 'Set which product price fills in first when users add items to sales documents.',
        icon: Tag,
        tint: 'bg-emerald-100 text-emerald-700'
    },
    numbering: {
        title: 'Document Numbering',
        subtitle: 'Prefixes, sequences, and auto numbering',
        description: 'Manage numbering behavior for customer and sales documents.',
        icon: Hash,
        tint: 'bg-sky-100 text-sky-700'
    },
    rounding: {
        title: 'Invoice Rounding',
        subtitle: 'Round-off rule for invoice totals',
        description: 'Choose how the sales invoice net total is rounded and the rounding step.',
        icon: Settings,
        tint: 'bg-rose-100 text-rose-700'
    }
};

function Toggle({ checked, onChange }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-[#F5C742]' : 'bg-slate-200'}`}
            aria-pressed={checked}
        >
            <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`}
            />
        </button>
    );
}

function PageHeader({ title, subtitle, detail, onBack, action }) {
    return (
        <header className="border-b border-[#DCE3EB] bg-white px-7 py-5">
            <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                <span>Sales</span>
                <ChevronRight className="h-3 w-3" />
                <span className={detail ? 'text-slate-500' : 'font-semibold text-slate-900'}>Configure & customize</span>
                {detail && (
                    <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-semibold text-slate-900">{title}</span>
                    </>
                )}
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    {detail && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF6D8] text-[#C98A00]">
                        <Settings className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
                        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
                    </div>
                </div>
                {action}
            </div>
        </header>
    );
}

function HubCard({ meta, value, onClick }) {
    const Icon = meta.icon;
    return (
        <button type="button" onClick={onClick} className={`${CARD} p-5 text-left`}>
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.tint}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
            <h2 className="text-base font-bold text-slate-950">{meta.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
            <p className="mt-4 text-xs font-medium text-slate-500">{value}</p>
        </button>
    );
}

function SectionShell({ meta, children, onBack, onSave, isSaving }) {
    return (
        <div className={`min-h-screen ${PAGE_BG}`}>
            <PageHeader
                title={meta.title}
                subtitle={meta.subtitle}
                detail
                onBack={onBack}
                action={(
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={isSaving}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C742] px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#e7b936] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                        {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-4 w-4" />}
                        {isSaving ? 'Saving...' : 'Save changes'}
                    </button>
                )}
            />
            <main className="p-7">
                <div className={`${PANEL} p-6`}>{children}</div>
            </main>
        </div>
    );
}

function OptionCard({ active, label, description, badge, icon: Icon, tint, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-2xl border p-4 text-left transition ${
                active
                    ? 'border-[#F5C742] bg-[#FFFBEA] shadow-[0_6px_18px_rgba(245,199,66,0.18)]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
        >
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{label}</span>
                        {badge && <span className="rounded-full bg-[#F5C742] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-950">{badge}</span>}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
                </div>
            </div>
        </button>
    );
}

const SalesSettings = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeScreen, setActiveScreen] = useState('hub');
    const [showStockCheckModal, setShowStockCheckModal] = useState(false);

    const [stockCheckRequired, setStockCheckRequired] = useState(false);
    const [creditLimitPolicy, setCreditLimitPolicy] = useState('NO_IMPACT');
    const [salesMode, setSalesMode] = useState('FAST_SALE');
    const [salesItemPricePolicy, setSalesItemPricePolicy] = useState('RETAIL');
    const [roundingMode, setRoundingMode] = useState('NEAREST');
    const [roundingPrecision, setRoundingPrecision] = useState(1);
    const [documentNumbering, setDocumentNumbering] = useState(DEFAULT_DOCUMENT_NUMBERING.map((setting) => ({
        ...setting,
        preview: buildPreview(setting)
    })));

    useEffect(() => {
        const load = async () => {
            try {
                const data = await getSalesSettings();
                setStockCheckRequired(data.stockCheckRequired ?? false);
                setCreditLimitPolicy(data.creditLimitPolicy ?? 'NO_IMPACT');
                setSalesMode(data.salesMode ?? 'WORKFLOW_DRIVEN');
                setSalesItemPricePolicy(data.salesItemPricePolicy ?? 'RETAIL');
                setRoundingMode(data.roundingMode ?? 'NEAREST');
                setRoundingPrecision(Number(data.roundingPrecision) > 0 ? Number(data.roundingPrecision) : 1);
                setDocumentNumbering(normalizeDocumentNumbering(data.documentNumbering));
            } catch (err) {
                console.error('Failed to load sales settings', err);
                toast.error('Failed to load settings');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const persistSettings = async () => {
        setIsSaving(true);
        try {
            await saveSalesSettings({
                stockCheckRequired,
                creditLimitPolicy,
                salesMode,
                salesItemPricePolicy,
                roundingMode,
                roundingPrecision,
                documentNumbering
            });
            toast.success('Configure & customize saved successfully');
        } catch (err) {
            console.error('Failed to save settings', err);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const updateDocumentNumbering = (documentType, patch) => {
        setDocumentNumbering((prev) => prev.map((setting) => {
            if (setting.documentType !== documentType) return setting;
            const next = { ...setting, ...patch };
            next.preview = buildPreview(next);
            return next;
        }));
    };

    if (isLoading) {
        return (
            <div className={`min-h-screen ${PAGE_BG} flex items-center justify-center`}>
                <div className="text-center">
                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[#F5C742] border-t-transparent" />
                    <p className="text-sm text-slate-500">Loading sales settings...</p>
                </div>
            </div>
        );
    }

    const stockCheckSummary = stockCheckRequired ? 'Enabled. Posting will validate stock.' : 'Disabled. Posting ignores stock shortages.';
    const creditSummary = creditPolicies.find((policy) => policy.value === creditLimitPolicy)?.label || 'No Impact';
    const modeSummary = salesModes.find((mode) => mode.value === salesMode)?.label || 'Workflow Driven';
    const priceSummary = pricePolicies.find((policy) => policy.value === salesItemPricePolicy)?.label || 'Retail Price';
    const numberingSummary = `${documentNumbering.length} document types configured`;
    const roundingSummary = roundingMode === 'NONE'
        ? 'No rounding'
        : `${roundingModes.find((mode) => mode.value === roundingMode)?.label || 'Nearest'} · step ${Number(roundingPrecision).toFixed(2)}`;

    const stockCheckModal = showStockCheckModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                            <Package className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-950">Stock Check</h2>
                            <p className="mt-1 text-sm text-slate-600">Open a focused window to decide whether invoice posting should verify stock first.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowStockCheckModal(false)}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-5 px-6 py-6">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div>
                            <p className="text-sm font-bold text-slate-900">Require Stock Check Before Posting</p>
                            <p className="mt-1 text-sm text-slate-600">When enabled, the system blocks posting if any item would drive stock negative.</p>
                        </div>
                        <Toggle checked={stockCheckRequired} onChange={setStockCheckRequired} />
                    </div>

                    <div className={`rounded-2xl border px-4 py-4 ${stockCheckRequired ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start gap-3">
                            {stockCheckRequired ? (
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            ) : (
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{stockCheckRequired ? 'Stock protection is active' : 'Stock protection is inactive'}</p>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    {stockCheckRequired
                                        ? 'Sales Invoices will be blocked at posting if any line item has insufficient stock. This works well for real-time stock-controlled businesses.'
                                        : 'Sales Invoices can still be posted even if stock is zero or negative. Use this when delivery and stock reconciliation happen elsewhere.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-800">
                        Quotations, Sales Orders, Proforma Invoices, Delivery Notes, and Sales Invoices already read these settings. This window updates the same saved module configuration.
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                    <button
                        type="button"
                        onClick={() => setShowStockCheckModal(false)}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        Done
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            await persistSettings();
                            setShowStockCheckModal(false);
                        }}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#F5C742] px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#e7b936] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                        {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-4 w-4" />}
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    if (activeScreen === 'hub') {
        return (
            <div className={`min-h-screen ${PAGE_BG}`}>
                <PageHeader
                    title="Configure & customize"
                    subtitle="Open each settings area in its own focused screen."
                    action={(
                        <button
                            type="button"
                            onClick={persistSettings}
                            disabled={isSaving}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C742] px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#e7b936] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                        >
                            {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save all'}
                        </button>
                    )}
                />

                <main className="space-y-6 p-7">
                    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        <HubCard meta={sectionMeta.stockCheck} value={stockCheckSummary} onClick={() => setShowStockCheckModal(true)} />
                        <HubCard meta={sectionMeta.creditLimit} value={creditSummary} onClick={() => setActiveScreen('creditLimit')} />
                        <HubCard meta={sectionMeta.executionMode} value={modeSummary} onClick={() => setActiveScreen('executionMode')} />
                        <HubCard meta={sectionMeta.itemPrice} value={priceSummary} onClick={() => setActiveScreen('itemPrice')} />
                        <HubCard meta={sectionMeta.rounding} value={roundingSummary} onClick={() => setActiveScreen('rounding')} />
                        <HubCard meta={sectionMeta.numbering} value={numberingSummary} onClick={() => setActiveScreen('numbering')} />
                    </section>
                </main>
                {stockCheckModal}
            </div>
        );
    }

    if (activeScreen === 'creditLimit') {
        return (
            <>
                <SectionShell meta={sectionMeta.creditLimit} onBack={() => setActiveScreen('hub')} onSave={persistSettings} isSaving={isSaving}>
                    <div className="space-y-4">
                        {creditPolicies.map((policy) => (
                            <OptionCard
                                key={policy.value}
                                active={creditLimitPolicy === policy.value}
                                label={policy.label}
                                description={policy.description}
                                badge={creditLimitPolicy === policy.value ? 'Active' : null}
                                icon={policy.icon}
                                tint={policy.tint}
                                onClick={() => setCreditLimitPolicy(policy.value)}
                            />
                        ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-800">
                        The credit limit itself is stored on the customer or invoice side. This screen only controls what the sales module should do when the limit is crossed.
                    </div>
                </SectionShell>
                {stockCheckModal}
            </>
        );
    }

    if (activeScreen === 'executionMode') {
        return (
            <>
                <SectionShell meta={sectionMeta.executionMode} onBack={() => setActiveScreen('hub')} onSave={persistSettings} isSaving={isSaving}>
                    <div className="space-y-4">
                        {salesModes.map((mode) => (
                            <OptionCard
                                key={mode.value}
                                active={salesMode === mode.value}
                                label={mode.label}
                                description={mode.description}
                                badge={salesMode === mode.value ? 'Active' : null}
                                icon={Zap}
                                tint={mode.tint}
                                onClick={() => setSalesMode(mode.value)}
                            />
                        ))}
                    </div>

                    {salesMode === 'FAST_SALE' && (
                        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                            Fast Sale will auto-complete picking and delivery on posting. This is best when warehouse discipline is strong and stock is always maintained accurately.
                        </div>
                    )}
                </SectionShell>
                {stockCheckModal}
            </>
        );
    }

    if (activeScreen === 'itemPrice') {
        return (
            <>
                <SectionShell meta={sectionMeta.itemPrice} onBack={() => setActiveScreen('hub')} onSave={persistSettings} isSaving={isSaving}>
                    <div className="space-y-4">
                        {pricePolicies.map((policy) => (
                            <OptionCard
                                key={policy.value}
                                active={salesItemPricePolicy === policy.value}
                                label={policy.label}
                                description={policy.description}
                                badge={salesItemPricePolicy === policy.value ? 'Active' : null}
                                icon={Tag}
                                tint={policy.tint}
                                onClick={() => setSalesItemPricePolicy(policy.value)}
                            />
                        ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
                        Users can still edit the price on the document line. This screen controls the default price that appears first when the item is selected.
                    </div>
                </SectionShell>
                {stockCheckModal}
            </>
        );
    }

    if (activeScreen === 'rounding') {
        return (
            <>
                <SectionShell meta={sectionMeta.rounding} onBack={() => setActiveScreen('hub')} onSave={persistSettings} isSaving={isSaving}>
                    <div className="space-y-4">
                        {roundingModes.map((mode) => (
                            <OptionCard
                                key={mode.value}
                                active={roundingMode === mode.value}
                                label={mode.label}
                                description={mode.description}
                                badge={roundingMode === mode.value ? 'Active' : null}
                                icon={Settings}
                                tint={mode.tint}
                                onClick={() => setRoundingMode(mode.value)}
                            />
                        ))}
                    </div>

                    {roundingMode !== 'NONE' && (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <h3 className="text-sm font-bold text-slate-900">Rounding step</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                The total is rounded to a multiple of this amount.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {roundingPrecisions.map((step) => (
                                    <button
                                        key={step.value}
                                        type="button"
                                        onClick={() => setRoundingPrecision(step.value)}
                                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                                            roundingPrecision === step.value
                                                ? 'border-[#F5C742] bg-[#FFF8E7] text-slate-900'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        {step.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-800">
                        The rounding difference is posted to the Rounding Adjustment account (5999) so revenue stays exact. Cashiers can still override the round-off by hand on an individual invoice.
                    </div>
                </SectionShell>
                {stockCheckModal}
            </>
        );
    }

    return (
        <>
            <SectionShell meta={sectionMeta.numbering} onBack={() => setActiveScreen('hub')} onSave={persistSettings} isSaving={isSaving}>
                <div className="space-y-3">
                    {documentNumbering.map((setting) => (
                        <div key={setting.documentType} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                                    onChange={(nextValue) => updateDocumentNumbering(setting.documentType, { autoNumberingEnabled: nextValue })}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[130px_130px_1fr]">
                                <input
                                    type="text"
                                    value={setting.prefix}
                                    onChange={(e) => updateDocumentNumbering(setting.documentType, { prefix: e.target.value.toUpperCase() })}
                                    className={INPUT}
                                    placeholder="Prefix"
                                />
                                <input
                                    type="number"
                                    min="1"
                                    value={setting.nextNumber}
                                    onChange={(e) => updateDocumentNumbering(setting.documentType, { nextNumber: e.target.value })}
                                    className={INPUT}
                                    aria-label={`${setting.label} next number`}
                                />
                                <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono text-slate-700">
                                    {setting.preview || buildPreview(setting)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </SectionShell>
            {stockCheckModal}
        </>
    );
};

export default SalesSettings;
