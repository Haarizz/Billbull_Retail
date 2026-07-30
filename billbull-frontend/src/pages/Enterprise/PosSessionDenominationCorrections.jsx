import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Search, Loader2, Coins, X, CheckCircle2, XCircle, Send, PlayCircle, Ban, Clock, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '../../context/PermissionContext';
import { getPosSessionById } from '../../api/posApi';
import PaginationFooter from '../../components/common/PaginationFooter';
import {
  getDenominationCorrections, getEffectiveDenomination, createDenominationCorrection,
  submitDenominationCorrection, approveDenominationCorrection, rejectDenominationCorrection,
  applyDenominationCorrection, cancelDenominationCorrection,
} from '../../api/posSessionDenominationCorrectionApi';

const PAGE_SIZE = 20;
const DENOMINATIONS = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];

const STATUS_BADGE = {
  REQUESTED: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  EXECUTING: 'bg-indigo-100 text-indigo-700',
  APPLIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-red-100 text-red-700',
};

const formatMoney = (v) => (v == null ? '-' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');

export default function PosSessionDenominationCorrections() {
  const { canCreate, canApprove } = usePermissions();
  const canRequest = canCreate('pos.admin.session');
  const canDecide = canApprove('pos.admin.approvals');

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionIdFilter, setSessionIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showNewRequest, setShowNewRequest] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async (targetPage = 0) => {
    setLoading(true);
    try {
      const data = await getDenominationCorrections({
        sessionId: sessionIdFilter || undefined,
        status: statusFilter || undefined,
        page: targetPage,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setPage(data.page || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load denomination corrections.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdFilter, statusFilter]);

  useEffect(() => { load(0); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const withActing = async (id, fn, successMsg) => {
    setActingId(id);
    try {
      await fn();
      toast.success(successMsg);
      load(page);
      if (detailRow?.id === id) setDetailRow(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Action failed.');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = (id) => {
    const reason = window.prompt('Rejection reason:');
    if (!reason || !reason.trim()) return;
    withActing(id, () => rejectDenominationCorrection(id, reason.trim()), 'Correction rejected.');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Session Denomination Corrections</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Governed corrections to a closed session's cash count. Never edits the original session, X/Z Report, or Day Close — only overlays the effective denomination for display.
            </p>
          </div>
          {canRequest && (
            <button
              onClick={() => setShowNewRequest(true)}
              className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
            >
              <Plus size={14} /> New Correction Request
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={sessionIdFilter}
              onChange={(e) => setSessionIdFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(0); }}
              placeholder="Filter by Session ID..."
              className="h-9 pl-8 pr-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742] w-48"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]">
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <button onClick={() => load(0)} className="h-9 px-3 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Apply
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Coins size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No denomination corrections yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Session</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Original</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Corrected</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Difference</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Requested By</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700">#{r.sessionId}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(r.originalTotal)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(r.correctedTotal)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${Number(r.difference) < 0 ? 'text-red-600' : Number(r.difference) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {Number(r.difference) > 0 ? '+' : ''}{formatMoney(r.difference)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.requestedBy}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                        {r.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button title="View / Audit Timeline" onClick={() => setDetailRow(r)} className="text-slate-500 hover:text-slate-800">
                          <Eye size={14} />
                        </button>
                        {canRequest && r.submittable && (
                          <button disabled={actingId === r.id} title="Submit for Approval"
                            onClick={() => withActing(r.id, () => submitDenominationCorrection(r.id), 'Submitted for approval.')}
                            className="text-slate-500 hover:text-blue-600 disabled:opacity-40">
                            <Send size={14} />
                          </button>
                        )}
                        {canDecide && r.approvable && (
                          <button disabled={actingId === r.id} title="Approve"
                            onClick={() => withActing(r.id, () => approveDenominationCorrection(r.id), 'Correction approved.')}
                            className="text-slate-500 hover:text-emerald-600 disabled:opacity-40">
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {canDecide && r.rejectable && (
                          <button disabled={actingId === r.id} title="Reject" onClick={() => handleReject(r.id)}
                            className="text-slate-500 hover:text-red-600 disabled:opacity-40">
                            <XCircle size={14} />
                          </button>
                        )}
                        {canDecide && r.applicable && (
                          <button disabled={actingId === r.id} title="Apply"
                            onClick={() => withActing(r.id, () => applyDenominationCorrection(r.id), 'Correction applied — now the effective overlay.')}
                            className="text-slate-500 hover:text-indigo-600 disabled:opacity-40">
                            <PlayCircle size={14} />
                          </button>
                        )}
                        {canRequest && r.submittable && (
                          <button disabled={actingId === r.id} title="Cancel"
                            onClick={() => withActing(r.id, () => cancelDenominationCorrection(r.id), 'Request cancelled.')}
                            className="text-slate-500 hover:text-slate-800 disabled:opacity-40">
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationFooter page={page} totalPages={totalPages} totalElements={totalElements} size={PAGE_SIZE} loading={loading} onPageChange={(p) => load(p)} />
      </div>

      {showNewRequest && (
        <NewCorrectionRequestModal onClose={() => setShowNewRequest(false)} onCreated={() => { setShowNewRequest(false); load(0); }} />
      )}
      {detailRow && (
        <CorrectionDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}

function DenominationGrid({ values, onChange, readOnly }) {
  const total = DENOMINATIONS.reduce((sum, d) => sum + parseFloat(d) * (Number(values[d]) || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {DENOMINATIONS.map((d) => (
          <div key={d} className="border border-slate-200 rounded-lg p-2">
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">AED {d}</label>
            <input
              type="number"
              min="0"
              disabled={readOnly}
              value={values[d] ?? 0}
              onChange={(e) => onChange?.(d, Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full h-8 px-2 border border-slate-200 rounded text-sm disabled:bg-slate-50"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-2 text-sm font-bold text-slate-800">
        Total: {formatMoney(total)}
      </div>
    </div>
  );
}

function NewCorrectionRequestModal({ onClose, onCreated }) {
  const [sessionId, setSessionId] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const [session, setSession] = useState(null);
  const [original, setOriginal] = useState({});
  const [corrected, setCorrected] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const originalTotal = DENOMINATIONS.reduce((sum, d) => sum + parseFloat(d) * (Number(original[d]) || 0), 0);
  const correctedTotal = DENOMINATIONS.reduce((sum, d) => sum + parseFloat(d) * (Number(corrected[d]) || 0), 0);
  const difference = correctedTotal - originalTotal;

  const lookupSession = async () => {
    if (!sessionId) return;
    setLoadingSession(true);
    setError('');
    setSession(null);
    try {
      const [sessionData, effective] = await Promise.all([
        getPosSessionById(Number(sessionId)),
        getEffectiveDenomination(Number(sessionId)),
      ]);
      if (sessionData.status !== 'CLOSED') {
        setError('Denomination corrections can only be requested for a CLOSED session.');
        setLoadingSession(false);
        return;
      }
      setSession(sessionData);
      setOriginal(effective.effective || effective.original || {});
      setCorrected(effective.effective || effective.original || {});
    } catch (e) {
      setError(e?.response?.data?.message || 'Session not found.');
    } finally {
      setLoadingSession(false);
    }
  };

  const submit = async () => {
    if (!session) {
      setError('Look up a closed session first.');
      return;
    }
    if (!reason.trim()) {
      setError('A correction reason is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createDenominationCorrection({ sessionId: Number(sessionId), correctedDenominations: corrected, reason: reason.trim() });
      toast.success('Correction request created.');
      onCreated();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create correction request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">New Session Denomination Correction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Session ID</label>
            <div className="flex gap-2">
              <input type="number" value={sessionId} onChange={(e) => setSessionId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') lookupSession(); }}
                className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-sm" placeholder="e.g. 1024" />
              <button onClick={lookupSession} disabled={loadingSession || !sessionId}
                className="px-4 h-9 bg-slate-900 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                {loadingSession ? <Loader2 className="animate-spin" size={14} /> : 'View Session'}
              </button>
            </div>
          </div>

          {session && (
            <>
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 rounded-lg p-3">
                <div><span className="text-slate-500">Terminal</span><p className="font-bold text-slate-800">{session.terminalId || '-'}</p></div>
                <div><span className="text-slate-500">Closed At</span><p className="font-bold text-slate-800">{formatDateTime(session.closedAt)}</p></div>
                <div><span className="text-slate-500">Closing Cash</span><p className="font-bold text-slate-800">{formatMoney(session.closingCash)}</p></div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Original Denominations (as counted at close)</h4>
                <DenominationGrid values={original} readOnly />
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Corrected Denominations</h4>
                <DenominationGrid values={corrected} onChange={(d, v) => setCorrected((c) => ({ ...c, [d]: v }))} />
              </div>

              <div className={`rounded-lg p-3 text-sm font-bold flex justify-between ${difference === 0 ? 'bg-slate-50 text-slate-600' : difference > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                <span>Difference (Corrected − Original)</span>
                <span>{difference > 0 ? '+' : ''}{formatMoney(difference)}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Correction</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm h-20 resize-none"
                  placeholder="e.g. Miscounted AED 100 notes during close — recount confirmed by supervisor." />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded-lg border border-slate-200">Cancel</button>
          <button disabled={saving || !session} onClick={submit}
            className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-lg shadow-sm disabled:opacity-50">
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ icon: Icon, label, by, at, color }) {
  if (!at) return null;
  return (
    <div className="flex items-start gap-3">
      <div className={`p-1.5 rounded-full ${color}`}><Icon size={12} /></div>
      <div>
        <p className="text-xs font-bold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500">{by || 'system'} · {formatDateTime(at)}</p>
      </div>
    </div>
  );
}

function CorrectionDetailModal({ row, onClose }) {
  const original = JSON.parse(row.originalDenominationJson || '{}');
  const corrected = JSON.parse(row.correctedDenominationJson || '{}');
  const effective = row.status === 'APPLIED' ? corrected : original;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Correction — Session #{row.sessionId}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Original</p>
              <p className="text-lg font-bold text-slate-800">{formatMoney(row.originalTotal)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Corrected</p>
              <p className="text-lg font-bold text-slate-800">{formatMoney(row.correctedTotal)}</p>
            </div>
            <div className={`border rounded-lg p-3 ${row.status === 'APPLIED' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Effective {row.status === 'APPLIED' && '(Corrected)'}</p>
              <p className="text-lg font-bold text-slate-800">{formatMoney(row.status === 'APPLIED' ? row.correctedTotal : row.originalTotal)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">Original Count</h4>
              <DenominationGrid values={original} readOnly />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">Corrected Count</h4>
              <DenominationGrid values={corrected} readOnly />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-1">Reason</h4>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{row.reason}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-3">Audit Timeline</h4>
            <div className="space-y-3 border-l-2 border-slate-100 pl-4">
              <TimelineRow icon={Clock} label="Requested" by={row.requestedBy} at={row.requestedAt} color="bg-slate-100 text-slate-500" />
              <TimelineRow icon={CheckCircle2} label="Approved" by={row.approvedBy} at={row.approvedAt} color="bg-blue-100 text-blue-600" />
              <TimelineRow icon={XCircle} label="Rejected" by={row.rejectedBy} at={row.rejectedAt} color="bg-red-100 text-red-600" />
              <TimelineRow icon={PlayCircle} label="Applied" by={row.appliedBy} at={row.appliedAt} color="bg-emerald-100 text-emerald-600" />
            </div>
            {row.rejectionReason && (
              <p className="text-xs text-red-600 mt-2">Rejection reason: {row.rejectionReason}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
