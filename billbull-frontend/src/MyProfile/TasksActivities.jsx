import React, { useState, useMemo } from 'react';
import {
    ListChecks, Plus, Search, Calendar, User, Tag,
    Edit2, Trash2, CheckCircle2, Clock, Flag, X, Save,
    CircleDot, CheckCheck
} from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES   = ['Todo', 'In Progress', 'Completed'];
const CATEGORIES = ['Reports', 'Customer Relations', 'Inventory', 'Customer Service', 'Meetings', 'Administration', 'Other'];

const PRIORITY_STYLE = {
    High:   { text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    Medium: { text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    Low:    { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

const STATUS_STYLE = {
    'In Progress': { text: 'text-blue-600',     bg: 'bg-blue-50',     border: 'border-blue-200' },
    'Todo':        { text: 'text-slate-600',    bg: 'bg-slate-100',   border: 'border-slate-200' },
    'Completed':   { text: 'text-emerald-600',  bg: 'bg-emerald-50',  border: 'border-emerald-200' },
};

// ─── Initial data ─────────────────────────────────────────────────────────────

let nextId = 7;

const INITIAL_TASKS = [
    {
        id: 1, title: 'Prepare Q1 Sales Report',
        description: 'Compile sales data and create comprehensive quarterly report',
        priority: 'High', status: 'In Progress',
        dueDate: '2024-02-15', assignedTo: 'Sarah Johnson',
        tags: ['sales', 'report', 'urgent'], category: 'Reports', completedDate: null,
    },
    {
        id: 2, title: 'Follow up with ABC Corporation',
        description: 'Schedule meeting to discuss contract renewal',
        priority: 'High', status: 'Todo',
        dueDate: '2024-02-14', assignedTo: 'Michael Chen',
        tags: ['customer', 'follow-up'], category: 'Customer Relations', completedDate: null,
    },
    {
        id: 3, title: 'Update product catalog',
        description: 'Add new products to the inventory system',
        priority: 'Medium', status: 'In Progress',
        dueDate: '2024-02-16', assignedTo: 'Self',
        tags: ['inventory', 'catalog'], category: 'Inventory', completedDate: null,
    },
    {
        id: 4, title: 'Review customer feedback',
        description: 'Analyze recent customer surveys and feedback forms',
        priority: 'Low', status: 'Todo',
        dueDate: '2024-02-13', assignedTo: 'Emma Wilson',
        tags: ['feedback', 'survey'], category: 'Customer Service', completedDate: null,
    },
    {
        id: 5, title: 'Team meeting preparation',
        description: 'Prepare agenda and materials for weekly team meeting',
        priority: 'Medium', status: 'Completed',
        dueDate: '2024-02-12', assignedTo: 'Self',
        tags: ['meeting', 'team'], category: 'Meetings', completedDate: '2/12/2024',
    },
    {
        id: 6, title: 'Update CRM records',
        description: 'Enter new customer information into CRM system',
        priority: 'Low', status: 'Todo',
        dueDate: '2024-02-17', assignedTo: 'Self',
        tags: ['crm', 'data-entry'], category: 'Administration', completedDate: null,
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${parseInt(m)}/${parseInt(d)}/${y}`;
};

const isOverdue = (iso, status) => status !== 'Completed' && new Date(iso) < new Date();

const EMPTY_FORM = {
    title: '', description: '', priority: 'Medium',
    status: 'Todo', dueDate: '', assignedTo: 'Self',
    tagsRaw: '', category: 'Reports',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, sub, subColor }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 min-w-0">
        <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <div className="p-2 bg-[#F5C742]/10 rounded-lg">{icon}</div>
        </div>
        <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
        <p className={`text-xs font-medium ${subColor || 'text-slate-500'}`}>{sub}</p>
    </div>
);

const PriorityBadge = ({ priority }) => {
    const s = PRIORITY_STYLE[priority];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
            <Flag className="h-2.5 w-2.5" /> {priority}
        </span>
    );
};

const StatusBadge = ({ status }) => {
    const s = STATUS_STYLE[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
            {status}
        </span>
    );
};

const TaskCard = ({ task, onEdit, onDelete, onToggleComplete }) => {
    const overdue   = isOverdue(task.dueDate, task.status);
    const completed = task.status === 'Completed';
    const borderColor = completed ? 'border-l-emerald-400' : 'border-l-red-400';

    return (
        <div className={`bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 ${borderColor} p-5`}>
            <div className="flex items-start gap-3">
                {/* Toggle complete circle */}
                <button
                    onClick={() => onToggleComplete(task.id)}
                    className="mt-0.5 flex-shrink-0 cursor-pointer"
                    title={completed ? 'Mark as Todo' : 'Mark as Completed'}
                >
                    {completed
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        : <CircleDot className="h-5 w-5 text-slate-300 hover:text-emerald-400 transition-colors" />
                    }
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h4 className={`text-sm font-bold ${completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {task.title}
                            </h4>
                            <p className={`text-xs mt-0.5 ${completed ? 'text-slate-300' : 'text-slate-500'}`}>
                                {task.description}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                                onClick={() => onEdit(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                                <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => onDelete(task.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due: {fmtDate(task.dueDate)}
                            {overdue && <span className="text-red-500 font-bold ml-1">(Overdue)</span>}
                        </span>
                        <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            By: {task.assignedTo}
                        </span>
                    </div>

                    {/* Tags */}
                    {task.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Tag className="h-3 w-3 text-slate-400" />
                            {task.tags.map((t, i) => (
                                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Category & Completed */}
                    <div className="flex items-center justify-between mt-3">
                        <p className="text-[11px] text-slate-400">Category: {task.category}</p>
                        {completed && task.completedDate && (
                            <p className="text-[11px] text-emerald-500 font-medium">Completed: {task.completedDate}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const TaskModal = ({ mode, form, onChange, onSave, onClose }) => {
    const title = mode === 'add' ? 'Add New Task' : 'Edit Task';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-[#B4860B]" /> {title}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task Title *</label>
                        <input
                            type="text"
                            name="title"
                            value={form.title}
                            onChange={onChange}
                            placeholder="Enter task title..."
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={onChange}
                            placeholder="Enter task description..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 resize-none"
                        />
                    </div>

                    {/* Priority + Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                            <select
                                name="priority"
                                value={form.priority}
                                onChange={onChange}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer"
                            >
                                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                            <select
                                name="status"
                                value={form.status}
                                onChange={onChange}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer"
                            >
                                {STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Due Date + Assigned To */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Due Date</label>
                            <input
                                type="date"
                                name="dueDate"
                                value={form.dueDate}
                                onChange={onChange}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned To</label>
                            <input
                                type="text"
                                name="assignedTo"
                                value={form.assignedTo}
                                onChange={onChange}
                                placeholder="e.g. Self, John Doe"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900"
                            />
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                        <select
                            name="category"
                            value={form.category}
                            onChange={onChange}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer"
                        >
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tags (comma separated)</label>
                        <input
                            type="text"
                            name="tagsRaw"
                            value={form.tagsRaw}
                            onChange={onChange}
                            placeholder="e.g. sales, report, urgent"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900"
                        />
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors shadow-sm cursor-pointer"
                    >
                        <Save className="h-3.5 w-3.5" />
                        {mode === 'add' ? 'Add Task' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const TasksActivities = () => {
    const [tasks, setTasks]             = useState(INITIAL_TASKS);
    const [search, setSearch]           = useState('');
    const [statusFilter, setStatusFilter]     = useState('All Status');
    const [priorityFilter, setPriorityFilter] = useState('All Priorities');

    const [modal, setModal]   = useState(null); // null | 'add' | 'edit'
    const [editingId, setEditingId] = useState(null);
    const [form, setForm]     = useState(EMPTY_FORM);

    // ── Filter ──────────────────────────────────────────────────────────────
    const filtered = useMemo(() => tasks.filter(t => {
        const q = search.toLowerCase();
        const matchSearch = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
        const matchStatus   = statusFilter   === 'All Status'     || t.status   === statusFilter;
        const matchPriority = priorityFilter === 'All Priorities' || t.priority === priorityFilter;
        return matchSearch && matchStatus && matchPriority;
    }), [tasks, search, statusFilter, priorityFilter]);

    // ── Stats ───────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total     = tasks.length;
        const completed = tasks.filter(t => t.status === 'Completed').length;
        const pending   = tasks.filter(t => t.status !== 'Completed').length;
        const high      = tasks.filter(t => t.priority === 'High' && t.status !== 'Completed').length;
        const rate      = total ? Math.round((completed / total) * 100) : 0;
        return { total, completed, pending, high, rate };
    }, [tasks]);

    // ── Category stats ──────────────────────────────────────────────────────
    const categoryStats = useMemo(() => {
        const map = {};
        tasks.forEach(t => {
            if (!map[t.category]) map[t.category] = { total: 0, completed: 0 };
            map[t.category].total++;
            if (t.status === 'Completed') map[t.category].completed++;
        });
        return Object.entries(map).map(([name, v]) => ({ name, ...v }));
    }, [tasks]);

    // ── Form helpers ─────────────────────────────────────────────────────────
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const openAdd = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setModal('add');
    };

    const openEdit = (task) => {
        setForm({
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            dueDate: task.dueDate,
            assignedTo: task.assignedTo,
            tagsRaw: task.tags.join(', '),
            category: task.category,
        });
        setEditingId(task.id);
        setModal('edit');
    };

    const closeModal = () => { setModal(null); setEditingId(null); };

    const handleSave = () => {
        if (!form.title.trim()) return;
        const tags = form.tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
        if (modal === 'add') {
            setTasks(prev => [...prev, {
                id: nextId++,
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority,
                status: form.status,
                dueDate: form.dueDate,
                assignedTo: form.assignedTo.trim() || 'Self',
                tags,
                category: form.category,
                completedDate: form.status === 'Completed' ? fmtDate(new Date().toISOString().slice(0, 10)) : null,
            }]);
        } else {
            setTasks(prev => prev.map(t => t.id === editingId
                ? {
                    ...t,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    priority: form.priority,
                    status: form.status,
                    dueDate: form.dueDate,
                    assignedTo: form.assignedTo.trim() || 'Self',
                    tags,
                    category: form.category,
                    completedDate: form.status === 'Completed'
                        ? (t.completedDate || fmtDate(new Date().toISOString().slice(0, 10)))
                        : null,
                }
                : t
            ));
        }
        closeModal();
    };

    const handleDelete = (id) => setTasks(prev => prev.filter(t => t.id !== id));

    const handleToggleComplete = (id) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const nowCompleted = t.status !== 'Completed';
            return {
                ...t,
                status: nowCompleted ? 'Completed' : 'Todo',
                completedDate: nowCompleted ? fmtDate(new Date().toISOString().slice(0, 10)) : null,
            };
        }));
    };

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#F7F7FA] p-4 lg:p-6 font-sans text-slate-900">

            {/* Breadcrumb */}
            <p className="text-xs text-slate-400 mb-2">My Profile &rsaquo; Tasks &amp; Activities</p>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <ListChecks className="h-6 w-6 text-[#B4860B]" /> Tasks &amp; Activities
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Manage your assigned tasks and daily activities</p>
                </div>
                <button
                    onClick={openAdd}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors shadow-sm cursor-pointer self-start md:self-auto"
                >
                    <Plus className="h-4 w-4" /> Add Task
                </button>
            </div>

            {/* Stat Cards */}
            <div className="flex flex-col sm:flex-row gap-4 mb-5">
                <StatCard
                    icon={<ListChecks className="h-4 w-4 text-[#B4860B]" />}
                    label="Total Tasks"
                    value={stats.total}
                    sub="All time tasks"
                />
                <StatCard
                    icon={<CheckCheck className="h-4 w-4 text-emerald-600" />}
                    label="Completed"
                    value={stats.completed}
                    sub={`${stats.rate}% completion rate`}
                    subColor="text-emerald-600"
                />
                <StatCard
                    icon={<Clock className="h-4 w-4 text-blue-500" />}
                    label="Pending"
                    value={stats.pending}
                    sub="Active tasks"
                />
                <StatCard
                    icon={<Flag className="h-4 w-4 text-red-500" />}
                    label="High Priority"
                    value={stats.high}
                    sub="Urgent tasks"
                />
            </div>

            {/* Search & Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer"
                >
                    <option>All Status</option>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer"
                >
                    <option>All Priorities</option>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
            </div>

            {/* Task Grid */}
            {filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-20 flex flex-col items-center justify-center text-center mb-5">
                    <ListChecks className="h-10 w-10 text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-400">No tasks found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
                    {filtered.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onToggleComplete={handleToggleComplete}
                        />
                    ))}
                </div>
            )}

            {/* Tasks by Category */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-[#B4860B]" /> Tasks by Category
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {categoryStats.map(cat => (
                        <div key={cat.name} className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs font-bold text-slate-700 mb-2">{cat.name}</p>
                            <p className="text-2xl font-bold text-[#B4860B] mb-1">{cat.total}</p>
                            <p className="text-[10px] text-slate-400">{cat.completed} completed</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {modal && (
                <TaskModal
                    mode={modal}
                    form={form}
                    onChange={handleChange}
                    onSave={handleSave}
                    onClose={closeModal}
                />
            )}
        </div>
    );
};

export default TasksActivities;
