import React, { useState, useEffect } from 'react';
import {
    MessageSquare, LayoutTemplate, Zap, BarChart3,
    Search, Plus, RefreshCw, Download,
    MoreVertical, CheckCircle2, Clock,
    Smartphone, Mail, TrendingUp, TrendingDown,
    ShoppingBag, CreditCard, Cake,
    Truck, ShoppingCart, UserX, RotateCcw, Star,
    Eye, Edit, Trash2, Copy, BarChart, X, Send, User, ChevronDown, Info, Check, Workflow
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as ReBarChart, Bar, Cell } from 'recharts';

// --- MOCK DATA ---
import { getAllCustomers } from '../../api/customerledgerApi';
import { getInquiries } from '../../api/customerApi';
import { getTemplates, createTemplate, useTemplate, getMessageLogs, logMessage, updateTemplate, deleteTemplate } from '../../api/messagingApi';

// --- MOCK DATA ---

// Retail Message Types (Kept hardcoded as requested)
const messageTypes = [
    { title: 'Price Drop Notification', desc: 'Alert customers about price reductions', icon: TrendingDown, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Price Drop Alert! {{product_name}} is now available for {{new_price}}. Grab yours before stock runs out!' },
    { title: 'Back-in-Stock Alert', desc: 'Notify customers when items are available', icon: BoxIcon, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Good news! {{product_name}} is back in stock. Order now at {{link}}.' },
    { title: 'Invoice / Receipt Notification', desc: 'Send purchase receipts and invoices', icon: FileTextIcon, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Thank you for your purchase! Your invoice #{{invoice_no}} for AED {{amount}} is attached.' },
    { title: 'Delivery Status Update', desc: 'Track and notify delivery progress', icon: Truck, color: 'bg-slate-50', tags: ['whatsapp', 'sms'], body: 'Your order #{{order_id}} is out for delivery. Track it here: {{tracking_link}}' },
    { title: 'Offer Reminder / Expiry Reminder', desc: 'Remind customers about expiring offers', icon: Clock, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Hurry! Your offer for {{discount}}% OFF expires in 24 hours. Shop now!' },
    { title: 'Payment Due Reminder', desc: 'Send payment reminders to customers', icon: CreditCard, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Reminder: Payment of AED {{amount}} for invoice #{{invoice_no}} is due tomorrow. Please pay to avoid late fees.' },
    { title: 'Birthday / Anniversary Wish', desc: 'Send personalized greetings with offers', icon: Cake, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Happy Birthday {{customer_name}}! We have a special gift for you: {{discount}}% OFF your next purchase.' },
    { title: 'Order Ready for Pickup', desc: 'Notify when order is ready for collection', icon: CheckCircle2, color: 'bg-slate-50', tags: ['whatsapp', 'sms'], body: 'Your order #{{order_id}} is ready for pickup at our store. Please bring your ID.' },
    { title: 'Order Cancellation Notice', desc: 'Inform about order cancellations', icon: UserX, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Your order #{{order_id}} has been cancelled as requested. A refund has been initiated.' },
    { title: 'Refund Processed Notification', desc: 'Confirm refund completion', icon: RotateCcw, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'Refund Processed: AED {{amount}} has been credited to your account for order #{{order_id}}.' },
    { title: 'Loyalty Point Updates', desc: 'Notify about loyalty points earned', icon: Star, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'You have earned {{points}} loyalty points! Your total balance is {{total_points}}. Redeem them on your next visit.' },
    { title: 'Cart Abandonment Alert', desc: 'Recover abandoned online carts', icon: ShoppingCart, color: 'bg-slate-50', tags: ['whatsapp', 'sms', 'email'], body: 'You left something in your cart! Complete your purchase of {{product_name}} now and get 5% off.' },
];

// Helper icons
function BoxIcon(props) { return <ShoppingBag {...props} />; }
function FileTextIcon(props) { return <div {...props}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg></div>; }

const Messaging = () => {
    const [activeTab, setActiveTab] = useState('messages');
    const [selectedChannel, setSelectedChannel] = useState('All Channels');

    // Modal State
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeType, setComposeType] = useState(null);
    const [composeChannel, setComposeChannel] = useState('whatsapp');
    const [messageContent, setMessageContent] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Variable Parsing State
    const [templateVariables, setTemplateVariables] = useState({});
    const [detectedVariables, setDetectedVariables] = useState([]);



    // Automation Rules State (Replaced with mocked empty array for now since tab is Coming Soon)
    const [rules, setRules] = useState([]);
    const [editingRule, setEditingRule] = useState(null);

    // Search and Pagination State
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const messagesPerPage = 10;

    // Dynamic Lists from Backend
    const [messagesList, setMessagesList] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [statsData, setStatsData] = useState([
        { label: 'Total Messages Sent (Today)', value: '0', sub: 'WhatsApp + SMS + Email', icon: MessageSquare, color: 'text-yellow-500', bg: 'bg-yellow-50', trend: null },
        { label: 'Delivery Success Rate', value: '100%', sub: 'Failed messages visible in log', icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50', trend: 'up' },
        { label: 'Automation Triggers Fired', value: '0', sub: 'From stock alerts, invoices, etc', icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50', trend: 'up' },
        { label: 'Promo Click Rate', value: '0%', sub: 'For offer reminders / flash sale', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-50', trend: 'down' },
    ]);


    // Customer Selection State
    const [customers, setCustomers] = useState([]);
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

    useEffect(() => {
        // Extract variables from messageContent (supports both {var} and {{var}})
        const singleBrace = messageContent.match(/\{([^{}]+)\}/g) || [];
        const doubleBrace = messageContent.match(/\{\{([^{}]+)\}\}/g) || [];
        const allMatches = [...singleBrace, ...doubleBrace];
        const uniqueVars = [...new Set(allMatches.map(m => m.replace(/\{\{?|\}\}?/g, '')))];
        setDetectedVariables(uniqueVars);
    }, [messageContent]);

    useEffect(() => {
        // Auto-fill variables from selected customer
        if (selectedCustomers.length > 0) {
            const customer = selectedCustomers[0];
            setTemplateVariables(prev => {
                const newVars = { ...prev };
                detectedVariables.forEach(v => {
                    const key = v.trim().toLowerCase();
                    if (key === 'customer_name' || key === 'name') newVars[v] = customer.name;
                    else if (key === 'mobile' || key === 'phone') newVars[v] = customer.mobile || '';
                    else if (key === 'email') newVars[v] = customer.email || '';
                    else if (key === 'company') newVars[v] = customer.company || ''; // if exists
                    // preserve manual inputs for other vars
                });
                return newVars;
            });
        }
    }, [selectedCustomers, detectedVariables]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [customersData, inquiriesData, fetchedTemplates, fetchedLogs] = await Promise.all([
                    getAllCustomers(),
                    getInquiries(),
                    getTemplates(),
                    getMessageLogs()
                ]);

                const formattedInquiries = (inquiriesData || []).map(inq => ({
                    id: `inq-${inq.id}`,
                    name: `${inq.customer} - Inquiry`,
                    mobile: inq.mobile,
                    email: inq.email,
                    type: 'inquiry'
                }));

                const allRecipients = [
                    ...(customersData || []),
                    ...formattedInquiries
                ];

                setCustomers(allRecipients);

                // Debug logging for templates

                setTemplates(fetchedTemplates || []);

                // Process Logs
                const logs = fetchedLogs || [];
                const formattedLogs = logs.map(log => ({
                    id: log.id,
                    user: log.recipientName,
                    title: log.title || 'Message',
                    preview: log.content,
                    time: new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    channel: log.channel,
                    status: log.status,
                    tags: log.tags || []
                }));
                setMessagesList(formattedLogs);

                // Update Stats
                setStatsData(prev => {
                    const newData = [...prev];
                    newData[0].value = logs.length.toString(); // Total Sent
                    return newData;
                });

            } catch (error) {
                console.error("Failed to fetch data", error);
            }
        };
        fetchData();
    }, []);

    // Templates State

    const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
    const [newTemplate, setNewTemplate] = useState({
        title: '',
        tags: ['whatsapp'],
        body: '',
        uses: 0
    });

    const handleOpenCompose = (type) => {
        setComposeType(type);
        setComposeChannel(type ? type.tags[0] : 'whatsapp');
        setMessageContent(type && type.body ? type.body : ''); // Pre-fill content if available
        setSelectedCustomers([]); // Reset selected customers
        setCustomerSearch('');
        setIsComposeOpen(true);
        setIsDropdownOpen(false);
    };

    const handleUseTemplate = (template) => {
        setComposeType({ title: 'Template', tags: template.tags, id: template.id });
        setComposeChannel(template.tags[0]);
        setMessageContent(template.body);
        setIsComposeOpen(true);
    };

    const handleEditTemplate = (template) => {
        setNewTemplate(template);
        setIsCreateTemplateOpen(true);
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm("Are you sure you want to delete this template?")) return;
        try {
            await deleteTemplate(id);
            setTemplates(templates.filter(t => t.id !== id));
        } catch (error) {
            alert("Failed to delete template");
        }
    };

    const handleSaveTemplate = async () => {
        if (!newTemplate.title || !newTemplate.body) {
            alert("Please fill in title and body");
            return;
        }

        try {
            let savedTemplate;
            if (newTemplate.id) {
                // Update existing template
                savedTemplate = await updateTemplate(newTemplate.id, newTemplate);
                setTemplates(templates.map(t => t.id === savedTemplate.id ? savedTemplate : t));
            } else {
                // Create new template
                savedTemplate = await createTemplate(newTemplate);
                setTemplates([...templates, savedTemplate]);
            }

            setIsCreateTemplateOpen(false);
            setNewTemplate({
                title: '',
                tags: ['whatsapp'],
                body: '',
                uses: 0
            });
        } catch (err) {
            console.error(err);
            alert('Failed to save template');
        }
    };

    const handleDeleteRule = (id) => {
        if (window.confirm('Are you sure you want to delete this rule?')) {
            setRules(rules.filter(rule => rule.id !== id));
        }
    };

    const handleSaveRule = () => {
        setRules(rules.map(r => r.id === editingRule.id ? editingRule : r));
        setEditingRule(null);
    };

    const handleSendMessage = () => {
        if (selectedCustomers.length === 0) {
            alert("Please select a customer");
            return;
        }

        const customer = selectedCustomers[0];

        // LOG MESSAGE FUNCTION
        const logAndUpdateStats = (c, channel, status) => {
            // Replace variables one last time for logging (supports both {var} and {{var}})
            let finalMessage = messageContent;
            detectedVariables.forEach(v => {
                // Replace both single and double brace formats
                finalMessage = finalMessage.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), templateVariables[v] || `{{${v}}}`);
                finalMessage = finalMessage.replace(new RegExp(`\\{${v}\\}`, 'g'), templateVariables[v] || `{${v}}`);
            });

            logMessage({
                recipientName: c.name,
                recipientContact: channel === 'email' ? c.email : c.mobile,
                channel: channel,
                status: status,
                content: finalMessage,
                title: composeType ? composeType.title : 'Manual Message',
                tags: composeType && composeType.tags ? composeType.tags : ['Manual']
            }).then(savedLog => {
                if (savedLog) {
                    setMessagesList(prev => [{
                        id: savedLog.id,
                        user: savedLog.recipientName,
                        title: savedLog.title,
                        preview: savedLog.content,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        channel: savedLog.channel,
                        status: savedLog.status,
                        tags: savedLog.tags
                    }, ...prev]);

                    // Update stats locally
                    setStatsData(prev => {
                        const newData = [...prev];
                        newData[0].value = (parseInt(newData[0].value) + 1).toString();
                        return newData;
                    });
                }
            });

            if (composeType && composeType.title === 'Template' && composeType.id) {
                useTemplate(composeType.id).then(() => {
                    // Refresh templates to show updated usage count
                    getTemplates().then(data => {
                        if (data) setTemplates(data);
                    });
                });
            }
        };


        if (composeChannel === 'whatsapp') {
            if (!customer.mobile) {
                alert(`Customer ${customer.name} does not have a mobile number.`);
                return;
            }
            const phone = customer.mobile.replace(/\D/g, '');

            let finalMessage = messageContent;
            detectedVariables.forEach(v => {
                finalMessage = finalMessage.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), templateVariables[v] || `{{${v}}}`);
            });

            logAndUpdateStats(customer, 'whatsapp', 'delivered');

            const text = encodeURIComponent(finalMessage);
            const url = `https://wa.me/${phone}?text=${text}`;
            window.open(url, '_blank');
        } else if (composeChannel === 'email') {
            if (!customer.email) {
                alert(`Customer ${customer.name} does not have an email.`);
                return;
            }

            let finalMessage = messageContent;
            detectedVariables.forEach(v => {
                finalMessage = finalMessage.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), templateVariables[v] || `{{${v}}}`);
            });

            logAndUpdateStats(customer, 'email', 'sent');

            const subject = encodeURIComponent("Message from BillBull");
            const body = encodeURIComponent(finalMessage);
            const url = `mailto:${customer.email}?subject=${subject}&body=${body}`;
            window.location.href = url;
        } else if (composeChannel === 'sms') {
            if (!customer.mobile) {
                alert(`Customer ${customer.name} does not have a mobile number.`);
                return;
            }

            let finalMessage = messageContent;
            detectedVariables.forEach(v => {
                finalMessage = finalMessage.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), templateVariables[v] || `{{${v}}}`);
            });

            logAndUpdateStats(customer, 'sms', 'sent');

            const phone = customer.mobile.replace(/\D/g, '');
            const body = encodeURIComponent(finalMessage);
            const smsLink = `sms:${phone}?body=${body}`;
            window.location.href = smsLink;
        }

        setIsComposeOpen(false);
    };



    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] text-slate-900 overflow-y-auto relative">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="text-[#F5C742]" size={28} /> Messaging</h1>
                        <p className="text-xs text-slate-500">Send transactional alerts, promotional messages, and automated notifications across WhatsApp, SMS & Email.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleOpenCompose(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 font-bold rounded-lg text-xs shadow-sm transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" /> New Message
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs transition-colors">
                            <LayoutTemplate className="h-3.5 w-3.5" /> Templates
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs transition-colors">
                            <Download className="h-3.5 w-3.5" /> Delivery Logs
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 mt-4 border-b border-slate-100">
                    {['Messages', 'Templates', 'Automation Rules', 'Analytics'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab.toLowerCase().split(' ')[0])}
                            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.toLowerCase().split(' ')[0]
                                ? 'border-[#F5C742] text-slate-900'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                {tab === 'Messages' && <MessageSquare className="h-3.5 w-3.5" />}
                                {tab === 'Templates' && <LayoutTemplate className="h-3.5 w-3.5" />}
                                {tab === 'Automation Rules' && <Zap className="h-3.5 w-3.5" />}
                                {tab === 'Analytics' && <BarChart3 className="h-3.5 w-3.5" />}
                                {tab}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-6 space-y-6 w-full">
                {/* --- MESSAGES TAB --- */}
                {activeTab === 'messages' && (
                    <>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {statsData.map((stat, index) => (
                                <div key={index} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between h-28">
                                    <div>
                                        <div className="flex items-start justify-between mb-1">
                                            <h3 className="text-xs font-medium text-slate-500">{stat.label}</h3>
                                            <div className={`p-1.5 rounded-md ${stat.bg} ${stat.color}`}>
                                                <stat.icon className="h-4 w-4" />
                                            </div>
                                        </div>
                                        <div className="text-2xl font-bold text-slate-900 mb-0.5">{stat.value}</div>
                                        <div className="text-[10px] text-slate-400 font-medium">{stat.sub}</div>
                                    </div>
                                    {stat.trend && (
                                        <div className="relative mt-auto h-8 w-full overflow-hidden flex items-end justify-end opacity-50">
                                            <BarChart3 className="h-10 w-full text-blue-100" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Channel Filters */}
                        <div className="flex items-center gap-3">
                            {['All Channels', 'WhatsApp', 'SMS', 'Email'].map(channel => (
                                <button
                                    key={channel}
                                    onClick={() => setSelectedChannel(channel)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${selectedChannel === channel
                                        ? 'bg-[#F5C742] border-[#F5C742] text-slate-900'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {channel === 'WhatsApp' && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                                        {channel === 'SMS' && <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                                        {channel === 'Email' && <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />}
                                        {channel}
                                    </div>
                                </button>
                            ))}
                        </div>


                        {/* Retail Message Types Grid */}
                        <div className="space-y-3">
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Retail Message Types</h2>
                                <p className="text-xs text-slate-500">Quick access to transactional and promotional message triggers</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {messageTypes.map((type, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleOpenCompose(type)}
                                        className="bg-white p-3 rounded-lg border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group flex items-start gap-3"
                                    >
                                        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-[#F5C742]/10 transition-colors text-slate-600 group-hover:text-slate-900 flex-shrink-0">
                                            <type.icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-slate-900 text-sm mb-0.5 line-clamp-1">{type.title}</h3>
                                            <p className="text-[10px] text-slate-500 mb-2 line-clamp-2 leading-tight h-[2.2em]">{type.desc}</p>
                                            <div className="flex gap-1 flex-wrap">
                                                {type.tags.map(tag => (
                                                    <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium border uppercase
                          ${tag === 'whatsapp' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                          ${tag === 'sms' ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}
                          ${tag === 'email' ? 'bg-purple-50 text-purple-700 border-purple-100' : ''}
                        `}>
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Message Feed / List */}
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            {/* List Header */}
                            <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                                <div className="relative flex-1 max-w-sm">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search customer, message..."
                                        value={messageSearchQuery}
                                        onChange={(e) => {
                                            setMessageSearchQuery(e.target.value);
                                            setCurrentPage(1); // Reset to first page on search
                                        }}
                                        className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 bg-white"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="hidden sm:flex items-center gap-4 text-[10px] font-medium text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-700">All Triggers <MoreVertical className="h-2.5 w-2.5" /></div>
                                        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-700">All Status <MoreVertical className="h-2.5 w-2.5" /></div>
                                        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-700">All Tags <MoreVertical className="h-2.5 w-2.5" /></div>
                                    </div>
                                    <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                                        <RefreshCw className="h-3 w-3" /> Refresh
                                    </button>
                                </div>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {(() => {
                                    // Filter messages based on search query
                                    const filteredMessages = messagesList.filter(msg => {
                                        const searchLower = messageSearchQuery.toLowerCase();
                                        return (
                                            msg.user.toLowerCase().includes(searchLower) ||
                                            msg.title.toLowerCase().includes(searchLower) ||
                                            msg.preview.toLowerCase().includes(searchLower) ||
                                            msg.channel.toLowerCase().includes(searchLower) ||
                                            msg.status.toLowerCase().includes(searchLower)
                                        );
                                    });

                                    // Calculate pagination
                                    const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                                    const startIndex = (currentPage - 1) * messagesPerPage;
                                    const endIndex = startIndex + messagesPerPage;
                                    const paginatedMessages = filteredMessages.slice(startIndex, endIndex);

                                    if (paginatedMessages.length === 0) {
                                        return (
                                            <div className="px-4 py-12 text-center">
                                                <MessageSquare className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                                <p className="text-sm font-medium text-slate-500">No messages found</p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {messageSearchQuery ? 'Try adjusting your search' : 'Send your first message to get started'}
                                                </p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <>
                                            {paginatedMessages.map((msg) => (
                                                <div key={msg.id} className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 group">
                                                    <div className="relative">
                                                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0 border border-slate-200">
                                                            {msg.channel === 'whatsapp' && <MessageSquare className="h-3.5 w-3.5" />}
                                                            {msg.channel === 'email' && <Mail className="h-3.5 w-3.5" />}
                                                            {msg.channel === 'sms' && <Smartphone className="h-3.5 w-3.5" />}
                                                        </div>
                                                        <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white flex items-center justify-center text-[8px]
                          ${msg.channel === 'whatsapp' ? 'bg-green-500 text-white' : ''}
                          ${msg.channel === 'email' ? 'bg-purple-500 text-white' : ''}
                          ${msg.channel === 'sms' ? 'bg-blue-500 text-white' : ''}
                      `}>
                                                            {msg.channel === 'whatsapp' && <MessageSquare className="h-2 w-2" />}
                                                            {msg.channel === 'email' && <Mail className="h-2 w-2" />}
                                                            {msg.channel === 'sms' && <Smartphone className="h-2 w-2" />}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 min-w-0 pt-0.5">
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <h4 className="text-sm font-bold text-slate-900 leading-none">{msg.user}</h4>
                                                            <span className="text-[10px] text-slate-400">{msg.time}</span>
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-600 mb-0.5">{msg.title}</div>

                                                        <div className="flex items-start justify-between gap-4">
                                                            <p className="text-xs text-slate-500 line-clamp-1">{msg.preview}</p>
                                                            <div className="flex items-center gap-2 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                                                {/* Tags */}
                                                                {msg.tags.map(tag => (
                                                                    <span key={tag} className="text-[9px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {/* Status Badge */}
                                                                <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 uppercase tracking-wider
                                ${msg.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : ''}
                                ${msg.status === 'opened' || msg.status === 'seen' ? 'bg-blue-50 text-blue-600 border-blue-100' : ''}
                            `}>
                                                                    {msg.status}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {/* Pagination Controls */}
                                            {totalPages > 1 && (
                                                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                                                    <div className="text-xs text-slate-500">
                                                        Showing {startIndex + 1}-{Math.min(endIndex, filteredMessages.length)} of {filteredMessages.length} messages
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                            disabled={currentPage === 1}
                                                            className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            Previous
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                                                <button
                                                                    key={page}
                                                                    onClick={() => setCurrentPage(page)}
                                                                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${currentPage === page
                                                                        ? 'bg-[#F5C742] text-slate-900 border border-[#F5C742]'
                                                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                                                        }`}
                                                                >
                                                                    {page}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <button
                                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                            disabled={currentPage === totalPages}
                                                            className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="px-3 py-2 border-t border-slate-100 text-center bg-slate-50/50">
                                <button className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold uppercase tracking-wide transition-colors">
                                    View All Messages
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* --- TEMPLATES TAB --- */}
                {activeTab === 'templates' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Message Templates</h2>
                                <p className="text-xs text-slate-500">Reusable templates for retail communication</p>
                            </div>
                            <button
                                onClick={() => setIsCreateTemplateOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 font-bold rounded-lg text-xs shadow-sm transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" /> New Template
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {templates.map((tpl, i) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="text-sm font-bold text-slate-900">{tpl.title}</h3>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{tpl.uses} uses</span>
                                    </div>
                                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100 mb-3 italic leading-relaxed">
                                        {tpl.body}
                                    </p>
                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                                        <div className="flex gap-1.5">
                                            {tpl.tags.map(tag => (
                                                <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded font-medium border uppercase
                                 ${tag === 'whatsapp' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                                 ${tag === 'sms' ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}
                                 ${tag === 'email' ? 'bg-purple-50 text-purple-700 border-purple-100' : ''}
                                `}>{tag}</span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditTemplate(tpl)}
                                                className="text-slate-400 hover:text-blue-600"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(tpl.id)}
                                                className="text-slate-400 hover:text-red-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleUseTemplate(tpl)}
                                                className="text-xs font-bold text-slate-700 hover:text-[#F5C742] transition-colors"
                                            >
                                                Use Now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- AUTOMATION RULES TAB --- */}
                {activeTab === 'automation' && (
                    <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                        <div className="bg-yellow-50 p-4 rounded-full mb-4">
                            <Workflow className="h-8 w-8 text-yellow-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Automation Rules Coming Soon</h2>
                        <p className="text-sm text-slate-500 max-w-md">
                            We are building powerful automation triggers for your retail workflows.
                            Stay tuned for updates!
                        </p>
                    </div>
                )}

                {/* --- ANALYTICS TAB --- */}
                {activeTab === 'analytics' && (
                    <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                        <div className="bg-yellow-50 p-4 rounded-full mb-4">
                            <BarChart3 className="h-8 w-8 text-yellow-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Analytics Dashboard Coming Soon</h2>
                        <p className="text-sm text-slate-500 max-w-md">
                            Detailed insights and message performance metrics will be available here soon.
                        </p>
                    </div>
                )}

            </div>

            {/* --- COMPOSE DRAWER --- */}
            {
                isComposeOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-end">
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsComposeOpen(false)}
                        />

                        {/* Drawer */}
                        <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                            {/* Drawer Header */}
                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Compose Message</h2>
                                    <p className="text-xs text-slate-500">Send a new message to your customers</p>
                                </div>
                                <button
                                    onClick={() => setIsComposeOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Drawer Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">

                                {/* Message Type Selection */}
                                <div className="space-y-1.5 relative">
                                    <label className="text-xs font-semibold text-slate-700">Message Type</label>
                                    <div
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors"
                                    >
                                        <span>{composeType ? composeType.title : 'Manual Message'}</span>
                                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                    </div>

                                    {isDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200">
                                            {['Manual Message', 'Template', 'Trigger-Based Notification', 'Promotional Message'].map((option) => {
                                                const isSelected = (composeType ? composeType.title : 'Manual Message') === option;
                                                return (
                                                    <div
                                                        key={option}
                                                        onClick={() => {
                                                            setComposeType({ title: option, tags: ['whatsapp'] }); // simplified for now
                                                            setIsDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-2.5 text-sm flex items-center justify-between cursor-pointer transition-colors
                                                        ${isSelected
                                                                ? 'bg-[#F43F5E] text-white font-medium'
                                                                : 'text-slate-700 hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        <span>{option}</span>
                                                        {isSelected && <Check className="h-4 w-4" />}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Template Selection inside Compose */}
                                {(composeType?.title === 'Template') && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-700">Select Template</label>
                                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                            {templates.map((tpl, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setMessageContent(tpl.body);
                                                        setComposeChannel(tpl.tags[0]);
                                                    }}
                                                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer text-xs"
                                                >
                                                    <div className="font-bold text-slate-900">{tpl.title}</div>
                                                    <div className="text-slate-500 line-clamp-1">{tpl.body}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Channel Selection */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">Channel</label>
                                    <div className="flex gap-2 p-1 bg-slate-50 rounded-lg border border-slate-100">
                                        {['whatsapp', 'sms', 'email'].map(ch => (
                                            <button
                                                key={ch}
                                                onClick={() => setComposeChannel(ch)}
                                                className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-all ${composeChannel === ch
                                                    ? ch === 'whatsapp' ? 'bg-[#25D366] text-white shadow-sm' :
                                                        ch === 'sms' ? 'bg-blue-500 text-white shadow-sm' :
                                                            'bg-purple-500 text-white shadow-sm'
                                                    : 'text-slate-500 hover:bg-white hover:shadow-sm'
                                                    }`}
                                            >
                                                {ch === 'whatsapp' && <MessageSquare className="h-3.5 w-3.5" />}
                                                {ch === 'sms' && <Smartphone className="h-3.5 w-3.5" />}
                                                {ch === 'email' && <Mail className="h-3.5 w-3.5" />}
                                                <span className="capitalize">{ch}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Customer Select (Multi-Select) */}
                                <div className="space-y-1.5 relative">
                                    <label className="text-xs font-semibold text-slate-700">Customers</label>
                                    <div className="border border-slate-200 rounded-lg bg-white p-2 focus-within:ring-2 focus-within:ring-[#F5C742]/50">
                                        <div className="flex flex-wrap gap-2 mb-1.5">
                                            {selectedCustomers.map(cust => (
                                                <span key={cust.id} className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded-full border border-slate-200">
                                                    {cust.name}
                                                    <X
                                                        className="h-3 w-3 cursor-pointer hover:text-red-500"
                                                        onClick={() => setSelectedCustomers(prev => prev.filter(c => c.id !== cust.id))}
                                                    />
                                                </span>
                                            ))}
                                        </div>
                                        <div className="relative">
                                            <User className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder={selectedCustomers.length > 0 ? "Add another customer..." : "Search customer..."}
                                                value={customerSearch}
                                                onChange={(e) => {
                                                    setCustomerSearch(e.target.value);
                                                    setShowCustomerDropdown(true);
                                                }}
                                                onFocus={() => setShowCustomerDropdown(true)}
                                                className="w-full pl-8 pr-3 py-1 text-sm outline-none placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>

                                    {showCustomerDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowCustomerDropdown(false)} />
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                                {customers
                                                    .filter(c => !selectedCustomers.find(sc => sc.id === c.id)) // Filter out already selected
                                                    .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())) // Filter by search
                                                    .map(customer => (
                                                        <div
                                                            key={customer.id}
                                                            onClick={() => {
                                                                setSelectedCustomers([...selectedCustomers, customer]);
                                                                setCustomerSearch('');
                                                                // Keep dropdown open for multiple selection if needed, or close it. 
                                                                // Let's keep input focused but clear it.
                                                            }}
                                                            className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 flex justify-between items-center"
                                                        >
                                                            <span>{customer.name}</span>
                                                            <span className="text-[10px] text-slate-400">{customer.mobile || customer.email}</span>
                                                        </div>
                                                    ))
                                                }
                                                {customers.length === 0 && (
                                                    <div className="px-4 py-3 text-sm text-slate-400 text-center">No customers found</div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Message Content */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">Message Content</label>
                                    <textarea
                                        rows={6}
                                        placeholder="Type your message here..."
                                        value={messageContent}
                                        onChange={(e) => setMessageContent(e.target.value)}
                                        className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none"
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {['{{customer_name}}', '{{order_id}}', '{{item_name}}', '{{discount_code}}'].map(variable => (
                                            <button
                                                key={variable}
                                                onClick={() => setMessageContent(prev => prev ? prev + ' ' + variable : variable)}
                                                className="text-[10px] px-2 py-1 bg-slate-100 border border-slate-200 rounded text-slate-500 hover:bg-[#F5C742]/10 hover:text-[#b58e25] transition-colors font-mono"
                                            >
                                                {variable}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-400">Use double curly braces to insert dynamic variables.</p>

                                    {detectedVariables.length > 0 && (
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2 space-y-2">
                                            <p className="text-xs font-semibold text-slate-700">Fill Variables</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {detectedVariables.map(v => (
                                                    <div key={v}>
                                                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{v}</label>
                                                        <input
                                                            type="text"
                                                            value={templateVariables[v] || ''}
                                                            onChange={(e) => setTemplateVariables(prev => ({ ...prev, [v]: e.target.value }))}
                                                            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#F5C742]"
                                                            placeholder={`Enter ${v}`}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Drawer Footer */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50">
                                {composeType && composeType.title !== 'Manual Message' && (
                                    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                        <Info className="h-4 w-4 text-slate-400" />
                                        <span className="text-xs text-slate-700">Using template: <span className="font-semibold">{composeType.title}</span></span>
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => setIsComposeOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSendMessage}
                                        className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg shadow-sm transition-all hover:translate-y-[-1px]"
                                    >
                                        <Send className="h-4 w-4" /> Send Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* --- EDIT RULE MODAL --- */}
            {
                editingRule && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingRule(null)} />
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-base font-bold text-slate-900">Edit Automation Rule</h3>
                                <button onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Rule Title</label>
                                    <input
                                        type="text"
                                        value={editingRule.title}
                                        onChange={(e) => setEditingRule({ ...editingRule, title: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Trigger Event</label>
                                    <input
                                        type="text"
                                        value={editingRule.trigger}
                                        onChange={(e) => setEditingRule({ ...editingRule, trigger: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Action</label>
                                    <input
                                        type="text"
                                        value={editingRule.action}
                                        onChange={(e) => setEditingRule({ ...editingRule, action: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Target Segment</label>
                                    <input
                                        type="text"
                                        value={editingRule.segment}
                                        onChange={(e) => setEditingRule({ ...editingRule, segment: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => setEditingRule(null)} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-colors">Cancel</button>
                                <button onClick={handleSaveRule} className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded transition-colors">Save Changes</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* --- CREATE TEMPLATE MODAL --- */}
            {
                isCreateTemplateOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCreateTemplateOpen(false)} />
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-base font-bold text-slate-900">Create New Template</h3>
                                <button onClick={() => setIsCreateTemplateOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Template Name</label>
                                    <input
                                        type="text"
                                        value={newTemplate.title}
                                        onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                                        placeholder="e.g. Welcome Message"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Template Body</label>
                                    <textarea
                                        rows={4}
                                        value={newTemplate.body}
                                        onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                                        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none"
                                        placeholder="Type your template content..."
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {['{{customer_name}}', '{{order_id}}', '{{item_name}}', '{{discount_code}}'].map(variable => (
                                            <button
                                                key={variable}
                                                onClick={() => setNewTemplate(prev => ({ ...prev, body: prev.body ? prev.body + ' ' + variable : variable }))}
                                                className="text-[10px] px-2 py-1 bg-slate-100 border border-slate-200 rounded text-slate-500 hover:bg-[#F5C742]/10 hover:text-[#b58e25] transition-colors font-mono"
                                            >
                                                {variable}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Use {'{{variable}}'} for dynamic content.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Primary Channel</label>
                                    <div className="flex gap-2">
                                        {['whatsapp', 'sms', 'email'].map(ch => (
                                            <button
                                                key={ch}
                                                onClick={() => {
                                                    const tags = newTemplate.tags.includes(ch)
                                                        ? newTemplate.tags.filter(t => t !== ch)
                                                        : [...newTemplate.tags, ch];
                                                    setNewTemplate({ ...newTemplate, tags });
                                                }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize ${newTemplate.tags.includes(ch)
                                                    ? 'bg-[#F5C742] border-[#F5C742] text-slate-900'
                                                    : 'bg-white border-slate-200 text-slate-600'
                                                    }`}
                                            >
                                                {ch}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsCreateTemplateOpen(false)}
                                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveTemplate}
                                    className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-md"
                                >
                                    Save Template
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Messaging;
