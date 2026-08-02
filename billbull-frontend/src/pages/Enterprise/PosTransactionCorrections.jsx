import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Search, Loader2, ArrowLeftRight, X, CheckCircle2, XCircle, Send, PlayCircle, Ban, Clock, Eye, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '../../context/PermissionContext';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { getPosCashMovementById } from '../../api/posCashMovementApi';
import { getSelectableCategories } from '../../api/posCashMovementCategoryApi';
import PaginationFooter from '../../components/common/PaginationFooter';
import {
  getTransactionCorrections, createTransactionCorrection, submitTransactionCorrection,
  approveTransactionCorrection, rejectTransactionCorrection, applyTransactionCorrection, cancelTransactionCorrection,
} from '../../api/posTransactionCorrectionApi';

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

const CORRECTION_KINDS = [
  { key: 'CUSTOMER', label: 'Customer Correction', targetType: 'RECEIPT_VOUCHER', targetLabel: 'Receipt Voucher ID' },
  { key: 'PAYMENT_MODE', label: 'Payment Mode Correction', targetType: 'RECEIPT_VOUCHER', targetLabel: 'Receipt Voucher ID' },
  { key: 'RECEIPT_AMOUNT', label: 'Receipt Amount Correction', targetType: 'RECEIPT_VOUCHER', targetLabel: 'Receipt Voucher ID' },
  { key: 'ADVANCE_PAYMENT', label: 'Advance Allocation Correction', targetType: 'CUSTOMER_ADVANCE', targetLabel: 'Advance Application ID' },
  { key: 'CASH_MOVEMENT_CATEGORY', label: 'Cash Movement Category Correction', targetType: 'CASH_MOVEMENT', targetLabel: 'Cash Movement ID' },
];

const formatMoney = (v) => (v == null ? '-' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');
const safeParse = (json) => { try { return JSON.parse(json || '{}'); } catch { return {}; } };

export default function PosTransactionCorrections() {
  const { canCreate, canApprove } = usePermissions();
  const canRequest = canCreate('pos.admin.transaction');
  const canDecide = canApprove('pos.admin.approvals');

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [correctionTypeFilter, setCorrectionTypeFilter] = useState('');

  const [showNewRequest, setShowNewRequest] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async (targetPage = 0) => {
    setLoading(true);
    try {
      const data = await getTransactionCorrections({
        status: statusFilter || undefined,
        correctionType: correctionTypeFilter || undefined,
        page: targetPage,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setPage(data.page || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load transaction corrections.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, correctionTypeFilter]);

  useEffect(() => { load(0); }, [statusFilter, correctionTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
    withActing(id, () => rejectTransactionCorrection(id, reason.trim()), 'Correction rejected.');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Transaction Corrections</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Governed corrections to completed receipts, advance allocations, and cash movement categories. Every correction is a new offsetting GL event — no historical record is ever edited.
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
          <select value={correctionTypeFilter} onChange={(e) => setCorrectionTypeFilter(e.target.value)}
            className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]">
            <option value="">All correction types</option>
            {CORRECTION_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]">
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ArrowLeftRight size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No transaction corrections yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Target</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Correction Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Reason</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Requested By</th>
                  <th className="text-center px-4 py-2.5 font-semibold">v</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.targetType} #{r.targetId}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.correctionType?.replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.requestedBy}</td>
                    <td className="px-4 py-2.5 text-center text-slate-500">{r.version}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                        {r.status?.replace('_', ' ')}
                      </span>
                      {r.status === 'FAILED' && r.executionError && (
                        <p className="text-[10px] text-red-500 mt-1 max-w-[180px] truncate" title={r.executionError}>{r.executionError}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button title="View / Audit Timeline" onClick={() => setDetailRow(r)} className="text-slate-500 hover:text-slate-800">
                          <Eye size={14} />
                        </button>
                        {canRequest && r.submittable && (
                          <button disabled={actingId === r.id} title="Submit for Approval"
                            onClick={() => withActing(r.id, () => submitTransactionCorrection(r.id), 'Submitted for approval.')}
                            className="text-slate-500 hover:text-blue-600 disabled:opacity-40">
                            <Send size={14} />
                          </button>
                        )}
                        {canDecide && r.approvable && (
                          <button disabled={actingId === r.id} title="Approve"
                            onClick={() => withActing(r.id, () => approveTransactionCorrection(r.id), 'Correction approved.')}
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
                            onClick={() => withActing(r.id, () => applyTransactionCorrection(r.id), 'Correction applied — new offsetting GL entries posted.')}
                            className="text-slate-500 hover:text-indigo-600 disabled:opacity-40">
                            <PlayCircle size={14} />
                          </button>
                        )}
                        {canRequest && r.submittable && (
                          <button disabled={actingId === r.id} title="Cancel"
                            onClick={() => withActing(r.id, () => cancelTransactionCorrection(r.id), 'Request cancelled.')}
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

function NewCorrectionRequestModal({ onClose, onCreated }) {
  const [kind, setKind] = useState(CORRECTION_KINDS[0].key);
  const kindDef = CORRECTION_KINDS.find((k) => k.key === kind);

  const [targetId, setTargetId] = useState('');
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [target, setTarget] = useState(null);
  const [categories, setCategories] = useState([]);

  const [correctedCustomerCode, setCorrectedCustomerCode] = useState('');
  const [correctedPaymentMode, setCorrectedPaymentMode] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctedInvoiceNumber, setCorrectedInvoiceNumber] = useState('');
  const [correctedCategoryId, setCorrectedCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetTarget = () => { setTarget(null); setCategories([]); };

  const lookupTarget = async () => {
    if (!targetId) return;
    setLoadingTarget(true);
    setError('');
    resetTarget();
    try {
      if (kindDef.targetType === 'RECEIPT_VOUCHER') {
        const rv = await receiptVoucherApi.getById(Number(targetId));
        setTarget(rv);
        setCorrectedPaymentMode(rv.paymentMode || '');
        setCorrectedAmount(rv.amount ?? '');
      } else if (kindDef.targetType === 'CASH_MOVEMENT') {
        const m = await getPosCashMovementById(Number(targetId));
        setTarget(m);
        const sel = await getSelectableCategories(m.movementType, m.branchId);
        setCategories(sel.categories || []);
      } else if (kindDef.targetType === 'CUSTOMER_ADVANCE') {
        // No single-record lookup endpoint exists for advance applications yet — the backend
        // still fully validates the id and reason at submission time.
        setTarget({ id: Number(targetId), _noPreview: true });
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Transaction not found.');
    } finally {
      setLoadingTarget(false);
    }
  };

  const submit = async () => {
    if (!target) {
      setError('Look up the transaction first.');
      return;
    }
    if (!reason.trim()) {
      setError('A correction reason is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createTransactionCorrection({
        targetType: kindDef.targetType,
        targetId: Number(targetId),
        correctionType: kind,
        reason: reason.trim(),
        correctedCustomerCode: kind === 'CUSTOMER' ? correctedCustomerCode : undefined,
        correctedPaymentMode: kind === 'PAYMENT_MODE' ? correctedPaymentMode : undefined,
        correctedAmount: (kind === 'RECEIPT_AMOUNT' || kind === 'ADVANCE_PAYMENT') ? Number(correctedAmount) : undefined,
        correctedInvoiceNumber: kind === 'ADVANCE_PAYMENT' ? correctedInvoiceNumber : undefined,
        correctedCategoryId: kind === 'CASH_MOVEMENT_CATEGORY' ? Number(correctedCategoryId) : undefined,
      });
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
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">New Transaction Correction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correction Type</label>
            <select value={kind} onChange={(e) => { setKind(e.target.value); setTargetId(''); resetTarget(); }}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
              {CORRECTION_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{kindDef.targetLabel}</label>
            <div className="flex gap-2">
              <input type="number" value={targetId} onChange={(e) => setTargetId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') lookupTarget(); }}
                className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-sm" placeholder="e.g. 1024" />
              <button onClick={lookupTarget} disabled={loadingTarget || !targetId}
                className="px-4 h-9 bg-slate-900 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                {loadingTarget ? <Loader2 className="animate-spin" size={14} /> : 'Look Up'}
              </button>
            </div>
          </div>

          {target && !target._noPreview && kindDef.targetType === 'RECEIPT_VOUCHER' && (
            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 rounded-lg p-3">
              <div><span className="text-slate-500">Customer</span><p className="font-bold text-slate-800">{target.customerCode || 'Walk-In'}</p></div>
              <div><span className="text-slate-500">Payment Mode</span><p className="font-bold text-slate-800">{target.paymentMode}</p></div>
              <div><span className="text-slate-500">Amount</span><p className="font-bold text-slate-800">{formatMoney(target.amount)}</p></div>
            </div>
          )}
          {target && !target._noPreview && kindDef.targetType === 'CASH_MOVEMENT' && (
            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 rounded-lg p-3">
              <div><span className="text-slate-500">Type</span><p className="font-bold text-slate-800">{target.movementType}</p></div>
              <div><span className="text-slate-500">Amount</span><p className="font-bold text-slate-800">{formatMoney(target.amount)}</p></div>
              <div><span className="text-slate-500">Current Category</span><p className="font-bold text-slate-800">{target.categoryName || 'Uncategorized (Legacy)'}</p></div>
            </div>
          )}
          {target && target._noPreview && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>No preview is available for advance allocations — the backend will validate this ID and reject the request if it's invalid, already refunded, or in a locked period.</span>
            </div>
          )}

          {target && kind === 'CUSTOMER' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Customer Code (blank = Walk-In)</label>
              <input value={correctedCustomerCode} onChange={(e) => setCorrectedCustomerCode(e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" placeholder="e.g. CUST-0042" />
            </div>
          )}
          {target && kind === 'PAYMENT_MODE' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Payment Mode</label>
              <input value={correctedPaymentMode} onChange={(e) => setCorrectedPaymentMode(e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" placeholder="e.g. Visa, Cash, Mastercard" />
            </div>
          )}
          {target && kind === 'RECEIPT_AMOUNT' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Amount</label>
              <input type="number" step="0.01" value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm font-bold" />
            </div>
          )}
          {target && kind === 'ADVANCE_PAYMENT' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Invoice Number (blank = keep current)</label>
                <input value={correctedInvoiceNumber} onChange={(e) => setCorrectedInvoiceNumber(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" placeholder="e.g. INV-1042" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Amount</label>
                <input type="number" step="0.01" value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm font-bold" />
              </div>
            </>
          )}
          {target && kind === 'CASH_MOVEMENT_CATEGORY' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Corrected Category</label>
              <select value={correctedCategoryId} onChange={(e) => setCorrectedCategoryId(e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="">Select a category...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {target && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for Correction</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm h-20 resize-none"
                placeholder="e.g. Customer paid by card, cashier recorded it as cash in error." />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded-lg border border-slate-200">Cancel</button>
          <button disabled={saving || !target} onClick={submit}
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
  const original = safeParse(row.originalSnapshotJson);
  const corrected = safeParse(row.correctedSnapshotJson);
  const difference = safeParse(row.differenceSummaryJson);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">{row.targetType} #{row.targetId} — v{row.version}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Original</p>
              <dl className="space-y-1 text-xs">
                {Object.entries(original).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800">{String(v)}</dd></div>
                ))}
              </dl>
            </div>
            <div className={`border rounded-lg p-3 ${row.status === 'APPLIED' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Corrected {row.status === 'APPLIED' && '(Effective)'}</p>
              <dl className="space-y-1 text-xs">
                {Object.entries(corrected).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800">{String(v)}</dd></div>
                ))}
              </dl>
            </div>
          </div>

          {Object.keys(difference).length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 text-xs">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Difference</p>
              <dl className="space-y-1">
                {Object.entries(difference).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800">{String(v)}</dd></div>
                ))}
              </dl>
            </div>
          )}

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
            {row.rejectionReason && <p className="text-xs text-red-600 mt-2">Rejection reason: {row.rejectionReason}</p>}
            {row.executionError && <p className="text-xs text-red-600 mt-2">Execution error: {row.executionError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
