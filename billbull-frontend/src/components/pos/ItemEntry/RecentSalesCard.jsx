import React from 'react';
import { AlertCircle, ArrowRightCircle } from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';

const RecentSalesCard = ({ loading, error, recentSales, selectedIndex = -1, onSelectPrice, currency = 'AED' }) => {
    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="mb-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Recent Selling Prices (Other Customers)
                </h3>
            </div>

            {/* Body */}
            <div>
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-gray-100 rounded w-full"></div>
                        <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-100 rounded w-5/6"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center text-red-500 py-2">
                        <AlertCircle size={16} className="mr-2 opacity-80" />
                        <span className="text-xs font-medium">{error}</span>
                    </div>
                ) : !recentSales?.length ? (
                    <div className="text-gray-400 py-2">
                        <span className="text-xs font-medium">No recent sales found for this item.</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recentSales.map((sale, idx) => {
                            const isActive = idx === selectedIndex;
                            return (
                                <div
                                    key={idx}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onSelectPrice && onSelectPrice(idx, sale.price)}
                                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelectPrice) onSelectPrice(idx, sale.price); }}
                                    className={`flex justify-between items-center text-sm p-3 rounded-xl transition-colors cursor-pointer group ${
                                        isActive
                                            ? 'border-2 border-amber-400 bg-amber-50'
                                            : 'border-2 border-transparent hover:border-gray-100 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-semibold text-slate-700 text-xs truncate max-w-[150px]">
                                            {sale.customerName || 'Walk-in Customer'}
                                        </span>
                                        <span className="text-[10px] font-medium text-gray-400">
                                            {sale.date ? formatDisplayDate(sale.date) : 'Recent'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <CurrencyAmount value={sale.price} currency={currency} className={`font-black text-sm ${isActive ? 'text-amber-700' : 'text-slate-700'}`} />
                                        <ArrowRightCircle size={16} className={`text-amber-400 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecentSalesCard;
