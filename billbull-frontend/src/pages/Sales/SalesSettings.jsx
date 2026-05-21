import React, { useState, useEffect } from 'react';
import { Settings, Package, CreditCard, Save, CheckCircle, AlertTriangle, Ban, Info, Zap, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSalesSettings, saveSalesSettings } from '../../api/salesSettingsApi';

// ==========================================
// SALES SETTINGS PAGE
// ==========================================

const SalesSettings = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Settings state
    const [stockCheckRequired, setStockCheckRequired] = useState(false);
    const [creditLimitPolicy, setCreditLimitPolicy] = useState('NO_IMPACT');
    const [salesMode, setSalesMode] = useState('FAST_SALE');
    const [salesItemPricePolicy, setSalesItemPricePolicy] = useState('RETAIL');

    // Load settings on mount
    useEffect(() => {
        const load = async () => {
            try {
                const data = await getSalesSettings();
                setStockCheckRequired(data.stockCheckRequired ?? false);
                setCreditLimitPolicy(data.creditLimitPolicy ?? 'NO_IMPACT');
                setSalesMode(data.salesMode ?? 'WORKFLOW_DRIVEN');
                setSalesItemPricePolicy(data.salesItemPricePolicy ?? 'RETAIL');
            } catch (err) {
                console.error('Failed to load sales settings', err);
                toast.error('Failed to load settings');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveSalesSettings({
                stockCheckRequired,
                creditLimitPolicy,
                salesMode,
                salesItemPricePolicy,
            });
            toast.success('Sales settings saved successfully');
        } catch (err) {
            console.error('Failed to save settings', err);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    // Credit limit policy options
    const creditPolicies = [
        {
            value: 'NO_IMPACT',
            label: 'No Impact',
            description: 'No credit limit check is performed. Invoices can be posted freely regardless of outstanding balance.',
            icon: <Info size={18} className="text-slate-400" />,
            color: 'slate',
            activeClass: 'border-slate-400 bg-slate-50 ring-1 ring-slate-400',
            inactiveClass: 'border-slate-200 hover:border-slate-300',
        },
        {
            value: 'WARNING',
            label: 'Warning',
            description: 'Show a warning banner when the customer\'s outstanding balance exceeds their credit limit. The invoice can still be posted.',
            icon: <AlertTriangle size={18} className="text-amber-500" />,
            color: 'amber',
            activeClass: 'border-amber-400 bg-amber-50 ring-1 ring-amber-400',
            inactiveClass: 'border-slate-200 hover:border-amber-200',
        },
        {
            value: 'BLOCK',
            label: 'Block',
            description: 'Prevent posting the invoice when the customer\'s outstanding balance exceeds their credit limit. Payment must be collected first.',
            icon: <Ban size={18} className="text-red-500" />,
            color: 'red',
            activeClass: 'border-red-400 bg-red-50 ring-1 ring-red-400',
            inactiveClass: 'border-slate-200 hover:border-red-200',
        },
    ];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#F7F7FA] flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-3 border-[#F5C742] border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F7F7FA]">
            <style>{`
                .settings-page { font-family: 'Inter', sans-serif; }
                .toggle-track {
                    width: 48px; height: 26px; border-radius: 13px;
                    transition: background 0.25s; cursor: pointer;
                    display: flex; align-items: center; padding: 0 3px;
                    position: relative;
                }
                .toggle-thumb {
                    width: 20px; height: 20px; border-radius: 50%;
                    background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    transition: transform 0.25s;
                    position: absolute;
                }
            `}</style>

            <div className="settings-page max-w-3xl mx-auto px-6 py-8">

                {/* ---- PAGE HEADER ---- */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#F5C742] flex items-center justify-center shadow-sm">
                            <Settings size={20} className="text-[#1E1E1E]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Sales Settings</h1>
                            <p className="text-xs text-slate-500 mt-0.5">Configure rules that govern the sales module behaviour</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm"
                        style={{
                            background: isSaving ? '#d1d5db' : '#F5C742',
                            color: isSaving ? '#9ca3af' : '#1E1E1E',
                            cursor: isSaving ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isSaving ? (
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                            <Save size={16} />
                        )}
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>

                {/* ==============================
                    SECTION 1 — STOCK CHECK
                ============================== */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
                    {/* Section Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                <Package size={16} className="text-blue-500" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-800">Stock Check</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Control stock validation on invoice posting</p>
                            </div>
                        </div>
                        {/* Toggle */}
                        <button
                            onClick={() => setStockCheckRequired(v => !v)}
                            className="toggle-track focus:outline-none"
                            style={{ background: stockCheckRequired ? '#F5C742' : '#e2e8f0' }}
                            aria-label="Toggle stock check"
                        >
                            <div
                                className="toggle-thumb"
                                style={{ transform: stockCheckRequired ? 'translateX(22px)' : 'translateX(0px)' }}
                            />
                        </button>
                    </div>

                    {/* Setting Detail */}
                    <div className="px-6 py-5">
                        <div className="flex items-start gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-slate-700">
                                        Require Stock Check Before Posting
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stockCheckRequired ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {stockCheckRequired ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    When enabled, the system will verify that each item on a Sales Invoice has sufficient available
                                    warehouse stock before allowing the invoice to be posted. If any item is short, the post will
                                    be rejected with a clear error listing the affected items.
                                </p>
                                {stockCheckRequired && (
                                    <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                        <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-amber-700 leading-relaxed">
                                            <strong>Active:</strong> Invoices with insufficient stock will be blocked at posting.
                                            Ensure warehouse quantities are up to date before processing invoices.
                                        </p>
                                    </div>
                                )}
                                {!stockCheckRequired && (
                                    <div className="mt-3 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                                        <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-slate-500 leading-relaxed">
                                            <strong>Inactive:</strong> Invoices can be posted even if warehouse stock is zero or negative.
                                            Useful when stock is managed separately via Delivery Notes.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==============================
                    SECTION 2 — CREDIT LIMIT POLICY
                ============================== */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
                    {/* Section Header */}
                    <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                            <CreditCard size={16} className="text-purple-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">Credit Limit (Due) Policy</h2>
                            <p className="text-xs text-slate-400 mt-0.5">What happens when a customer's outstanding balance exceeds their credit limit</p>
                        </div>
                    </div>

                    {/* Policy Options */}
                    <div className="px-6 py-5 space-y-3">
                        {creditPolicies.map((policy) => {
                            const isSelected = creditLimitPolicy === policy.value;
                            return (
                                <button
                                    key={policy.value}
                                    onClick={() => setCreditLimitPolicy(policy.value)}
                                    className={`w-full text-left border-2 rounded-xl p-4 transition-all duration-200 ${isSelected ? policy.activeClass : policy.inactiveClass + ' bg-white'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Radio dot */}
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'border-current bg-current' : 'border-slate-300'}`}
                                            style={isSelected ? { borderColor: policy.color === 'slate' ? '#64748b' : policy.color === 'amber' ? '#f59e0b' : '#ef4444' } : {}}>
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                {policy.icon}
                                                <span className="text-sm font-bold text-slate-800">{policy.label}</span>
                                                {isSelected && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F5C742] text-[#1E1E1E] uppercase tracking-wider">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed">{policy.description}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Context note */}
                    <div className="px-6 pb-5">
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                            <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-blue-600 leading-relaxed">
                                The credit limit per customer is set on each Sales Invoice in the "Credit Limit" field.
                                The policy above controls the system-wide behaviour when that limit is breached.
                                Customers without a credit limit set (0 or blank) are always unaffected.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ==============================
                    SECTION 3 — SALES EXECUTION MODE
                ============================== */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
                    {/* Section Header */}
                    <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                            <Zap size={16} className="text-amber-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">Sales Execution Mode</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Control how invoices complete the delivery and stock deduction cycle</p>
                        </div>
                    </div>

                    {/* Mode Options */}
                    <div className="px-6 py-5 space-y-3">

                        {/* WORKFLOW_DRIVEN */}
                        <button
                            onClick={() => setSalesMode('WORKFLOW_DRIVEN')}
                            className={`w-full text-left border-2 rounded-xl p-4 transition-all duration-200 ${salesMode === 'WORKFLOW_DRIVEN' ? 'border-slate-400 bg-slate-50 ring-1 ring-slate-400' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${salesMode === 'WORKFLOW_DRIVEN' ? 'border-slate-500 bg-slate-500' : 'border-slate-300'}`}>
                                    {salesMode === 'WORKFLOW_DRIVEN' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-bold text-slate-800">Workflow Driven</span>
                                        {salesMode === 'WORKFLOW_DRIVEN' && (
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F5C742] text-[#1E1E1E] uppercase tracking-wider">Active</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Full pipeline with manual steps. Sales Invoices auto-generate Draft <strong>Picking Lists</strong>, and warehouse staff complete dispatch manually from the Picking and Delivery Note workflow. Stock is deducted and revenue is recognised only when the Delivery Note is marked Delivered.
                                    </p>
                                </div>
                            </div>
                        </button>

                        {/* FAST_SALE */}
                        <button
                            onClick={() => setSalesMode('FAST_SALE')}
                            className={`w-full text-left border-2 rounded-xl p-4 transition-all duration-200 ${salesMode === 'FAST_SALE' ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-slate-200 hover:border-amber-200 bg-white'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${salesMode === 'FAST_SALE' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
                                    {salesMode === 'FAST_SALE' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap size={14} className="text-amber-500" />
                                        <span className="text-sm font-bold text-slate-800">Fast Sale</span>
                                        {salesMode === 'FAST_SALE' && (
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F5C742] text-[#1E1E1E] uppercase tracking-wider">Active</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Instant sale mode. When a Sales Invoice is created and posted, the system automatically creates a <strong>Picking List</strong>, dispatches it, and marks it delivered in one atomic step — deducting stock and recognising revenue immediately.
                                    </p>
                                    {salesMode === 'FAST_SALE' && (
                                        <div className="mt-2 flex items-start gap-2 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                                            <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                                            <p className="text-[11px] text-amber-700 leading-relaxed">
                                                <strong>Active:</strong> Every new invoice will auto-generate a Picking note and auto-complete delivery on posting. Ensure each line item has a warehouse assigned and sufficient stock. Invoices with missing warehouses or insufficient stock will be blocked.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Context note */}
                    <div className="px-6 pb-5">
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                            <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-blue-600 leading-relaxed">
                                Fast Sale applies globally to all new invoices. Invoices linked to a pre-existing Delivery Note (Before-Sale flow) are not affected — their delivery lifecycle is always respected as-is.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ==============================
                    SECTION 4 — DEFAULT ITEM PRICE
                ============================== */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
                    <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Tag size={16} className="text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">Default Item Price</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Which price from the product master is auto-filled when adding items to a Quotation, Sales Order, or Sales Invoice
                            </p>
                        </div>
                    </div>

                    <div className="px-6 py-5 space-y-3">
                        {[
                            {
                                value: 'RETAIL',
                                label: 'Retail Price',
                                description: 'Use the product master’s Retail Price as the default line price. This is the system default.',
                                activeClass: 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400',
                                dotActive: 'border-emerald-500 bg-emerald-500'
                            },
                            {
                                value: 'MAX_SALE',
                                label: 'Maximum Sale Price',
                                description: 'Use the product master’s Maximum Sale Price (ceiling). Falls back to Retail Price if Max is not set on a particular product.',
                                activeClass: 'border-blue-400 bg-blue-50 ring-1 ring-blue-400',
                                dotActive: 'border-blue-500 bg-blue-500'
                            },
                            {
                                value: 'MIN_SALE',
                                label: 'Minimum Sale Price',
                                description: 'Use the product master’s Minimum Sale Price (floor). Falls back to Retail Price if Min is not set on a particular product.',
                                activeClass: 'border-amber-400 bg-amber-50 ring-1 ring-amber-400',
                                dotActive: 'border-amber-500 bg-amber-500'
                            }
                        ].map(option => {
                            const isSelected = salesItemPricePolicy === option.value;
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => setSalesItemPricePolicy(option.value)}
                                    className={`w-full text-left border-2 rounded-xl p-4 transition-all duration-200 ${isSelected ? option.activeClass : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? option.dotActive : 'border-slate-300'}`}>
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-slate-800">{option.label}</span>
                                                {isSelected && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F5C742] text-[#1E1E1E] uppercase tracking-wider">Active</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed">{option.description}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="px-6 pb-5">
                        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                Applies only to the <strong>default</strong> price filled in when an item is first added to a document. Users can still edit the price on each line as needed.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ---- BOTTOM SAVE ROW ---- */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm"
                        style={{
                            background: isSaving ? '#d1d5db' : '#F5C742',
                            color: isSaving ? '#9ca3af' : '#1E1E1E',
                            cursor: isSaving ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isSaving ? (
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                            <CheckCircle size={16} />
                        )}
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default SalesSettings;
