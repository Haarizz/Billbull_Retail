import React from 'react';
import { AlertCircle } from 'lucide-react';

const StockCard = ({ loading, error, stockData, uom = 'BAG' }) => {
    // calculate total
    const totalStock = stockData?.locations?.reduce((acc, loc) => acc + (loc.available ?? loc.onHand ?? 0), 0) || 0;

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="mb-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Stock Available &mdash; {totalStock.toFixed(1)} {uom}
                </h3>
            </div>

            {/* Body */}
            <div>
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-100 rounded w-5/6"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center text-red-500 py-2">
                        <AlertCircle size={16} className="mr-2 opacity-80" />
                        <span className="text-xs font-medium">{error}</span>
                    </div>
                ) : !stockData?.locations?.length ? (
                    <div className="text-gray-400 py-2">
                        <span className="text-xs font-medium">No stock available across locations.</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {stockData.locations.map((loc, idx) => {
                            const qty = loc.available ?? loc.onHand ?? 0;
                            return (
                                <div key={loc.locationId ?? idx} className="flex justify-between items-center text-sm">
                                    <span className="font-semibold text-slate-700">
                                        {loc.name || 'Unknown Location'}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${qty > 100 ? 'bg-green-500' : qty > 0 ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                        <span className={`font-black ${qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {qty} {loc.uom || uom}
                                        </span>
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

export default StockCard;
