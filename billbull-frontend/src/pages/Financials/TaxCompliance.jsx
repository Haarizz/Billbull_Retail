import React, { useState, useEffect, useMemo } from 'react';
import {
    FileText, Settings, PieChart, FileCheck, // Tab Icons
    Plus, History, DollarSign, AlertCircle, Bell, CheckCircle, // KPI & Action Icons
    Edit, Trash2, Search, Download, Upload, ExternalLink, ChevronDown, File, X, CloudUpload, Eye
} from 'lucide-react';
import {
    getTaxConfigs,
    createTaxConfig,
    updateTaxConfig,
    deleteTaxConfig,
    getTaxFilings,
    updateTaxFiling,
    uploadTaxDocument,
    deleteTaxDocument,
    downloadTaxDocument
} from '../../api/taxApi';
import toast from 'react-hot-toast'; // Assuming toast is available, otherwise alert fallback

export default function TaxCompliance() {
    // --- 1. State Management ---

    // Default active tab
    const [activeTab, setActiveTab] = useState('overview');

    // Search State
    const [searchQuery, setSearchQuery] = useState('');

    // Modal Visibility States
    const [isAddTaxModalOpen, setIsAddTaxModalOpen] = useState(false);
    const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);

    // Mode States
    const [isEditConfigMode, setIsEditConfigMode] = useState(false);

    // --- 2. Data Management ---

    const [taxConfigs, setTaxConfigs] = useState([]);
    const [filingsData, setFilingsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    // --- 3. API Fetching ---

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            setFetchError(null);
            const [configs, filings] = await Promise.all([
                getTaxConfigs(),
                getTaxFilings()
            ]);
            setTaxConfigs(configs);
            setFilingsData(filings);
        } catch (error) {
            console.error("Failed to fetch tax data:", error);
            const msg = error?.response?.status === 403
                ? "You don't have permission to view tax data. Contact your administrator."
                : (error?.response?.data?.message || error?.message || "Failed to load tax data");
            setFetchError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // --- 4. Dynamic KPI Calculations ---
    const kpiData = useMemo(() => {
        let pending = 0;
        let overdueCount = 0;
        let filedThisMonthCount = 0;
        let dueThisWeekCount = 0;

        const now = new Date();
        const sevenDaysLater = new Date(now);
        sevenDaysLater.setDate(now.getDate() + 7);
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        filingsData.forEach(f => {
            if (f.status === 'Pending' || f.status === 'Overdue') {
                pending += Number(f.amount || 0);
            }
            if (f.status === 'Overdue') {
                overdueCount++;
            }

            // Filed this month — check filedDate against current month
            if (f.status === 'Filed' && f.filedDate) {
                try {
                    const filed = new Date(f.filedDate);
                    if (filed.getMonth() === currentMonth && filed.getFullYear() === currentYear) {
                        filedThisMonthCount++;
                    }
                } catch (e) { /* ignore unparseable dates */ }
            }

            // Due in next 7 days — skip TBD or blank
            if (f.status !== 'Filed' && f.dueDate && f.dueDate !== 'TBD') {
                try {
                    const due = new Date(f.dueDate);
                    if (!isNaN(due.getTime()) && due >= now && due <= sevenDaysLater) {
                        dueThisWeekCount++;
                    }
                } catch (e) { /* ignore unparseable dates */ }
            }
        });

        return {
            pendingAmount: pending.toLocaleString(),
            overdue: overdueCount,
            filedThisMonth: filedThisMonthCount,
            dueThisWeek: dueThisWeekCount
        };
    }, [filingsData]);

    // --- 5. Forms State ---

    const [configForm, setConfigForm] = useState({
        id: null,
        type: '',
        frequency: '',
        rate: '',
        accounts: '',
        status: 'Active'
    });

    const [filingForm, setFilingForm] = useState({
        id: null,
        type: '',
        period: '',
        amount: '',
        status: 'Pending',
        notes: '',
        documents: 0
    });

    // --- 6. Helper Functions ---

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Filed': return <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded border border-green-200 uppercase">Filed</span>;
            case 'Pending': return <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200 uppercase">Pending</span>;
            case 'Overdue': return <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200 uppercase">Overdue</span>;
            default: return null;
        }
    };

    // --- 7. Handlers ---

    // Configuration Handlers
    const handleOpenAddConfig = () => {
        setIsEditConfigMode(false);
        setConfigForm({ id: null, type: '', frequency: '', rate: '', accounts: '', status: 'Active' });
        setIsAddTaxModalOpen(true);
    };

    const handleOpenEditConfig = (config) => {
        setIsEditConfigMode(true);
        setConfigForm({
            id: config.id,
            type: config.type,
            frequency: config.frequency,
            rate: config.rate,
            accounts: config.accounts ? config.accounts.join(', ') : '',
            status: config.status
        });
        setIsAddTaxModalOpen(true);
    };

    const handleDeleteConfig = async (id) => {
        if (window.confirm("Are you sure you want to delete this tax configuration? This will also delete all associated filings.")) {
            try {
                setLoading(true);
                await deleteTaxConfig(id);
                // Refresh data
                await fetchDashboardData();
            } catch (error) {
                console.error("Error deleting config:", error);
                alert("Failed to delete configuration");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Convert comma-separated string to array for backend
        const accountList = configForm.accounts.split(',').map(s => s.trim()).filter(s => s);

        const payload = {
            type: configForm.type,
            frequency: configForm.frequency,
            rate: configForm.rate,
            accounts: accountList,
            status: configForm.status
        };

        try {
            if (isEditConfigMode) {
                await updateTaxConfig(configForm.id, payload);
            } else {
                await createTaxConfig(payload);
            }
            setIsAddTaxModalOpen(false);
            await fetchDashboardData();
        } catch (error) {
            console.error("Error saving config:", error);
            alert("Failed to save configuration");
        } finally {
            setLoading(false);
        }
    };

    // Filing Handlers
    // Convert "dd MMM yyyy" (backend format) → "yyyy-MM-dd" (HTML date input format)
    const toInputDate = (dateStr) => {
        if (!dateStr || dateStr === 'TBD') return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        } catch (e) { return ''; }
    };

    // Convert "yyyy-MM-dd" (HTML date input) → "dd MMM yyyy" (backend format)
    const fromInputDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return dateStr; }
    };

    const handleOpenFilingModal = (filingId, viewOnly = false) => {
        const filing = filingsData.find(f => f.id === filingId);
        if (!filing) return;

        setFilingForm({
            id: filing.id,
            type: filing.type,
            period: filing.period,
            dueDate: toInputDate(filing.dueDate),
            dueDateDisplay: filing.dueDate || '',
            amount: filing.amount === 0 ? '' : filing.amount,
            status: filing.status,
            notes: filing.notes || '',
            documents: filing.documents,
            attachmentName: filing.attachmentName,
            isViewOnly: viewOnly
        });
        setIsFilingModalOpen(true);
    };

    const handleSaveFiling = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            amount: parseFloat(filingForm.amount) || 0,
            dueDate: filingForm.dueDate ? fromInputDate(filingForm.dueDate) : null,
            status: filingForm.status,
            notes: filingForm.notes
        };

        try {
            await updateTaxFiling(filingForm.id, payload);
            setIsFilingModalOpen(false);
            await fetchDashboardData();
        } catch (error) {
            console.error("Error updating filing:", error);
            alert("Failed to update filing status");
        } finally {
            setLoading(false);
        }
    };

    // File Upload Handler
    const fileInputRef = React.useRef(null);
    const [selectedFilingId, setSelectedFilingId] = React.useState(null);

    const handleUploadClick = (filingId) => {

        if (!filingId) {
            console.error("No filing ID provided for upload");
            alert("Error: No filing selected for upload."); // Explicit feedback
            return;
        }
        setSelectedFilingId(filingId);
        // Timeout ensures state is updated before click (though usually not needed)
        setTimeout(() => {
            if (fileInputRef.current) {
                fileInputRef.current.click();
            }
        }, 0);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];


        if (!file || !selectedFilingId) {
            console.error("Missing file or filing ID");
            return;
        }

        const toastId = toast.loading("Uploading document...");
        try {
            const response = await uploadTaxDocument(selectedFilingId, file);

            toast.success("Document uploaded successfully", { id: toastId });
            await fetchDashboardData();
        } catch (error) {
            console.error("Error uploading document:", error);
            console.error("Error details:", error.response?.data);
            console.error("Error status:", error.response?.status);

            const errorMessage = error.response?.data?.message || "Failed to upload document";
            toast.error(errorMessage, { id: toastId });
        } finally {
            e.target.value = null; // Reset input
            setSelectedFilingId(null);
        }
    };

    const handleRemoveDocument = async () => {
        if (!window.confirm("Are you sure you want to remove the attached document?")) return;

        const toastId = toast.loading("Removing document...");
        try {
            await deleteTaxDocument(filingForm.id);
            toast.success("Document removed", { id: toastId });

            // Update local state
            setFilingForm(prev => ({
                ...prev,
                documents: Math.max(0, prev.documents - 1),
                attachmentName: null
            }));
            await fetchDashboardData();
        } catch (error) {
            console.error("Error removing document:", error);
            toast.error("Failed to remove document", { id: toastId });
        }
    };

    // Compute effective status: if Pending and dueDate is past today, treat as Overdue in UI
    const effectiveStatus = (filing) => {
        if (filing.status === 'Filed') return 'Filed';
        if (filing.dueDate && filing.dueDate !== 'TBD') {
            try {
                const due = new Date(filing.dueDate);
                if (!isNaN(due.getTime()) && due < new Date()) return 'Overdue';
            } catch (e) { /* ignore */ }
        }
        return filing.status;
    };

    // Search Logic
    const filteredFilings = filingsData.filter(f =>
        (f.taxConfiguration?.type || f.type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.period || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return <div className="p-6 flex items-center justify-center min-h-screen text-slate-500 text-sm">Loading Tax Dashboard...</div>;
    }

    if (fetchError) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-screen gap-4">
                <AlertCircle size={40} className="text-red-400" />
                <p className="text-slate-600 text-sm font-medium">{fetchError}</p>
                <button
                    onClick={fetchDashboardData}
                    className="px-4 py-2 bg-[#F5C742] text-slate-900 rounded-lg text-sm font-semibold hover:bg-yellow-400 transition"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-50 min-h-screen font-sans text-slate-800 relative">

            {/* HEADER */}
            <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-[#F5C742] p-2 rounded-lg text-white shadow-sm">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FileCheck className="text-[#F5C742]" size={28} /> Tax Compliance Dashboard</h1>
                        <p className="text-xs text-slate-500">Manage Corporate Tax, VAT, and Excise Tax compliance</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-50 shadow-sm transition">
                        <History size={14} /> Audit Log
                    </button>
                    <button
                        onClick={handleOpenAddConfig}
                        className="flex items-center gap-2 bg-[#F5C742] text-slate-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-yellow-400 shadow-sm transition"
                    >
                        <Plus size={14} /> Add Tax Type
                    </button>
                </div>
            </header>

            {/* KPI CARDS (Calculated Realtime) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-28 hover:shadow-md transition-shadow">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#F5C742]"></div>
                    <div className="flex justify-between items-start">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total Pending Amount</h4>
                        <DollarSign size={14} className="text-slate-400" />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-slate-800 mb-1">AED {kpiData.pendingAmount}</div>
                        <div className="text-[10px] text-slate-400">Across all tax types</div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-28 hover:shadow-md transition-shadow">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex justify-between items-start">
                        <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wide">Overdue Filings</h4>
                        <AlertCircle size={14} className="text-red-500" />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-slate-800 mb-1">{kpiData.overdue}</div>
                        <div className="text-[10px] text-slate-500">Requires immediate attention</div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-28 hover:shadow-md transition-shadow">
                    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                    <div className="flex justify-between items-start">
                        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Due This Week</h4>
                        <Bell size={14} className="text-yellow-600" />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-slate-800 mb-1">{kpiData.dueThisWeek}</div>
                        <div className="text-[10px] text-slate-400">Upcoming in next 7 days</div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-28 hover:shadow-md transition-shadow">
                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                    <div className="flex justify-between items-start">
                        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Filed This Month</h4>
                        <CheckCircle size={14} className="text-green-600" />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-slate-800 mb-1">{kpiData.filedThisMonth}</div>
                        <div className="text-[10px] text-slate-400">Successfully completed</div>
                    </div>
                </div>
            </div>

            {/* TABS */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 flex overflow-hidden">
                {[
                    { id: 'overview', label: 'Overview', icon: PieChart },
                    { id: 'configuration', label: 'Configuration', icon: Settings },
                    { id: 'reports', label: 'Reports', icon: FileText },
                    { id: 'filings', label: 'Filings', icon: FileCheck },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors border-b-2 relative ${activeTab === tab.id
                            ? 'border-[#F5C742] text-yellow-700 bg-yellow-50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ================= CONTENT: OVERVIEW ================= */}
            {activeTab === 'overview' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    {taxConfigs.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
                            <p>No tax types configured yet.</p>
                            <p className="text-sm mt-2">Go to the <strong>Configuration</strong> tab to add your first tax type.</p>
                        </div>
                    ) : (
                        <>
                            {/* Dynamic Summary Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {taxConfigs.map((config) => {
                                    // Match filing using configId (DTO structure)
                                    const accountFilings = filingsData.filter(f => {
                                        // Debug log for matching

                                        return Number(f.configId) === Number(config.id);
                                    });
                                    // Assuming the 'latest' is the one created/pending. In a real app, sort by date.
                                    // For now, we take the Pending one or the first one.
                                    const latestFiling = accountFilings.find(f => f.status !== 'Filed') || accountFilings[0];

                                    // Find last successfully filed return
                                    const lastFiledFn = accountFilings.filter(f => f.status === 'Filed').sort((a, b) => new Date(b.filedDate) - new Date(a.filedDate))[0];
                                    const lastFiledDate = lastFiledFn ? lastFiledFn.filedDate : 'Never';

                                    return (
                                        <div key={config.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className="font-bold text-lg text-slate-800">{config.type}</h3>
                                                <span className={`bg-green-100 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wide`}>{config.status}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-4">{latestFiling ? latestFiling.period : 'Current Period'}</p>

                                            <div className="space-y-3 mb-6 flex-grow">
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Next Due Date</div>
                                                    <div className="flex items-center gap-2 font-medium text-slate-700 text-sm">
                                                        <History size={16} className="text-slate-400" />
                                                        {latestFiling ? latestFiling.dueDate : 'TBD'}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Amount Payable</div>
                                                    <div className="text-xl font-bold text-slate-800">
                                                        AED {latestFiling ? Number(latestFiling.amount || 0).toLocaleString() : '0'}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Filing Frequency</div>
                                                    <div className="inline-block border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-600 font-medium">
                                                        {config.frequency}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Last Filed</div>
                                                    <div className="text-sm text-slate-700 font-medium">
                                                        {lastFiledDate}
                                                    </div>
                                                </div>
                                            </div>

                                            {latestFiling && (
                                                <button
                                                    onClick={() => handleOpenFilingModal(latestFiling.id)}
                                                    className="w-full border border-slate-200 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold flex items-center justify-center gap-2"
                                                >
                                                    <FileText size={16} /> File Return
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Filing History Table */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-base">Filing History</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Log of all submitted returns</p>
                                    </div>
                                </div>
                                {filingsData.filter(f => f.status === 'Filed').length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">No filed returns yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="text-[10px] text-slate-500 font-semibold border-b border-slate-200 bg-slate-50 uppercase">
                                                <tr>
                                                    <th className="py-2 pl-4">Tax Type</th>
                                                    <th className="py-2">Period</th>
                                                    <th className="py-2">Due Date</th>
                                                    <th className="py-2">Filed Date</th>
                                                    <th className="py-2 text-right">Amount</th>
                                                    <th className="py-2 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filingsData.filter(f => f.status === 'Filed').map((f) => (
                                                    <tr key={f.id} className="hover:bg-slate-50">
                                                        <td className="py-3 pl-4 font-medium text-slate-800">{f.taxConfiguration?.type || f.type}</td>
                                                        <td className="py-3 text-slate-600">{f.period}</td>
                                                        <td className="py-3 text-slate-500">{f.dueDate}</td>
                                                        <td className="py-3 text-emerald-600">{f.filedDate}</td>
                                                        <td className="py-3 font-mono font-bold text-right text-slate-800">AED {Number(f.amount).toLocaleString()}</td>
                                                        <td className="py-3 text-center flex justify-center">{getStatusBadge(f.status)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ================= CONTENT: REPORTS ================= */}
            {activeTab === 'reports' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="mb-2">
                        <h3 className="text-lg font-bold text-slate-800">Financial Tax Reports</h3>
                        <p className="text-xs text-slate-500">Generate and download detailed tax reports</p>
                    </div>

                    {taxConfigs.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
                            <p>No tax data available for reports. Please configure tax types.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                                {taxConfigs.map((config) => {
                                    const latestFiling = filingsData.find(f => Number(f.configId) === Number(config.id));
                                    return (
                                        <div key={config.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full hover:border-yellow-300 transition-colors">
                                            <div className="flex items-center gap-2 mb-4">
                                                <FileText size={18} className="text-yellow-600" />
                                                <h3 className="font-bold text-slate-800">{config.type} Report</h3>
                                            </div>

                                            <div className="space-y-2 mb-4 flex-grow">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-500">Linked Accounts</span>
                                                    <span className="font-medium text-slate-800 text-xs bg-slate-100 px-2 py-0.5 rounded">{config.accounts ? config.accounts.join(', ') : 'None'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                                                    <span className="text-slate-600 font-medium">Current Status</span>
                                                    <span className="font-bold text-slate-800">{latestFiling ? latestFiling.status : 'N/A'}</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center text-sm mb-4 mt-auto bg-slate-50 p-3 rounded-lg">
                                                <span className="font-bold text-slate-600">Total Payable</span>
                                                <span className="font-bold text-yellow-700 text-base">AED {latestFiling ? Number(latestFiling.amount).toLocaleString() : '0'}</span>
                                            </div>

                                            <div className="flex gap-2">
                                                <button className="flex-1 border border-slate-200 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2 transition font-medium">
                                                    <Download size={14} /> Excel
                                                </button>
                                                <button className="flex-1 border border-slate-200 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2 transition font-medium">
                                                    <FileText size={14} /> PDF
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Filing History Section in Reports */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-base">Filing History</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Log of all submitted returns and payment statuses</p>
                                    </div>

                                    <div className="flex gap-3">
                                        <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-yellow-500">
                                            <option>All Tax Types</option>
                                            {taxConfigs.map(t => <option key={t.id}>{t.type}</option>)}
                                        </select>
                                        <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-yellow-500">
                                            <option>All Statuses</option>
                                            <option>Filed</option>
                                            <option>Pending</option>
                                            <option>Overdue</option>
                                        </select>
                                        <button className="flex items-center gap-2 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
                                            <Download size={14} /> Export Report
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="text-[10px] text-slate-500 font-semibold border-b border-slate-200 bg-slate-50 uppercase">
                                            <tr>
                                                <th className="py-2 pl-4">Tax Type</th>
                                                <th className="py-2">Period</th>
                                                <th className="py-2">Due Date</th>
                                                <th className="py-2">Filed Date</th>
                                                <th className="py-2 text-right">Amount</th>
                                                <th className="py-2 text-center">Status</th>
                                                <th className="py-2 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filingsData.map((f) => (
                                                <tr key={f.id} className="hover:bg-slate-50">
                                                    <td className="py-3 pl-4 font-medium text-slate-800">{f.taxConfiguration?.type || f.type}</td>
                                                    <td className="py-3 text-slate-600">{f.period}</td>
                                                    <td className="py-3 text-slate-500">{f.dueDate}</td>
                                                    <td className="py-3 text-slate-600 font-medium">{f.filedDate || '-'}</td>
                                                    <td className="py-3 font-mono font-bold text-right text-slate-800">AED {Number(f.amount).toLocaleString()}</td>
                                                    <td className="py-3 text-center flex justify-center">{getStatusBadge(f.status)}</td>
                                                    <td className="py-3 text-center">
                                                        <button
                                                            onClick={() => handleOpenFilingModal(f.id, true)}
                                                            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-blue-600 transition"
                                                            title="View Details"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ================= CONTENT: FILINGS (With Working Search) ================= */}
            {activeTab === 'filings' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Tax Filings Management</h3>
                            <p className="text-xs text-slate-500">Manage tax periods, filing due dates, and document uploads</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by tax type or period..."
                                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* List of Filings */}
                    <div className="space-y-3">
                        {filteredFilings.length === 0 ? (
                            <div className="text-center py-8 bg-white border border-slate-200 rounded-xl">
                                <p className="text-slate-500 text-sm">
                                    {filingsData.length === 0
                                        ? "No filings available. Add a tax type in Configuration to generate a filing."
                                        : "No filings found matching your search."}
                                </p>
                            </div>
                        ) : (
                            filteredFilings.map((filing) => (
                                <div key={filing.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center border ${filing.status === 'Filed' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                {filing.status === 'Filed' ? <CheckCircle size={16} /> : <History size={16} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-sm text-slate-800">{filing.type}</h4>
                                                    {getStatusBadge(effectiveStatus(filing))}
                                                </div>
                                                <p className="text-xs text-slate-500">Tax Period: {filing.period}</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleOpenFilingModal(filing.id)}
                                                className="p-1.5 text-slate-400 hover:text-yellow-700 hover:bg-yellow-50 rounded-lg border border-slate-200 transition"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleUploadClick(filing.id)}
                                                className="p-1.5 text-slate-400 hover:text-yellow-700 hover:bg-yellow-50 rounded-lg border border-slate-200 transition"
                                                title="Upload Document"
                                            >
                                                <Upload size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                        <div><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Due Date</div><div className="text-xs font-medium text-slate-800">{filing.dueDate}</div></div>
                                        <div><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Amount</div><div className="text-xs font-bold text-yellow-700">AED {Number(filing.amount).toLocaleString()}</div></div>
                                        <div><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Documents</div><div className="text-xs font-medium text-slate-800">{filing.documents} file(s)</div></div>
                                    </div>

                                    {(filing.notes || filing.attachmentName) && (
                                        <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 mt-2">
                                            {filing.notes && <div className="text-xs text-slate-600 mb-2"><span className="font-semibold text-slate-700">Notes:</span> {filing.notes}</div>}

                                            {filing.attachmentName && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation(); // Stop row click
                                                            try {
                                                                const blob = await downloadTaxDocument(filing.id);

                                                                // Create hidden link to force download
                                                                const url = window.URL.createObjectURL(new Blob([blob]));
                                                                const a = document.createElement('a');
                                                                a.href = url;
                                                                a.download = filing.attachmentName;
                                                                document.body.appendChild(a);
                                                                a.click();

                                                                // Cleanup
                                                                window.URL.revokeObjectURL(url);
                                                                document.body.removeChild(a);
                                                            } catch (err) {
                                                                console.error("Download error:", err);
                                                                toast.error("Failed to download document");
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition group hover:shadow-md"
                                                        title="Click to download"
                                                    >
                                                        <File size={14} className="text-slate-400 group-hover:text-yellow-600" />
                                                        <span className="truncate max-w-[150px]">{filing.attachmentName}</span>
                                                        <Download size={12} className="text-slate-400 group-hover:text-slate-600 ml-1" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ================= CONTENT: CONFIGURATION ================= */}
            {activeTab === 'configuration' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="mb-4">
                        <h3 className="font-bold text-slate-800 text-lg">Tax Type Configuration</h3>
                        <p className="text-xs text-slate-500 mt-1">Define and manage tax types</p>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-xs text-left">
                            <thead className="text-[10px] text-slate-500 font-bold border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                                <tr>
                                    <th className="py-3 pl-4">Tax Type</th>
                                    <th className="py-3">Filing Frequency</th>
                                    <th className="py-3">Rate</th>
                                    <th className="py-3">Linked Accounts</th>
                                    <th className="py-3">Status</th>
                                    <th className="py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {taxConfigs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-6 text-center text-slate-400">
                                            No tax types configured. Click "Add Tax Type" to start.
                                        </td>
                                    </tr>
                                ) : (
                                    taxConfigs.map((tax) => (
                                        <tr key={tax.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 pl-4 font-medium text-slate-800">{tax.type}</td>
                                            <td className="py-3">
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] border border-slate-200 font-semibold">{tax.frequency}</span>
                                            </td>
                                            <td className="py-3 text-slate-700 font-mono">{tax.rate}</td>
                                            <td className="py-3">
                                                <div className="flex gap-1 flex-wrap">
                                                    {tax.accounts && tax.accounts.map((acc, idx) => (
                                                        <span key={idx} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] border border-blue-100 font-medium">{acc}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tax.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{tax.status}</span>
                                            </td>
                                            <td className="py-3 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button onClick={() => handleOpenEditConfig(tax)} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-yellow-600 transition-colors"><Edit size={14} /></button>
                                                    <button onClick={() => handleDeleteConfig(tax.id)} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ================= MODAL: ADD/EDIT TAX TYPE ================= */}
            {isAddTaxModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{isEditConfigMode ? 'Edit Tax Type' : 'Add New Tax Type'}</h2>
                                <p className="text-xs text-slate-500">Configure tax type, filing frequency, and linked accounts</p>
                            </div>
                            <button onClick={() => setIsAddTaxModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
                            {/* Tax Type */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Tax Type <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <select
                                        name="type"
                                        value={configForm.type}
                                        onChange={e => setConfigForm({ ...configForm, type: e.target.value })}
                                        className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 bg-white"
                                        required
                                    >
                                        <option value="" disabled>Select tax type</option>
                                        <option value="Corporate Tax">Corporate Tax</option>
                                        <option value="VAT (Value Added Tax)">VAT (Value Added Tax)</option>
                                        <option value="Excise Tax">Excise Tax</option>
                                        <option value="Customs Duty">Customs Duty</option>
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Filing Frequency <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <select name="frequency" value={configForm.frequency} onChange={e => setConfigForm({ ...configForm, frequency: e.target.value })} className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 bg-white" required>
                                        <option value="" disabled>Select frequency</option>
                                        <option value="Monthly">Monthly</option>
                                        <option value="Quarterly">Quarterly</option>
                                        <option value="Annually">Annually</option>
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Tax Rate <span className="text-red-500">*</span></label>
                                <input type="text" value={configForm.rate} onChange={e => setConfigForm({ ...configForm, rate: e.target.value })} placeholder="e.g., 5%, 9%, 50%" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500" required />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Linked Accounts (comma-separated)</label>
                                <input type="text" value={configForm.accounts} onChange={e => setConfigForm({ ...configForm, accounts: e.target.value })} placeholder="e.g., Revenue, Operating Expenses" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Status</label>
                                <div className="relative">
                                    <select value={configForm.status} onChange={e => setConfigForm({ ...configForm, status: e.target.value })} className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 bg-white">
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-2">
                                <button type="button" onClick={() => setIsAddTaxModalOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-[#F5C742] text-slate-900 font-medium rounded-lg text-sm hover:bg-yellow-400 shadow-md transition flex items-center gap-2">
                                    {loading ? 'Saving...' : (isEditConfigMode ? 'Save Changes' : 'Add Tax Type')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ================= MODAL: UPDATE FILING STATUS ================= */}
            {isFilingModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{filingForm.isViewOnly ? 'Filing Details' : 'Update Filing Status'}</h2>
                                <p className="text-xs text-slate-500">{filingForm.type} - {filingForm.period}</p>
                            </div>
                            <button onClick={() => setIsFilingModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSaveFiling} className="p-6 space-y-4">
                            {/* Tax Period (Read Only) */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Tax Period</label>
                                <input type="text" value={filingForm.period} disabled className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm text-slate-500 font-medium" />
                            </div>

                            {/* Due Date */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Next Due Date</label>
                                <input
                                    type="date"
                                    value={filingForm.dueDate}
                                    onChange={e => setFilingForm({ ...filingForm, dueDate: e.target.value })}
                                    className={`w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 ${filingForm.isViewOnly ? 'bg-slate-50 text-slate-500' : ''}`}
                                    disabled={filingForm.isViewOnly}
                                />
                            </div>

                            {/* Amount Payable */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Amount Payable (AED) <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    value={filingForm.amount}
                                    onChange={e => setFilingForm({ ...filingForm, amount: e.target.value })}
                                    className={`w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 font-mono ${filingForm.isViewOnly ? 'bg-slate-50 text-slate-500' : ''}`}
                                    required
                                    disabled={filingForm.isViewOnly}
                                />
                            </div>

                            {/* Filing Status */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Filing Status <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <select
                                        value={filingForm.status}
                                        onChange={e => setFilingForm({ ...filingForm, status: e.target.value })}
                                        className={`w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 ${filingForm.isViewOnly ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                                        disabled={filingForm.isViewOnly}
                                    >
                                        <option value="Pending">Pending</option>
                                        <option value="Filed">Filed</option>
                                        <option value="Overdue">Overdue</option>
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Notes / Remarks</label>
                                <textarea
                                    value={filingForm.notes}
                                    onChange={e => setFilingForm({ ...filingForm, notes: e.target.value })}
                                    placeholder={filingForm.isViewOnly ? "No notes added." : "Add any notes or remarks..."}
                                    className={`w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 min-h-[80px] ${filingForm.isViewOnly ? 'bg-slate-50 text-slate-500' : ''}`}
                                    disabled={filingForm.isViewOnly}
                                />
                            </div>

                            {/* Upload Documents Area */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-700">Documents</label>
                                {filingForm.isViewOnly ? (
                                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[60px] flex items-center justify-center">
                                        {filingForm.documents > 0 ? (
                                            <div className="text-center">
                                                <p className="text-xs text-green-600 font-bold">{filingForm.documents} documents attached</p>
                                                {filingForm.attachmentName && (
                                                    <div className="flex items-center justify-center gap-2 mt-2">
                                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm text-xs font-medium text-slate-700">
                                                            <File size={14} className="text-slate-400" />
                                                            <span className="truncate max-w-[150px]">{filingForm.attachmentName}</span>
                                                        </div>
                                                        {/* Download button for View Mode */}
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    const blob = await downloadTaxDocument(filingForm.id);
                                                                    const url = window.URL.createObjectURL(new Blob([blob]));
                                                                    const a = document.createElement('a');
                                                                    a.href = url;
                                                                    a.download = filingForm.attachmentName;
                                                                    document.body.appendChild(a);
                                                                    a.click();
                                                                    window.URL.revokeObjectURL(url);
                                                                    document.body.removeChild(a);
                                                                } catch (err) { toast.error("Download failed"); }
                                                            }}
                                                            className="p-1.5 text-slate-500 hover:text-blue-600 bg-white border border-slate-200 rounded-full hover:shadow-sm"
                                                            title="Download"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : <p className="text-sm text-slate-400 italic">No documents attached.</p>}
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => handleUploadClick(filingForm.id)}
                                        className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition cursor-pointer hover:border-yellow-400 group"
                                    >
                                        <CloudUpload size={24} className="text-slate-400 mb-2 group-hover:text-yellow-500 transition-colors" />
                                        <p className="text-sm text-slate-500 font-medium">Click to upload or drag and drop</p>
                                        <p className="text-[10px] text-slate-400 mt-1">PDF, Excel, or XML files</p>
                                        {filingForm.documents > 0 && (
                                            <div className="mt-2 text-center">
                                                <p className="text-xs text-green-600 font-bold">{filingForm.documents} documents attached</p>
                                                {filingForm.attachmentName && (
                                                    <div className="flex items-center justify-center gap-2 mt-1">
                                                        <p className="text-[10px] text-slate-500 italic truncate max-w-[200px]">{filingForm.attachmentName}</p>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveDocument(); }} className="text-red-400 hover:text-red-600 p-0.5 rounded-full hover:bg-red-50 transition" title="Remove Document">
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-2">
                                <button type="button" onClick={() => setIsFilingModalOpen(false)} className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 transition">
                                    {filingForm.isViewOnly ? 'Close' : 'Cancel'}
                                </button>
                                {!filingForm.isViewOnly && (
                                    <button type="submit" className="px-6 py-2 bg-[#F5C742] text-slate-900 font-medium rounded-lg text-sm hover:bg-yellow-400 shadow-md transition flex items-center gap-2">
                                        {loading ? 'Saving...' : 'Update Filing'}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
        </div>
    );
}
