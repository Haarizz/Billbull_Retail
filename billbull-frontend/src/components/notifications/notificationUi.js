// Shared presentation helpers for the notification bell, the inbox and the activity feed.
import {
    Package, ShoppingCart, Truck, Landmark, Users, AlertTriangle, Monitor, Info,
    CheckCircle2, XCircle, LogIn, Settings2, Boxes, Bell,
} from 'lucide-react';

/** Notification categories (backend `category`). */
export const CATEGORY_META = {
    INVENTORY: { label: 'Inventory', icon: Package, tint: 'text-sky-700 bg-sky-50 ring-sky-100' },
    SALES: { label: 'Sales', icon: ShoppingCart, tint: 'text-emerald-700 bg-emerald-50 ring-emerald-100' },
    PURCHASE: { label: 'Purchase', icon: Truck, tint: 'text-violet-700 bg-violet-50 ring-violet-100' },
    FINANCE: { label: 'Finance', icon: Landmark, tint: 'text-amber-800 bg-amber-50 ring-amber-100' },
    HR: { label: 'HR', icon: Users, tint: 'text-pink-700 bg-pink-50 ring-pink-100' },
    POS: { label: 'POS', icon: Monitor, tint: 'text-orange-700 bg-orange-50 ring-orange-100' },
    SYSTEM: { label: 'System', icon: AlertTriangle, tint: 'text-slate-700 bg-slate-100 ring-slate-200' },
    OTHER: { label: 'Other', icon: Bell, tint: 'text-slate-700 bg-slate-100 ring-slate-200' },
};

export const categoryMeta = (key) => CATEGORY_META[key] || CATEGORY_META.OTHER;

/** Notification severity (backend `type`). */
export const TYPE_META = {
    INFO: { label: 'Info', icon: Info, bar: 'bg-sky-500', text: 'text-sky-700', soft: 'bg-sky-50' },
    WARNING: { label: 'Warning', icon: AlertTriangle, bar: 'bg-amber-500', text: 'text-amber-700', soft: 'bg-amber-50' },
    SUCCESS: { label: 'Success', icon: CheckCircle2, bar: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50' },
    ERROR: { label: 'Error', icon: XCircle, bar: 'bg-red-500', text: 'text-red-700', soft: 'bg-red-50' },
};

export const typeMeta = (key) => TYPE_META[key] || TYPE_META.INFO;

export const PRIORITY_META = {
    CRITICAL: { label: 'Critical', chip: 'bg-red-600 text-white' },
    HIGH: { label: 'High', chip: 'bg-amber-100 text-amber-800' },
    MEDIUM: { label: 'Medium', chip: 'bg-slate-100 text-slate-600' },
    LOW: { label: 'Low', chip: 'bg-slate-50 text-slate-500' },
};

/** Activity modules (backend ActivityTranslator.MODULE_PREFIXES). */
export const MODULE_META = {
    AUTH: { label: 'Sign-in', icon: LogIn, tint: 'text-slate-700 bg-slate-100' },
    POS: { label: 'POS', icon: Monitor, tint: 'text-orange-700 bg-orange-50' },
    SALES: { label: 'Sales', icon: ShoppingCart, tint: 'text-emerald-700 bg-emerald-50' },
    INVENTORY: { label: 'Inventory', icon: Boxes, tint: 'text-sky-700 bg-sky-50' },
    PURCHASE: { label: 'Purchase', icon: Truck, tint: 'text-violet-700 bg-violet-50' },
    FINANCE: { label: 'Finance', icon: Landmark, tint: 'text-amber-800 bg-amber-50' },
    HR: { label: 'HR', icon: Users, tint: 'text-pink-700 bg-pink-50' },
    ADMIN: { label: 'Admin', icon: Settings2, tint: 'text-indigo-700 bg-indigo-50' },
    OTHER: { label: 'Other', icon: Info, tint: 'text-slate-600 bg-slate-100' },
};

export const moduleMeta = (key) => MODULE_META[key] || MODULE_META.OTHER;

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Backend LocalDateTime strings carry no zone; they are the server's local (tenant) time. */
export const toDate = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today" / "Yesterday" / weekday this week / "12 Nov 2026". */
export const dayLabel = (value, now = new Date()) => {
    const d = toDate(value);
    if (!d) return 'Earlier';
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Groups an already newest-first list into [{ label, items }] by day, keeping order. */
export const groupByDay = (items, getDate) => {
    const groups = [];
    for (const item of items) {
        const label = dayLabel(getDate(item));
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(item);
        else groups.push({ label, items: [item] });
    }
    return groups;
};

/** "just now", "5m", "3h", "Yesterday", "12 Nov". Computed client-side so it stays fresh. */
export const shortAgo = (value, now = new Date()) => {
    const d = toDate(value);
    if (!d) return '';
    const s = Math.max(0, Math.floor((now - d) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const timeOfDay = (value) => {
    const d = toDate(value);
    return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
};

export const fullDateTime = (value) => {
    const d = toDate(value);
    return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
};

export const isoDay = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── People ────────────────────────────────────────────────────────────────────

export const initials = (name) => {
    const clean = String(name || '?').split('@')[0].replace(/[._-]+/g, ' ').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_TINTS = [
    'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800',
    'bg-violet-100 text-violet-800', 'bg-pink-100 text-pink-800', 'bg-orange-100 text-orange-800',
    'bg-teal-100 text-teal-800', 'bg-indigo-100 text-indigo-800',
];

/** Stable tint per person, so the same user always gets the same avatar colour. */
export const avatarTint = (seed) => {
    const s = String(seed || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_TINTS[h % AVATAR_TINTS.length];
};

// ── Links ─────────────────────────────────────────────────────────────────────

/**
 * Notifications written before the redesign point at a route that never existed
 * ("/sales/pos-console?tab=terminals"); the POS console lives inside /sales/pos.
 */
export const resolveActionUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('/sales/pos-console')) return '/sales/pos';
    return url;
};

/** Detail values arrive as strings or numbers; keep them short for chips. */
export const formatDetail = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
};
