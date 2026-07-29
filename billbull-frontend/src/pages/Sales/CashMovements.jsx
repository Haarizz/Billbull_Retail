import React, { useCallback, useEffect, useState } from "react";
import { Banknote, Eye, Pencil, Ban, Plus, X } from "lucide-react";
import { useBranch } from "../../context/BranchContext";
import { usePermissions } from "../../context/PermissionContext";
import PaginationFooter from "../../components/common/PaginationFooter";
import {
  getPosCashMovements,
  getPosCashMovementById,
  createPosCashMovement,
  editPosCashMovement,
  voidPosCashMovement,
} from "../../api/posCashMovementApi";
import { getSelectableCategories } from "../../api/posCashMovementCategoryApi";

const MOVEMENT_TYPES = ["DROP_IN", "DROP_OUT"];
const STATUSES = ["ACTIVE", "VOIDED"];
const PAGE_SIZE = 20;

const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : "-");
const formatAmount = (v) => (v == null ? "-" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const StatusBadge = ({ status }) => {
  const isVoided = status === "VOIDED";
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
        isVoided
          ? "bg-red-50 text-red-600 border-red-200"
          : "bg-emerald-50 text-emerald-600 border-emerald-200"
      }`}
    >
      {status}
    </span>
  );
};

export default function CashMovements() {
  const { activeBranch } = useBranch();
  const { canAction } = usePermissions();

  const canCreate = canAction("permissions.pos.cashmovement.create", "view");
  const canViewAll = canAction("permissions.pos.cashmovement.viewall", "view");
  const canEditPerm = canAction("permissions.pos.cashmovement.edit", "view");
  const canVoidPerm = canAction("permissions.pos.cashmovement.void", "view");

  const [filters, setFilters] = useState({
    sessionId: "", status: "", movementType: "", fromDate: "", toDate: "", performedBy: "",
  });
  const [rows, setRows] = useState([]);
  const [pageMeta, setPageMeta] = useState({ page: 0, totalPages: 0, totalElements: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [viewRow, setViewRow] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [voidRow, setVoidRow] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const missingSessionFilter = !canViewAll && !filters.sessionId;

  const fetchRows = useCallback(async (page = 0) => {
    if (missingSessionFilter) {
      setRows([]);
      setPageMeta({ page: 0, totalPages: 0, totalElements: 0 });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getPosCashMovements({
        branchId: activeBranch?.id,
        sessionId: filters.sessionId || undefined,
        status: filters.status || undefined,
        movementType: filters.movementType || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        performedBy: filters.performedBy || undefined,
        page,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setPageMeta({ page: data.page, totalPages: data.totalPages, totalElements: data.totalElements });
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load cash movements.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id, filters, missingSessionFilter]);

  useEffect(() => { fetchRows(0); }, [fetchRows]);

  const handleFilterChange = (field, value) => setFilters((f) => ({ ...f, [field]: value }));

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="text-[#F5C742]" size={22} />
          <div>
            <h1 className="text-lg font-bold text-slate-800">Cash Drop / Outs</h1>
            <p className="text-xs text-slate-500">POS cash-drawer drop-in / drop-out transactions</p>
          </div>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded shadow-sm flex items-center gap-2 transition-colors"
          >
            <Plus size={16} /> Add New
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input
            type="number" placeholder="Session ID"
            value={filters.sessionId}
            onChange={(e) => handleFilterChange("sessionId", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          />
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.movementType}
            onChange={(e) => handleFilterChange("movementType", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          >
            <option value="">All Types</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="date" value={filters.fromDate}
            onChange={(e) => handleFilterChange("fromDate", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          />
          <input
            type="date" value={filters.toDate}
            onChange={(e) => handleFilterChange("toDate", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          />
          <input
            type="text" placeholder="Performed By"
            value={filters.performedBy}
            onChange={(e) => handleFilterChange("performedBy", e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20"
          />
        </div>
      </div>

      {missingSessionFilter && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3">
          Enter a Session ID above to view your cash movements. Cross-session history requires supervisor access.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="bb-nowrap-table w-full text-sm text-left">
            <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Business Date</th>
                <th className="px-4 py-2 font-semibold">Session</th>
                <th className="px-4 py-2 font-semibold">Counter</th>
                <th className="px-4 py-2 font-semibold">Terminal</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 font-semibold text-right">Amount</th>
                <th className="px-4 py-2 font-semibold">Description</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Created By</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">Loading...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">No cash movements found.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="group border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">{formatDateTime(row.performedAt)}</td>
                  <td className="px-4 py-2">{row.businessDate || "-"}</td>
                  <td className="px-4 py-2">{row.sessionId}</td>
                  <td className="px-4 py-2">{row.counterName || "-"}</td>
                  <td className="px-4 py-2">{row.terminalId || "-"}</td>
                  <td className="px-4 py-2">{row.movementType}</td>
                  <td className="px-4 py-2">
                    {row.categoryName || <span className="text-slate-400 italic">Uncategorized (Legacy)</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{formatAmount(row.amount)}</td>
                  <td className="px-4 py-2 max-w-[220px] truncate" title={row.description}>{row.description || "-"}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2">{row.performedBy || "-"}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100">
                      <button type="button" title="View" onClick={() => setViewRow(row)} className="text-slate-500 hover:text-slate-800">
                        <Eye size={16} />
                      </button>
                      {canEditPerm && (
                        <button
                          type="button" title="Edit" disabled={!row.editable}
                          onClick={() => setEditRow(row)}
                          className="text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {canVoidPerm && (
                        <button
                          type="button" title="Void" disabled={!row.voidable}
                          onClick={() => setVoidRow(row)}
                          className="text-slate-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          page={pageMeta.page} totalPages={pageMeta.totalPages} totalElements={pageMeta.totalElements}
          size={PAGE_SIZE} loading={loading} onPageChange={(p) => fetchRows(p)}
        />
      </div>

      {viewRow && <ViewModal row={viewRow} onClose={() => setViewRow(null)} />}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchRows(pageMeta.page); }}
        />
      )}
      {editRow && (
        <EditModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); fetchRows(pageMeta.page); }}
        />
      )}
      {voidRow && (
        <VoidModal
          row={voidRow}
          onClose={() => setVoidRow(null)}
          onVoided={() => { setVoidRow(null); fetchRows(pageMeta.page); }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`bg-white rounded-lg shadow-lg w-full ${wide ? "max-w-lg" : "max-w-sm"} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function ViewModal({ row: initial, onClose }) {
  const [row, setRow] = useState(initial);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPosCashMovementById(initial.id)
      .then((full) => { if (!cancelled) setRow(full); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initial.id]);

  return (
    <ModalShell title={`Cash Movement #${row.id}`} onClose={onClose} wide>
      {loading && <div className="text-xs text-slate-400">Refreshing...</div>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Type</dt><dd className="font-bold">{row.movementType}</dd>
        <dt className="text-slate-500">Category</dt>
        <dd>{row.categoryName || <span className="text-slate-400 italic">Uncategorized (Legacy)</span>}</dd>
        <dt className="text-slate-500">Amount</dt><dd className="font-bold">{formatAmount(row.amount)}</dd>
        <dt className="text-slate-500">Status</dt><dd><StatusBadge status={row.status} /></dd>
        <dt className="text-slate-500">Session</dt><dd>{row.sessionId}</dd>
        <dt className="text-slate-500">Counter</dt><dd>{row.counterName || "-"}</dd>
        <dt className="text-slate-500">Terminal</dt><dd>{row.terminalId || "-"}</dd>
        <dt className="text-slate-500">Business Date</dt><dd>{row.businessDate || "-"}</dd>
        <dt className="text-slate-500">Performed By</dt><dd>{row.performedBy || "-"}</dd>
        <dt className="text-slate-500">Performed At</dt><dd>{formatDateTime(row.performedAt)}</dd>
        <dt className="text-slate-500">Description</dt><dd>{row.description || "-"}</dd>
        <dt className="text-slate-500">Reference</dt><dd>{row.reference || "-"}</dd>
        {row.editCount > 0 && (
          <>
            <dt className="text-slate-500">Original Description</dt><dd>{row.originalDescription || "-"}</dd>
            <dt className="text-slate-500">Edited By / At</dt><dd>{row.editedBy} · {formatDateTime(row.editedAt)}</dd>
          </>
        )}
        {row.status === "VOIDED" && (
          <>
            <dt className="text-slate-500">Void Reason</dt><dd className="text-red-600">{row.voidReason}</dd>
            <dt className="text-slate-500">Voided By / At</dt><dd>{row.voidedBy} · {formatDateTime(row.voidedAt)}</dd>
          </>
        )}
      </dl>
    </ModalShell>
  );
}

function CreateModal({ onClose, onCreated }) {
  const { activeBranch } = useBranch();
  const [sessionId, setSessionId] = useState("");
  const [movementType, setMovementType] = useState("DROP_IN");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryRequired, setCategoryRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCategoryId("");
    getSelectableCategories(movementType, activeBranch?.id)
      .then((data) => {
        setCategories(data?.categories || []);
        setCategoryRequired(Boolean(data?.categoryRequired));
      })
      .catch(() => { setCategories([]); setCategoryRequired(false); });
  }, [movementType, activeBranch?.id]);

  const submit = async () => {
    if (!sessionId || !amount || Number(amount) <= 0) {
      setError("Session ID and a positive amount are required.");
      return;
    }
    if (categoryRequired && !categoryId) {
      setError("Select a category before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPosCashMovement({
        sessionId: Number(sessionId), movementType, amount: Number(amount), description, reference,
        categoryId: categoryId || undefined,
      });
      onCreated();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to create cash movement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="New Cash Drop / Out" onClose={onClose} wide>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}
      <label className="block text-xs font-semibold text-slate-600">Session ID</label>
      <input type="number" value={sessionId} onChange={(e) => setSessionId(e.target.value)}
        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
      <label className="block text-xs font-semibold text-slate-600">Movement Type</label>
      <select value={movementType} onChange={(e) => setMovementType(e.target.value)}
        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
        {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <label className="block text-xs font-semibold text-slate-600">Amount</label>
      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm font-bold" />
      {(categories.length > 0 || categoryRequired) && (
        <>
          <label className="block text-xs font-semibold text-slate-600">
            Category{categoryRequired ? " *" : " (optional)"}
          </label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="">{categoryRequired ? "Select a category..." : "Uncategorized"}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      <label className="block text-xs font-semibold text-slate-600">Reason / Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-lg text-sm h-16 resize-none" />
      <label className="block text-xs font-semibold text-slate-600">Reference (optional)</label>
      <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded border border-slate-200">Cancel</button>
        <button type="button" disabled={saving} onClick={submit}
          className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded shadow-sm disabled:opacity-50">
          {saving ? "Saving..." : "Create"}
        </button>
      </div>
    </ModalShell>
  );
}

function EditModal({ row, onClose, onSaved }) {
  const [description, setDescription] = useState(row.description || "");
  const [reference, setReference] = useState(row.reference || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await editPosCashMovement(row.id, { description, reference });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Edit Cash Movement #${row.id}`} onClose={onClose} wide>
      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded p-2">
        Only description and reference can be edited. Amount, type, and session are permanent — void and re-create if incorrect.
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}
      <label className="block text-xs font-semibold text-slate-600">Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-lg text-sm h-16 resize-none" />
      <label className="block text-xs font-semibold text-slate-600">Reference</label>
      <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
        className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded border border-slate-200">Cancel</button>
        <button type="button" disabled={saving} onClick={submit}
          className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded shadow-sm disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function VoidModal({ row, onClose, onVoided }) {
  const [voidReason, setVoidReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!voidReason.trim()) {
      setError("Void reason is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await voidPosCashMovement(row.id, voidReason.trim());
      onVoided();
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to void cash movement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Void Cash Movement #${row.id}`} onClose={onClose}>
      <div className="text-sm text-slate-600">
        Void <span className="font-bold">{row.movementType}</span> of{" "}
        <span className="font-bold">{formatAmount(row.amount)}</span>? The original record is
        preserved and a reversing GL entry will be posted. This cannot be undone.
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}
      <label className="block text-xs font-semibold text-slate-600">Void Reason (required)</label>
      <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-lg text-sm h-16 resize-none" />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded border border-slate-200">Cancel</button>
        <button type="button" disabled={saving} onClick={submit}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded shadow-sm disabled:opacity-50">
          {saving ? "Voiding..." : "Void Transaction"}
        </button>
      </div>
    </ModalShell>
  );
}
