const STATUS_CONFIG = {
  ACTIVE:               { dot: "bg-green-500",  label: "Active" },
  IDLE:                 { dot: "bg-yellow-400", label: "Idle" },
  OFFLINE:              { dot: "bg-gray-400",   label: "Offline" },
  PENDING_REGISTRATION: { dot: "bg-blue-400",   label: "Pending" },
  INACTIVE:             { dot: "bg-gray-300",   label: "Inactive" },
  MAINTENANCE:          { dot: "bg-orange-400", label: "Maintenance" },
  BLOCKED:              { dot: "bg-red-500",    label: "Blocked" },
  ARCHIVED:             { dot: "bg-gray-200",   label: "Archived" },
  DECOMMISSIONED:       { dot: "bg-red-900",    label: "Decommissioned" },
};

/**
 * Colored dot + label chip for a terminal's operational status.
 * @param {{ status: string, showLabel?: boolean, className?: string }} props
 */
export default function TerminalStatusBadge({ status, showLabel = true, className = "" }) {
  const cfg = STATUS_CONFIG[status] ?? { dot: "bg-gray-300", label: status ?? "Unknown" };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {showLabel && <span className="text-xs font-medium text-gray-600">{cfg.label}</span>}
    </span>
  );
}
