import React, { useId, useState } from 'react';
import { Minus, Plus, PlusCircle, Check } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';

const EntryForm = ({
    price,
    quantity,
    discount,
    taxRate,
    netTotal,
    currency = 'AED',
    onChangePrice,
    onChangeQuantity,
    onChangeDiscount,
    isReadOnly = false,
    errors = {},
    onCancel,
    onConfirm,
    mode,
    uom = 'BAG'
}) => {
    const priceId = useId();
    const qtyId = useId();
    const discId = useId();
    const [discountMode, setDiscountMode] = useState('percent'); // 'percent' | 'amount'

    const handleQtyChange = (delta) => {
        if (isReadOnly) return;
        const current = parseFloat(quantity) || 0;
        const next = Math.max(0, current + delta);
        onChangeQuantity?.(next);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 space-y-6">
                {/* Price per UOM */}
                <div>
                    <label htmlFor={priceId} className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                        PRICE PER {uom} ({currency})
                    </label>
                    <div className="relative">
                        <input
                            id={priceId}
                            type="number"
                            min="0"
                            step="any"
                            value={price === 0 && !isReadOnly ? '' : price}
                            onChange={(e) => onChangePrice?.(e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full px-4 py-3 text-2xl font-black text-slate-800 border-2 rounded-xl focus:outline-none transition-colors text-center ${
                                errors.price 
                                    ? 'border-red-400 bg-red-50 focus:border-red-500' 
                                    : 'border-amber-200 focus:border-amber-400 bg-white'
                            } ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-50 border-gray-200' : ''}`}
                            placeholder="0.00"
                        />
                        {/* Fake Up/Down arrows to match Figma design (cosmetic) */}
                        {!isReadOnly && (
                            <div className="absolute inset-y-0 right-2 flex flex-col items-center justify-center pointer-events-none text-gray-300 gap-1">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0L5 0Z"/></svg>
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10L5 6Z"/></svg>
                            </div>
                        )}
                    </div>
                    {errors.price && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.price}</p>}
                </div>

                {/* Quantity */}
                <div>
                    <label htmlFor={qtyId} className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                        QUANTITY ({uom})
                    </label>
                    <div className="flex items-center gap-3">
                        <button 
                            type="button" 
                            onClick={() => handleQtyChange(-1)}
                            disabled={isReadOnly}
                            className="w-12 h-12 rounded-xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50 shrink-0"
                        >
                            <Minus size={18} strokeWidth={3} />
                        </button>
                        <input
                            id={qtyId}
                            type="number"
                            min="0.001"
                            step="any"
                            value={quantity}
                            onChange={(e) => onChangeQuantity?.(e.target.value)}
                            disabled={isReadOnly}
                            className={`flex-1 w-full px-4 py-3 text-xl font-bold text-slate-800 border-2 rounded-xl focus:outline-none transition-colors text-center ${
                                errors.quantity 
                                    ? 'border-red-400 focus:border-red-500' 
                                    : 'border-gray-100 focus:border-amber-400 bg-white'
                            } ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-50' : ''}`}
                            placeholder="1"
                        />
                        <button 
                            type="button" 
                            onClick={() => handleQtyChange(1)}
                            disabled={isReadOnly}
                            className="w-12 h-12 rounded-xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50 shrink-0"
                        >
                            <Plus size={18} strokeWidth={3} />
                        </button>
                    </div>
                    {errors.quantity && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.quantity}</p>}
                </div>

                {/* Discount */}
                <div>
                    <label htmlFor={discId} className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                        DISCOUNT (OPTIONAL)
                    </label>
                    <div className="flex bg-gray-50 rounded-lg p-1 mb-3">
                        <button 
                            type="button"
                            onClick={() => setDiscountMode('percent')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${discountMode === 'percent' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            % Percent
                        </button>
                        <button 
                            type="button"
                            onClick={() => setDiscountMode('amount')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${discountMode === 'amount' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            {currency} Amount
                        </button>
                    </div>
                    <div className="relative">
                        <input
                            id={discId}
                            type="number"
                            min="0"
                            step="any"
                            value={discount === 0 && !isReadOnly ? '' : discount}
                            onChange={(e) => onChangeDiscount?.(e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full pl-4 pr-10 py-3 text-lg font-bold text-slate-800 border-2 rounded-xl focus:outline-none transition-colors text-center ${
                                errors.discount 
                                    ? 'border-red-400 focus:border-red-500' 
                                    : 'border-gray-100 focus:border-amber-400 bg-white'
                            } ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-50' : ''}`}
                            placeholder="0"
                        />
                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                            <span className="text-gray-400 font-bold">{discountMode === 'percent' ? '%' : currency}</span>
                        </div>
                    </div>
                    {errors.discount && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.discount}</p>}
                </div>

                {/* Line Total */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        LINE TOTAL
                    </span>
                    <CurrencyAmount value={netTotal || 0} currency={currency} className="text-2xl font-black text-slate-800 tracking-tight" />
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-8 pt-4">
                <button 
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-3.5 px-4 text-sm font-bold text-gray-500 bg-white border-2 border-gray-100 rounded-xl hover:bg-gray-50 hover:text-gray-700 transition-colors focus:outline-none"
                >
                    Cancel
                </button>
                {!isReadOnly && (
                    <button 
                        type="button"
                        onClick={onConfirm}
                        className="flex-[2] py-3.5 px-4 text-sm font-bold text-[#1A2332] bg-[#F5C742] border-2 border-[#F5C742] rounded-xl hover:bg-[#E5B532] hover:border-[#E5B532] transition-colors flex items-center justify-center gap-2 focus:outline-none"
                    >
                        {mode === 'edit' ? (
                            <>
                                <Check size={18} strokeWidth={2.5} />
                                Save Changes
                            </>
                        ) : (
                            <>
                                <PlusCircle size={18} strokeWidth={2.5} />
                                Add to Invoice
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default EntryForm;
