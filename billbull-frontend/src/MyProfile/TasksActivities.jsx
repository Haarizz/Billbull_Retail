import React, { useState, useEffect, useMemo } from 'react';
import {
    ListChecks, Plus, Search, Calendar, User, Tag,
    Edit2, Trash2, CheckCircle2, Clock, Flag, X, Save,
    CircleDot, CheckCheck
} from 'lucide-react';
import { getMyTasks, createTask, updateTask, deleteTask } from '../api/taskApi';
import toast from 'react-hot-toast';

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITIES  = ['High', 'Medium', 'Low'];
const STATUSES    = ['Todo', 'In Progress', 'Completed'];
const CATEGORIES  = ['Reports', 'Customer Relations', 'Inventory', 'Customer Service', 'Meetings', 'Administration', 'Other'];

const PRIORITY_STYLE = {
    HIGH:   { text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    MEDIUM: { text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    LOW:    { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

const STATUS_STYLE = {
    'IN_PROGRESS': { text: 'text-blue-600',     bg: 'bg-blue-50',   border: 'border-blue-200' },
    'TODO':        { text: 'text-slate-600',    bg: 'bg-slate-100', border: 'border-slate-200' },
    'COMPLETED':   { text: 'text-emerald-600',  bg: 'bg-emerald-50',border: 'border-emerald-200' },
};

const priorityStyle = (p) => PRIORITY_STYLE[(p || '').toUpperCase()] || PRIORITY_STYLE.MEDIUM;
const statusStyle   = (s) => STATUS_STYLE[(s || '').toUpperCase()]   || STATUS_STYLE.TODO;
const statusLabel   = (s) => ({ TODO: 'Todo', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' })[(s || '').toUpperCase()] || s;
const priorityLabel = (p) => ({ HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' })[(p || '').toUpperCase()] || p;

const isOverdue = (dueDate, status) =>
    status !== 'COMPLETED' && dueDate && new Date(dueDate) < new Date();

const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

// Convert form values (display) → API values (backend)
const toApiStatus   = (s) => s.toUpperCase().replace(' ', '_');
const toApiPriority = (p) => p.toUpperCase();

// ─── Empty form ───────────────────────────────────────────────────────────────

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
    const s = priorityStyle(priority);
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
            <Flag className="h-2.5 w-2.5" /> {priorityLabel(priority)}
        </span>
    );
};

const StatusBadge = ({ status }) => {
    const s = statusStyle(status);
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
            {statusLabel(status)}
        </span>
    );
};

// ─── Task Card ────────────────────────────────────────────────────────────────

const TaskCard = ({ task, onEdit, onDelete, onToggleComplete, saving }) => {
    const completed   = (task.status || '').toUpperCase() === 'COMPLETED';
    const overdue     = isOverdue(task.dueDate, task.status);
    const borderColor = completed ? 'border-l-emerald-400' : 'border-l-red-400';

    return (
        <div className={`bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 ${borderColor} p-5`}>
            <div className="flex items-start gap-3">
                <button onClick={() => onToggleComplete(task)} disabled={saving}
                    className="mt-0.5 flex-shrink-0 cursor-pointer disabled:opacity-50"
                    title={completed ? 'Mark as Todo' : 'Mark as Completed'}>
                    {completed
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        : <CircleDot className="h-5 w-5 text-slate-300 hover:text-emerald-400 transition-colors" />}
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
                            <button onClick={() => onEdit(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                                <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => onDelete(task.id)} disabled={saving}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 flex-wrap">
                        {task.dueDate && (
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Due: {fmtDate(task.dueDate)}
                                {overdue && <span className="text-red-500 font-bold ml-1">(Overdue)</span>}
                            </span>
                        )}
                        {task.assignedTo && (
                            <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> By: {task.assignedTo}
                            </span>
                        )}
                    </div>

                    {task.tags?.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Tag className="h-3 w-3 text-slate-400" />
                            {task.tags.map((t, i) => (
                                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">{t}</span>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-3">
                        {task.category && <p className="text-[11px] text-slate-400">Category: {task.category}</p>}
                        {completed && task.completedDate && (
                            <p className="text-[11px] text-emerald-500 font-medium">Completed: {fmtDate(task.completedDate)}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const TaskModal = ({ mode, form, onChange, onSave, onClose, saving }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-[#B4860B]" />
                    {mode === 'add' ? 'Add New Task' : 'Edit Task'}
                </h2>
                <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="px-6 py-5 space-y-4">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task Title *</label>
                    <input type="text" name="title" value={form.title} onChange={onChange}
                        placeholder="Enter task title..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                    <textarea name="description" value={form.description} onChange={onChange}
                        placeholder="Enter task description..." rows={3}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Priority</label>
                        <select name="priority" value={form.priority} onChange={onChange}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer">
                            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                        <select name="status" value={form.status} onChange={onChange}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer">
                            {STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Due Date</label>
                        <input type="date" name="dueDate" value={form.dueDate} onChange={onChange}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned To</label>
                        <input type="text" name="assignedTo" value={form.assignedTo} onChange={onChange}
                            placeholder="e.g. Self, John Doe"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900" />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                    <select name="category" value={form.category} onChange={onChange}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900 bg-white cursor-pointer">
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tags (comma separated)</label>
                    <input type="text" name="tagsRaw" value={form.tagsRaw} onChange={onChange}
                        placeholder="e.g. sales, report, urgent"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] text-slate-900" />
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                <button onClick={onClose}
                    className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    Cancel
                </button>
                <button onClick={onSave} disabled={saving || !form.title.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving…' : mode === 'add' ? 'Add Task' : 'Save Changes'}
                </button>
            </div>
        </div>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const TasksActivities = () => {
    const [tasks, setTasks]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);

    const [search, setSearch]               = useState('');
    const [statusFilter, setStatusFilter]   = useState('All Status');
    const [priorityFilter, setPriorityFilter] = useState('All Priorities');

    const [modal, setModal]     = useState(null); // null | 'add' | 'edit'
    const [editingId, setEditingId] = useState(null);
    const [form, setForm]       = useState(EMPTY_FORM);

    // ── Load ────────────────────────────────────────────────────────────────
    const loadTasks = async () => {
        setLoading(true);
        try {
            const data = await getMyTasks();
            setTasks(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadTasks(); }, []);

    // ── Filter ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => tasks.filter(t => {
        const q = search.toLowerCase();
        const matchSearch   = !q || t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
        const matchStatus   = statusFilter   === 'All Status'     || statusLabel(t.status)   === statusFilter;
        const matchPriority = priorityFilter === 'All Priorities' || priorityLabel(t.priority) === priorityFilter;
        return matchSearch && matchStatus && matchPriority;
    }), [tasks, search, statusFilter, priorityFilter]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total     = tasks.length;
        const completed = tasks.filter(t => (t.status || '').toUpperCase() === 'COMPLETED').length;
        const pending   = total - completed;
        const high      = tasks.filter(t => (t.priority || '').toUpperCase() === 'HIGH' && (t.status || '').toUpperCase() !== 'COMPLETED').length;
        const rate      = total ? Math.round((completed / total) * 100) : 0;
        return { total, completed, pending, high, rate };
    }, [tasks]);

    // ── Category stats ────────────────────────────────────────────────────────
    const categoryStats = useMemo(() => {
        const map = {};
        tasks.forEach(t => {
            const cat = t.category || 'Other';
            if (!map[cat]) map[cat] = { total: 0, completed: 0 };
            map[cat].total++;
            if ((t.status || '').toUpperCase() === 'COMPLETED') map[cat].completed++;
        });
        return Object.entries(map).map(([name, v]) => ({ name, ...v }));
    }, [tasks]);

    // ── Form ─────────────────────────────────────────────────────────────────
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setModal('add'); };

    const openEdit = (task) => {
        setForm({
            title:       task.title || '',
            description: task.description || '',
            priority:    priorityLabel(task.priority) || 'Medium',
            status:      statusLabel(task.status)     || 'Todo',
            dueDate:     task.dueDate || '',
            assignedTo:  task.assignedTo || '',
            tagsRaw:     (task.tags || []).join(', '),
            category:    task.category || 'Reports',
        });
        setEditingId(task.id);
        setModal('edit');
    };

    const closeModal = () => { setModal(null); setEditingId(null); };

    const handleSave = async () => {
        if (!form.title.trim()) return;
        setSaving(true);
        const payload = {
            title:       form.title.trim(),
            description: form.description.trim(),
            priority:    toApiPriority(form.priority),
            status:      toApiStatus(form.status),
            dueDate:     form.dueDate || null,
            assignedTo:  form.assignedTo.trim() || 'Self',
            tags:        form.tagsRaw,
            category:    form.category,
        };
        try {
            if (modal === 'add') {
                const created = await createTask(payload);
                setTasks(prev => [created, ...prev]);
                toast.success('Task created');
            } else {
                const updated = await updateTask(editingId, payload);
                setTasks(prev => prev.map(t => t.id === editingId ? updated : t));
                toast.success('Task updated');
            }
            closeModal();
        } catch {
            toast.error('Failed to save task');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this task?')) return;
        setSaving(true);
        try {
            await deleteTask(id);
            setTasks(prev => prev.filter(t => t.id !== id));
            toast.success('Task deleted');
        } catch {
            toast.error('Failed to delete task');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleComplete = async (task) => {
        const nowCompleted = (task.status || '').toUpperCase() !== 'COMPLETED';
        setSaving(true);
        try {
            const payload = {
                title:       task.title,
                description: task.description,
                priority:    task.priority,
                status:      nowCompleted ? 'COMPLETED' : 'TODO',
                dueDate:     task.dueDate || null,
                assignedTo:  task.assignedTo,
                tags:        (task.tags || []).join(', '),
                category:    task.category,
            };
            const updated = await updateTask(task.id, payload);
            setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
        } catch {
            toast.error('Failed to update task');
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-[#F7F7FA] flex items-center justify-center">
            <p className="text-sm text-slate-400 animate-pulse">Loading tasks…</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F7F7FA] p-4 lg:p-6 font-sans text-slate-900">

            <p className="text-xs text-slate-400 mb-2">My Profile &rsaquo; Tasks &amp; Activities</p>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <ListChecks className="h-6 w-6 text-[#B4860B]" /> Tasks &amp; Activities
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Manage your assigned tasks and daily activities</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors shadow-sm cursor-pointer self-start md:self-auto">
                    <Plus className="h-4 w-4" /> Add Task
                </button>
            </div>

            {/* Stats */}
            <div className="flex flex-col sm:flex-row gap-4 mb-5">
                <StatCard icon={<ListChecks className="h-4 w-4 text-[#B4860B]" />} label="Total Tasks"    value={stats.total}     sub="All time tasks" />
                <StatCard icon={<CheckCheck className="h-4 w-4 text-emerald-600" />} label="Completed"    value={stats.completed} sub={`${stats.rate}% completion rate`} subColor="text-emerald-600" />
                <StatCard icon={<Clock className="h-4 w-4 text-blue-500" />}        label="Pending"       value={stats.pending}   sub="Active tasks" />
                <StatCard icon={<Flag className="h-4 w-4 text-red-500" />}          label="High Priority" value={stats.high}      sub="Urgent tasks" />
            </div>

            {/* Search & Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input type="text" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer">
                    <option>All Status</option>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742] cursor-pointer">
                    <option>All Priorities</option>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
            </div>

            {/* Task Grid */}
            {filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-20 flex flex-col items-center justify-center text-center mb-5">
                    <ListChecks className="h-10 w-10 text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-400">
                        {tasks.length === 0 ? 'No tasks yet' : 'No tasks match your filters'}
                    </p>
                    {tasks.length === 0 && (
                        <button onClick={openAdd}
                            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 text-xs font-bold rounded-lg hover:bg-[#dfb53d] transition-colors cursor-pointer">
                            <Plus className="h-3.5 w-3.5" /> Create your first task
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
                    {filtered.map(task => (
                        <TaskCard key={task.id} task={task}
                            onEdit={openEdit} onDelete={handleDelete}
                            onToggleComplete={handleToggleComplete} saving={saving} />
                    ))}
                </div>
            )}

            {/* Tasks by Category */}
            {categoryStats.length > 0 && (
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
            )}

            {/* Modal */}
            {modal && (
                <TaskModal mode={modal} form={form} onChange={handleChange}
                    onSave={handleSave} onClose={closeModal} saving={saving} />
            )}
        </div>
    );
};

export default TasksActivities;
