import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Coins, ArrowLeftRight, Tags, ClipboardCheck, LayoutDashboard, History as HistoryIcon, BarChart3,
  CheckCircle2, XCircle, Ban, Loader2, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '../../context/PermissionContext';
import {
  getCorrectionRequests, approveCorrectionRequest, rejectCorrectionRequest, cancelCorrectionRequest,
} from '../../api/posAdminApi';
import PaginationFooter from '../../components/common/PaginationFooter';
import CorrectionExportButtons from '../../components/common/CorrectionExportButtons';
import PosCashMovementCategories from './PosCashMovementCategories';
import PosSessionDenominationCorrections from './PosSessionDenominationCorrections';
import PosTransactionCorrections from './PosTransactionCorrections';
import PosCorrectionDashboard from './PosCorrectionDashboard';
import PosCorrectionHistory from './PosCorrectionHistory';
import PosCorrectionAnalytics from './PosCorrectionAnalytics';
import PosCorrectionAuditView from './PosCorrectionAuditView';

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

const CorrectionApprovalsPanel = () => {
  const { canApprove } = usePermissions();
  const canDecide = canApprove('pos.admin.approvals');

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const data = await getCorrectionRequests({
        status: statusFilter || undefined,
        page: targetPage,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setPage(data.page || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (id) => {
    setActingId(id);
    try {
      await approveCorrectionRequest(id);
      toast.success('Correction approved.');
      load(page);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to approve correction request.');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Rejection reason:');
    if (!reason || !reason.trim()) return;
    setActingId(id);
    try {
      await rejectCorrectionRequest(id, reason.trim());
      toast.success('Correction rejected.');
      load(page);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to reject correction request.');
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this correction request?')) return;
    setActingId(id);
    try {
      await cancelCorrectionRequest(id);
      toast.success('Correction request cancelled.');
      load(page);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to cancel correction request.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Correction Approvals</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Every correction request across POS Administration, in one governance queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <CorrectionExportButtons
            data={rows}
            columns={[
              { header: 'Request #', key: 'requestNumber' }, { header: 'Target Type', key: 'targetType' },
              { header: 'Target ID', key: 'targetId' }, { header: 'Correction Type', key: 'correctionType' },
              { header: 'Reason', key: 'reason' }, { header: 'Requested By', key: 'requestedBy' },
              { header: 'Status', key: 'status' },
            ]}
            title="Approval Queue"
            fileName="pos-admin-approval-queue"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <ClipboardCheck size={32} className="mb-2 opacity-50" />
          <p className="text-sm">No correction requests yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Request #</th>
                <th className="text-left px-4 py-2.5 font-semibold">Target</th>
                <th className="text-left px-4 py-2.5 font-semibold">Correction Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Reason</th>
                <th className="text-left px-4 py-2.5 font-semibold">Requested By</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{r.requestNumber}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.targetType} #{r.targetId}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.correctionType}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.requestedBy}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {r.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {canDecide && r.approvable && (
                        <button
                          disabled={actingId === r.id}
                          onClick={() => handleApprove(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-[11px] font-bold hover:bg-green-100 disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                      )}
                      {canDecide && r.rejectable && (
                        <button
                          disabled={actingId === r.id}
                          onClick={() => handleReject(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-[11px] font-bold hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      )}
                      {r.cancellable && (
                        <button
                          disabled={actingId === r.id}
                          onClick={() => handleCancel(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50"
                        >
                          <Ban size={12} /> Cancel
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

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        totalElements={totalElements}
        size={PAGE_SIZE}
        loading={loading}
        onPageChange={(p) => load(p)}
      />
    </div>
  );
};

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'pos.admin' },
  { id: 'denomination', label: 'Session Denomination Corrections', icon: Coins, module: 'pos.admin.session' },
  { id: 'transaction', label: 'Transaction Corrections', icon: ArrowLeftRight, module: 'pos.admin.transaction' },
  { id: 'categories', label: 'Cash Movement Categories', icon: Tags, module: 'pos.admin.cashmovement.category' },
  { id: 'approvals', label: 'Correction Approvals', icon: ClipboardCheck, module: 'pos.admin.approvals' },
  { id: 'history', label: 'History', icon: HistoryIcon, module: 'pos.admin' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, module: 'pos.admin' },
  { id: 'audit', label: 'Audit View', icon: ShieldCheck, module: 'pos.admin.audit' },
];

const PosAdministration = () => {
  const { canView, permissionsLoaded } = usePermissions();
  const visibleTabs = TABS.filter((t) => !permissionsLoaded || canView(t.module));
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  useEffect(() => {
    if (permissionsLoaded && visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [permissionsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900">
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <span>Enterprise Console</span>
          <span className="text-slate-400">&gt;</span>
          <span className="font-medium text-slate-900">POS Administration</span>
        </div>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-slate-700" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">POS Administration</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Post-transaction financial governance — controlled, auditable corrections. Not part of day-to-day POS operations.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {!permissionsLoaded ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : visibleTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <AlertCircle size={28} className="mb-2 opacity-60" />
            <p className="text-sm">You don't have access to any POS Administration section.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'dashboard' && <PosCorrectionDashboard />}
            {activeTab === 'denomination' && <PosSessionDenominationCorrections />}
            {activeTab === 'transaction' && <PosTransactionCorrections />}
            {activeTab === 'categories' && <PosCashMovementCategories />}
            {activeTab === 'approvals' && <CorrectionApprovalsPanel />}
            {activeTab === 'history' && <PosCorrectionHistory />}
            {activeTab === 'analytics' && <PosCorrectionAnalytics />}
            {activeTab === 'audit' && <PosCorrectionAuditView />}
          </>
        )}
      </div>
    </div>
  );
};

export default PosAdministration;
