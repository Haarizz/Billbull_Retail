import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Pencil, CheckCircle2, XCircle, Loader2, Tags, Search, ToggleLeft, ToggleRight, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '../../context/PermissionContext';
import { getAccounts } from '../../api/ledgerApi';
import { getPosSettings, savePosSettings } from '../../api/posApi';
import PaginationFooter from '../../components/common/PaginationFooter';
import {
  getCashMovementCategories, createCashMovementCategory, updateCashMovementCategory,
  activateCashMovementCategory, deactivateCashMovementCategory,
} from '../../api/posCashMovementCategoryApi';

const PAGE_SIZE = 20;
const MOVEMENT_TYPES = ['DROP_IN', 'DROP_OUT', 'BOTH'];
const MOVEMENT_TYPE_LABEL = { DROP_IN: 'Drop In', DROP_OUT: 'Drop Out', BOTH: 'Both' };

const EMPTY_FORM = {
  code: '', name: '', description: '', movementType: 'BOTH',
  glAccountId: '', displayOrder: 0, notesRequired: false, approvalRequired: false,
};

export default function PosCashMovementCategories() {
  const { canCreate, canEdit } = usePermissions();
  const canManage = canCreate('pos.admin.cashmovement.category') || canEdit('pos.admin.cashmovement.category');

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [requireCategory, setRequireCategory] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  const load = useCallback(async (targetPage = 0) => {
    setLoading(true);
    try {
      const data = await getCashMovementCategories({
        active: activeFilter === '' ? undefined : activeFilter === 'true',
        movementType: movementTypeFilter || undefined,
        search: search || undefined,
        page: targetPage,
        size: PAGE_SIZE,
      });
      setRows(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setPage(data.page || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, movementTypeFilter, search]);

  useEffect(() => { load(0); }, [activeFilter, movementTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => load(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    getPosSettings().then((s) => setRequireCategory(Boolean(s?.requireCashMovementCategory))).catch(() => {});
  }, []);

  const toggleRequireCategory = async () => {
    setToggleLoading(true);
    try {
      const current = await getPosSettings();
      const updated = await savePosSettings({ ...current, requireCashMovementCategory: !requireCategory });
      setRequireCategory(Boolean(updated?.requireCashMovementCategory));
      toast.success(`Category is now ${!requireCategory ? 'required' : 'optional'} for new cash movements in this branch.`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update the setting.');
    } finally {
      setToggleLoading(false);
    }
  };

  const handleToggleActive = async (row) => {
    try {
      if (row.active) {
        await deactivateCashMovementCategory(row.id);
        toast.success(`"${row.name}" deactivated.`);
      } else {
        await activateCashMovementCategory(row.id);
        toast.success(`"${row.name}" activated.`);
      }
      load(page);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to change category status.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-50 text-slate-500"><Tags size={18} /></div>
          <div>
            <p className="text-sm font-bold text-slate-800">Require category for new cash movements</p>
            <p className="text-xs text-slate-500">Applies to this branch only — existing movements are never affected.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={!canManage || toggleLoading}
          onClick={toggleRequireCategory}
          className="flex items-center gap-2 disabled:opacity-50"
          title={canManage ? '' : 'You do not have permission to change this setting'}
        >
          {requireCategory
            ? <ToggleRight className="text-emerald-600" size={30} />
            : <ToggleLeft className="text-slate-300" size={30} />}
          <span className={`text-xs font-bold ${requireCategory ? 'text-emerald-700' : 'text-slate-500'}`}>
            {requireCategory ? 'Required' : 'Optional'}
          </span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or code..."
                className="h-9 pl-8 pr-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
              />
            </div>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]">
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <select value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]">
              <option value="">All movement types</option>
              {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
            >
              <Plus size={14} /> New Category
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Tags size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No categories found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Code</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Movement Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">GL Account</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Notes Req.</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Approval Req.</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{r.code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{MOVEMENT_TYPE_LABEL[r.movementType] || r.movementType}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.glAccountName ? `${r.glAccountName} (${r.glAccountCode})` : <span className="text-slate-400">Default posting rule</span>}</td>
                    <td className="px-4 py-2.5 text-center">{r.notesRequired ? '✓' : '—'}</td>
                    <td className="px-4 py-2.5 text-center">{r.approvalRequired ? '✓' : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {r.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && (
                          <button title="Edit" onClick={() => { setEditing(r); setShowForm(true); }} className="text-slate-500 hover:text-blue-600">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canManage && (
                          <button
                            title={r.active ? 'Deactivate' : 'Activate'}
                            onClick={() => handleToggleActive(r)}
                            className={r.active ? 'text-slate-500 hover:text-red-600' : 'text-slate-500 hover:text-emerald-600'}
                          >
                            {r.active ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
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

      {showForm && (
        <CategoryFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(page); }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ initial, onClose, onSaved }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState(initial ? {
    code: initial.code, name: initial.name, description: initial.description || '',
    movementType: initial.movementType, glAccountId: initial.glAccountId || '',
    displayOrder: initial.displayOrder ?? 0, notesRequired: initial.notesRequired, approvalRequired: initial.approvalRequired,
  } : EMPTY_FORM);
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getAccounts().then(setAccounts).catch(() => {}); }, []);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Code and name are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, glAccountId: form.glAccountId || null, displayOrder: Number(form.displayOrder) || 0 };
      if (isEdit) {
        await updateCashMovementCategory(initial.id, payload);
        toast.success('Category updated.');
      } else {
        await createCashMovementCategory(payload);
        toast.success('Category created.');
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Category' : 'New Cash Movement Category'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Code</label>
              <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Display Order</label>
              <input type="number" value={form.displayOrder} onChange={(e) => set('displayOrder', e.target.value)}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm h-16 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Movement Type</label>
            <select value={form.movementType} onChange={(e) => set('movementType', e.target.value)}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
              {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">GL Account Mapping (optional)</label>
            <select value={form.glAccountId} onChange={(e) => set('glAccountId', e.target.value)}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">Use default posting rule</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={form.notesRequired} onChange={(e) => set('notesRequired', e.target.checked)} />
              Notes required
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={form.approvalRequired} onChange={(e) => set('approvalRequired', e.target.checked)} />
              Approval required
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 rounded-lg border border-slate-200">Cancel</button>
          <button disabled={saving} onClick={submit}
            className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-lg shadow-sm disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
