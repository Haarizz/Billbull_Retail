import React, { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, History as HistoryIcon, X, Eye, CheckCircle2, XCircle, PlayCircle, Clock, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import PaginationFooter from '../../components/common/PaginationFooter';
import CorrectionExportButtons from '../../components/common/CorrectionExportButtons';
import { getCorrectionHistory, getEffectiveCorrectionView, getAuditForCorrectionRequest } from '../../api/posAdminReportingApi';

const PAGE_SIZE = 20;
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
const TARGET_TYPES = ['SALES_INVOICE', 'SALES_RETURN', 'RECEIPT_VOUCHER', 'CUSTOMER_ADVANCE', 'CASH_MOVEMENT', 'POS_SESSION', 'X_REPORT', 'Z_REPORT', 'DAY_CLOSE'];
const CORRECTION_TYPES = ['DENOMINATION', 'PAYMENT_MODE', 'CUSTOMER', 'RECEIPT_AMOUNT', 'ADVANCE_PAYMENT', 'CASH_MOVEMENT_CATEGORY', 'OTHER'];
const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');

const EMPTY_FILTERS = {
  branchId: '', status: '', targetType: '', correctionType: '', targetId: '',
  requestedBy: '', approvedBy: '', fromDate: '', toDate: '', search: '',
};

export default function PosCorrectionHistory() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (targetPage = 0) => {
    setLoading(true);
    try {
      const data = await getCorrectionHistory({
        branchId: filters.branchId || undefined,
        status: filters.status || undefined,
        targetType: filters.targetType || undefined,
        correctionType: filters.correctionType || undefined,
        targetId: filters.targetId || undefined,
        requestedBy: filters.requestedBy || undefined,
        approvedBy: filters.approvedBy || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        search: filters.search || undefined,
        page: targetPage,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setPage(data.page || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load correction history.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field, value) => setFilters((f) => ({ ...f, [field]: value }));

  const exportColumns = [
    { header: 'Request #', key: 'requestNumber' }, { header: 'Target Type', key: 'targetType' },
    { header: 'Target ID', key: 'targetId' }, { header: 'Correction Type', key: 'correctionType' },
    { header: 'Reason', key: 'reason' }, { header: 'Requested By', key: 'requestedBy' },
    { header: 'Requested At', key: 'requestedAt' }, { header: 'Approved By', key: 'approvedBy' },
    { header: 'Status', key: 'status' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Correction History</h3>
            <p className="text-xs text-slate-500 mt-0.5">Unified, cross-domain search across every correction type — session, receipt, advance, and cash movement.</p>
          </div>
          <CorrectionExportButtons data={rows} columns={exportColumns} title="Correction History" fileName="pos-correction-history" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 p-4 border-b border-slate-100">
          <div className="relative col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={filters.search} onChange={(e) => set('search', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(0); }}
              placeholder="Correction #, reason..." className="w-full h-9 pl-8 pr-3 text-xs border border-slate-200 rounded-lg" />
          </div>
          <select value={filters.targetType} onChange={(e) => set('targetType', e.target.value)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-white">
            <option value="">All target types</option>
            {TARGET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={filters.correctionType} onChange={(e) => set('correctionType', e.target.value)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-white">
            <option value="">All correction types</option>
            {CORRECTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-white">
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <input type="number" value={filters.targetId} onChange={(e) => set('targetId', e.target.value)}
            placeholder="Target ID (session/receipt/etc.)" className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <input value={filters.requestedBy} onChange={(e) => set('requestedBy', e.target.value)}
            placeholder="Requested By (user)" className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <input value={filters.approvedBy} onChange={(e) => set('approvedBy', e.target.value)}
            placeholder="Approver" className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <input type="number" value={filters.branchId} onChange={(e) => set('branchId', e.target.value)}
            placeholder="Branch ID" className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <input type="date" value={filters.fromDate} onChange={(e) => set('fromDate', e.target.value)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <input type="date" value={filters.toDate} onChange={(e) => set('toDate', e.target.value)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg" />
          <button onClick={() => load(0)} className="h-9 px-3 text-xs font-bold text-slate-900 bg-[#F5C742] rounded-lg hover:bg-[#E5B732]">Search</button>
          <button onClick={() => { setFilters(EMPTY_FILTERS); }} className="h-9 px-3 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Clear</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <HistoryIcon size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No corrections match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Request #</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Target</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Requested By</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Approved By</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Requested At</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{r.requestNumber}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.targetType} #{r.targetId}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.correctionType?.replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.requestedBy}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.approvedBy || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(r.requestedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                        {r.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setDetail(r)} className="text-slate-500 hover:text-slate-800"><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationFooter page={page} totalPages={totalPages} totalElements={totalElements} size={PAGE_SIZE} loading={loading} onPageChange={(p) => load(p)} />
      </div>

      {detail && <HistoryDetailModal row={detail} onClose={() => setDetail(null)} />}
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

function HistoryDetailModal({ row, onClose }) {
  const [effective, setEffective] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [linkedJournals, setLinkedJournals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getEffectiveCorrectionView(row.targetType, row.targetId).catch(() => null),
      getAuditForCorrectionRequest(row.requestNumber, row.id).catch(() => null),
    ]).then(([eff, audit]) => {
      setEffective(eff);
      setAuditTrail(audit?.auditTrail || []);
      setLinkedJournals(audit?.linkedJournals || []);
    }).finally(() => setLoading(false));
  }, [row]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">{row.requestNumber} — {row.targetType} #{row.targetId}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="animate-spin" size={22} /></div>
          ) : (
            <>
              {effective?.corrected && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Original</p>
                    <dl className="space-y-1 text-xs">
                      {Object.entries(effective.original || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800">{String(v)}</dd></div>
                      ))}
                    </dl>
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Effective (Corrected)</p>
                    <dl className="space-y-1 text-xs">
                      {Object.entries(effective.effective || effective.correctedDenomination || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800">{String(v)}</dd></div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-1">Reason</h4>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{row.reason}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-3">Timeline</h4>
                <div className="space-y-3 border-l-2 border-slate-100 pl-4">
                  <TimelineRow icon={Clock} label="Requested" by={row.requestedBy} at={row.requestedAt} color="bg-slate-100 text-slate-500" />
                  <TimelineRow icon={Send} label="Submitted" by={row.requestedBy} at={row.status !== 'REQUESTED' ? row.requestedAt : null} color="bg-slate-100 text-slate-500" />
                  <TimelineRow icon={CheckCircle2} label="Approved" by={row.approvedBy} at={row.approvedAt} color="bg-blue-100 text-blue-600" />
                  <TimelineRow icon={XCircle} label="Rejected" by={row.rejectedBy} at={row.rejectedAt} color="bg-red-100 text-red-600" />
                  <TimelineRow icon={PlayCircle} label="Applied" by={row.executedBy} at={row.executedAt} color="bg-emerald-100 text-emerald-600" />
                </div>
                {row.failureReason && <p className="text-xs text-red-600 mt-2">Failure reason: {row.failureReason}</p>}
              </div>

              {linkedJournals.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">Linked Journals</h4>
                  <div className="space-y-1">
                    {linkedJournals.map((j) => (
                      <div key={j.entryNumber} className="flex justify-between text-xs bg-slate-50 rounded-lg p-2">
                        <span className="font-mono text-slate-600">{j.entryNumber} ({j.reference})</span>
                        <span className="text-slate-500">{j.status} · {j.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {auditTrail.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">Linked Audit Events</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditTrail.map((a) => (
                      <div key={a.id} className="text-xs bg-slate-50 rounded-lg p-2">
                        <span className="font-bold text-slate-700">{a.action}</span>
                        <span className="text-slate-400"> · {a.entityType}</span>
                        <span className="text-slate-500"> · {a.username} · {formatDateTime(a.timestamp)}</span>
                        {a.details && <p className="text-slate-500 mt-0.5">{a.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
