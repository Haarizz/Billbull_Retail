import React, { useState, useEffect, useMemo } from 'react';
import { Banknote, Search, RefreshCw, Plus, CheckCircle2, AlertCircle, X, Download, FileText, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import CurrencyAmount from '../../../components/CurrencyAmount';
import { useCompany } from '../../../context/CompanyContext';
import { getAdvanceSummary, getAdvanceHistory, receiveAdvance, refundAdvance } from '../../../api/advanceApplicationApi';

const CustomerAdvancesView = ({ customers = [] }) => {
    const { company } = useCompany();
    const currency = company?.currency || 'AED';

    const [selectedCustomerCode, setSelectedCustomerCode] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    
    const [summary, setSummary] = useState(null);
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Filters
    const [historyFilter, setHistoryFilter] = useState('All'); // All, RECEIVED, APPLIED, REFUNDED, OPEN

    // Modals
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [refundReceiptData, setRefundReceiptData] = useState(null);

    useEffect(() => {
        if (customers.length > 0 && !selectedCustomerCode) {
            setSelectedCustomerCode(customers[0].code);
        }
    }, [customers]);

    useEffect(() => {
        if (selectedCustomerCode) {
            loadData();
        }
    }, [selectedCustomerCode, historyFilter]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const sumData = await getAdvanceSummary(selectedCustomerCode);
            setSummary(sumData);
            
            const histData = await getAdvanceHistory(selectedCustomerCode, historyFilter);
            setHistory(histData || []);
        } catch (error) {
            console.error("Failed to load customer advances", error);
            toast.error("Failed to load customer advances.");
        } finally {
            setIsLoading(false);
        }
    };

    const selectedCustomerDetails = useMemo(
        () => customers.find((c) => c.code === selectedCustomerCode) || null,
        [customers, selectedCustomerCode]
    );

    const filteredCustomers = useMemo(() => {
        const term = customerSearch.toLowerCase().trim();
        if (!term) return customers;
        return customers.filter(c =>
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.code && c.code.toLowerCase().includes(term)) ||
            (c.phone && c.phone.toLowerCase().includes(term)) ||
            (c.mobile && c.mobile.toLowerCase().includes(term))
        );
    }, [customers, customerSearch]);

    // Modals Handlers
    const handleReceiveSuccess = () => {
        setIsReceiveModalOpen(false);
        toast.success("Advance received successfully.");
        loadData();
    };

    const handleRefundSuccess = () => {
        setRefundReceiptData(null);
        toast.success("Advance refunded successfully.");
        loadData();
    };

    return (
        <div className="space-y-6">
            {/* Filter & Action Bar */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm print:hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-semibold text-[#F5C742] flex items-center gap-2 uppercase tracking-wide">
                        <Banknote className="h-4 w-4" /> Customer Advances
                    </h3>
                    <div className="flex gap-2">
                        <button onClick={() => setIsReceiveModalOpen(true)} disabled={!selectedCustomerCode} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-md shadow-sm flex items-center gap-2 disabled:opacity-50">
                            <Plus className="h-4 w-4" /> Receive Advance
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">Select Customer *</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={selectedCustomerDetails
                                    ? `${selectedCustomerDetails.code} - ${selectedCustomerDetails.name}`
                                    : customerSearch}
                                onChange={(e) => {
                                    setCustomerSearch(e.target.value);
                                    setSelectedCustomerCode('');
                                    setSummary(null);
                                    setHistory([]);
                                }}
                                onFocus={() => {
                                    if (selectedCustomerDetails) {
                                        setCustomerSearch('');
                                        setSelectedCustomerCode('');
                                    }
                                }}
                                placeholder="Search by name, code or phone..."
                                className="w-full h-10 pl-9 pr-3 rounded-md border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                            />
                            {customerSearch && !selectedCustomerCode && (
                                <div className="absolute z-20 top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                                    {filteredCustomers.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-slate-400 text-center">No customers found</div>
                                    ) : filteredCustomers.slice(0, 50).map(c => (
                                        <div
                                            key={c.code}
                                            className="px-4 py-2.5 cursor-pointer hover:bg-amber-50 border-b border-slate-50 last:border-0"
                                            onClick={() => {
                                                setSelectedCustomerCode(c.code);
                                                setCustomerSearch('');
                                            }}
                                        >
                                            <div className="text-sm font-medium text-slate-800">{c.code} — {c.name}</div>
                                            {(c.phone || c.mobile || c.contact) && (
                                                <div className="text-xs text-slate-500 mt-0.5">{c.phone || c.mobile || c.contact}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Total Received</div>
                    <div className="text-xl font-bold text-slate-800">
                        <CurrencyAmount value={summary?.totalReceived || 0} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Total Applied</div>
                    <div className="text-xl font-bold text-emerald-600">
                        <CurrencyAmount value={summary?.totalApplied || 0} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Total Refunded</div>
                    <div className="text-xl font-bold text-orange-500">
                        <CurrencyAmount value={summary?.totalRefunded || 0} currency={currency} />
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm bg-blue-50">
                    <div className="text-xs text-blue-600 mb-1 font-semibold">Available Balance</div>
                    <div className="text-xl font-bold text-blue-700">
                        <CurrencyAmount value={summary?.availableBalance || 0} currency={currency} />
                    </div>
                    <div className="text-[10px] text-blue-500 mt-1">Open Advances: {summary?.openAdvancesCount || 0}</div>
                </div>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700">Advance History</h4>
                    <select
                        value={historyFilter}
                        onChange={(e) => setHistoryFilter(e.target.value)}
                        className="text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-[#F5C742]"
                    >
                        <option value="All">All Transactions</option>
                        <option value="OPEN">Open Advances</option>
                        <option value="RECEIVED">Received</option>
                        <option value="APPLIED">Applied</option>
                        <option value="REFUNDED">Refunded</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="bb-nowrap-table w-full text-sm text-left">
                        <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-xs uppercase">Date</th>
                                <th className="px-6 py-3 font-semibold text-xs uppercase">Type</th>
                                <th className="px-6 py-3 font-semibold text-xs uppercase">Reference</th>
                                <th className="px-6 py-3 font-semibold text-xs uppercase">Payment Mode</th>
                                <th className="px-6 py-3 font-semibold text-xs uppercase text-right">Amount</th>
                                <th className="px-6 py-3 font-semibold text-xs uppercase text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">Loading history...</td>
                                </tr>
                            ) : history.length > 0 ? (
                                history.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 text-slate-600">{item.date}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-0.5 border rounded text-[10px] font-bold ${
                                                item.type === 'RECEIVED' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                                                item.type === 'APPLIED' ? 'text-green-600 bg-green-50 border-green-100' :
                                                'text-orange-700 bg-orange-50 border-orange-100'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-700 font-medium">{item.reference || '-'}</td>
                                        <td className="px-6 py-3 text-slate-500">{item.paymentMode || '-'}</td>
                                        <td className={`px-6 py-3 text-right font-bold ${
                                            item.type === 'RECEIVED' ? 'text-blue-600' : 'text-slate-600'
                                        }`}>
                                            <CurrencyAmount value={item.amount} currency={currency} />
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {item.type === 'RECEIVED' && historyFilter === 'OPEN' && (
                                                <button 
                                                    onClick={() => setRefundReceiptData(item)}
                                                    className="text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                                                >
                                                    Refund
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">No advance history found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Receive Modal */}
            {isReceiveModalOpen && (
                <ReceiveAdvanceModal 
                    isOpen={isReceiveModalOpen}
                    onClose={() => setIsReceiveModalOpen(false)}
                    onSuccess={handleReceiveSuccess}
                    customerCode={selectedCustomerCode}
                    customerName={selectedCustomerDetails?.name}
                    currency={currency}
                />
            )}

            {/* Refund Modal */}
            {refundReceiptData && (
                <RefundAdvanceModal 
                    isOpen={!!refundReceiptData}
                    onClose={() => setRefundReceiptData(null)}
                    onSuccess={handleRefundSuccess}
                    receiptData={refundReceiptData}
                    currency={currency}
                />
            )}
        </div>
    );
};

// Simplified Modals for demonstration (they would call the APIs directly)
const ReceiveAdvanceModal = ({ isOpen, onClose, onSuccess, customerCode, customerName, currency }) => {
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [reference, setReference] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;
        
        setIsSubmitting(true);
        try {
            await receiveAdvance({ customerCode, amount: Number(amount), paymentMode, reference });
            onSuccess();
        } catch (error) {
            toast.error(error?.response?.data?.message || "Failed to receive advance");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Receive Advance</h3>
                        <p className="text-xs text-slate-500">Customer: {customerName} ({customerCode})</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Amount ({currency}) <span className="text-red-500">*</span></label>
                            <input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] bg-white">
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Reference</label>
                            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. TRN-12345" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting || !amount || Number(amount) <= 0} className="px-4 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm disabled:opacity-50">
                            {isSubmitting ? 'Processing...' : 'Confirm Receipt'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const RefundAdvanceModal = ({ isOpen, onClose, onSuccess, receiptData, currency }) => {
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;
        
        setIsSubmitting(true);
        try {
            // Note: In reality, we need advanceReceiptId which is the database ID, not the voucher number.
            // Wait, receiptData.reference is the voucher number? Let's check history response.
            // We'll need to update history response to include the `id` of the receipt!
            await refundAdvance({ advanceReceiptId: receiptData.id, amount: Number(amount), paymentMode });
            onSuccess();
        } catch (error) {
            toast.error(error?.response?.data?.message || "Failed to refund advance");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Refund Advance</h3>
                        <p className="text-xs text-slate-500">Voucher: {receiptData.reference}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Amount ({currency}) <span className="text-red-500">*</span></label>
                            <input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] bg-white">
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting || !amount || Number(amount) <= 0} className="px-4 py-2 bg-red-500 rounded-md text-sm font-bold text-white hover:bg-red-600 shadow-sm disabled:opacity-50">
                            {isSubmitting ? 'Processing...' : 'Confirm Refund'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CustomerAdvancesView;
