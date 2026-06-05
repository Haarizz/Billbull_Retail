import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bell, X, Check, CheckCheck, Package, ShoppingCart,
    Truck, Landmark, Users, AlertTriangle, Info,
    CheckCircle, XCircle, ChevronRight, Inbox
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const CATEGORIES = [
    { key: null, label: 'All' },
    { key: 'INVENTORY', label: 'Inventory' },
    { key: 'SALES', label: 'Sales' },
    { key: 'PURCHASE', label: 'Purchase' },
    { key: 'FINANCE', label: 'Finance' },
    { key: 'HR', label: 'HR' },
    { key: 'SYSTEM', label: 'System' },
];

const TYPE_CONFIG = {
    INFO:    { icon: Info,         color: '#3B82F6', bg: '#EFF6FF',  accent: '#3B82F6' },
    WARNING: { icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB', accent: '#F59E0B' },
    SUCCESS: { icon: CheckCircle,  color: '#10B981', bg: '#ECFDF5',  accent: '#10B981' },
    ERROR:   { icon: XCircle,      color: '#EF4444', bg: '#FEF2F2',  accent: '#EF4444' },
};

const CATEGORY_ICONS = {
    INVENTORY: Package,
    SALES: ShoppingCart,
    PURCHASE: Truck,
    FINANCE: Landmark,
    HR: Users,
    SYSTEM: AlertTriangle,
};

// Subtle pop sound for HIGH/CRITICAL notifications
let lastPlayedCount = 0;
const playNotifSound = (count, notifications) => {
    if (count <= lastPlayedCount) { lastPlayedCount = count; return; }
    // Only play for HIGH or CRITICAL
    const hasUrgent = notifications.some(n => !n.read && (n.priority === 'HIGH' || n.priority === 'CRITICAL'));
    if (!hasUrgent) { lastPlayedCount = count; return; }
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch { /* Audio not available — silently ignore */ }
    lastPlayedCount = count;
};

const NotificationBell = () => {
    const [open, setOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState(null);
    const panelRef = useRef(null);
    const bellRef = useRef(null);
    const navigate = useNavigate();

    const {
        unreadCount,
        notifications,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        dismiss,
    } = useNotifications();

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (open && panelRef.current && !panelRef.current.contains(e.target)
                && bellRef.current && !bellRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (open) {
            fetchNotifications(0, 15, activeCategory ? { category: activeCategory } : {});
        }
    }, [open, activeCategory, fetchNotifications]);

    // Sound effect for urgent notifications
    useEffect(() => {
        playNotifSound(unreadCount, notifications);
    }, [unreadCount, notifications]);

    const handleClick = (notif) => {
        if (!notif.read) markAsRead(notif.id);
        if (notif.actionUrl) {
            navigate(notif.actionUrl);
            setOpen(false);
        }
    };

    const handleDismiss = (e, id) => {
        e.stopPropagation();
        dismiss(id);
    };

    const displayNotifs = activeCategory
        ? notifications.filter(n => n.category === activeCategory)
        : notifications;

    return (
        <div style={{ position: 'relative' }}>
            {/* ── Bell Button ────────────────────────────────────────── */}
            <button
                ref={bellRef}
                id="notification-bell"
                onClick={() => setOpen(!open)}
                style={{
                    position: 'relative',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    background: open ? 'rgba(245, 199, 66, 0.1)' : 'transparent',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8F9FA'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
                title="Notifications"
            >
                <Bell style={{ width: 20, height: 20, color: open ? '#B45309' : '#475569' }} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 5px',
                        borderRadius: '9px',
                        background: '#EF4444',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                        animation: 'notifPulse 2s infinite',
                        lineHeight: 1,
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Dropdown Panel ──────────────────────────────────────── */}
            {open && (
                <div
                    ref={panelRef}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '420px',
                        maxHeight: '560px',
                        background: 'rgba(255, 255, 255, 0.97)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'notifSlideIn 0.2s ease-out',
                        overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '16px 20px 12px',
                        borderBottom: '1px solid #F1F5F9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>
                                Notifications
                            </h3>
                            {unreadCount > 0 && (
                                <span style={{ fontSize: '12px', color: '#64748B' }}>
                                    {unreadCount} unread
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '4px 10px', borderRadius: '6px',
                                        border: '1px solid #E2E8F0', background: '#fff',
                                        fontSize: '11px', fontWeight: 500, color: '#475569',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#F5C742'; e.currentTarget.style.color = '#B45309'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#475569'; }}
                                    title="Mark all as read"
                                >
                                    <CheckCheck style={{ width: 13, height: 13 }} /> Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                style={{
                                    padding: '4px', borderRadius: '6px', border: 'none',
                                    background: 'transparent', cursor: 'pointer', color: '#94A3B8',
                                    display: 'flex',
                                }}
                                title="Close"
                            >
                                <X style={{ width: 16, height: 16 }} />
                            </button>
                        </div>
                    </div>

                    {/* Category Tabs */}
                    <div style={{
                        padding: '8px 20px',
                        borderBottom: '1px solid #F1F5F9',
                        display: 'flex',
                        gap: '4px',
                        overflowX: 'auto',
                    }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.key || 'all'}
                                onClick={() => setActiveCategory(cat.key)}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '20px',
                                    border: 'none',
                                    fontSize: '11px',
                                    fontWeight: activeCategory === cat.key ? 600 : 500,
                                    background: activeCategory === cat.key ? '#F5C742' : '#F1F5F9',
                                    color: activeCategory === cat.key ? '#1E1E1E' : '#64748B',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Notification List */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px 12px',
                    }}>
                        {displayNotifs.length === 0 ? (
                            <div style={{
                                padding: '40px 20px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px',
                            }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: '#F1F5F9', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Inbox style={{ width: 28, height: 28, color: '#94A3B8' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>
                                        All caught up!
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                                        No notifications to show
                                    </div>
                                </div>
                            </div>
                        ) : (
                            displayNotifs.map((notif) => {
                                const typeConf = TYPE_CONFIG[notif.type] || TYPE_CONFIG.INFO;
                                const TypeIcon = typeConf.icon;
                                const CatIcon = CATEGORY_ICONS[notif.category] || Info;

                                return (
                                    <div
                                        key={notif.id}
                                        onClick={() => handleClick(notif)}
                                        style={{
                                            position: 'relative',
                                            padding: '12px 14px',
                                            margin: '4px 0',
                                            borderRadius: '12px',
                                            border: `1px solid ${notif.read ? '#F1F5F9' : '#E2E8F0'}`,
                                            background: notif.read ? '#FAFAFA' : '#fff',
                                            cursor: notif.actionUrl ? 'pointer' : 'default',
                                            transition: 'all 0.15s',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'flex-start',
                                            borderLeft: `3px solid ${typeConf.accent}`,
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                                            e.currentTarget.querySelector('.notif-dismiss').style.opacity = '1';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.transform = 'none';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.querySelector('.notif-dismiss').style.opacity = '0';
                                        }}
                                    >
                                        {/* Icon */}
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '10px',
                                            background: typeConf.bg, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <CatIcon style={{ width: 18, height: 18, color: typeConf.color }} />
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center',
                                                gap: '6px', marginBottom: '2px',
                                            }}>
                                                {!notif.read && (
                                                    <span style={{
                                                        width: 7, height: 7, borderRadius: '50%',
                                                        background: '#3B82F6', flexShrink: 0,
                                                    }} />
                                                )}
                                                <span style={{
                                                    fontSize: '13px', fontWeight: notif.read ? 500 : 600,
                                                    color: '#1E293B', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {notif.title}
                                                </span>
                                            </div>
                                            <div style={{
                                                fontSize: '12px', color: '#64748B', lineHeight: '1.4',
                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                display: '-webkit-box', WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}>
                                                {notif.message}
                                            </div>
                                            <div style={{
                                                fontSize: '10px', color: '#94A3B8', marginTop: '4px',
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                            }}>
                                                <span>{notif.timeAgo}</span>
                                                {notif.category && (
                                                    <>
                                                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD5E1' }} />
                                                        <span>{notif.category.charAt(0) + notif.category.slice(1).toLowerCase()}</span>
                                                    </>
                                                )}
                                                {notif.priority === 'HIGH' || notif.priority === 'CRITICAL' ? (
                                                    <>
                                                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD5E1' }} />
                                                        <span style={{
                                                            color: notif.priority === 'CRITICAL' ? '#EF4444' : '#F59E0B',
                                                            fontWeight: 600,
                                                        }}>
                                                            {notif.priority === 'CRITICAL' ? '● Critical' : '● High'}
                                                        </span>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Action arrow / dismiss */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            <button
                                                className="notif-dismiss"
                                                onClick={(e) => handleDismiss(e, notif.id)}
                                                style={{
                                                    opacity: 0, padding: '2px', borderRadius: '4px',
                                                    border: 'none', background: 'transparent',
                                                    cursor: 'pointer', color: '#94A3B8',
                                                    transition: 'opacity 0.15s',
                                                    display: 'flex',
                                                }}
                                                title="Dismiss"
                                            >
                                                <X style={{ width: 14, height: 14 }} />
                                            </button>
                                            {notif.actionUrl && (
                                                <ChevronRight style={{ width: 14, height: 14, color: '#CBD5E1' }} />
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '12px 20px',
                        borderTop: '1px solid #F1F5F9',
                        textAlign: 'center',
                    }}>
                        <button
                            onClick={() => { navigate('/notifications'); setOpen(false); }}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: 600, color: '#B45309',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#92400E'}
                            onMouseLeave={e => e.currentTarget.style.color = '#B45309'}
                        >
                            View All Notifications <ChevronRight style={{ width: 14, height: 14 }} />
                        </button>
                    </div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes notifPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                @keyframes notifSlideIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};

export default NotificationBell;
