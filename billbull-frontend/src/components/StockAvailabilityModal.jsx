import React, { useState, useEffect, useRef } from 'react';
import { Box, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { getImageUrl } from '../utils/urlUtils';
import { getStockAvailability } from '../api/stockAvailabilityApi';

const StockAvailabilityModal = ({ isOpen, onClose, selectedStockItem }) => {
    const [locations, setLocations] = useState([]);
    const [incomingLpos, setIncomingLpos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !selectedStockItem?.code) {
            setLocations([]);
            setIncomingLpos([]);
            return;
        }

        const fetchStock = async () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            setIsLoading(true);
            try {
                const data = await getStockAvailability(selectedStockItem.code, abortControllerRef.current.signal);
                if (data) {
                    setLocations(data.locations || []);
                    setIncomingLpos(data.incomingLpos || []);
                }
            } catch (err) {
                console.error("Error fetching stock:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStock();

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [isOpen, selectedStockItem?.code]);

    if (!isOpen || !selectedStockItem) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-yellow-600 font-bold text-sm">
                        <Box size={18} /> Stock Availability & Incoming Orders
                    </div>
                    <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
                </div>
                <div className="p-6">
                    <p className="text-xs text-slate-500 mb-4">View stock across locations and reserve from incoming orders.</p>

                    <div className="flex items-start gap-4 mb-6">
                        {selectedStockItem.image ? (
                            <img src={getImageUrl(selectedStockItem.image)} alt={selectedStockItem.code} className="w-16 h-16 rounded border border-slate-200 object-cover" />
                        ) : (
                            <div className="w-16 h-16 rounded border border-slate-200 bg-slate-50 flex items-center justify-center">
                                <Box size={24} className="text-slate-300" />
                            </div>
                        )}
                        <div>
                            <div className="text-sm font-bold text-slate-800">Item Code: {selectedStockItem.code}</div>
                            <div className="text-xs text-slate-500">{selectedStockItem.name || selectedStockItem.desc}</div>
                        </div>
                    </div>

                    {/* Current Stock Table */}
                    <div className="mb-4">
                        <h4 className="text-xs font-bold text-yellow-600 flex items-center gap-1 mb-2">
                            <Box size={12} /> Current Stock by Location
                        </h4>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="p-2">Location</th>
                                        <th className="p-2">Type</th>
                                        <th className="p-2 text-right">On Hand</th>
                                        <th className="p-2 text-right text-orange-600">Reserved</th>
                                        <th className="p-2 text-right text-emerald-600">Available</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        [1, 2, 3].map((i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="p-2"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                                <td className="p-2"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                                                <td className="p-2"><div className="h-4 bg-slate-200 rounded w-10 ml-auto"></div></td>
                                                <td className="p-2"><div className="h-4 bg-slate-200 rounded w-10 ml-auto"></div></td>
                                                <td className="p-2"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                            </tr>
                                        ))
                                    ) : locations.length === 0 ? (
                                        <tr>
                                            <td className="p-4 text-center text-slate-400 font-medium" colSpan="5">No stock available across locations for this item.</td>
                                        </tr>
                                    ) : (
                                        <>
                                            {locations.map((loc, idx) => (
                                                <tr key={idx}>
                                                    <td className="p-2 font-medium text-slate-700">{loc.name}</td>
                                                    <td className="p-2 text-slate-500 text-[10px] uppercase font-bold tracking-wider">{loc.type}</td>
                                                    <td className="p-2 text-right">{loc.onHand}</td>
                                                    <td className="p-2 text-right text-orange-600">{loc.reserved}</td>
                                                    <td className="p-2 text-right font-bold text-emerald-600">{loc.available}</td>
                                                </tr>
                                            ))}
                                            {/* Total Row */}
                                            <tr className="bg-slate-50 font-bold">
                                                <td className="p-2" colSpan="2">Total</td>
                                                <td className="p-2 text-right">{locations.reduce((a, b) => a + (b.onHand || 0), 0)}</td>
                                                <td className="p-2 text-right text-orange-600">{locations.reduce((a, b) => a + (b.reserved || 0), 0)}</td>
                                                <td className="p-2 text-right text-emerald-600">{locations.reduce((a, b) => a + (b.available || 0), 0)}</td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Incoming Stock */}
                    <div>
                        <h4 className="text-xs font-bold text-yellow-600 flex items-center gap-1 mb-2">
                            <RotateCcw size={12} /> Incoming Stock (LPOs)
                        </h4>
                        <div className="border border-slate-200/50 rounded-lg overflow-hidden bg-slate-50">
                            {isLoading ? (
                                <div className="p-4 flex flex-col gap-2">
                                    <div className="h-4 bg-slate-200 rounded w-full animate-pulse"></div>
                                    <div className="h-4 bg-slate-200 rounded w-2/3 animate-pulse"></div>
                                </div>
                            ) : incomingLpos.length === 0 ? (
                                <div className="p-4 text-center text-xs text-blue-500 font-medium">
                                    No incoming purchase orders for this item.
                                </div>
                            ) : (
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-white text-slate-500 font-semibold border-b border-slate-200/50">
                                        <tr>
                                            <th className="p-2">LPO Number</th>
                                            <th className="p-2">Supplier</th>
                                            <th className="p-2">Exp. Date</th>
                                            <th className="p-2 text-right">Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50 text-slate-700">
                                        {incomingLpos.map((lpo, idx) => (
                                            <tr key={idx}>
                                                <td className="p-2 font-bold text-blue-600">{lpo.lpoNumber}</td>
                                                <td className="p-2">{lpo.supplierName}</td>
                                                <td className="p-2 text-slate-500">{lpo.expectedDate ? new Date(lpo.expectedDate).toLocaleDateString() : 'TBD'}</td>
                                                <td className="p-2 text-right font-bold text-emerald-600">+{lpo.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 p-2 bg-orange-50 border border-orange-100 rounded flex items-start gap-2">
                        <AlertTriangle size={14} className="text-orange-400 mt-0.5 shrink-0" />
                        <span className="text-[10px] text-orange-700 leading-tight">Stock reservations will be created when the order is confirmed. Reserved stock is automatically released if the order expires or is cancelled.</span>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:bg-slate-50">Close</button>
                </div>
            </div>
        </div>
    );
};

export default StockAvailabilityModal;
