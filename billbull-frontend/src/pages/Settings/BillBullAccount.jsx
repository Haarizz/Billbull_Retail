import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { getPlatformStatus, listSupportSessions, revokeSupportSession } from "../../api/platformAccessApi";

const MODULE_LABELS = {
  pos: "POS till",
  purchases: "Purchasing",
  finance: "Accounting",
  hr: "HR & payroll",
  customer: "Customer Connect",
};

const LIMIT_LABELS = {
  maxUsers: "Active users",
  maxBranches: "Branches",
  maxTerminalsPerBranch: "POS terminals per branch",
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

/**
 * Settings → BillBull Account (ADMIN). What BillBull's control plane has set for this account,
 * and every time BillBull support signed in — with a button to end a live support session now.
 */
export default function BillBullAccount() {
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([getPlatformStatus(), listSupportSessions()]);
      setStatus(s);
      setSessions(list);
    } catch {
      toast.error("Could not load BillBull account details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id) => {
    setRevoking(id);
    try {
      await revokeSupportSession(id);
      toast.success("Support session ended");
      await load();
    } catch {
      toast.error("Could not end the support session");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-amber-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">BillBull Account</h1>
            <p className="text-sm text-gray-500">Your plan, and every time BillBull support signed in.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {status && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Plan</h2>
            {!status.managed ? (
              <p className="text-sm text-gray-600">This account is not managed by the BillBull control plane yet. Every module is available.</p>
            ) : (
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-gray-600">Plan</dt><dd className="font-medium">{status.planCode || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Status</dt><dd className="font-medium">{status.status}</dd></div>
                {Object.entries(LIMIT_LABELS).map(([k, label]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-gray-600">{label}</dt>
                    <dd>{status.limits?.[k] ?? "Unlimited"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Modules</h2>
            <ul className="text-sm space-y-1">
              {Object.entries(MODULE_LABELS).map(([k, label]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-gray-700">{label}</span>
                  <span className={status.modules?.[k] ? "text-emerald-700" : "text-gray-400"}>
                    {status.modules?.[k] ? "Included" : "Not in plan"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800">BillBull support sign-ins</h2>
          <p className="text-xs text-gray-500 mt-1">
            {status?.supportAccessEnabled
              ? <>Support access is <b>enabled</b> on this server. BillBull staff sign in as <code>{status.supportUsername}</code> with that user&apos;s roles, for a limited time. Freeze that user in Settings → Roles to stop all support access.</>
              : <>Support access is <b>disabled</b> on this server. BillBull staff cannot sign in to your account.</>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Issued</th>
                <th className="px-4 py-2">BillBull staff</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Ends</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No support sign-ins yet.</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 whitespace-nowrap">{fmt(s.issuedAt)}</td>
                  <td className="px-4 py-2">{s.platformUser}</td>
                  <td className="px-4 py-2">{s.reason}{s.ticketRef ? ` (ticket ${s.ticketRef})` : ""}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {s.revokedAt ? `Ended ${fmt(s.revokedAt)}` : fmt(s.expiresAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s.live && (
                      <button
                        type="button"
                        disabled={revoking === s.id}
                        onClick={() => revoke(s.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Ban size={12} /> End now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
