import React, { useEffect, useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';

const calculateRow = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.price) || 0;
    const discPercent = parseFloat(item.disc) || 0;
    const taxPercent = parseFloat(item.tax) || 0;
    const focQty = parseFloat(item.foc) || 0;

    const grossAmount = price * qty;

    let focDeduction = 0;
    if (focQty > 0 && item.focUnit && item.unitConversions) {
        const sellingUnit = item.unit;
        const focUnit = item.focUnit;
        if (sellingUnit === focUnit) {
            focDeduction = price * focQty;
        } else {
            const focConversion = item.unitConversions[focUnit] || 1;
            const sellingConversion = item.unitConversions[sellingUnit] || 1;
            const focInBaseUnit = focQty * focConversion;
            const focInSellingUnit = focInBaseUnit / sellingConversion;
            focDeduction = price * focInSellingUnit;
        }
    }

    const preDiscountAmount = Math.max(0, grossAmount - focDeduction);
    const discountAmount = preDiscountAmount * (discPercent / 100);
    const taxableAmount = preDiscountAmount - discountAmount;
    const taxAmount = taxableAmount * (taxPercent / 100);
    const total = taxableAmount + taxAmount;

    return {
        ...item,
        grossAmount,
        discountAmount,
        taxableAmount,
        taxAmt: taxAmount,
        total,
    };
};

const ItemAddOnsModal = ({ item, onClose, onSave, isReadOnly = false }) => {
    const [current, setCurrent] = useState(item ? calculateRow({ ...item }) : null);

    useEffect(() => {
        setCurrent(item ? calculateRow({ ...item }) : null);
    }, [item]);

    if (!item || !current) return null;

    const availableUnits = Array.isArray(current.availableUnits) && current.availableUnits.length > 0
        ? current.availableUnits
        : [current.unit || current.focUnit || 'PCS'];

    const handleChange = (field, value) => {
        if (isReadOnly) return;
        const stringFields = new Set(['focUnit', 'remarks', 'desc', 'code', 'barcode', 'unit']);
        const val = stringFields.has(field) ? value : Number(value);
        const updated = calculateRow({ ...current, [field]: val });
        setCurrent(updated);
    };

    const displayQty = current.qty ?? current.currentQty ?? current.orderedQty ?? 0;

    const grossProfit = (() => {
        const net = (current.qty || 0) * (current.price || 0) * (1 - (current.disc || 0) / 100);
        const cost = (current.cost || 0) * (current.qty || 0);
        return net > 0 ? (((net - cost) / net) * 100).toFixed(1) : 0;
    })();

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <SlidersHorizontal size={16} className="text-yellow-600" /> Item Add-Ons &amp; Details
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-4">Configure discounts, taxes, FOC items, and view detailed calculations</p>

                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-4">
                        <div className="font-bold text-slate-800 text-sm mb-1 leading-snug">
                            {current.desc || current.name || (current.code ? current.code : '-')}
                        </div>
                        {(current.desc || current.name) && current.code && (
                            <div className="text-[10px] font-mono text-slate-400 mb-1">{current.code}</div>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold italic tracking-tight mb-1">
                            <span className="font-mono text-[9px] tracking-[1.5px] font-bold text-slate-300">||||</span>
                            <span>{current.barcode || 'no barcode'}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Qty</span>
                                <span className="text-xs font-bold text-slate-700">{displayQty} {current.unit || ''}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Unit Price</span>
                                <span className="text-xs font-bold text-slate-700">AED {(current.price || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-slate-700">Discount</label>
                                <div className="flex bg-slate-100 rounded p-0.5">
                                    <button className="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-400 text-slate-900">%</button>
                                </div>
                            </div>
                            <input
                                type="number"
                                disabled={isReadOnly}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                                value={current.disc || ''}
                                onChange={(e) => handleChange('disc', e.target.value)}
                                placeholder="0"
                            />
                            <div className="text-[10px] text-slate-500 mt-1">Discount %: {(current.disc || 0).toFixed(2)}%</div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-emerald-600 mb-1">Free of Charge (FOC)</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">FOC Qty</label>
                                    <input
                                        type="number"
                                        disabled={isReadOnly}
                                        className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                                        value={current.foc || ''}
                                        onChange={(e) => handleChange('foc', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">FOC Unit</label>
                                    <select
                                        disabled={isReadOnly}
                                        className="w-full p-2 border border-slate-200 rounded text-sm appearance-none outline-none focus:border-yellow-400 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                                        value={current.focUnit || current.unit || 'PCS'}
                                        onChange={(e) => handleChange('focUnit', e.target.value)}
                                    >
                                        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Item Details / Remarks</label>
                            <textarea
                                rows="3"
                                disabled={isReadOnly}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors resize-none disabled:bg-slate-50 disabled:text-slate-500"
                                value={current.remarks || ''}
                                onChange={(e) => handleChange('remarks', e.target.value)}
                                placeholder="Add special item notes or delivery details"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Tax % (VAT)</label>
                            <input
                                type="number"
                                disabled={isReadOnly}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                                value={current.tax || ''}
                                onChange={(e) => handleChange('tax', e.target.value)}
                                placeholder="5"
                            />
                            <div className="text-[10px] text-slate-500 mt-1">Tax Amount: AED {(current.taxAmt || 0).toFixed(2)}</div>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm mt-4">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Calculation Breakdown</h4>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between text-slate-600">
                                    <span>Base Amount (Qty × Price)</span>
                                    <span>AED {(current.grossAmount ?? (current.qty || 0) * (current.price || 0)).toFixed(2)}</span>
                                </div>
                                {(current.foc > 0) && (
                                    <div className="flex justify-between text-emerald-600">
                                        <span>FOC Deduction ({current.foc} {current.focUnit || current.unit})</span>
                                        <span>- AED {((current.grossAmount ?? 0) - (current.taxableAmount ?? 0) - (current.discountAmount ?? 0)).toFixed(2)}</span>
                                    </div>
                                )}
                                {(current.disc > 0) && (
                                    <div className="flex justify-between text-red-500">
                                        <span>Discount ({current.disc}%)</span>
                                        <span>- AED {(current.discountAmount ?? 0).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-slate-600">
                                    <span>Taxable Amount</span>
                                    <span>AED {(current.taxableAmount ?? 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-600">
                                    <span>Tax ({current.tax || 0}%)</span>
                                    <span>+ AED {(current.taxAmt || current.taxAmount || 0).toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-200 my-2 w-full" />
                                <div className="flex justify-between font-bold text-yellow-600 text-sm">
                                    <span>Net Amount</span>
                                    <span>AED {(current.total ?? current.net ?? 0).toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-100 my-2 w-full" />
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>Cost Price</span>
                                    <span>AED {((current.cost || 0) * (current.qty || 0)).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>Gross Profit %</span>
                                    <span className={parseFloat(grossProfit) < 10 ? 'text-red-400' : 'text-emerald-500'}>
                                        {grossProfit}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        {isReadOnly ? 'Close' : 'Cancel'}
                    </button>
                    {!isReadOnly && (
                        <button
                            onClick={() => onSave(current)}
                            className="px-5 py-2 bg-yellow-400 text-slate-900 border border-yellow-500 text-xs font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm"
                        >
                            Save
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ItemAddOnsModal;
