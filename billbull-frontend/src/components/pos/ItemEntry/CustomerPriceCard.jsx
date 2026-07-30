import React from 'react';
import { AlertCircle } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';

const CustomerPriceCard = ({ loading, error, customerPrices, customerName, selectedIndex = -1, onSelectPrice, currency = 'AED' }) => {
    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="mb-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Previous Price &mdash; {customerName || 'Walk-in Customer'}
                </h3>
            </div>

            {/* Body */}
            <div>
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-gray-100 rounded w-full"></div>
                        <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center text-red-500 py-2">
                        <AlertCircle size={16} className="mr-2 opacity-80" />
                        <span className="text-xs font-medium">{error}</span>
                    </div>
                ) : !customerPrices?.length ? (
                    <div className="text-gray-400 py-2">
                        <span className="text-xs font-medium">No previous sales found for this customer.</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {customerPrices.map((history, idx) => {
                            const isActive = idx === selectedIndex;
                            return (
                                <div
                                    key={idx}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onSelectPrice && onSelectPrice(idx, history.price)}
                                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectPrice) onSelectPrice(idx, history.price); }}
                                    className={`flex justify-between items-center text-sm p-3 rounded-xl transition-colors cursor-pointer ${
                                        isActive
                                            ? 'border-2 border-amber-400 bg-amber-50'
                                            : 'border-2 border-transparent hover:border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-medium ${isActive ? 'text-amber-700/70' : 'text-gray-400'}`}>
                                            {history.date ? formatDisplayDate(history.date) : 'Recent'}
                                        </span>
                                        <span className={`text-xs font-semibold ${isActive ? 'text-amber-800' : 'text-gray-500'}`}>
                                            Qty: {history.quantity} BAG
                                        </span>
                                    </div>
                                    <CurrencyAmount
                                        value={history.price}
                                        currency={currency}
                                        className={`font-black text-sm ${isActive ? 'text-amber-700' : 'text-slate-700'}`}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomerPriceCard;
