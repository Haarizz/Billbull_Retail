import { useState, useEffect, useCallback } from "react";
import {
  getAllPosTerminals, getPendingTerminals,
  approvePosTerminal, rejectPosTerminal,
  archivePosTerminal, restorePosTerminal, decommissionPosTerminal,
  assignTerminalCounter,
} from "../../api/posApi";
import { getActiveCounters } from "../../api/counterApi";
import TerminalStatusBadge from "../../components/pos/TerminalStatusBadge";
import { usePermissions } from "../../context/PermissionContext";
import { AlertTriangle, XCircle } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Frontend gating mirrors backend permissions.pos.terminal.<action> exactly — this hides actions
// the user can't perform, but the backend (ModulePermissionService) is the actual enforcement.
const canTerminalAction = (canAction, action) => canAction(`permissions.pos.terminal.${action}`, "view");

export default function POSTerminals({ branchId: branchIdProp }) {
  const { activeBranchId, defaultBranch } = useBranch();
  const { canAction } = usePermissions();
  const branchId = branchIdProp ?? (activeBranchId !== "ALL" ? activeBranchId : null) ?? defaultBranch?.id;
  const [terminals, setTerminals] = useState([]);
  const [pending, setPending] = useState([]);
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [tab, setTab] = useState("all");
  const [archiveReason, setArchiveReason] = useState("");
  const [archivingId, setArchivingId] = useState(null);
  // Decommission-terminal confirmation dialog (replaces window.prompt/window.confirm)
  const [decommissionTarget, setDecommissionTarget] = useState(null);
  const [decommissionReason, setDecommissionReason] = useState("");
  const [decommissionBusy, setDecommissionBusy] = useState(false);
  const [decommissionError, setDecommissionError] = useState("");

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [all, pend, ctrs] = await Promise.all([
        getAllPosTerminals(branchId),
        getPendingTerminals(branchId),
        getActiveCounters(branchId),
      ]);
      setTerminals(all);
      setPending(pend);
      setCounters(ctrs);
    } catch {
      setError("Failed to load terminals.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      const updated = await approvePosTerminal(id);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
      setPending((p) => p.filter((t) => t.id !== updated.id));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Approve failed.");
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejection (optional):");
    try {
      const updated = await rejectPosTerminal(id, reason);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
      setPending((p) => p.filter((t) => t.id !== updated.id));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Reject failed.");
    }
  };

  const handleArchive = async (id) => {
    const reason = window.prompt("Archive reason (optional):");
    try {
      const updated = await archivePosTerminal(id, reason || undefined);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Archive failed.");
    }
  };

  const handleRestore = async (id) => {
    try {
      const updated = await restorePosTerminal(id);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Restore failed.");
    }
  };

  const handleDecommission = (terminal) => {
    setDecommissionReason("");
    setDecommissionError("");
    setDecommissionTarget(terminal);
  };

  const submitDecommission = async () => {
    if (!decommissionTarget) return;
    setDecommissionBusy(true);
    setDecommissionError("");
    try {
      const updated = await decommissionPosTerminal(decommissionTarget.id, decommissionReason.trim() || undefined);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
      setDecommissionTarget(null);
    } catch (e) {
      setDecommissionError(e?.response?.data?.message || "Decommission failed.");
    } finally {
      setDecommissionBusy(false);
    }
  };

  const handleCounterAssign = async (terminalPk, counterId) => {
    try {
      const updated = await assignTerminalCounter(terminalPk, counterId || null);
      setTerminals((p) => p.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Counter assignment failed.");
    }
  };

  const displayed = tab === "pending" ? pending
    : tab === "archived" ? terminals.filter((t) => t.status === "ARCHIVED")
    : tab === "decommissioned" ? terminals.filter((t) => t.status === "DECOMMISSIONED")
    : terminals.filter((t) => t.status !== "ARCHIVED" && t.status !== "DECOMMISSIONED");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Terminal Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{terminals.length} terminal{terminals.length !== 1 ? "s" : ""} registered</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 text-gray-600">
          Refresh
        </button>
      </div>

      {actionError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-start justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[["all", "All Active"], ["pending", `Pending (${pending.length})`], ["archived", "Archived"], ["decommissioned", "Decommissioned"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === key ? "border-amber-500 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading terminals…</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-sm">{error}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No terminals in this view.</div>
      ) : (
        <div className="space-y-3">
          {displayed.map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-mono flex-shrink-0">
                  {t.isMainPos ? "★" : "#"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{t.terminalName || t.terminalId}</span>
                    <span className="text-xs text-gray-400 font-mono">{t.terminalId}</span>
                    <TerminalStatusBadge status={t.status} />
                    {t.isMainPos && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">Main POS</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-400">
                      Counter: <span className="text-gray-600">{t.counterName || "—"}</span>
                    </span>
                    <span className="text-xs text-gray-400">
                      Heartbeat: <span className="text-gray-600">{timeAgo(t.lastHeartbeatAt)}</span>
                    </span>
                    {t.ipAddress && (
                      <span className="text-xs text-gray-400">IP: <span className="text-gray-600">{t.ipAddress}</span></span>
                    )}
                    {t.operatingSystem && (
                      <span className="text-xs text-gray-400">{t.operatingSystem}{t.browser ? ` · ${t.browser}` : ""}</span>
                    )}
                  </div>

                  {/* Counter picker */}
                  {tab !== "archived" && tab !== "decommissioned" && counters.length > 0 && canTerminalAction(canAction, "assigncounter") && (
                    <div className="mt-2">
                      <select
                        value={t.counterId ?? ""}
                        onChange={(e) => handleCounterAssign(t.id, e.target.value ? Number(e.target.value) : null)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white"
                      >
                        <option value="">— No Counter —</option>
                        {counters.map((c) => (
                          <option key={c.id} value={c.id}>{c.counterName} ({c.counterCode})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  {t.status === "PENDING_REGISTRATION" && (
                    <>
                      {canTerminalAction(canAction, "approve") && (
                        <button onClick={() => handleApprove(t.id)}
                          className="px-2.5 py-1 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600">
                          Approve
                        </button>
                      )}
                      {canTerminalAction(canAction, "reject") && (
                        <button onClick={() => handleReject(t.id)}
                          className="px-2.5 py-1 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                          Reject
                        </button>
                      )}
                    </>
                  )}
                  {t.status === "ARCHIVED" ? (
                    <>
                      {canTerminalAction(canAction, "restore") && (
                        <button onClick={() => handleRestore(t.id)}
                          className="px-2.5 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                          Restore
                        </button>
                      )}
                      {canTerminalAction(canAction, "decommission") && (
                        <button onClick={() => handleDecommission(t)}
                          className="px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                          Decommission
                        </button>
                      )}
                    </>
                  ) : t.status === "DECOMMISSIONED" ? (
                    <span className="text-xs text-gray-400 italic px-1">Permanently retired — cannot be restored</span>
                  ) : (
                    t.status !== "PENDING_REGISTRATION" && (
                      <>
                        {canTerminalAction(canAction, "archive") && (
                          <button onClick={() => handleArchive(t.id)}
                            className="px-2.5 py-1 text-xs border border-orange-200 text-orange-500 rounded-lg hover:bg-orange-50">
                            Archive
                          </button>
                        )}
                        {canTerminalAction(canAction, "decommission") && (
                          <button onClick={() => handleDecommission(t)}
                            className="px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                            Decommission
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decommission terminal (permanent, with reason) modal */}
      {decommissionTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Decommission Terminal</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-semibold">
                    {decommissionTarget.terminalName || decommissionTarget.terminalId}
                  </span>
                  {' '}({decommissionTarget.terminalId}) will be permanently retired.{' '}
                  <span className="font-semibold text-red-600">This cannot be undone.</span>{' '}
                  The device will need to register as a brand-new terminal, consuming a new
                  terminal slot, to use this branch again.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Decommission reason <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                autoFocus
                rows={3}
                value={decommissionReason}
                onChange={(e) => { setDecommissionReason(e.target.value); setDecommissionError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitDecommission(); }}
                placeholder="e.g. Hardware retired, branch closed…"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
              {decommissionError && (
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {decommissionError}
                </p>
              )}
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button
                type="button"
                onClick={() => setDecommissionTarget(null)}
                disabled={decommissionBusy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecommission}
                disabled={decommissionBusy}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                {decommissionBusy ? "Decommissioning…" : "Decommission Terminal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
