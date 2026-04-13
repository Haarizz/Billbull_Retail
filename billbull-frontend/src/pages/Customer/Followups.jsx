import React, { useState, useEffect, useMemo } from 'react';
import { getInquiries, addFollowUp, updateInquiry } from '../../api/customerApi';
import { getAllQuotations } from '../../api/quotationApi';
import { getAllSalesOrders } from '../../api/salesorderApi';
import { getProductById } from '../../api/productsApi';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, CheckCircle, AlertCircle, FileText, Activity,
    Search, Filter, Plus, ChevronDown, MoreVertical, Phone, Mail,
    MessageSquare, User, RefreshCw, Send, ArrowRight, X,
    Edit, Trash2, BarChart2, List
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const Followups = () => {
    const navigate = useNavigate();

    // --- STATE ---
    const [followupsList, setFollowupsList] = useState([]);
    const [inquiries, setInquiries] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [inquiriesData, quotationsData, salesOrdersData] = await Promise.all([
                    getInquiries(),
                    getAllQuotations(),
                    getAllSalesOrders()
                ]);

                setInquiries(inquiriesData || []);
                const quotes = quotationsData || [];
                const orders = salesOrdersData || [];

                // Transform Inquiries into Follow-up Table Rows
                const mappedFollowups = (inquiriesData || [])
                    .filter(inq => inq.followUpDate) // ✅ FILTER ONLY SCHEDULED FOLLOW-UPS
                    .map(inq => {
                        const normalize = (str) => String(str || '').toLowerCase().trim();
                        const iCust = normalize(inq.customer);

                        // Find linked quotation
                        const linkedQuote = quotes.find(q => {
                            const qCust = normalize(q.customer);
                            // 1. Direct Inquiry Link
                            if (q.inquiryId && String(q.inquiryId) === String(inq.id)) return true;
                            // 2. Reference Number Link
                            if (q.reference && inq.inquiryNumber && q.reference === inq.inquiryNumber) return true;
                            // 3. Loose Name Matching (fuzzy fallback)
                            if (iCust && qCust && (qCust === iCust || qCust.includes(iCust) || iCust.includes(qCust))) return true;
                            return false;
                        });

                        // Match Linked Sales Order (via Linked Quotation)
                        const linkedOrder = linkedQuote
                            ? orders.find(so => so.linkedQuotation === linkedQuote.qtnNo)
                            : null;

                        const idSuffix = String(inq.id).padStart(5, '0');
                        const fuId = `FU-${new Date().getFullYear()}-${idSuffix}`;

                        // Calculate Inquiry Status Logic
                        let derivedStatus = 'New';
                        if (linkedOrder && linkedOrder.status === 'INVOICED') {
                            derivedStatus = 'Invoiced';
                        } else if (linkedQuote) {
                            derivedStatus = 'Converted';
                        } else {
                            // Map Priority to Hot/Warm/Cool
                            const p = String(inq.priority || '').toLowerCase();
                            if (['high', 'critical', 'urgent'].includes(p)) derivedStatus = 'Hot';
                            else if (['medium'].includes(p)) derivedStatus = 'Warm';
                            else if (['low'].includes(p)) derivedStatus = 'Cool';
                            else derivedStatus = inq.status || 'New';
                        }

                        // Determine follow-up status (respects backend Completed status)
                        let followUpStatus = 'Pending';
                        if (inq.status === 'Completed') {
                            followUpStatus = 'Completed';
                        } else if (linkedOrder) {
                            followUpStatus = 'Converted';
                        } else {
                            followUpStatus = inq.status || 'Pending';
                        }

                        return {
                            id: fuId,
                            backendId: inq.id,
                            customer: inq.customer || 'Unknown Customer',
                            phone: inq.mobile || '-',
                            inquiry: inq.inquiryNumber || `Ref-${inq.id}`,
                            inquiryStatus: derivedStatus,
                            scheduleDate: inq.followUpDate, // ✅ Only use explicit follow-up date
                            scheduleTime: inq.followUpTime || '-',
                            type: inq.source || 'Call',
                            assignedTo: inq.assignedTo || 'Unassigned',
                            priority: inq.priority || 'Medium',
                            status: followUpStatus,
                            quotation: linkedQuote || null,
                            salesOrder: linkedOrder || null, // Store the linked sales order
                            rawInquiry: inq // Store full inquiry object for passing to other pages
                        };
                    });

                setFollowupsList(mappedFollowups);

            } catch (error) {
                console.error("Failed to fetch data", error);
            }
        };
        fetchData();
    }, []);

    // Helper to refresh data
    const refreshData = async () => {
        try {
            const inquiriesData = await getInquiries();
            const quotationsData = await getAllQuotations();
            const salesOrdersData = await getAllSalesOrders();

            setInquiries(inquiriesData || []);
            const quotes = quotationsData || [];
            const orders = salesOrdersData || [];

            const mappedFollowups = (inquiriesData || [])
                .filter(inq => inq.followUpDate) // ✅ FILTER ONLY SCHEDULED FOLLOW-UPS
                .map(inq => {
                    const normalize = (str) => String(str || '').toLowerCase().trim();
                    const iCust = normalize(inq.customer);

                    const linkedQuote = quotes.find(q => {
                        const qCust = normalize(q.customer);
                        if (q.inquiryId && String(q.inquiryId) === String(inq.id)) return true;
                        if (q.reference && inq.inquiryNumber && q.reference === inq.inquiryNumber) return true;
                        if (iCust && qCust && (qCust === iCust || qCust.includes(iCust) || iCust.includes(qCust))) return true;
                        return false;
                    });

                    const linkedOrder = linkedQuote
                        ? orders.find(so => so.linkedQuotation === linkedQuote.qtnNo)
                        : null;

                    const idSuffix = String(inq.id).padStart(5, '0');
                    const fuId = `FU-${new Date().getFullYear()}-${idSuffix}`;

                    // Calculate Inquiry Status Logic
                    let derivedStatus = 'New';
                    if (linkedOrder && linkedOrder.status === 'INVOICED') {
                        derivedStatus = 'Invoiced';
                    } else if (linkedQuote) {
                        derivedStatus = 'Converted';
                    } else {
                        const p = String(inq.priority || '').toLowerCase();
                        if (['high', 'critical', 'urgent'].includes(p)) derivedStatus = 'Hot';
                        else if (['medium'].includes(p)) derivedStatus = 'Warm';
                        else if (['low'].includes(p)) derivedStatus = 'Cool';
                        else derivedStatus = inq.status || 'New';
                    }

                    // Determine follow-up status (respects backend Completed status)
                    let followUpStatus = 'Pending';
                    if (inq.status === 'Completed') {
                        followUpStatus = 'Completed';
                    } else if (linkedOrder) {
                        followUpStatus = 'Converted';
                    } else {
                        followUpStatus = inq.status || 'Pending';
                    }

                    return {
                        id: fuId,
                        backendId: inq.id,
                        customer: inq.customer || 'Unknown Customer',
                        phone: inq.mobile || '-',
                        inquiry: inq.inquiryNumber || `Ref-${inq.id}`,
                        inquiryStatus: derivedStatus,
                        scheduleDate: inq.followUpDate, // ✅ Only use explicit follow-up date
                        scheduleTime: inq.followUpTime || '-',
                        type: inq.source || 'Call',
                        assignedTo: inq.assignedTo || 'Unassigned',
                        priority: inq.priority || 'Medium',
                        status: followUpStatus,
                        quotation: linkedQuote || null,
                        salesOrder: linkedOrder || null,
                        rawInquiry: inq // Store full inquiry object for passing to other pages
                    };
                });

            setFollowupsList(mappedFollowups);
        } catch (e) { console.error(e); }
    };

    // Modals State
    const [modals, setModals] = useState({
        add: false,
        convert: false,
        complete: false,
        reschedule: false
    });
    const [selectedFollowup, setSelectedFollowup] = useState(null);
    // viewMode removed as per request

    // Form States
    const [newFollowup, setNewFollowup] = useState({
        customer: '', phone: '', inquiry: '', scheduleDate: '', scheduleTime: '', type: 'Call', assignedTo: '', priority: 'Medium'
    });
    const [completeNote, setCompleteNote] = useState('');
    const [nextAction, setNextAction] = useState({ action: '', date: '' });
    const [rescheduleData, setRescheduleData] = useState({ date: '', time: '' });

    // Filter and Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({
        dateRange: 'all',
        branch: 'all',
        status: 'all',
        priority: 'all'
    });

    // Dynamic Stats Calculation
    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const totalFollowups = followupsList.length;
        const pendingToday = followupsList.filter(f => f.scheduleDate === today && f.status !== 'Completed').length;
        const overdue = followupsList.filter(f => f.scheduleDate < today && f.status !== 'Completed').length;
        const completedThisWeek = followupsList.filter(f => f.status === 'Completed').length; // Simplified
        const conversionRate = totalFollowups > 0
            ? ((followupsList.filter(f => f.quotation || f.salesOrder).length / totalFollowups) * 100).toFixed(1)
            : '0.0';

        return [
            { title: 'Total Follow-ups', value: totalFollowups.toString(), icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
            { title: 'Pending Today', value: pendingToday.toString(), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
            { title: 'Overdue', value: overdue.toString(), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
            { title: 'Completed (Week)', value: completedThisWeek.toString(), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { title: 'Conversion Rate', value: `${conversionRate}%`, icon: Activity, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { title: 'Avg Response', value: '2.3 hours', icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ];
    }, [followupsList]);

    const barChartData = [
        { name: 'Amal Khan', completed: 48, onTime: 42, total: 55 },
        { name: 'Fahad Ali', completed: 35, onTime: 30, total: 45 },
        { name: 'Firoz Ahmed', completed: 42, onTime: 38, total: 50 },
        { name: 'Sara Mohamed', completed: 18, onTime: 15, total: 25 },
    ];

    const pieChartData = [
        { name: 'Call', value: 65.5, color: '#facc15' },
        { name: 'Visit', value: 81, color: '#8b5cf6' },
        { name: 'Email', value: 62.9, color: '#3b82f6' },
        { name: 'WhatsApp', value: 76.2, color: '#22c55e' },
    ];

    const conversionData = [
        { name: 'Amal Khan', value: 66.7, count: '38/42' },
        { name: 'Fahad Ali', value: 57.9, count: '22/38' },
        { name: 'Firoz Ahmed', value: 51.7, count: '15/29' },
        { name: 'Sara Mohamed', value: 73.3, count: '11/15' },
    ];

    const salesConversionData = [
        { name: 'Amal Khan', value: 42.9, count: '12/28' },
        { name: 'Fahad Ali', value: 36.4, count: '8/22' },
        { name: 'Firoz Ahmed', value: 33.3, count: '5/15' },
        { name: 'Sara Mohamed', value: 54.5, count: '6/11' },
    ];


    // --- HELPERS ---
    const getStatusStyle = (status) => {
        switch (status) {
            case 'Completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'Pending': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Overdue': return 'bg-red-50 text-red-600 border-red-100';
            case 'Converted': return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'New': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getPriorityStyle = (priority) => {
        switch (String(priority).toLowerCase()) {
            case 'critical': return 'bg-rose-50 text-rose-600 border-rose-100 font-bold';
            case 'urgent': return 'bg-red-50 text-red-600 border-red-100 font-bold';
            case 'high': return 'bg-orange-50 text-orange-600 border-orange-100';
            case 'medium': return 'bg-yellow-50 text-yellow-600 border-yellow-100';
            case 'low': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getInquiryStatusStyle = (status) => {
        const s = String(status || '').toLowerCase();
        if (s === 'invoiced') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
        if (s === 'converted') return 'bg-purple-50 text-purple-600 border-purple-100';
        if (s === 'hot') return 'bg-red-50 text-red-600 border-red-100';
        if (s === 'warm') return 'bg-orange-50 text-orange-600 border-orange-100';
        if (s === 'cool') return 'bg-blue-50 text-blue-600 border-blue-100';
        if (s === 'new') return 'bg-slate-100 text-slate-600 border-slate-200';
        return 'bg-slate-50 text-slate-500';
    };

    const getTypeIcon = (type) => {
        switch (String(type).toLowerCase()) {
            case 'call':
            case 'phone call': return <Phone size={14} className="text-blue-500" />;
            case 'whatsapp': return <MessageSquare size={14} className="text-green-500" />;
            case 'email': return <Mail size={14} className="text-purple-500" />;
            case 'visit':
            case 'walk-in':
            case 'walk in': return <User size={14} className="text-teal-500" />;
            case 'website': return <Activity size={14} className="text-indigo-500" />;
            default: return <Activity size={14} className="text-slate-400" />;
        }
    };

    const openModal = (type, item = null) => {
        setSelectedFollowup(item);
        setModals({ ...modals, [type]: true });

        // Reset specific form states if needed
        if (type === 'reschedule' && item) {
            setRescheduleData({ date: item.scheduleDate, time: item.scheduleTime });
        }
    };

    const closeModal = (type) => {
        setModals({ ...modals, [type]: false });
        setSelectedFollowup(null);
    };

    const handleCustomerChange = (e) => {
        const selectedCustomer = e.target.value;
        const inquiry = inquiries.find(i => i.customer === selectedCustomer);
        if (inquiry) {
            setNewFollowup({
                ...newFollowup,
                customer: selectedCustomer,
                phone: inquiry.mobile, // Mapped from 'mobile' in API
                inquiry: inquiry.inquiryNumber || inquiry.id, // Prefer inquiryNumber
                assignedTo: inquiry.assignedTo,
                priority: inquiry.priority
            });
        } else {
            setNewFollowup({
                ...newFollowup,
                customer: selectedCustomer,
                phone: '',
                inquiry: '',
                assignedTo: '',
                priority: 'Medium'
            });
        }
    };

    const handleAddFollowup = async () => {
        // Find backend ID
        let backendId = null;
        const inquiry = inquiries.find(i =>
            (i.inquiryNumber && i.inquiryNumber === newFollowup.inquiry) ||
            (i.customer === newFollowup.customer)
        );
        if (inquiry) backendId = inquiry.id;

        if (!backendId) {
            console.error("No valid inquiry found to attach follow-up");
            closeModal('add');
            return;
        }

        try {
            await addFollowUp(backendId, {
                type: newFollowup.type,
                summary: 'Scheduled Follow-up via UI',
                nextFollowUpDate: newFollowup.scheduleDate,
                nextFollowUpTime: newFollowup.scheduleTime,
                // Assuming date is in YYYY-MM-DD format
                status: 'Pending'
            });
            await refreshData();
        } catch (e) {
            console.error(e);
        }

        setNewFollowup({ customer: '', phone: '', inquiry: '', scheduleDate: '', scheduleTime: '', type: 'Call', assignedTo: '', priority: 'Medium' });
        closeModal('add');
    };

    const handleComplete = async () => {
        if (!selectedFollowup || !selectedFollowup.backendId) return;

        try {
            // 1. Add follow-up note
            await addFollowUp(selectedFollowup.backendId, {
                type: 'Note',
                summary: completeNote || 'Completed Follow-up',
                status: 'Completed',
                nextFollowUpDate: null
            });

            // 2. Update parent Inquiry status
            const currentInq = selectedFollowup.rawInquiry || {};

            // Explicitly force status to 'Completed'
            await updateInquiry(selectedFollowup.backendId, {
                ...currentInq,
                status: 'Completed',
                // Ensure we don't accidentally revert other fields if rawInquiry is stale
                lastFollowUpDate: new Date().toISOString().split('T')[0]
            });

            await refreshData();
        } catch (e) {
            console.error("Failed to complete follow-up", e);
            alert("Failed to update status. Please try again.");
        }

        closeModal('complete');
    };

    const handleReschedule = async () => {
        if (!selectedFollowup || !selectedFollowup.backendId) return;

        try {
            await addFollowUp(selectedFollowup.backendId, {
                type: 'Reschedule',
                summary: 'Rescheduled Follow-up',
                status: 'Pending',
                nextFollowUpDate: rescheduleData.date
            });
            await refreshData();
        } catch (e) { console.error(e); }

        closeModal('reschedule');
    };

    const handleQuote = async (item) => {
        try {
            const inquiry = item.rawInquiry || { ...item };
            // Enrich Items
            const enrichedItems = await Promise.all((inquiry.items || []).map(async (itm) => {
                try {
                    const productId = itm.productId || (itm.product && itm.product.id);
                    if (!productId) {
                        return {
                            itemCode: 'N/A',
                            description: itm.productName || itm.description,
                            unit: 'Unit',
                            quantity: itm.quantity,
                            price: itm.standardPrice || itm.price || 0,
                            discount: 0,
                            taxRate: 5,
                            lineTotal: (itm.quantity * (itm.standardPrice || itm.price || 0))
                        };
                    }

                    const productData = await getProductById(productId);
                    // Handle aggregate response or direct product object
                    const product = productData.product || productData;
                    const pricing = productData.pricing || {};
                    const inventory = productData.inventory || {};
                    const unitObj = inventory.defaultUnit || {};

                    const price = pricing.retailPrice || itm.standardPrice || product.price || 0;
                    const total = (price * itm.quantity);
                    const taxAmt = total * 0.05;

                    return {
                        id: Math.random(),
                        itemId: product.id,
                        itemCode: product.code || 'N/A',
                        description: product.name || itm.productName,
                        unit: unitObj.name || (unitObj.code) || 'Msg',
                        quantity: itm.quantity || 1,
                        price: price,
                        discount: 0,
                        taxRate: 5,
                        taxAmount: taxAmt,
                        lineTotal: total + taxAmt,
                        primaryImage: productData.primaryImage || ''
                    };
                } catch (err) {
                    console.error("Failed to enrich item", err);
                    return {
                        itemCode: 'ERR',
                        description: itm.productName,
                        quantity: itm.quantity,
                        price: itm.price || 0,
                        lineTotal: 0
                    };
                }
            }));

            navigate('/sales/quotation', {
                state: {
                    inquiry: inquiry,
                    items: enrichedItems
                }
            });

        } catch (error) {
            console.error("Failed to prepare quote", error);
        }
    };

    const handleConvert = () => {
        // Logic to convert would go here (e.g. API call)
        closeModal('convert');
        navigate('/sales/orders/create'); // Example redirect
    };

    // ✅ REAL ANALYTICS DATA CALCULATION
    const analyticsData = useMemo(() => {
        const totalInquiries = inquiries.length;
        const totalFollowups = followupsList.length;

        // 1. Follow-Ups by Sales Reps
        const repsMap = {};
        followupsList.forEach(item => {
            const rep = item.assignedTo || 'Unassigned';
            repsMap[rep] = (repsMap[rep] || 0) + 1;
        });
        const followupsByRep = Object.keys(repsMap).map(rep => ({ name: rep, value: repsMap[rep] }));

        // 2. Follow-Up Methods Success Rate (by volume for now)
        const methodsMap = {};
        followupsList.forEach(item => {
            const method = item.type || 'Other';
            methodsMap[method] = (methodsMap[method] || 0) + 1;
        });
        const followupsByMethod = Object.keys(methodsMap).map(method => ({ name: method, value: methodsMap[method] }));

        // 3. Inquiry -> Quotation Conversion
        const linkedQuotesCount = followupsList.filter(i => i.quotation).length;
        const inquiryConversion = [
            { name: 'Converted to Quote', value: linkedQuotesCount },
            { name: 'Pending Inquiry', value: totalInquiries - linkedQuotesCount }
        ];

        // 4. Quotation -> Sales Conversion
        const linkedOrdersCount = followupsList.filter(i => i.salesOrder && (i.salesOrder.status === 'CONFIRMED' || i.salesOrder.status === 'INVOICED')).length;
        const salesConversion = [
            { name: 'Converted to Sale', value: linkedOrdersCount },
            { name: 'Pending Quote', value: linkedQuotesCount - linkedOrdersCount }
        ];

        // 5. Follow Ups Completed On Time (Mocking "On Time" as Completed for now)
        const completedCount = followupsList.filter(i => i.status === 'Completed').length;
        const completionStats = [
            { name: 'Completed', value: completedCount },
            { name: 'Pending', value: totalFollowups - completedCount }
        ];

        return { followupsByRep, followupsByMethod, inquiryConversion, salesConversion, completionStats };
    }, [followupsList, inquiries]);

    // Filtered and Searched Follow-ups List
    const filteredFollowups = useMemo(() => {
        return followupsList.filter(item => {
            // Search filter
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
                item.customer.toLowerCase().includes(searchLower) ||
                item.inquiry.toLowerCase().includes(searchLower) ||
                item.phone.toLowerCase().includes(searchLower) ||
                item.assignedTo.toLowerCase().includes(searchLower);

            // Status filter
            const matchesStatus = filters.status === 'all' || item.status === filters.status;

            // Priority filter
            const matchesPriority = filters.priority === 'all' || item.priority.toLowerCase() === filters.priority.toLowerCase();

            // Date range filter
            let matchesDateRange = true;
            if (filters.dateRange !== 'all') {
                const today = new Date();
                const itemDate = new Date(item.scheduleDate);

                if (filters.dateRange === 'today') {
                    matchesDateRange = item.scheduleDate === today.toISOString().split('T')[0];
                } else if (filters.dateRange === 'week') {
                    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    matchesDateRange = itemDate >= weekAgo && itemDate <= today;
                } else if (filters.dateRange === 'month') {
                    matchesDateRange = itemDate.getMonth() === today.getMonth() &&
                        itemDate.getFullYear() === today.getFullYear();
                }
            }

            return matchesSearch && matchesStatus && matchesPriority && matchesDateRange;
        });
    }, [followupsList, searchQuery, filters]);

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6 pb-20">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Calendar className="text-[#F5C742]" size={28} /> Customer Follow-Ups
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Manage scheduled follow-ups, track conversions & monitor performance.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button className="hidden md:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-600 text-xs font-bold hover:bg-slate-50 shadow-sm">
                        <FileText size={16} /> Add Note
                    </button>
                    <button className="hidden md:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-600 text-xs font-bold hover:bg-slate-50 shadow-sm">
                        <Send size={16} /> Send Price List
                    </button>
                    <button
                        onClick={() => navigate('/sales/quotation')}
                        className="hidden md:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-600 text-xs font-bold hover:bg-slate-50 shadow-sm"
                    >
                        <FileText size={16} /> Create Quotation
                    </button>
                    <button
                        onClick={() => openModal('add')}
                        className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 bg-white border border-slate-200 rounded-md text-slate-600 text-xs font-bold shadow-sm hover:bg-slate-50 w-full md:w-auto"
                    >
                        <Plus size={16} /> Add Follow-up
                    </button>
                </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-white p-3 md:p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[9px] md:text-[10px] text-slate-500 font-bold mb-1">{stat.title}</p>
                            <h3 className={`text-lg md:text-xl font-bold ${stat.color}`}>{stat.value}</h3>
                        </div>
                        <div className={`p-1.5 md:p-2 rounded-full ${stat.bg}`}>
                            <stat.icon size={16} className={`${stat.color} md:w-[18px] md:h-[18px]`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* ===================== LIST VIEW ===================== */}
            <>
                {/* FILTERS */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 md:p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
                        <div className="md:col-span-4 relative">
                            <Search className="absolute left-3 top-2.5 md:top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search customer, inquiry, mobile..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 md:py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400 text-slate-600"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <select
                                value={filters.dateRange}
                                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                                className="w-full px-3 py-2.5 md:py-2 text-xs border border-slate-200 rounded-md text-slate-600 focus:outline-none bg-white"
                            >
                                <option value="all">All Dates</option>
                                <option value="today">Today</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">This Month</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <select className="w-full px-3 py-2.5 md:py-2 text-xs border border-slate-200 rounded-md text-slate-600 focus:outline-none bg-white">
                                <option>All Branches</option>
                                <option>Main Branch</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                className="w-full px-3 py-2.5 md:py-2 text-xs border border-slate-200 rounded-md text-slate-600 focus:outline-none bg-white"
                            >
                                <option value="all">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="Completed">Completed</option>
                                <option value="Converted">Converted</option>
                            </select>
                        </div>
                        <div className="md:col-span-1">
                            <select
                                value={filters.priority}
                                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                                className="w-full px-3 py-2.5 md:py-2 text-xs border border-slate-200 rounded-md text-slate-600 focus:outline-none bg-white"
                            >
                                <option value="all">All Priority</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                        <div className="md:col-span-1 flex justify-center md:justify-end">
                            <button
                                onClick={refreshData}
                                className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs font-bold px-4 py-2.5 md:py-0"
                            >
                                <RefreshCw size={14} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>


                {/* MOBILE CARD VIEW */}
                <div className="md:hidden space-y-3 mb-6">
                    {filteredFollowups.map((item) => (
                        <div key={item.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-slate-800">{item.customer}</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">{item.phone}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[10px] font-bold border ${getStatusStyle(item.status)}`}>
                                    {item.status}
                                </span>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold mb-0.5">INQUIRY</p>
                                    <p className="text-slate-700">{item.inquiry}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold mb-0.5">PRIORITY</p>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityStyle(item.priority)}`}>
                                        {item.priority}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold mb-0.5">SCHEDULE</p>
                                    <div className="flex items-center gap-1 text-slate-600">
                                        <Calendar size={10} /> {item.scheduleDate}
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                                        <Clock size={10} /> {item.scheduleTime}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold mb-0.5">ASSIGNED TO</p>
                                    <p className="text-slate-700">{item.assignedTo}</p>
                                </div>
                            </div>

                            {/* Quotation/Order Info */}
                            {(item.quotation || item.salesOrder) && (
                                <div className="mb-3 p-2 bg-slate-50 rounded border border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold mb-1">
                                        {item.salesOrder ? 'SALES ORDER' : 'QUOTATION'}
                                    </p>
                                    {item.salesOrder ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-700 font-medium">{item.salesOrder.soNumber}</span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${item.salesOrder.status === 'INVOICED' ? 'bg-blue-100 text-blue-700' :
                                                item.salesOrder.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                {item.salesOrder.status}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-700 font-medium">{item.quotation.qtnNo}</span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${item.quotation.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                                item.quotation.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                                    'bg-orange-100 text-orange-700'
                                                }`}>
                                                {item.quotation.status === 'PENDING_APPROVAL' ? 'Pending' : item.quotation.status}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2">
                                {item.status !== 'Completed' && (
                                    <button
                                        onClick={() => openModal('complete', item)}
                                        disabled={!item.salesOrder || item.salesOrder.status !== 'INVOICED'}
                                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border text-xs font-bold rounded
                                            ${(!item.salesOrder || item.salesOrder.status !== 'INVOICED')
                                                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                                            }`}
                                    >
                                        <CheckCircle size={14} /> Complete
                                    </button>
                                )}

                                {item.status !== 'Completed' && !item.salesOrder && (
                                    item.quotation ? (
                                        item.quotation.status === 'APPROVED' && (
                                            <button
                                                onClick={() => navigate('/sales/order', {
                                                    state: {
                                                        quotation: {
                                                            ...item.quotation,
                                                            customer: item.customer || item.quotation.customer,
                                                            phone: item.phone !== '-' ? item.phone : '',
                                                            source: item.type,
                                                            inquiryId: item.inquiry
                                                        }
                                                    }
                                                })}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded hover:bg-emerald-100 active:bg-emerald-200"
                                            >
                                                <ArrowRight size={14} /> Convert
                                            </button>
                                        )
                                    ) : (
                                        <button
                                            onClick={() => handleQuote(item)}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded hover:bg-amber-100 active:bg-amber-200"
                                        >
                                            <Plus size={14} /> Quote
                                        </button>
                                    )
                                )}

                                {item.status !== 'Completed' && (
                                    <button
                                        onClick={() => openModal('reschedule', item)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 active:bg-slate-100"
                                    >
                                        <RefreshCw size={14} /> Reschedule
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* TABLE - Desktop Only */}
                <div className="hidden md:block bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                {['Follow-Up ID', 'Customer', 'Inquiry', 'Schedule', 'Type', 'Assigned To', 'Priority', 'Status', 'Quotation', 'Actions'].map((h, i) => (
                                    <th key={i} className={`px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider ${h === 'Actions' ? 'text-center' : ''}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredFollowups.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{item.id}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-xs font-bold text-slate-700">{item.customer}</div>
                                        <div className="text-[10px] text-slate-400">{item.phone}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-slate-900">{item.inquiry}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded w-fit mt-1 border ${getInquiryStatusStyle(item.inquiryStatus)}`}>
                                                {item.inquiryStatus}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        <div className="flex items-center gap-1"><Calendar size={10} /> {item.scheduleDate}</div>
                                        <div className="flex items-center gap-1 mt-0.5 text-slate-400"><Clock size={10} /> {item.scheduleTime}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                            {getTypeIcon(item.type)}
                                            <span>{item.type}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">{item.assignedTo}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityStyle(item.priority)}`}>
                                            {item.priority}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusStyle(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-amber-600 font-medium">
                                        {item.salesOrder ? (
                                            <div className="flex flex-col">
                                                <span>{item.salesOrder.soNumber}</span>
                                                <span className={`text-[9px] px-1 rounded w-fit ${item.salesOrder.status === 'INVOICED' ? 'bg-blue-50 text-blue-600' :
                                                    item.salesOrder.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-600' :
                                                        'bg-slate-50 text-slate-600'
                                                    }`}>
                                                    {item.salesOrder.status}
                                                </span>
                                            </div>
                                        ) : item.quotation ? (
                                            <div className="flex flex-col">
                                                <span>{item.quotation.qtnNo}</span>
                                                <span className={`text-[9px] px-1 rounded w-fit ${item.quotation.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                                                    item.quotation.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                                                    }`}>
                                                    {item.quotation.status === 'PENDING_APPROVAL' ? 'Pending' : item.quotation.status}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {item.status !== 'Completed' && (
                                                <button
                                                    onClick={() => openModal('complete', item)}
                                                    disabled={
                                                        // Disable if no quotation, or quotation not approved, OR sales order not invoiced
                                                        !item.salesOrder || item.salesOrder.status !== 'INVOICED'
                                                    }
                                                    className={`flex items-center gap-1 px-2 py-1 border text-[10px] font-bold rounded
                                                    ${(!item.salesOrder || item.salesOrder.status !== 'INVOICED')
                                                            ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                        }`}
                                                    title={(!item.salesOrder || item.salesOrder.status !== 'INVOICED')
                                                        ? "Requires Invoiced Sales Order to Complete"
                                                        : "Mark as Completed"
                                                    }
                                                >
                                                    <CheckCircle size={12} /> Complete
                                                </button>
                                            )}

                                            {item.status !== 'Completed' && !item.salesOrder && (
                                                item.quotation ? (
                                                    item.quotation.status === 'APPROVED' && (
                                                        <button
                                                            onClick={() => navigate('/sales/order', {
                                                                state: {
                                                                    quotation: {
                                                                        ...item.quotation,
                                                                        customer: item.customer || item.quotation.customer,
                                                                        phone: item.phone !== '-' ? item.phone : '',
                                                                        source: item.type,
                                                                        inquiryId: item.inquiry
                                                                    }
                                                                }
                                                            })}
                                                            className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold hover:text-emerald-700"
                                                            title="Convert Approved Quote to Order"
                                                        >
                                                            <ArrowRight size={12} /> Convert
                                                        </button>
                                                    )
                                                ) : (
                                                    <button
                                                        onClick={() => handleQuote(item)}
                                                        className="flex items-center gap-1 text-amber-600 text-[10px] font-bold hover:text-amber-700"
                                                    >
                                                        <Plus size={12} /> Quote
                                                    </button>
                                                )
                                            )}

                                            {item.status !== 'Completed' && (
                                                <button
                                                    onClick={() => openModal('reschedule', item)}
                                                    className="text-slate-400 hover:text-slate-600 ml-1"
                                                    title="Reschedule Follow-up"
                                                >
                                                    <Clock size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
                        <span>Showing 6 follow-ups</span>
                        <div className="flex gap-2">
                            <button className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50">Prev</button>
                            <button className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">Next</button>
                        </div>
                    </div>
                </div>
            </>

            {/* ===================== ANALYTICS VIEW ===================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 ani-fade-in mt-6">

                {/* 1. Follow-Ups by Sales Reps */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 col-span-1 md:col-span-2 lg:col-span-2">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <User size={14} className="text-indigo-500" /> Follow-Ups by Sales Reps
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Performance distribution across the sales team</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analyticsData.followupsByRep} barSize={40}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="value" name="Total Follow-Ups" fill="#6366f1" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Follow-Up Methods Success */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 col-span-1">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Activity size={14} className="text-emerald-500" /> Follow-Up Methods
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Most effective communication channels</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analyticsData.followupsByMethod}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    cornerRadius={5}
                                >
                                    {analyticsData.followupsByMethod.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#ec4899'][index % 4]} stroke="none" />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Inquiry -> Quotation Conversion */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 col-span-1">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <FileText size={14} className="text-blue-500" /> Inquiry Conversion
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Inquiries converted to Quotations</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analyticsData.inquiryConversion}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    dataKey="value"
                                    paddingAngle={2}
                                    cornerRadius={4}
                                >
                                    <Cell fill="#3b82f6" stroke="none" />
                                    <Cell fill="#e2e8f0" stroke="none" />
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <text x="50%" y="50%" dy={8} textAnchor="middle" fill="#334155" fontSize={20} fontWeight="bold">
                                    {((analyticsData.inquiryConversion[0].value / (analyticsData.inquiryConversion[0].value + analyticsData.inquiryConversion[1].value || 1)) * 100).toFixed(0)}%
                                </text>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. Quotation -> Sales Conversion */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 col-span-1">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <CheckCircle size={14} className="text-amber-500" /> Sales Conversion
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Quotations converted to Sales</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analyticsData.salesConversion} layout="vertical" barSize={24}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="value" name="Count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 5. Follow-Ups Completed On Time */}
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 col-span-1">
                    <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Clock size={14} className="text-green-500" /> Completion Rate
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Follow-ups marked as completed</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analyticsData.completionStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    dataKey="value"
                                    paddingAngle={2}
                                    cornerRadius={4}
                                >
                                    <Cell fill="#10b981" stroke="none" /> {/* Completed */}
                                    <Cell fill="#fca5a5" stroke="none" /> {/* Pending/Late */}
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <text x="50%" y="50%" dy={8} textAnchor="middle" fill="#334155" fontSize={20} fontWeight="bold">
                                    {((analyticsData.completionStats[0].value / (analyticsData.completionStats[0].value + analyticsData.completionStats[1].value || 1)) * 100).toFixed(0)}%
                                </text>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>





            {/* --- MODALS --- */}

            {/* ADD FOLLOW-UP MODAL */}
            {
                modals.add && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">Add Follow-up</h3>
                                <button onClick={() => closeModal('add')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 grid gap-4">
                                {/* ... inputs ... */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Customer Name</label>
                                    <select
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-yellow-400"
                                        value={newFollowup.customer}
                                        onChange={handleCustomerChange}
                                    >
                                        <option value="">Select Customer</option>
                                        {inquiries.map(item => (
                                            <option key={item.id} value={item.customer}>{item.customer} ({item.inquiryNumber || item.id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Inquiry ID (Auto-filled)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-600 cursor-not-allowed"
                                        value={newFollowup.inquiry}
                                        readOnly
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Mobile Number</label>
                                    <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md" value={newFollowup.phone} onChange={(e) => setNewFollowup({ ...newFollowup, phone: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                                        <input type="date" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md" value={newFollowup.scheduleDate} onChange={(e) => setNewFollowup({ ...newFollowup, scheduleDate: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Time</label>
                                        <input type="time" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md" value={newFollowup.scheduleTime} onChange={(e) => setNewFollowup({ ...newFollowup, scheduleTime: e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                                        <select className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white" value={newFollowup.type} onChange={(e) => setNewFollowup({ ...newFollowup, type: e.target.value })}>
                                            <option>Call</option><option>Visit</option><option>Whatsapp</option><option>Email</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Priority</label>
                                        <select className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white" value={newFollowup.priority} onChange={(e) => setNewFollowup({ ...newFollowup, priority: e.target.value })}>
                                            <option>High</option><option>Medium</option><option>Low</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Assigned To</label>
                                    <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md" value={newFollowup.assignedTo} onChange={(e) => setNewFollowup({ ...newFollowup, assignedTo: e.target.value })} />
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => closeModal('add')} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                                <button onClick={handleAddFollowup} className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 shadow-sm">Save Follow-up</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* CONVERT MODAL */}
            {
                modals.convert && selectedFollowup && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Quotation Details</h3>
                                    <p className="text-xs text-slate-500">{selectedFollowup.quotation} • {selectedFollowup.customer}</p>
                                </div>
                                <button onClick={() => closeModal('convert')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <p className="text-xs text-slate-400 mb-1">Customer</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedFollowup.customer}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 mb-1">Mobile</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedFollowup.phone}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 mb-1">Valid Until</p>
                                        <p className="text-sm font-bold text-slate-700">2025-01-15</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 mb-1">Status</p>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Sent</span>
                                    </div>
                                </div>

                                <h4 className="text-xs font-bold text-slate-500 mb-2">Items</h4>
                                <div className="border border-slate-100 rounded-lg overflow-hidden mb-6">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2 font-medium">Product</th>
                                                <th className="px-3 py-2 font-medium">Qty</th>
                                                <th className="px-3 py-2 font-medium">Unit Price</th>
                                                <th className="px-3 py-2 font-medium">Discount</th>
                                                <th className="px-3 py-2 font-medium text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-600">
                                            <tr>
                                                <td className="px-3 py-2">Coca Cola 300ml</td>
                                                <td className="px-3 py-2">12</td>
                                                <td className="px-3 py-2">AED 2.50</td>
                                                <td className="px-3 py-2">AED 0.00</td>
                                                <td className="px-3 py-2 text-right">AED 30.00</td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-2">Samsung Galaxy A24</td>
                                                <td className="px-3 py-2">1</td>
                                                <td className="px-3 py-2">AED 899.00</td>
                                                <td className="px-3 py-2">AED 50.00</td>
                                                <td className="px-3 py-2 text-right">AED 849.00</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex justify-end mb-6">
                                    <div className="w-48 space-y-2">
                                        <div className="flex justify-between text-xs text-slate-600">
                                            <span>Subtotal</span>
                                            <span>AED 879.00</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-red-500">
                                            <span>Discount</span>
                                            <span>-AED 50.00</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-600">
                                            <span>Tax (5%)</span>
                                            <span>AED 43.95</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-bold text-slate-800 border-t border-slate-200 pt-2">
                                            <span>Total</span>
                                            <span className="text-amber-500">AED 872.95</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => closeModal('convert')} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-100">Close</button>
                                <button onClick={handleConvert} className="px-4 py-2 bg-amber-400 text-slate-900 rounded text-xs font-bold hover:bg-amber-500 shadow-sm flex items-center gap-2">
                                    <ArrowRight size={14} /> Convert to Order
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* COMPLETE MODAL */}
            {
                modals.complete && selectedFollowup && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">Complete Follow-Up</h3>
                                <button onClick={() => closeModal('complete')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                                <p className="text-xs text-slate-500">Mark this follow-up as completed and schedule next action</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Completion Notes *</label>
                                    <textarea
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-400 h-24 resize-none"
                                        placeholder="What was discussed? Customer response? Key points..."
                                        value={completeNote}
                                        onChange={(e) => setCompleteNote(e.target.value)}
                                    ></textarea>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Next Action</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-400"
                                        placeholder="e.g., Send revised quotation, Schedule demo..."
                                        value={nextAction.action}
                                        onChange={(e) => setNextAction({ ...nextAction, action: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Schedule Next Follow-Up</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-emerald-400"
                                        value={nextAction.date}
                                        onChange={(e) => setNextAction({ ...nextAction, date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => closeModal('complete')} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                                <button onClick={handleComplete} className="px-4 py-2 bg-emerald-500 text-white rounded text-xs font-bold hover:bg-emerald-600 shadow-sm flex items-center gap-2">
                                    <CheckCircle size={14} /> Complete Follow-Up
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* RESCHEDULE MODAL */}
            {
                modals.reschedule && selectedFollowup && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">Reschedule Follow-Up</h3>
                                <button onClick={() => closeModal('reschedule')} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                                <p className="text-xs text-slate-500">Change the scheduled date and time for this follow-up</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">New Date *</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400"
                                        value={rescheduleData.date}
                                        onChange={(e) => setRescheduleData({ ...rescheduleData, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">New Time</label>
                                    <input
                                        type="time"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-yellow-400"
                                        value={rescheduleData.time}
                                        onChange={(e) => setRescheduleData({ ...rescheduleData, time: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => closeModal('reschedule')} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                                <button onClick={handleReschedule} className="px-4 py-2 bg-yellow-400 text-slate-900 rounded text-xs font-bold hover:bg-yellow-500 shadow-sm flex items-center gap-2">
                                    <Clock size={14} /> Reschedule
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
};

export default Followups;
