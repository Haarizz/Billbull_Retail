import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    FileText,
    Plus,
    Search,
    Filter,
    Eye,
    MoreHorizontal,
    Download,
    FileSpreadsheet,
    ChevronDown,
    DollarSign,
    Clock,
    CheckCircle2,
    TrendingUp,
    CreditCard,
    Users,
    Printer,
    UploadCloud,
    ShoppingBag,
    Coffee,
    Dumbbell,
    CalendarDays,
    Ticket,
    X,
    Mail,
    Edit,
    Paperclip,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Copy,
    Trash,
} from 'lucide-react';

import { employeesApi } from '../../api/employeesApi';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { getImageUrl } from '../../utils/urlUtils';

// --- HELPER: CUSTOM SELECT ---
const CustomSelect = ({ placeholder, options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 bg-white text-slate-600 flex justify-between items-center cursor-pointer"
            >
                <span className={value ? "text-slate-700" : "text-slate-400"}>
                    {value || placeholder}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {options.length > 0 ? options.map((option, idx) => (
                        <div
                            key={idx}
                            onClick={() => {
                                onChange && onChange(option);
                                setIsOpen(false);
                            }}
                            className="px-3 py-2 text-xs cursor-pointer text-slate-600 hover:bg-[#F43F5E] hover:text-white transition-colors"
                        >
                            {option}
                        </div>
                    )) : (
                        <div className="px-3 py-2 text-xs text-slate-400 italic">No options found</div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- COMPONENT: RECEIPT VOUCHER ---
const ReceiptVoucher = () => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const fileInputRef = useRef(null);

    // State for the Slide-in Drawer
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);

    // --- DATA STATES ---
    const [employees, setEmployees] = useState([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

    // --- FORM STATE ---
    const [receipts, setReceipts] = useState([]);
    const [editingReceipt, setEditingReceipt] = useState(null);
    const [formData, setFormData] = useState({
        date: '2026-01-22',
        branch: 'Dubai Branch',
        member: '',
        category: '',
        amount: '',
        mode: '',
        reference: '',
        notes: '',
        status: 'Completed',
        purpose: 'ADVANCE_RECEIVED',
        attachment: null
    });

    // Reset form when opening for "Add"
    const openAddModal = () => {
        setEditingReceipt(null);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            branch: 'Dubai Branch',
            member: '',
            category: '',
            amount: '',
            mode: '',
            reference: '',
            notes: '',
            purpose: 'ADVANCE_RECEIVED',
            attachment: null
        });
        setIsAddModalOpen(true);
    };

    // --- CALENDAR STATE ---
    const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1)); // Default Jan 2026
    // --- FILTER STATE ---
    const [filterDate, setFilterDate] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSource, setFilterSource] = useState('All Sources');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterPayment, setFilterPayment] = useState('All Payments');
    const [filterBranch, setFilterBranch] = useState('All Branches');
    const [filterDateRange, setFilterDateRange] = useState('All Time');

    // --- DATA FETCHING ---
    const fetchReceipts = async () => {
        try {
            const data = await receiptVoucherApi.getAll();
            const formatted = data.map(r => ({
                id: r.voucherId,
                dbId: r.id,
                date: new Date(r.date).toLocaleDateString('en-US'),
                source: r.category,
                sourceSub: r.reference,
                member: r.memberName,
                memberId: 'EMP-000', // Placeholder
                amount: r.amount.toLocaleString(),
                mode: r.paymentMode,
                status: r.status,
                purpose: r.purpose,
                icon: getIconForCategory(r.category),
                color: getColorForCategory(r.category),
                bg: getBgForCategory(r.category),
                attachment: r.attachmentName ? {
                    name: r.attachmentName,
                    url: r.attachmentPath ? getImageUrl(`/uploads/receipts/${r.attachmentPath.split(/[/\\]/).pop()}`) : null
                } : null
            }));
            setReceipts(formatted);
        } catch (error) {
            console.error("Failed to fetch receipts:", error);
        }
    };

    useEffect(() => {
        fetchReceipts();
    }, []);

    // --- MOCK DATA INITIALIZATION ---
    // Moved mock data to state to support duplicate/delete actions
    // --- DERIVED STATS ---
    const stats = React.useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const todayStr = now.toLocaleDateString('en-US');

        let todayTotal = 0;
        let todayCount = 0;
        let monthTotal = 0;
        let pendingTotal = 0;
        const sourceMap = {};

        // New Quick Stats
        let completedToday = 0;
        let pendingCount = 0;
        let partiallyPaidCount = 0;
        const paymentModeMap = {};

        receipts.forEach(r => {
            const rDate = new Date(r.date);
            const amount = parseFloat(r.amount.replace(/,/g, '')) || 0;

            // Today
            if (new Date(r.date).toDateString() === new Date().toDateString()) {
                todayTotal += amount;
                todayCount++;
                if (r.status === 'Completed') completedToday++;
            }

            // This Month
            if (rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear) {
                monthTotal += amount;
            }

            // Status Counts
            if (r.status === 'Pending') {
                pendingTotal += amount;
                pendingCount++;
            }
            if (r.status === 'Partially Paid') {
                pendingTotal += amount; // Assuming pending amount includes partially paid for simpliciy or logic tweak
                partiallyPaidCount++;
            }

            // Income Sources
            const sourceKey = r.source || 'Other';
            if (!sourceMap[sourceKey]) {
                sourceMap[sourceKey] = { amount: 0, count: 0, icon: r.icon, color: r.color, bg: r.bg };
            }
            sourceMap[sourceKey].amount += amount;
            sourceMap[sourceKey].count++;

            // Payment Mode
            if (!paymentModeMap[r.mode]) paymentModeMap[r.mode] = 0;
            paymentModeMap[r.mode]++;
        });

        const incomeSources = Object.entries(sourceMap).map(([label, data]) => ({
            label,
            amount: data.amount.toLocaleString(),
            count: `${data.count} receipt${data.count !== 1 ? 's' : ''}`,
            icon: data.icon,
            color: data.color,
            bg: data.bg
        }));

        // Find most used payment
        let mostUsedPayment = 'N/A';
        let maxCount = 0;
        Object.entries(paymentModeMap).forEach(([mode, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostUsedPayment = mode;
            }
        });

        return {
            todayTotal: todayTotal.toLocaleString(),
            todayCount,
            monthTotal: monthTotal.toLocaleString(),
            pendingTotal: pendingTotal.toLocaleString(),
            totalCount: receipts.length,
            incomeSources,
            completedToday,
            pendingCount,
            partiallyPaidCount,
            mostUsedPayment
        };
    }, [receipts]);

    // Helpers for mapping
    const getIconForCategory = (cat) => {
        if (!cat) return DollarSign;
        if (cat.includes('Sales')) return ShoppingBag;
        if (cat.includes('Consulting')) return Users;
        if (cat.includes('Subscription')) return FileText;
        if (cat.includes('Maintenance')) return Clock;
        return DollarSign;
    };

    const getColorForCategory = (cat) => {
        if (!cat) return 'text-slate-600';
        if (cat.includes('Sales')) return 'text-blue-600';
        if (cat.includes('Consulting')) return 'text-emerald-600';
        if (cat.includes('Subscription')) return 'text-purple-600';
        return 'text-slate-600';
    };

    const getBgForCategory = (cat) => {
        if (!cat) return 'bg-slate-50';
        if (cat.includes('Sales')) return 'bg-blue-50';
        if (cat.includes('Consulting')) return 'bg-emerald-50';
        if (cat.includes('Subscription')) return 'bg-purple-50';
        return 'bg-slate-50';
    };

    // Action State
    const [openActionId, setOpenActionId] = useState(null);

    // --- FILE HANDLERS ---
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData({ ...formData, attachment: e.target.files[0] });
        }
    };

    const handleTriggerUpload = () => {
        fileInputRef.current.click();
    };

    const handleRemoveFile = () => {
        setFormData({ ...formData, attachment: null });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- CLICK OUTSIDE HANDLER FOR ACTIONS ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (openActionId && !event.target.closest('.action-menu')) {
                setOpenActionId(null);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [openActionId]);



    // --- FETCH EMPLOYEES ON MOUNT (Restored) ---
    useEffect(() => {
        const loadEmployees = async () => {
            setIsLoadingEmployees(true);
            try {
                const data = await employeesApi.getActiveEmployees();
                // Store full data for ID lookup
                setEmployees(data || []);
            } catch (error) {
                console.error("Failed to fetch employees:", error);
                setEmployees([]);
            } finally {
                setIsLoadingEmployees(false);
            }
        };

        loadEmployees();
    }, []);

    // --- ACTION HANDLERS ---
    const handleEdit = (receipt) => {
        setEditingReceipt(receipt);
        setFormData({
            date: new Date(receipt.date).toISOString().split('T')[0], // approx conversion for demo
            branch: 'Dubai Branch', // Default or from receipt if available
            member: receipt.member,
            category: receipt.source,
            amount: receipt.amount.replace(/,/g, ''),
            mode: receipt.mode,
            reference: receipt.sourceSub,
            notes: '',
            status: receipt.status || 'Completed',
            purpose: receipt.purpose || 'AGAINST_INVOICE',
            attachment: null // In a real app we would load the existing attachment info here
        });
        setIsAddModalOpen(true);
        setOpenActionId(null);
    };

    const handleDuplicate = (receipt) => {
        setEditingReceipt(null); // Treat as new
        setFormData({
            date: new Date().toISOString().split('T')[0], // Current date
            branch: receipt.branch || 'Dubai Branch',
            member: receipt.member,
            category: receipt.source,
            amount: receipt.amount.replace(/,/g, ''),
            mode: receipt.mode,
            reference: receipt.sourceSub,
            notes: receipt.notes || '',
            status: 'Pending',
            purpose: receipt.purpose || 'ADVANCE_RECEIVED',
            attachment: null
        });
        setIsAddModalOpen(true);
        setOpenActionId(null);
    };

    const handleSave = async () => {
        const payload = {
            date: formData.date,
            branch: formData.branch,
            memberName: formData.member,
            category: formData.category,
            amount: Number(formData.amount),
            paymentMode: formData.mode,
            reference: formData.reference,
            notes: formData.notes,
            status: formData.status,
            purpose: formData.purpose
        };

        const submitData = new FormData();
        submitData.append('data', JSON.stringify(payload));
        if (formData.attachment instanceof File) {
            submitData.append('file', formData.attachment);
        }

        try {
            if (editingReceipt) {
                await receiptVoucherApi.update(editingReceipt.dbId, submitData);
            } else {
                await receiptVoucherApi.create(submitData);
            }
            fetchReceipts(); // Refresh list
            setIsAddModalOpen(false);
        } catch (error) {
            console.error("Failed to save receipt:", error);
            const message = error?.response?.data?.message || error?.response?.data || "Failed to save receipt. Please try again.";
            alert(message);
        }
    };

    const handlePrint = (receipt) => {
        // Ideally this would print a specific receipt template
        // For now, we simulate by invoking browser print, usually printing the whole page
        // A real app would open a new window with just the receipt content
        window.print();
        setOpenActionId(null);
    };

    const handleDelete = async (id, dbId) => {
        if (window.confirm('Are you sure you want to delete this receipt?')) {
            try {
                // If we have a dbId use it, otherwise fallback to finding it (or passed id if it's the dbId)
                // Since our new table mapping passes row.id as voucherId, we need to find the real DB ID or pass it
                // We'll update the delete call in the map to pass row.dbId
                if (dbId) {
                    await receiptVoucherApi.delete(dbId);
                } else {
                    // Fallback if dbId missing (shouldn't happen with new logic)
                    console.warn("No DB ID found for delete");
                }
                fetchReceipts();
            } catch (error) {
                console.error("Failed to delete receipt:", error);
            }
        }
        setOpenActionId(null);
    };

    // Removed static incomeSources, using stats.incomeSources


    // Handler to open the drawer
    const handleViewReceipt = (receipt) => {
        setSelectedReceipt(receipt);
        setIsDrawerOpen(true);
    };

    // Handler to close the drawer
    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        // Optional: delay clearing data for animation smoothness
        setTimeout(() => setSelectedReceipt(null), 300);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'Pending': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'Partially Paid': return 'bg-orange-50 text-orange-700 border-orange-100';
            default: return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    // --- CALENDAR LOGIC ---
    const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const handleDateClick = (day) => {
        const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        // Toggle if same date clicked
        if (filterDate && clickedDate.toDateString() === filterDate.toDateString()) {
            setFilterDate(null);
        } else {
            setFilterDate(clickedDate);
        }
    };

    const hasReceiptOnDate = (day) => {
        const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toLocaleDateString('en-US'); // "1/21/2026"
        // Need to match the mock data format "1/21/2026" (m/d/yyyy) - basic check 
        // Mock data is single digit month/day without pad, LocaleString standard behavior varies but often m/d/yyyy.
        // Let's coerce standard equality
        return receipts.some(r => {
            const rDate = new Date(r.date);
            const cDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            return rDate.toDateString() === cDate.toDateString();
        });
    };

    const filteredReceipts = useMemo(() => {
        return receipts.filter(r => {
            // Date Filter (Calendar)
            if (filterDate && new Date(r.date).toDateString() !== filterDate.toDateString()) return false;

            // Date Range Dropdown
            if (filterDateRange !== 'All Time') {
                const rDate = new Date(r.date);
                const today = new Date();

                if (filterDateRange === 'Last 7 Days') {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(today.getDate() - 7);
                    if (rDate < sevenDaysAgo) return false;
                } else if (filterDateRange === 'This Month') {
                    if (
                        rDate.getMonth() !== today.getMonth() ||
                        rDate.getFullYear() !== today.getFullYear()
                    ) return false;
                }
            }

            // Text Search
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matches =
                    r.id.toLowerCase().includes(query) ||
                    r.member.toLowerCase().includes(query) ||
                    r.amount.toLowerCase().includes(query) ||
                    (r.dbId && r.dbId.toString().includes(query));
                if (!matches) return false;
            }

            // Dropdown Filters
            if (filterSource !== 'All Sources' && r.source !== filterSource) return false;
            if (filterStatus !== 'All Status' && r.status !== filterStatus) return false;
            if (filterPayment !== 'All Payments' && r.mode !== filterPayment) return false;
            if (filterBranch !== 'All Branches' && (r.branch || 'Dubai Branch') !== filterBranch) return false;

            return true;
        });
    }, [receipts, filterDate, searchQuery, filterSource, filterStatus, filterPayment, filterBranch, filterDateRange]);


    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 lg:p-6 relative overflow-x-hidden">

            {/* HEADER SECTION */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-[#F5C742]" size={28} /> Receipt Vouchers
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Record miscellaneous income, advances, and other non-invoice receipts</p>
                    <div className="text-[10px] text-slate-400 mt-1">Financials &rarr; <span className="font-semibold text-slate-600">Receipt Voucher</span></div>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                        <FileSpreadsheet size={16} /> Export Excel
                    </button>
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
                        <Download size={16} /> Export PDF
                    </button>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-xs font-bold shadow-sm hover:bg-yellow-400"
                    >
                        <Plus size={16} /> Add Receipt
                    </button>
                </div>
            </div>

            {/* STATS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold">Today's Receipts</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.todayTotal}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">{stats.todayCount} transactions</p>
                        </div>
                        <div className="p-2 bg-[#F5C742] rounded text-slate-900">
                            <DollarSign size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold">This Month</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.monthTotal}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">January 2024</p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded text-emerald-600">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold">Pending Amount</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">AED {stats.pendingTotal}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">Awaiting payment</p>
                        </div>
                        <div className="p-2 bg-orange-50 rounded text-orange-600">
                            <Clock size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold">Total Receipts</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalCount}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">This period</p>
                        </div>
                        <div className="p-2 bg-indigo-50 rounded text-indigo-600">
                            <FileText size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* MIDDLE SECTION: INCOME SOURCE & CALENDAR */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

                {/* INCOME SOURCE DISTRIBUTION */}
                <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-1">Income Source Distribution</h3>
                    <p className="text-xs text-slate-400 mb-4">Revenue breakdown by source category</p>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {stats.incomeSources.length > 0 && stats.incomeSources.map((item, idx) => (
                            <div key={idx} className="flex flex-col items-center justify-center p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                <div className={`p-2 rounded-lg mb-2 ${item.bg} ${item.color}`}>
                                    <item.icon size={20} />
                                </div>
                                <p className="text-[10px] text-slate-500 font-semibold text-center mb-0.5">{item.label}</p>
                                <p className="text-sm font-bold text-slate-800">AED {item.amount}</p>
                                <p className="text-[10px] text-slate-400">{item.count}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* QUICK STATS / CALENDAR */}
                <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-700">Quick Stats</h3>
                            <p className="text-xs text-slate-400">Recent receipt overview</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs text-slate-500">Completed Today</span>
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">{stats.completedToday}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs text-slate-500">Pending Approval</span>
                            <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold">{stats.pendingCount}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs text-slate-500">Partially Paid</span>
                            <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">{stats.partiallyPaidCount}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-xs text-slate-500">Most Used Payment</span>
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{stats.mostUsedPayment}</span>
                        </div>
                    </div>

                    {/* Interactive Calendar */}
                    <div className="mt-6 pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-1">
                                <button onClick={prevMonth} className="hover:text-slate-700 transition-colors text-slate-400"><ChevronLeft size={10} /></button>
                                <span className="text-[10px] text-slate-400 font-bold min-w-[70px] text-center">
                                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </span>
                                <button onClick={nextMonth} className="hover:text-slate-700 transition-colors text-slate-400"><ChevronRight size={10} /></button>
                            </div>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                            </div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center mb-1">
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <span key={d} className="text-[8px] text-slate-400 font-bold">{d}</span>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {/* Empty Slots */}
                            {Array.from({ length: getFirstDayOfMonth(currentDate) }).map((_, i) => (
                                <div key={`empty-${i}`} className="h-6"></div>
                            ))}
                            {/* Days */}
                            {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => i + 1).map(day => {
                                const isSelected = filterDate && filterDate.getDate() === day && filterDate.getMonth() === currentDate.getMonth() && filterDate.getFullYear() === currentDate.getFullYear();
                                const hasActivity = hasReceiptOnDate(day);

                                return (
                                    <button
                                        key={day}
                                        onClick={() => handleDateClick(day)}
                                        className={`text-[8px] p-1 rounded-sm w-full flex items-center justify-center transition-all
                                            ${isSelected ? 'bg-red-500 text-white font-bold' : 'text-slate-500 hover:bg-slate-50'}
                                            ${hasActivity && !isSelected ? 'font-bold text-slate-700' : ''}
                                        `}
                                    >
                                        {day}
                                        {hasActivity && !isSelected && (
                                            <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-500"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {filterDate && (
                            <div className="mt-2 text-center">
                                <button onClick={() => setFilterDate(null)} className="text-[9px] text-indigo-600 hover:underline">Clear Filter</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* FILTERS & TABLE */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">

                {/* FILTERS */}
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><Filter size={16} /> Receipt Filters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                        <div className="md:col-span-2 relative">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Search</label>
                            <Search className="absolute left-3 top-[26px] text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search by ID, Member, Amount..."
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600 font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Range</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                value={filterDateRange}
                                onChange={(e) => setFilterDateRange(e.target.value)}
                            >
                                <option>All Time</option>
                                <option>Last 7 Days</option>
                                <option>This Month</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Income Source</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                value={filterSource}
                                onChange={(e) => setFilterSource(e.target.value)}
                            >
                                <option>All Sources</option>
                                <option>Direct Sales</option>
                                <option>Consulting</option>
                                <option>Services</option>
                                <option>Subscription</option>
                                <option>Refund In</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option>All Status</option>
                                <option>Completed</option>
                                <option>Pending</option>
                                <option>Partially Paid</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Payment Mode</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                value={filterPayment}
                                onChange={(e) => setFilterPayment(e.target.value)}
                            >
                                <option>All Payments</option>
                                <option>Cash</option>
                                <option>Card</option>
                                <option>Bank Transfer</option>
                                <option>Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Branch</label>
                            <select
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:border-yellow-400"
                                value={filterBranch}
                                onChange={(e) => setFilterBranch(e.target.value)}
                            >
                                <option>All Branches</option>
                                <option>Dubai Branch</option>
                                <option>Marina Branch</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* TABLE */}
                <div className="mb-4 flex justify-between items-end">
                    <div>
                        <h3 className="text-sm font-bold text-slate-700">Receipt Vouchers</h3>
                        <p className="text-xs text-slate-500">
                            {filterDate
                                ? `Showing receipts for ${filterDate.toLocaleDateString()}`
                                : `All receipt vouchers and income records (${filteredReceipts.length} receipts)`
                            }
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3"><input type="checkbox" className="rounded border-slate-300" /></th>
                                <th className="px-4 py-3">Voucher ID</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Source Channel</th>
                                <th className="px-4 py-3">Payer / Employee</th>
                                <th className="px-4 py-3 text-right">Amount (AED)</th>
                                <th className="px-4 py-3">Payment Mode</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredReceipts.length > 0 ? (
                                filteredReceipts.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => handleViewReceipt(row)}>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-mono font-medium text-[10px]">
                                                <FileText size={10} /> {row.id}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 flex items-center gap-1">
                                            <CalendarDays size={12} /> {row.date}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1 rounded ${row.bg} ${row.color}`}>
                                                    <row.icon size={12} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-700">{row.source}</div>
                                                    <div className="text-[10px] text-slate-400">{row.sourceSub}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                    <Users size={12} />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-700">{row.member}</div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {(() => {
                                                            const emp = employees.find(e => {
                                                                const empName = e.name || e.fullName || (e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : '');
                                                                return empName === row.member;
                                                            });
                                                            return emp ? (emp.employeeCode || emp.employeeId || emp.empId || emp.code || 'N/A') : row.memberId || 'N/A';
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-600">AED {row.amount}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-slate-600">
                                                {row.mode === 'Card' ? <CreditCard size={12} /> : <DollarSign size={12} />}
                                                {row.mode}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 w-fit ${getStatusBadge(row.status)}`}>
                                                {row.status === 'Completed' && <CheckCircle2 size={10} />}
                                                {row.status === 'Pending' && <Clock size={10} />}
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center relative action-menu">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenActionId(openActionId === row.id ? null : row.id);
                                                }}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                                            >
                                                <MoreHorizontal size={14} />
                                            </button>

                                            {openActionId === row.id && (
                                                <div className="absolute right-8 top-0 mt-1 w-32 bg-white border border-slate-200 rounded-md shadow-lg z-50 overflow-hidden text-left">
                                                    <div className="py-1">
                                                        <button onClick={(e) => { e.stopPropagation(); handleEdit(row); }} className="w-full px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                                            <Edit size={12} className="text-slate-400" /> Edit Receipt
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setIsDrawerOpen(true); setSelectedReceipt(row); }} className="w-full px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                                            <Eye size={12} className="text-slate-400" /> View Details
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handlePrint(row); }} className="w-full px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                                            <Printer size={12} className="text-slate-400" /> Print Receipt
                                                        </button>
                                                        <button className="w-full px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                                            <Mail size={12} className="text-slate-400" /> Email Receipt
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(row); }} className="w-full px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                                            <Copy size={12} className="text-slate-400" /> Duplicate
                                                        </button>
                                                        <div className="border-t border-slate-100 my-1"></div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id, row.dbId); }} className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                                                            <Trash size={12} className="text-red-400" /> Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="9" className="px-4 py-8 text-center text-slate-400 italic">
                                        No receipts found for this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- ADD RECEIPT MODAL --- */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="bg-white rounded-lg shadow-2xl w-[700px] max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <DollarSign size={18} className="text-slate-500" /> {editingReceipt ? 'Edit Receipt' : 'Add New Receipt'}
                                </h3>
                                <p className="text-xs text-slate-500">{editingReceipt ? 'Modify existing receipt details' : 'Record a new income receipt and voucher entry'}</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Voucher Date <span className="text-red-500">*</span></label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none text-slate-700 font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Branch</label>
                                    <CustomSelect
                                        placeholder="Select branch"
                                        options={['Dubai Branch', 'Marina Branch']}
                                        value={formData.branch}
                                        onChange={(val) => setFormData({ ...formData, branch: val })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Employee / Member Name <span className="text-red-500">*</span></label>
                                    <CustomSelect
                                        placeholder={isLoadingEmployees ? "Loading employees..." : "Select employee"}
                                        options={employees.map(e => e.name || e.fullName || e.firstName + ' ' + e.lastName)}
                                        value={formData.member}
                                        onChange={(val) => setFormData({ ...formData, member: val })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Receipt Category <span className="text-red-500">*</span></label>
                                    <CustomSelect
                                        placeholder="Select category"
                                        options={['Direct Sales', 'Consulting', 'Services', 'Subscription', 'Refund In']}
                                        value={formData.category}
                                        onChange={(val) => setFormData({ ...formData, category: val })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Accounting Purpose <span className="text-red-500">*</span></label>
                                    <CustomSelect
                                        placeholder="Select purpose"
                                        options={['Against Invoice', 'Cash Sale', 'Advance Received', 'Refund In']}
                                        value={
                                            formData.purpose === 'AGAINST_INVOICE' ? 'Against Invoice' :
                                                formData.purpose === 'CASH_SALE' ? 'Cash Sale' :
                                                    formData.purpose === 'ADVANCE_RECEIVED' ? 'Advance Received' :
                                                        formData.purpose === 'REFUND_IN' ? 'Refund In' : 'Against Invoice'
                                        }
                                        onChange={(val) => {
                                            const map = {
                                                'Against Invoice': 'AGAINST_INVOICE',
                                                'Cash Sale': 'CASH_SALE',
                                                'Advance Received': 'ADVANCE_RECEIVED',
                                                'Refund In': 'REFUND_IN'
                                            };
                                            setFormData({ ...formData, purpose: map[val] });
                                        }}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Amount (AED) <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                                    <CustomSelect
                                        placeholder="Select payment mode"
                                        options={['Cash', 'Card', 'Bank Transfer']}
                                        value={formData.mode}
                                        onChange={(val) => setFormData({ ...formData, mode: val })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                                    <CustomSelect
                                        placeholder="Select status"
                                        options={['Completed', 'Pending', 'Partially Paid']}
                                        value={formData.status}
                                        onChange={(val) => setFormData({ ...formData, status: val })}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Description / Reference</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Invoice #001, Advance Payment..."
                                        value={formData.reference}
                                        onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none text-slate-700 font-medium"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                                    <textarea
                                        rows="2"
                                        placeholder="Additional notes about this receipt..."
                                        value={formData.notes || ''}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 focus:outline-none resize-none"
                                    ></textarea>
                                </div>
                            </div>

                            {/* File Upload */}
                            {/* File Upload */}
                            <div
                                onClick={handleTriggerUpload}
                                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${formData.attachment ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

                                {formData.attachment ? (
                                    <>
                                        <div className="p-3 bg-emerald-100 rounded-full shadow-sm mb-2">
                                            <CheckCircle2 size={20} className="text-emerald-600" />
                                        </div>
                                        <p className="text-xs font-bold text-slate-700">{formData.attachment.name || "File Attached"}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{(formData.attachment.size / 1024).toFixed(0)} KB • Click to change</p>
                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }} className="mt-3 px-3 py-1.5 bg-white border border-red-200 rounded text-[10px] font-bold text-red-600 hover:bg-red-50 shadow-sm flex items-center gap-1">
                                            <Trash size={10} /> Remove File
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white rounded-full shadow-sm mb-2">
                                            <UploadCloud size={20} className="text-slate-400" />
                                        </div>
                                        <p className="text-xs font-bold text-slate-700">Attach Receipt or Invoice</p>
                                        <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, PDF up to 10MB</p>
                                        <button className="mt-3 px-3 py-1.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 shadow-sm flex items-center gap-1">
                                            <Paperclip size={10} /> Choose File
                                        </button>
                                    </>
                                )}
                            </div>

                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
                            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                            <button onClick={() => { handleSave(); handlePrint(); }} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Printer size={14} /> Save & Print</button>
                            <button onClick={handleSave} className="px-5 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm">
                                {editingReceipt ? 'Update Receipt' : 'Save Receipt'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- SLIDE-IN VIEW RECEIPT DETAILS DRAWER --- */}
            {/* Background Overlay */}
            {isDrawerOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
                    onClick={handleCloseDrawer}
                ></div>
            )}

            {/* Drawer Container */}
            <div className={`fixed inset-y-0 right-0 z-50 w-[600px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedReceipt && (
                    <div className="h-full flex flex-col">
                        {/* Drawer Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <FileText size={18} className="text-slate-500" /> Receipt Details
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">{selectedReceipt.id} - {selectedReceipt.source}</p>
                            </div>
                            <button onClick={handleCloseDrawer} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Drawer Body - Scrollable */}
                        <div className="p-6 overflow-y-auto flex-1">

                            {/* Amount & Status Row */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="border border-slate-200 rounded-lg p-4 text-center bg-white shadow-sm">
                                    <p className="text-2xl font-bold text-emerald-600">AED {selectedReceipt.amount}</p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Receipt Amount</p>
                                </div>
                                <div className="border border-slate-200 rounded-lg p-4 text-center flex flex-col items-center justify-center bg-white shadow-sm">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${getStatusBadge(selectedReceipt.status)}`}>
                                        {selectedReceipt.status === 'Completed' && <CheckCircle2 size={12} />}
                                        {selectedReceipt.status === 'Pending' && <Clock size={12} />}
                                        {selectedReceipt.status}
                                    </span>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-2">Status</p>
                                </div>
                            </div>

                            {/* Receipt Info Grid */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Receipt Information</h4>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Voucher ID</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedReceipt.id}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Date</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedReceipt.date}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Payer / Employee</p>
                                        <p className="text-xs font-bold text-slate-800">{selectedReceipt.member}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Member / Emp ID</p>
                                        <p className="text-xs font-medium text-slate-700">
                                            {(() => {
                                                if (!selectedReceipt.member) return 'N/A';

                                                // Try to find matching employee by name
                                                const emp = employees.find(e => {
                                                    const empName = e.name || e.fullName || (e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : '');
                                                    return empName === selectedReceipt.member;
                                                });

                                                // Return ID if found, using the verified employeeCode field
                                                return emp ? (emp.employeeCode || emp.employeeId || emp.empId || emp.code || 'N/A') : 'N/A';
                                            })()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Payment Mode</p>
                                        <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                                            {selectedReceipt.mode === 'Card' ? <CreditCard size={12} /> : <DollarSign size={12} />}
                                            {selectedReceipt.mode}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Branch</p>
                                        <p className="text-xs font-medium text-slate-700">Dubai Branch</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Accounting Purpose</p>
                                        <p className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit mt-0.5">
                                            {selectedReceipt.purpose === 'AGAINST_INVOICE' ? 'Against Invoice' :
                                                selectedReceipt.purpose === 'CASH_SALE' ? 'Cash Sale' :
                                                    selectedReceipt.purpose === 'ADVANCE_RECEIVED' ? 'Advance Received' :
                                                        selectedReceipt.purpose === 'REFUND_IN' ? 'Refund In' : 'Against Invoice'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Income Source */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Income Source</h4>
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded ${selectedReceipt.bg} ${selectedReceipt.color}`}>
                                        <selectedReceipt.icon size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">{selectedReceipt.source}</p>
                                        <p className="text-xs text-slate-500">{selectedReceipt.sourceSub}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-2 border-b border-slate-100 pb-2">Notes</h4>
                                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
                                    Received amount for software license renewal - Q1 2024
                                </p>
                            </div>

                            {/* Audit Trail */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Audit Trail</h4>
                                <div className="grid grid-cols-2 gap-y-3">
                                    <div>
                                        <p className="text-[10px] text-slate-400">Created By</p>
                                        <p className="text-xs font-medium text-slate-700">Lisa Wang</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">Created At</p>
                                        <p className="text-xs font-medium text-slate-700">1/21/2024, 9:15:00 AM</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">Approved By</p>
                                        <p className="text-xs font-medium text-slate-700">Sarah Ahmed</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">Transaction ID</p>
                                        <p className="text-xs font-medium text-slate-700">TXN-001-2024</p>
                                    </div>
                                </div>
                            </div>

                            {/* Attachments */}
                            {selectedReceipt.attachment && (
                                <div className="mb-2">
                                    <h4 className="text-xs font-bold text-slate-700 mb-2 border-b border-slate-100 pb-2">Attachments</h4>
                                    <div
                                        onClick={() => selectedReceipt.attachment.url && window.open(selectedReceipt.attachment.url, '_blank')}
                                        className="flex items-center justify-between p-2 border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Paperclip size={14} className="text-slate-400 group-hover:text-blue-500" />
                                            <span className="text-xs text-slate-600 font-medium group-hover:text-blue-600">{selectedReceipt.attachment.name}</span>
                                        </div>
                                        <Download size={14} className="text-slate-400 hover:text-blue-600" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3 sticky bottom-0">
                            <button className="flex-1 px-4 py-2 bg-[#F5C742] rounded-md text-xs font-bold text-slate-900 hover:bg-yellow-400 shadow-sm flex items-center justify-center gap-2 transition-colors">
                                <Edit size={14} /> Edit Receipt
                            </button>
                            <div className="flex gap-2">
                                <button className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                                    <Printer size={14} /> Print
                                </button>
                                <button className="px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                                    <Mail size={14} /> Email
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
};

export default ReceiptVoucher;
