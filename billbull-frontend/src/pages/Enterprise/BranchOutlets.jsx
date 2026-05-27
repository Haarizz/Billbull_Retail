import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, Pencil, Trash2, Star, StarOff, Check, X, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    getBranches, createBranch, updateBranch, setDefaultBranch, deleteBranch,
    setHeadquartersBranch,
} from '../../api/branchApi';
import { getWarehouses } from '../../api/warehouseApi';
import { useBranch } from '../../context/BranchContext';
import PaginationFooter from '../../components/common/PaginationFooter';

const EMPTY_FORM = {
    name: '',
    code: '',
    type: 'BRANCH',
    isHeadquarters: false,
    address: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    phone: '',
    fax: '',
    email: '',
    trnNumber: '',
    logoUrl: '',
    sortOrder: 0,
    defaultWarehouseId: '',
};

const BRANCH_TYPES = [
    { value: 'HEADQUARTERS', label: 'Headquarters' },
    { value: 'BRANCH', label: 'Branch' },
    { value: 'OUTLET', label: 'Outlet' },
    { value: 'WAREHOUSE', label: 'Warehouse' },
];

const BranchOutlets = () => {
    const { refreshDefaultBranch } = useBranch();
    const [branches, setBranches] = useState([]);
    const LIST_PAGE_SIZE = 30;
    const [listPage, setListPage] = useState(0);
    const pagedBranches = branches.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const branchWarehouses = useMemo(() => {
        if (!editId) return [];
        return warehouses.filter(w => w.branchId === editId);
    }, [warehouses, editId]);

    const load = async () => {
        setLoading(true);
        try {
            const [br, wh] = await Promise.all([getBranches(), getWarehouses()]);
            setBranches(br);
            setWarehouses(wh);
        } catch {
            toast.error('Failed to load branches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openAdd = () => {
        setEditId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (b) => {
        setEditId(b.id);
        setForm({
            name: b.name || '',
            code: b.code || '',
            type: b.type || 'BRANCH',
            isHeadquarters: Boolean(b.isHeadquarters),
            address: b.address || '',
            addressLine2: b.addressLine2 || '',
            city: b.city || '',
            state: b.state || '',
            country: b.country || '',
            postalCode: b.postalCode || '',
            phone: b.phone || '',
            fax: b.fax || '',
            email: b.email || '',
            trnNumber: b.trnNumber || '',
            logoUrl: b.logoUrl || '',
            sortOrder: b.sortOrder ?? 0,
            defaultWarehouseId: b.defaultWarehouseId || '',
        });
        setShowForm(true);
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(EMPTY_FORM);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { toast.error('Branch name is required'); return; }

        if (form.isHeadquarters && !editId) {
            const existing = branches.find(b => b.isHeadquarters);
            if (existing && !window.confirm(
                `"${existing.name}" is currently the Headquarters. Replace it with this new branch?`
            )) return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                code: form.code.trim() || null,
                type: form.type || 'BRANCH',
                isHeadquarters: Boolean(form.isHeadquarters),
                address: form.address.trim() || null,
                addressLine2: form.addressLine2.trim() || null,
                city: form.city.trim() || null,
                state: form.state.trim() || null,
                country: form.country.trim() || null,
                postalCode: form.postalCode.trim() || null,
                phone: form.phone.trim() || null,
                fax: form.fax.trim() || null,
                email: form.email.trim() || null,
                trnNumber: form.trnNumber.trim() || null,
                logoUrl: form.logoUrl.trim() || null,
                sortOrder: Number(form.sortOrder) || 0,
                defaultWarehouseId: editId && form.defaultWarehouseId ? Number(form.defaultWarehouseId) : null,
            };
            if (editId) {
                await updateBranch(editId, payload);
                toast.success('Branch updated');
            } else {
                await createBranch(payload);
                toast.success('Branch created.');
            }
            cancelForm();
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save branch');
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (id) => {
        try {
            await setDefaultBranch(id);
            toast.success('Default branch updated');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to set default');
        }
    };

    const handleSetHeadquarters = async (id, name) => {
        const existing = branches.find(b => b.isHeadquarters && b.id !== id);
        if (existing && !window.confirm(
            `Replace "${existing.name}" with "${name}" as the company Headquarters? Reports with 'All Branches' will use the new HQ's address and branding.`
        )) return;
        try {
            await setHeadquartersBranch(id);
            toast.success('Headquarters updated');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to set headquarters');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this branch? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            await deleteBranch(id);
            toast.success('Branch deleted');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete branch');
        } finally {
            setDeletingId(null);
        }
    };

    const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400';

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 rounded-lg">
                            <Building2 className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900">Branch / Outlets</h1>
                            <p className="text-xs text-slate-500">Manage company branches, outlets and headquarters</p>
                        </div>
                    </div>
                    <button
                        onClick={openAdd}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-sm font-semibold rounded-lg transition-colors"
                    >
                        <Plus size={15} /> Add Branch
                    </button>
                </div>

                {/* Form */}
                {showForm && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-slate-800 mb-4">
                            {editId ? 'Edit Branch' : 'New Branch'}
                        </h2>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Branch Name <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        className={inputCls} placeholder="e.g. Dubai Main Branch" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch Code</label>
                                    <input type="text" value={form.code}
                                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                        className={inputCls} placeholder="e.g. BR-001" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                                    <select value={form.type}
                                        onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                                        className={`${inputCls} bg-white`}>
                                        {BRANCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>

                                <div className="col-span-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.isHeadquarters}
                                            onChange={e => setForm(f => ({ ...f, isHeadquarters: e.target.checked }))}
                                            className="h-4 w-4 text-yellow-500" />
                                        <Crown size={14} className="text-yellow-600" />
                                        <span className="text-sm font-medium text-slate-700">Mark as company Headquarters</span>
                                        <span className="text-xs text-slate-400">(only one branch can be HQ; used for 'All Branches' reports)</span>
                                    </label>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                                    <input type="text" value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                        className={inputCls} placeholder="+971 4 000 0000" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Fax</label>
                                    <input type="text" value={form.fax}
                                        onChange={e => setForm(f => ({ ...f, fax: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                                    <input type="email" value={form.email}
                                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                        className={inputCls} placeholder="branch@company.com" />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1</label>
                                    <input type="text" value={form.address}
                                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
                                    <input type="text" value={form.addressLine2}
                                        onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                                        className={inputCls} />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                                    <input type="text" value={form.city}
                                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">State / Emirate</label>
                                    <input type="text" value={form.state}
                                        onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                                    <input type="text" value={form.country}
                                        onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                                        className={inputCls} />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Postal Code</label>
                                    <input type="text" value={form.postalCode}
                                        onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">TRN Number</label>
                                    <input type="text" value={form.trnNumber}
                                        onChange={e => setForm(f => ({ ...f, trnNumber: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Sort Order</label>
                                    <input type="number" value={form.sortOrder}
                                        onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                                        className={inputCls} />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Logo URL</label>
                                    <input type="text" value={form.logoUrl}
                                        onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                                        className={inputCls} placeholder="/uploads/logos/branch-x.png" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Default Warehouse</label>
                                    <select
                                        value={form.defaultWarehouseId}
                                        onChange={e => setForm(f => ({ ...f, defaultWarehouseId: e.target.value }))}
                                        disabled={!editId || branchWarehouses.length === 0}
                                        className={`${inputCls} bg-white disabled:bg-slate-100 disabled:text-slate-400`}
                                    >
                                        <option value="">-- None --</option>
                                        {branchWarehouses.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                    {!editId && (
                                        <p className="mt-1 text-[11px] text-slate-400">
                                            Save the branch first, then assign a warehouse.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button type="submit" disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors">
                                    <Check size={14} /> {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={cancelForm}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                                    <X size={14} /> Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
                    ) : branches.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-sm">
                            No branches yet. Click <strong>Add Branch</strong> to create one.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Branch</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Default Warehouse</th>
                                    <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">HQ</th>
                                    <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Default</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {pagedBranches.map(b => (
                                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="font-medium text-slate-800">{b.name}</div>
                                            <div className="text-xs text-slate-400">{b.code || '—'}</div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 capitalize">
                                                {(b.type || 'BRANCH').toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-slate-500 text-xs">
                                            <div>{b.phone || '—'}</div>
                                            <div className="text-slate-400">{b.email || ''}</div>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600">
                                            {b.defaultWarehouseName
                                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{b.defaultWarehouseName}</span>
                                                : <span className="text-slate-400 text-xs">Not set</span>}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            {b.isHeadquarters ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                                                    <Crown size={10} /> HQ
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleSetHeadquarters(b.id, b.name)}
                                                    className="text-slate-400 hover:text-yellow-600 text-xs"
                                                    title="Promote to Headquarters"
                                                >
                                                    Make HQ
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            {b.isDefault ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                                                    <Star size={10} fill="currentColor" /> Default
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleSetDefault(b.id)}
                                                    className="text-slate-400 hover:text-yellow-500 transition-colors"
                                                    title="Set as default"
                                                >
                                                    <StarOff size={14} />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => openEdit(b)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Edit">
                                                    <Pencil size={13} />
                                                </button>
                                                {!b.isDefault && !b.isHeadquarters && (
                                                    <button onClick={() => handleDelete(b.id)}
                                                        disabled={deletingId === b.id}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                                        title="Delete">
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <PaginationFooter
                        page={listPage}
                        size={LIST_PAGE_SIZE}
                        totalElements={branches.length}
                        totalPages={Math.ceil(branches.length / LIST_PAGE_SIZE)}
                        onPageChange={setListPage}
                    />
                </div>
            </div>
        </div>
    );
};

export default BranchOutlets;
