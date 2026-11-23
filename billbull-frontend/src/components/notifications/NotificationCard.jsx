import React from 'react';
import { Check, X, ChevronRight, MapPin, Hash } from 'lucide-react';
import {
    categoryMeta, typeMeta, PRIORITY_META, shortAgo, fullDateTime, initials, avatarTint, formatDetail,
} from './notificationUi';

export const Avatar = ({ name, seed, size = 'sm' }) => {
    const dims = size === 'xs' ? 'w-5 h-5 text-[9px]' : size === 'md' ? 'w-9 h-9 text-xs' : 'w-6 h-6 text-[10px]';
    return (
        <span
            className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${dims} ${avatarTint(seed || name)}`}
            aria-hidden="true"
        >
            {initials(name)}
        </span>
    );
};

/**
 * One notification. `compact` is the bell dropdown variant: no selection, fewer chips.
 */
const NotificationCard = ({
    notif,
    compact = false,
    selected = false,
    onToggleSelect,
    onOpen,
    onMarkRead,
    onDismiss,
}) => {
    const type = typeMeta(notif.type);
    const cat = categoryMeta(notif.category);
    const CatIcon = cat.icon;
    const priority = PRIORITY_META[notif.priority];
    const urgent = notif.priority === 'HIGH' || notif.priority === 'CRITICAL';
    const details = Object.entries(notif.details || {});
    const maxChips = compact ? 2 : 5;
    const clickable = Boolean(notif.actionUrl);

    const stop = (fn) => (e) => {
        e.stopPropagation();
        fn?.();
    };

    return (
        <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => onOpen?.(notif)}
            onKeyDown={(e) => {
                if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onOpen?.(notif);
                }
            }}
            className={`group relative flex gap-3 rounded-xl border transition-all outline-none
                focus-visible:ring-2 focus-visible:ring-[#F5C742]
                ${compact ? 'p-3' : 'p-4'}
                ${notif.read
                    ? 'bg-white/70 border-slate-100 hover:border-slate-200'
                    : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'}
                ${selected ? 'ring-2 ring-[#F5C742] border-[#F5C742]' : ''}
                ${clickable ? 'cursor-pointer' : ''}`}
        >
            {/* Severity bar */}
            <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${type.bar} ${notif.read ? 'opacity-40' : ''}`} />

            {onToggleSelect && (
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSelect(notif.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#E0A800] cursor-pointer"
                    aria-label={`Select notification: ${notif.title}`}
                />
            )}

            {/* Category tile */}
            <div className={`shrink-0 flex items-center justify-center rounded-xl ring-1 ${cat.tint} ${compact ? 'w-9 h-9' : 'w-10 h-10'}`}>
                <CatIcon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-[#E0A800] shrink-0" aria-label="Unread" />}
                        <span className={`truncate ${compact ? 'text-[13px]' : 'text-sm'} ${notif.read ? 'font-medium text-slate-600' : 'font-semibold text-slate-900'}`}>
                            {notif.title}
                        </span>
                        {urgent && priority && (
                            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded ${priority.chip}`}>
                                {priority.label}
                            </span>
                        )}
                    </div>
                    <time
                        className="shrink-0 text-[11px] text-slate-400 tabular-nums"
                        dateTime={notif.createdAt || undefined}
                        title={fullDateTime(notif.createdAt)}
                    >
                        {shortAgo(notif.createdAt) || notif.timeAgo}
                    </time>
                </div>

                {notif.message && (
                    <p className={`mt-0.5 text-slate-500 leading-relaxed ${compact ? 'text-xs line-clamp-2' : 'text-[13px] line-clamp-2'}`}>
                        {notif.message}
                    </p>
                )}

                {details.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {details.slice(0, maxChips).map(([label, value]) => (
                            <span key={label} className="inline-flex items-center gap-1 max-w-[220px] rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5 text-[11px]">
                                <span className="text-slate-400 shrink-0">{label}</span>
                                <span className="font-semibold text-slate-700 truncate">{formatDetail(value)}</span>
                            </span>
                        ))}
                        {details.length > maxChips && (
                            <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">+{details.length - maxChips} more</span>
                        )}
                    </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {notif.actorName ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Avatar name={notif.actorName} seed={notif.actorUsername} size="xs" />
                            <span className="font-medium text-slate-600">{notif.actorName}</span>
                        </span>
                    ) : (
                        <span className="text-slate-400">System</span>
                    )}
                    {notif.branchName && (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{notif.branchName}</span>
                    )}
                    {!compact && notif.referenceId && (
                        <span className="inline-flex items-center gap-0.5 font-mono text-slate-500"><Hash className="w-3 h-3" />{notif.referenceId}</span>
                    )}
                    {!compact && <span className="text-slate-400">{cat.label}</span>}
                </div>
            </div>

            {/* Actions */}
            <div className={`flex shrink-0 items-start gap-0.5 transition-opacity ${compact ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                {!notif.read && onMarkRead && (
                    <button
                        type="button"
                        onClick={stop(() => onMarkRead(notif.id))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        title="Mark as read"
                        aria-label="Mark as read"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                )}
                {onDismiss && (
                    <button
                        type="button"
                        onClick={stop(() => onDismiss(notif.id))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                        title="Dismiss"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                {clickable && !compact && <ChevronRight className="w-4 h-4 mt-1.5 text-slate-300" aria-hidden="true" />}
            </div>
        </div>
    );
};

export default NotificationCard;
