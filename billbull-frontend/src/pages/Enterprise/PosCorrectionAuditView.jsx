import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRecentCorrectionAudit, getAuditForCorrectionRequest } from '../../api/posAdminReportingApi';

const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');

const ACTION_BADGE = {
  REQUESTED: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXECUTING: 'bg-indigo-100 text-indigo-700',
  APPLIED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

/** Enterprise Console > POS Administration > Audit View (Phase 5 §9) — fully read-only. Links
 *  a correction's request lifecycle, approval, execution, financial audit entries, and any
 *  generated journals in one place. Nothing here is editable. */
export default function PosCorrectionAuditView() {
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchRequestNumber, setSearchRequestNumber] = useState('');
  const [searchCorrectionRequestId, setSearchCorrectionRequestId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getRecentCorrectionAudit(150)
      .then(setRecent)
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load audit activity.'))
      .finally(() => setLoading(false));
  }, []);

  const runSearch = async () => {
    if (!searchRequestNumber.trim() || !searchCorrectionRequestId) {
      toast.error('Both the correction request number and its numeric ID are required.');
      return;
    }
    setSearching(true);
    try {
      const result = await getAuditForCorrectionRequest(searchRequestNumber.trim(), Number(searchCorrectionRequestId));
      setSearchResult(result);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No audit trail found for that request.');
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="text-slate-500" size={16} />
          <h3 className="text-sm font-bold text-slate-800">Audit View</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Look up a specific correction's complete linked trail — request, approval, execution, financial audit entries, and generated journals. Everything below is read-only.
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={searchRequestNumber} onChange={(e) => setSearchRequestNumber(e.target.value)}
            placeholder="Correction Request # (e.g. from History)" className="h-9 px-3 text-xs border border-slate-200 rounded-lg flex-1 min-w-[220px]" />
          <input type="number" value={searchCorrectionRequestId} onChange={(e) => setSearchCorrectionRequestId(e.target.value)}
            placeholder="Correction ID (numeric)" className="h-9 px-3 text-xs border border-slate-200 rounded-lg w-48" />
          <button onClick={runSearch} disabled={searching}
            className="h-9 px-4 bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {searching ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />} Look Up
          </button>
        </div>

        {searchResult && (
          <div className="mt-4 space-y-3">
            {searchResult.linkedJournals?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Generated Journals</h4>
                <div className="space-y-1">
                  {searchResult.linkedJournals.map((j) => (
                    <div key={j.entryNumber} className="flex justify-between text-xs bg-slate-50 rounded-lg p-2">
                      <span className="font-mono text-slate-600">{j.entryNumber} ({j.reference})</span>
                      <span className="text-slate-500">{j.narration} · {j.status} · {j.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">Financial Audit Entries</h4>
              <div className="space-y-1">
                {(searchResult.auditTrail || []).map((a) => (
                  <div key={a.id} className="text-xs bg-slate-50 rounded-lg p-2 flex items-start justify-between gap-3">
                    <div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${ACTION_BADGE[a.action] || 'bg-slate-100 text-slate-600'}`}>{a.action}</span>
                      <span className="text-slate-400">{a.entityType}</span>
                      {a.details && <p className="text-slate-500 mt-1">{a.details}</p>}
                    </div>
                    <span className="text-slate-500 whitespace-nowrap">{a.username} · {formatDateTime(a.timestamp)}</span>
                  </div>
                ))}
                {(!searchResult.auditTrail || searchResult.auditTrail.length === 0) && (
                  <p className="text-xs text-slate-400">No audit entries found.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Recent Audit Activity</h3>
          <p className="text-xs text-slate-500 mt-0.5">The latest events across every correction type, most recent first.</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        ) : recent.length === 0 ? (
          <div className="text-center text-slate-400 py-16 text-sm">No audit activity yet.</div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Action</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Entity Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Reference</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Details</th>
                  <th className="text-left px-4 py-2.5 font-semibold">User</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${ACTION_BADGE[a.action] || 'bg-slate-100 text-slate-600'}`}>{a.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{a.entityType}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{a.entityId}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-md truncate" title={a.details}>{a.details}</td>
                    <td className="px-4 py-2.5 text-slate-600">{a.username}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(a.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
