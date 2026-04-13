import React, { useState } from 'react';
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

/**
 * ItemAddOnsModal — shared component for editing line-item discounts, FOC, tax.
 *
 * Props:
 *   item       — the item object to edit (must have id, desc/name, code, qty, unit, price, disc, foc, focUnit, tax, taxAmt, total, cost, availableUnits)
 *   onClose    — called when the modal is dismissed without saving
 *   onSave(updatedItem) — called with the updated item when "Save" is clicked
 */
const ItemAddOnsModal = ({ item, onClose, onSave }) => {
    const [current, setCurrent] = useState(() => ({ ...item }));

    if (!item) return null;

    const handleChange = (field, value) => {
        const val = field === 'focUnit' ? value : Number(value);
        const updated = calculateRow({ ...current, [field]: val });
        setCurrent(updated);
    };

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
                        <div className="font-bold text-slate-800 text-sm mb-1">{current.desc || current.name || 'Unknown Item'}</div>
                        <div className="text-xs text-slate-500">Code: {current.code}</div>
                        <div className="text-xs text-slate-500">Qty: {current.qty} {current.unit}</div>
                    </div>

                    <div className="space-y-4">
                        {/* Discount */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-slate-700">Discount</label>
                                <div className="flex bg-slate-100 rounded p-0.5">
                                    <button className="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-400 text-slate-900">%</button>
                                </div>
                            </div>
                            <input
                                type="number"
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                                value={current.disc || ''}
                                onChange={(e) => handleChange('disc', e.target.value)}
                                placeholder="0"
                            />
                            <div className="text-[10px] text-slate-500 mt-1">Discount %: {(current.disc || 0).toFixed(2)}%</div>
                        </div>

                        {/* Free of Charge */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1 text-emerald-600">Free of Charge (FOC)</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">FOC Qty</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                                        value={current.foc || ''}
                                        onChange={(e) => handleChange('foc', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">FOC Unit</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 rounded text-sm appearance-none outline-none focus:border-yellow-400 bg-white"
                                        value={current.focUnit || 'PCS'}
                                        onChange={(e) => handleChange('focUnit', e.target.value)}
                                    >
                                        {(current.availableUnits || ['PCS']).map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Tax */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Tax % (VAT)</label>
                            <input
                                type="number"
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-yellow-400 outline-none transition-colors"
                                value={current.tax || ''}
                                onChange={(e) => handleChange('tax', e.target.value)}
                                placeholder="5"
                            />
                            <div className="text-[10px] text-slate-500 mt-1">Tax Amount: AED {(current.taxAmt || 0).toFixed(2)}</div>
                        </div>

                        {/* Calculation Breakdown */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm mt-4">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Calculation Breakdown</h4>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between text-slate-600">
                                    <span>Base Amount</span>
                                    <span>AED {((current.qty || 0) * (current.price || 0)).toFixed(2)}</span>
                                </div>
                                {(current.disc > 0) && (
                                    <div className="flex justify-between text-red-500">
                                        <span>Discount ({current.disc}%)</span>
                                        <span>- AED {(((current.qty || 0) * (current.price || 0)) * (current.disc / 100)).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-slate-600">
                                    <span>After Discount (Gross)</span>
                                    <span>AED {(((current.qty || 0) * (current.price || 0)) * (1 - (current.disc || 0) / 100)).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-600">
                                    <span>Tax ({(current.tax || 0)}%)</span>
                                    <span>+ AED {(current.taxAmt || 0).toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-200 my-2 w-full" />
                                <div className="flex justify-between font-bold text-yellow-600 text-sm">
                                    <span>Net Amount</span>
                                    <span>AED {(current.total || 0).toFixed(2)}</span>
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
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(current)}
                        className="px-5 py-2 bg-yellow-400 text-slate-900 border border-yellow-500 text-xs font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ItemAddOnsModal;
