import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, LayoutDashboard, ShoppingCart,
  Package, Truck, DollarSign, UserCog, Headphones, Bell,
  Eye, PlusCircle, Pencil, Trash2, CheckCircle, Download,
  ChevronRight, AlertTriangle, RefreshCw, Check, X,
  Info, Settings2, Lock, KeyRound, RotateCcw, Copy
} from 'lucide-react';
import { rolePermissionsApi } from '../../api/rolePermissionsApi';
import { usersApi } from '../../api/usersApi';
import { usePermissions } from '../../context/PermissionContext';

// ─── Module definitions ────────────────────────────────────────────────────
// Keep in sync with backend security/ModuleCatalog.java
const MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'KPIs, quick stats, quick actions',
    icon: LayoutDashboard,
    color: 'text-slate-500',
    resources: [
      { key: 'dashboard.kpis', label: 'Main KPIs' },
      { key: 'dashboard.charts', label: 'Financial Charts' },
    ]
  },
  {
    key: 'sales',
    label: 'Customers & Sales',
    description: 'Quotations, orders, invoices, payments',
    icon: ShoppingCart,
    color: 'text-yellow-600',
    resources: [
      { key: 'sales.customer',  label: 'Customer Ledger & Registry' },
      { key: 'sales.quotation', label: 'Quotations' },
      { key: 'sales.order',     label: 'Sales Orders' },
      { key: 'sales.proforma',  label: 'Proforma Invoices' },
      { key: 'sales.invoice',   label: 'Sales Invoices' },
      { key: 'sales.delivery',  label: 'Delivery Notes' },
      { key: 'sales.return',    label: 'Sales Returns' },
      { key: 'sales.pos',       label: 'POS Sales' },
      { key: 'sales.payment',   label: 'Customer Payments' },
      { key: 'sales.templates', label: 'Print & Email Templates' },
      { key: 'sales.reports',   label: 'Sales Reports' },
      { key: 'sales.settings',  label: 'Configure & Customize' },
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory & Registries',
    description: 'Products, warehouses, stock management',
    icon: Package,
    color: 'text-blue-500',
    resources: [
      { key: 'inventory.category',  label: 'Departments & Brands' },
      { key: 'inventory.units',     label: 'Units' },
      { key: 'inventory.product',   label: 'Products / Services' },
      { key: 'inventory.warehouse', label: 'Warehouses & Storages' },
      { key: 'inventory.stock',     label: 'Stock Taking & Transfers' },
      { key: 'inventory.barcode',   label: 'Barcode Print & Design' },
      { key: 'inventory.reports',   label: 'Inventory Reports' },
      { key: 'batch_manual_select', label: 'Batch Manual Select' },
    ]
  },
  {
    key: 'purchases',
    label: 'Vendors & Purchases',
    description: 'LPOs, GRN, purchase invoices',
    icon: Truck,
    color: 'text-orange-500',
    resources: [
      { key: 'purchases.vendor',    label: 'Vendor Ledger & Registry' },
      { key: 'purchases.lpo',      label: 'LPOs & Approvals' },
      { key: 'purchases.grn',      label: 'GRN / Goods Receipt' },
      { key: 'purchases.invoice',  label: 'Purchase Invoices' },
      { key: 'purchases.payment',  label: 'Vendor Payments' },
      { key: 'purchases.templates',label: 'Print & Email Templates' },
      { key: 'purchases.reports',  label: 'Purchase Reports' },
    ]
  },
  {
    key: 'finance',
    label: 'Financials',
    description: 'Ledger, vouchers, reconciliation, tax',
    icon: DollarSign,
    color: 'text-green-600',
    resources: [
      { key: 'finance.ledger',    label: 'General Ledger' },
      { key: 'finance.voucher',   label: 'Journal / Receipt / Payment Vouchers' },
      { key: 'finance.expense',   label: 'Expenses' },
      { key: 'finance.reconcile', label: 'Bank Reconciliation' },
      { key: 'finance.tax',       label: 'VAT & Tax Dashboard' },
      { key: 'finance.reports',   label: 'Financial Reports' },
      { key: 'finance.config',    label: 'Chart of Accounts & Config' },
      { key: 'finance.templates', label: 'Print & Email Templates' },
    ]
  },
  {
    key: 'hr',
    label: 'Payroll & Employees',
    description: 'Staff records, salary, attendance',
    icon: Users,
    color: 'text-indigo-500',
    resources: [
      { key: 'hr.employee',   label: 'Employee Database' },
      { key: 'hr.payroll',    label: 'Payroll Processing' },
      { key: 'hr.attendance', label: 'Attendance & Leave' },
    ]
  },
  {
    key: 'customer',
    label: 'Customer Connect',
    description: 'Inquiries, follow-ups, messaging',
    icon: Headphones,
    color: 'text-pink-500',
    resources: [
      { key: 'customer.inquiry',  label: 'Inquiries' },
      { key: 'customer.followup', label: 'Follow-ups' },
      { key: 'customer.message',  label: 'Marketing Messages' },
    ]
  },
  {
    key: 'notification',
    label: 'Notifications',
    description: 'In-app notification centre',
    icon: Bell,
    color: 'text-rose-500',
    resources: []
  },
  {
    key: 'userManagement',
    label: 'User Management',
    description: 'System users, roles, company config',
    icon: UserCog,
    color: 'text-purple-600',
    resources: [
      { key: 'userManagement.user',  label: 'User Setup' },
      { key: 'userManagement.role',  label: 'Role Permissions' },
      { key: 'userManagement.setup', label: 'Company Profile' },
    ]
  },
];

// Workflow override permissions (financial flow §21A maker-checker controls).
// Rendered as single grant/revoke switches — the backend checks specific flags,
// so a grant sets every flag on the row and a revoke clears them all.
const SPECIAL_PERMISSIONS = [
  { key: 'permissions.journal.create',              label: 'Create Manual Journal Vouchers',    description: 'Draft manual JVs in the general ledger' },
  { key: 'permissions.journal.approve',             label: 'Approve Journal Vouchers',          description: 'Approve JVs up to the high-value threshold' },
  { key: 'permissions.journal.approve-high-value',  label: 'Approve High-Value JVs',            description: 'Second-approver sign-off above the AED threshold' },
  { key: 'permissions.posting.backdate-into-locked', label: 'Post Into Locked Periods',         description: 'Backdate postings into a closed accounting period' },
  { key: 'permissions.sales.override-credit-limit', label: 'Override Credit Limit',             description: 'Complete sales that exceed a customer credit limit' },
  { key: 'permissions.vendor.advance',              label: 'Manage Vendor Advances',            description: 'Record and apply vendor advance payments' },
  { key: 'permissions.customer.advance.refund',     label: 'Refund Customer Advances',          description: 'Refund unapplied customer advance balances' },
];

// Vertical action columns (order matters — mirrors the matrix header)
const VERTICALS = [
  { flag: 'canCreate',  label: 'Create',  icon: PlusCircle,  color: 'text-emerald-600' },
  { flag: 'canEdit',    label: 'Edit',    icon: Pencil,      color: 'text-yellow-600' },
  { flag: 'canDelete',  label: 'Delete',  icon: Trash2,      color: 'text-red-500' },
  { flag: 'canApprove', label: 'Approve', icon: CheckCircle, color: 'text-purple-600' },
  { flag: 'canExport',  label: 'Export',  icon: Download,    color: 'text-slate-500' },
];

const ALL_FLAGS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove', 'canExport'];

const EMPTY_PERM = { canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };

// Must match RoleService.SYSTEM_ROLES on the backend
const SYSTEM_ROLES = new Set([
  'ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'SUPERVISOR', 'SALES',
  'INVENTORY_MANAGER', 'ACCOUNTANT', 'HR', 'DELIVERY_PERSON',
]);

const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;

// ─── Role visual config ───────────────────────────────────────────────────
const ROLE_META = {
  ADMIN:             { bg: 'bg-purple-50',  border: 'border-purple-200', dot: 'bg-purple-600', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  SALES:             { bg: 'bg-yellow-50',  border: 'border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' },
  HR:                { bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-600',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  ACCOUNTANT:        { bg: 'bg-green-50',   border: 'border-green-200',  dot: 'bg-green-600',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  INVENTORY_MANAGER: { bg: 'bg-orange-50',  border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  DELIVERY_PERSON:   { bg: 'bg-cyan-50',    border: 'border-cyan-200',   dot: 'bg-cyan-600',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700' },
};

const DEFAULT_META = { bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600' };

const getRoleMeta = (name) => ROLE_META[name] || DEFAULT_META;

const flagsPayload = (p) => ({
  canView:    !!p.canView,
  canCreate:  !!p.canCreate,
  canEdit:    !!p.canEdit,
  canDelete:  !!p.canDelete,
  canApprove: !!p.canApprove,
  canExport:  !!p.canExport,
});

const rowFromDto = (dto) => ({
  id:         dto.id,
  canView:    dto.canView,
  canCreate:  dto.canCreate,
  canEdit:    dto.canEdit,
  canDelete:  dto.canDelete,
  canApprove: dto.canApprove,
  canExport:  dto.canExport,
});

const apiError = (err, fallback) =>
  err?.response?.data?.message || fallback;

// ─── Toggle switch ─────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange, disabled, saving, inherited }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled || saving}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      ${checked ? (inherited ? 'bg-[#F5C742]/50' : 'bg-[#F5C742]') : 'bg-slate-200'}
      ${saving ? 'opacity-60' : ''}`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
    />
  </button>
);

// ─── Main component ────────────────────────────────────────────────────────
const UserRoleConfig = () => {
  const { refreshPermissions } = usePermissions();
  const [roles, setRoles]               = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [userCounts, setUserCounts]     = useState({});   // roleName → active user count
  const [permMap, setPermMap]           = useState({});   // module → { id?, canView, ..., canExport }
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving]             = useState({});   // module → bool
  const [saveStatus, setSaveStatus]     = useState({});   // module → 'ok' | 'err'
  const [globalError, setGlobalError]   = useState(null);

  // New Role Modal state
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [newRole, setNewRole]           = useState({ name: '', description: '', copyFrom: '' });
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [modalError, setModalError]     = useState(null);

  // Edit description modal
  const [editRole, setEditRole]         = useState(null); // { id, name, description }
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Delete role confirm
  const [deleteTarget, setDeleteTarget] = useState(null); // role object
  const [isDeletingRole, setIsDeletingRole] = useState(false);

  // ── Load roles + user counts ────────────────────────────────────────────
  const loadRoles = useCallback(() => {
    setLoadingRoles(true);
    usersApi.getAllRoles()
      .then(r => {
        setRoles(r);
        setSelectedRole(prev => {
          if (prev) {
            const still = r.find(x => x.id === prev.id);
            if (still) return still;
          }
          return r.length > 0 ? r[0] : null;
        });
      })
      .catch(err => setGlobalError(apiError(err, 'Failed to load roles')))
      .finally(() => setLoadingRoles(false));

    // Best-effort: user counts per role for the sidebar badges
    usersApi.getAll()
      .then(users => {
        const counts = {};
        users.forEach(u => {
          if (u.active === false) return;
          (u.roles || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
        });
        setUserCounts(counts);
      })
      .catch(() => setUserCounts({}));
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  // ── Load permissions for selected role ──────────────────────────────────
  const loadPerms = useCallback((role) => {
    if (!role) return;
    setLoadingPerms(true);
    setPermMap({});
    setGlobalError(null);

    rolePermissionsApi.getByRole(role.name)
      .then(rows => {
        const map = {};
        rows.forEach(rp => { map[rp.module] = rowFromDto(rp); });
        setPermMap(map);
      })
      .catch(err => setGlobalError(apiError(err, 'Failed to load permissions for ' + role.name)))
      .finally(() => setLoadingPerms(false));
  }, []);

  useEffect(() => { loadPerms(selectedRole); }, [selectedRole, loadPerms]);

  const flashStatus = useCallback((key, status, ms) => {
    setSaveStatus(prev => ({ ...prev, [key]: status }));
    setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: null })), ms);
  }, []);

  /**
   * Effective permissions for a sub-resource: an explicit row is authoritative;
   * otherwise the parent module's values are inherited (mirrors the backend).
   */
  const effectiveFor = useCallback((resKey, parentKey) => {
    const own = permMap[resKey];
    if (own?.id != null) return { ...own, inherited: false };
    const parent = permMap[parentKey] || EMPTY_PERM;
    return { ...EMPTY_PERM, ...flagsPayload(parent), inherited: true };
  }, [permMap]);

  // ── Toggle a single flag ─────────────────────────────────────────────────
  const handleToggle = useCallback(async (key, flag, parentKey = null) => {
    if (!selectedRole) return;

    const own = permMap[key];
    const isExplicit = own?.id != null;
    // Toggling an inherited sub-resource materialises an explicit row seeded
    // from the currently-effective (parent) values.
    const base = isExplicit
      ? own
      : (parentKey ? flagsPayload(permMap[parentKey] || EMPTY_PERM) : { ...EMPTY_PERM, ...(own || {}) });

    const next = { ...base, [flag]: !base[flag] };

    // Inheritance logic within the row:
    // 1. Turning VIEW off clears every vertical flag for this row
    if (flag === 'canView' && !next.canView) {
      next.canCreate = next.canEdit = next.canDelete = next.canApprove = next.canExport = false;
    }
    // 2. Turning any vertical ON forces View on
    if (flag !== 'canView' && next[flag]) {
      next.canView = true;
    }

    setPermMap(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...next } }));
    setSaving(prev => ({ ...prev, [key]: true }));

    try {
      let result;
      if (isExplicit) {
        result = await rolePermissionsApi.update(own.id, flagsPayload(next));
      } else {
        result = await rolePermissionsApi.create({
          roleName: selectedRole.name,
          module:   key,
          ...flagsPayload(next),
        });
      }
      setPermMap(prev => ({ ...prev, [key]: rowFromDto(result) }));

      // Turning a PARENT module's view off resets its explicit sub-resource rows
      // to "inherit" (delete), so re-enabling the module later restores access
      // cleanly instead of leaving stale explicit denials behind.
      if (flag === 'canView' && !next.canView && !parentKey) {
        const module = MODULES.find(m => m.key === key);
        const explicitChildren = (module?.resources || []).filter(res => permMap[res.key]?.id != null);
        if (explicitChildren.length > 0) {
          const results = await Promise.allSettled(
            explicitChildren.map(res => rolePermissionsApi.remove(permMap[res.key].id))
          );
          setPermMap(prev => {
            const nextMap = { ...prev };
            results.forEach((r, i) => {
              if (r.status === 'fulfilled') delete nextMap[explicitChildren[i].key];
            });
            return nextMap;
          });
          if (results.some(r => r.status === 'rejected')) {
            flashStatus(key, 'err', 3000);
            return;
          }
        }
      }

      flashStatus(key, 'ok', 1500);
      refreshPermissions();
    } catch (err) {
      setPermMap(prev => {
        const nextMap = { ...prev };
        if (isExplicit) nextMap[key] = own; else delete nextMap[key];
        return nextMap;
      });
      setGlobalError(apiError(err, null));
      flashStatus(key, 'err', 3000);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [selectedRole, permMap, refreshPermissions, flashStatus]);

  // ── Grant / revoke all for a row (cascades to explicit children of a parent) ──
  const handleRowSelectAll = useCallback(async (key, grantAll, isParent = false) => {
    if (!selectedRole) return;

    const nextValues = {
      canView:   grantAll,
      canCreate: grantAll,
      canEdit:   grantAll,
      canDelete: grantAll,
      canApprove:grantAll,
      canExport: grantAll,
    };

    const rows = [{ module: key, ...nextValues }];
    if (isParent) {
      const module = MODULES.find(m => m.key === key);
      (module?.resources || [])
        .filter(res => permMap[res.key]?.id != null)  // only explicit rows; others inherit
        .forEach(res => rows.push({ module: res.key, ...nextValues }));
    }

    const previous = permMap;
    setPermMap(prev => {
      const nextMap = { ...prev };
      rows.forEach(r => { nextMap[r.module] = { ...(prev[r.module] || {}), ...nextValues }; });
      return nextMap;
    });
    setSaving(prev => ({ ...prev, [key]: true }));

    try {
      const result = await rolePermissionsApi.bulkSave(selectedRole.name, rows);
      setPermMap(prev => {
        const nextMap = { ...prev };
        result.forEach(dto => { nextMap[dto.module] = rowFromDto(dto); });
        return nextMap;
      });
      flashStatus(key, 'ok', 1500);
      refreshPermissions();
    } catch (err) {
      setPermMap(previous);
      setGlobalError(apiError(err, null));
      flashStatus(key, 'err', 3000);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [selectedRole, permMap, refreshPermissions, flashStatus]);

  // ── Reset a sub-resource to inherit from its parent ─────────────────────
  const handleResetInherit = useCallback(async (resKey) => {
    const own = permMap[resKey];
    if (!own?.id) return;
    setSaving(prev => ({ ...prev, [resKey]: true }));
    try {
      await rolePermissionsApi.remove(own.id);
      setPermMap(prev => {
        const nextMap = { ...prev };
        delete nextMap[resKey];
        return nextMap;
      });
      flashStatus(resKey, 'ok', 1500);
      refreshPermissions();
    } catch (err) {
      setGlobalError(apiError(err, null));
      flashStatus(resKey, 'err', 3000);
    } finally {
      setSaving(prev => ({ ...prev, [resKey]: false }));
    }
  }, [permMap, refreshPermissions, flashStatus]);

  // ── Special (workflow override) permission: single grant switch ─────────
  const handleSpecialToggle = useCallback(async (key) => {
    if (!selectedRole) return;
    const own = permMap[key];
    const granted = !!own?.canView;
    const value = !granted;
    const nextValues = {
      canView: value, canCreate: value, canEdit: value,
      canDelete: value, canApprove: value, canExport: value,
    };

    setPermMap(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...nextValues } }));
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const result = own?.id
        ? await rolePermissionsApi.update(own.id, nextValues)
        : await rolePermissionsApi.create({ roleName: selectedRole.name, module: key, ...nextValues });
      setPermMap(prev => ({ ...prev, [key]: rowFromDto(result) }));
      flashStatus(key, 'ok', 1500);
      refreshPermissions();
    } catch (err) {
      setPermMap(prev => {
        const nextMap = { ...prev };
        if (own) nextMap[key] = own; else delete nextMap[key];
        return nextMap;
      });
      setGlobalError(apiError(err, null));
      flashStatus(key, 'err', 3000);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [selectedRole, permMap, refreshPermissions, flashStatus]);

  // ── Role CRUD ───────────────────────────────────────────────────────────
  const handleCreateRole = useCallback(async () => {
    if (!ROLE_NAME_PATTERN.test(newRole.name)) {
      setModalError('Role name must start with a letter and use only A–Z, 0–9 and _ (2–50 chars).');
      return;
    }
    setIsCreatingRole(true);
    setModalError(null);
    try {
      const created = await usersApi.createRole({ name: newRole.name, description: newRole.description });
      if (newRole.copyFrom) {
        await rolePermissionsApi.copy(newRole.copyFrom, created.name);
      }
      setRoles(prev => [...prev, created]);
      setSelectedRole(created);
      setIsModalOpen(false);
      setNewRole({ name: '', description: '', copyFrom: '' });
      refreshPermissions();
    } catch (err) {
      setModalError(apiError(err, 'Failed to create role. The name might already exist.'));
    } finally {
      setIsCreatingRole(false);
    }
  }, [newRole, refreshPermissions]);

  const handleSaveDescription = useCallback(async () => {
    if (!editRole) return;
    setIsSavingRole(true);
    try {
      const updated = await usersApi.updateRole(editRole.id, editRole.description);
      setRoles(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      setSelectedRole(prev => (prev?.id === updated.id ? updated : prev));
      setEditRole(null);
    } catch (err) {
      setGlobalError(apiError(err, 'Failed to update role description'));
      setEditRole(null);
    } finally {
      setIsSavingRole(false);
    }
  }, [editRole]);

  const handleDeleteRole = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeletingRole(true);
    try {
      await usersApi.deleteRole(deleteTarget.id);
      setRoles(prev => prev.filter(r => r.id !== deleteTarget.id));
      setSelectedRole(prev => {
        if (prev?.id !== deleteTarget.id) return prev;
        const remaining = roles.filter(r => r.id !== deleteTarget.id);
        return remaining.length > 0 ? remaining[0] : null;
      });
      setDeleteTarget(null);
    } catch (err) {
      setGlobalError(apiError(err, 'Failed to delete role'));
      setDeleteTarget(null);
    } finally {
      setIsDeletingRole(false);
    }
  }, [deleteTarget, roles]);

  const isAdminRole = selectedRole?.name === 'ADMIN';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-[#F7F7FA] font-sans">
      <div className="flex-1 p-4 md:p-6 space-y-6">

        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">Settings &rarr; User & Role Configuration</div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Settings2 className="text-[#F5C742]" size={26} />
              User & Role Configuration
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Configure horizontal (module visibility) and vertical (action-level) access for each role.
            </p>
          </div>
        </div>

        {globalError && (
          <div className="flex items-center justify-between gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {globalError}
            </div>
            <button onClick={() => setGlobalError(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── Role selector panel ── */}
          <div className="w-full lg:w-60 shrink-0 space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles</p>
              <button
                onClick={() => { setModalError(null); setIsModalOpen(true); }}
                className="text-[10px] bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 font-bold px-2 py-1 rounded shadow-sm transition-colors flex items-center gap-1"
              >
                <PlusCircle size={10} /> Add Role
              </button>
            </div>

            {loadingRoles ? (
              <div className="text-xs text-slate-400 px-2">Loading roles…</div>
            ) : (
              roles.map(role => {
                const meta    = getRoleMeta(role.name);
                const active  = selectedRole?.id === role.id;
                const isSystem = SYSTEM_ROLES.has(role.name);
                const count   = userCounts[role.name];
                return (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedRole(role); }}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-all flex items-center gap-3 group cursor-pointer
                      ${active
                        ? `${meta.bg} ${meta.border} shadow-sm`
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? meta.dot : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold truncate flex items-center gap-1.5 ${active ? meta.text : 'text-slate-700'}`}>
                        {role.name}
                        {isSystem && <Lock size={9} className="text-slate-400 shrink-0" title="System role — cannot be deleted" />}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {role.description || (role.name === 'ADMIN' ? 'Full system access' : 'Manage system resources')}
                      </div>
                    </div>
                    {count != null && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        {count} {count === 1 ? 'user' : 'users'}
                      </span>
                    )}
                    {active && <ChevronRight size={14} className={`${meta.text} shrink-0`} />}
                  </div>
                );
              })
            )}
          </div>

          {/* ── Permission matrix ── */}
          <div className="flex-1 min-w-0">

            {!selectedRole ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                Select a role to configure permissions
              </div>
            ) : (
              <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                {/* Matrix header */}
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getRoleMeta(selectedRole.name).badge}`}>
                      {selectedRole.name}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Access Matrix</span>
                    {loadingPerms && (
                      <RefreshCw size={13} className="text-slate-400 animate-spin" />
                    )}
                    <button
                      onClick={() => setEditRole({ id: selectedRole.id, name: selectedRole.name, description: selectedRole.description || '' })}
                      className="text-slate-300 hover:text-slate-500 transition-colors"
                      title="Edit role description"
                    >
                      <Pencil size={12} />
                    </button>
                    {!SYSTEM_ROLES.has(selectedRole.name) && (
                      <button
                        onClick={() => setDeleteTarget(selectedRole)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Delete this role"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded bg-blue-200 inline-block" />
                      <span>Horizontal — module visibility</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded bg-[#F5C742] inline-block" />
                      <span>Vertical — actions inside module</span>
                    </div>
                  </div>
                </div>

                {isAdminRole && (
                  <div className="mx-5 mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>ADMIN role</strong> — editing permissions here may restrict admin access.
                      User Management visibility is protected and cannot be switched off for ADMIN.
                    </span>
                  </div>
                )}

                {/* Column headers */}
                <div className="overflow-x-auto">
                  <table className="bb-nowrap-table w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-5 py-3 font-semibold text-slate-500 w-60">Module</th>

                        {/* Horizontal column */}
                        <th className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="flex items-center gap-1 text-blue-600 font-semibold">
                              <Eye size={11} /> View
                            </span>
                            <span className="text-[9px] text-slate-400 font-normal">Horizontal</span>
                          </div>
                        </th>

                        {/* Separator */}
                        <th className="w-px bg-slate-200 p-0" />

                        {/* Vertical columns */}
                        {VERTICALS.map(col => (
                          <th key={col.flag} className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`flex items-center gap-1 font-semibold ${col.color}`}>
                                <col.icon size={11} /> {col.label}
                              </span>
                              <span className="text-[9px] text-slate-400 font-normal">Vertical</span>
                            </div>
                          </th>
                        ))}

                        <th className="px-3 py-3 text-center text-slate-400 font-normal text-[10px]">All</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-50">
                      {MODULES.map(mod => {
                        const perm      = permMap[mod.key] || {};
                        const viewOn    = !!perm.canView;
                        const isRowSaving = !!saving[mod.key];
                        const status    = saveStatus[mod.key];
                        const ModIcon   = mod.icon;

                        return (
                          <React.Fragment key={mod.key}>
                            {/* Module Header Row */}
                            <tr className={`transition-colors border-l-2 ${viewOn ? 'bg-slate-50/80 border-blue-500' : 'bg-slate-50/40 border-transparent'}`}>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm
                                    ${viewOn ? 'bg-white' : 'bg-slate-100 opacity-50'}`}>
                                    <ModIcon size={16} className={viewOn ? mod.color : 'text-slate-400'} />
                                  </div>
                                  <div>
                                    <div className={`font-bold text-sm ${viewOn ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {mod.label}
                                    </div>
                                    <div className="text-[10px] text-slate-400">{mod.description}</div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3 text-center">
                                <Toggle
                                  checked={viewOn}
                                  onChange={() => handleToggle(mod.key, 'canView')}
                                  saving={isRowSaving}
                                />
                              </td>

                              <td className="w-px bg-slate-100 p-0" />

                              {mod.resources.length > 0 ? (
                                <td colSpan={5} className="px-3 py-3 text-[10px] text-slate-400 font-medium italic">
                                  {viewOn ? 'Configure granular access below' : 'Module disabled'}
                                </td>
                              ) : (
                                VERTICALS.map(col => (
                                  <td key={col.flag} className="px-3 py-3 text-center">
                                    <Toggle
                                      checked={!!perm[col.flag]}
                                      onChange={() => handleToggle(mod.key, col.flag)}
                                      disabled={!viewOn}
                                      saving={isRowSaving}
                                    />
                                  </td>
                                ))
                              )}

                              <td className="px-3 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {status === 'ok'  && <Check size={12} className="text-emerald-500" />}
                                  {status === 'err' && <X    size={12} className="text-red-500" />}
                                  {!status && !isRowSaving && (
                                    <button
                                      onClick={() => handleRowSelectAll(mod.key, !(viewOn && ALL_FLAGS.every(f => perm[f])), true)}
                                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors font-medium
                                        ${viewOn && ALL_FLAGS.every(f => perm[f]) ? 'border-red-200 text-red-500' : 'border-slate-200 text-slate-400'}`}
                                    >
                                      {viewOn && ALL_FLAGS.every(f => perm[f]) ? 'None' : 'All'}
                                    </button>
                                  )}
                                  {isRowSaving && <RefreshCw size={11} className="text-slate-400 animate-spin" />}
                                </div>
                              </td>
                            </tr>

                            {/* Resource Rows */}
                            {viewOn && mod.resources.map(res => {
                              const eff = effectiveFor(res.key, mod.key);
                              const rSaving = !!saving[res.key];
                              const rStatus = saveStatus[res.key];
                              const rAllOn = ALL_FLAGS.every(f => eff[f]);

                              return (
                                <tr key={res.key} className="bg-white hover:bg-slate-50/50 transition-colors">
                                  <td className="px-5 py-2.5 pl-14">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-1.5 h-1.5 rounded-full ${eff.inherited ? 'bg-slate-200' : 'bg-[#F5C742]'}`} />
                                      <span className="text-xs font-medium text-slate-600">{res.label}</span>
                                      {eff.inherited ? (
                                        <span className="text-[8px] uppercase tracking-wide font-bold text-slate-300" title="No explicit rule — follows the module's permissions">
                                          inherits
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleResetInherit(res.key)}
                                          className="text-slate-300 hover:text-amber-500 transition-colors"
                                          title="Remove explicit rule — revert to inheriting from the module"
                                        >
                                          <RotateCcw size={10} />
                                        </button>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-3 py-2.5 text-center">
                                    <Toggle
                                      checked={!!eff.canView}
                                      onChange={() => handleToggle(res.key, 'canView', mod.key)}
                                      saving={rSaving}
                                      inherited={eff.inherited}
                                    />
                                  </td>

                                  <td className="w-px bg-slate-50 p-0" />

                                  {VERTICALS.map(col => (
                                    <td key={col.flag} className="px-3 py-2.5 text-center">
                                      <Toggle
                                        checked={!!eff[col.flag]}
                                        onChange={() => handleToggle(res.key, col.flag, mod.key)}
                                        disabled={!eff.canView}
                                        saving={rSaving}
                                        inherited={eff.inherited}
                                      />
                                    </td>
                                  ))}

                                  <td className="px-3 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      {rStatus === 'ok'  && <Check size={12} className="text-emerald-500" />}
                                      {rStatus === 'err' && <X    size={12} className="text-red-500" />}
                                      {!rStatus && !rSaving && (
                                        <button
                                          onClick={() => handleRowSelectAll(res.key, !rAllOn)}
                                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors font-medium
                                            ${rAllOn ? 'border-red-200 text-red-500' : 'border-slate-200 text-slate-400'}`}
                                        >
                                          {rAllOn ? 'None' : 'All'}
                                        </button>
                                      )}
                                      {rSaving && <RefreshCw size={11} className="text-slate-400 animate-spin" />}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer note */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2 text-[11px] text-slate-400">
                  <Info size={12} className="shrink-0" />
                  Changes are saved instantly and enforced by the server on every request. Open sessions pick
                  them up automatically within a few minutes, or immediately after logging out and back in.
                </div>
              </div>

              {/* ── Special workflow permissions ── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                  <KeyRound size={15} className="text-[#F5C742]" />
                  <span className="text-sm font-semibold text-slate-700">Workflow Overrides</span>
                  <span className="text-[10px] text-slate-400">
                    High-privilege actions gated individually (maker-checker &amp; policy overrides)
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {SPECIAL_PERMISSIONS.map(sp => {
                    const granted = !!permMap[sp.key]?.canView;
                    const sSaving = !!saving[sp.key];
                    const sStatus = saveStatus[sp.key];
                    return (
                      <div key={sp.key} className="px-5 py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-semibold ${granted ? 'text-slate-700' : 'text-slate-400'}`}>{sp.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{sp.description}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {sStatus === 'ok'  && <Check size={12} className="text-emerald-500" />}
                          {sStatus === 'err' && <X    size={12} className="text-red-500" />}
                          <Toggle
                            checked={granted}
                            onChange={() => handleSpecialToggle(sp.key)}
                            saving={sSaving}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Add Role Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <PlusCircle size={18} className="text-[#F5C742]" />
                Add New System Role
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" /> {modalError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Role Name</label>
                <input
                  type="text"
                  placeholder="e.g. REGIONAL_MANAGER"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] transition-all"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                />
                <p className="text-[10px] text-slate-400 ml-1">Use uppercase letters, digits and underscores (2–50 chars, e.g. HEAD_OFFICE)</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Description</label>
                <textarea
                  placeholder="Description of role responsibilities..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] transition-all resize-none"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5 flex items-center gap-1.5">
                  <Copy size={11} /> Copy Permissions From
                </label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] transition-all"
                  value={newRole.copyFrom}
                  onChange={(e) => setNewRole({ ...newRole, copyFrom: e.target.value })}
                >
                  <option value="">Start blank (no access)</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 ml-1">Optionally start the new role with an existing role's permission set.</p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                disabled={isCreatingRole}
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isCreatingRole || !newRole.name}
                onClick={handleCreateRole}
                className={`px-5 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2
                  ${isCreatingRole || !newRole.name
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 active:scale-95'}`}
              >
                {isCreatingRole ? (
                  <> <RefreshCw size={14} className="animate-spin" /> Creating... </>
                ) : (
                  <> <Check size={14} /> Create Role </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Description Modal ── */}
      {editRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Pencil size={16} className="text-[#F5C742]" />
                Edit Role — {editRole.name}
              </h2>
              <button onClick={() => setEditRole(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Description</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] transition-all resize-none"
                value={editRole.description}
                onChange={(e) => setEditRole({ ...editRole, description: e.target.value })}
              />
              <p className="text-[10px] text-slate-400 ml-1">The role name is permanent — permissions and user assignments reference it.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                disabled={isSavingRole}
                onClick={() => setEditRole(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isSavingRole}
                onClick={handleSaveDescription}
                className="px-5 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 bg-[#F5C742] hover:bg-[#e5b732] text-slate-800 active:scale-95"
              >
                {isSavingRole ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Role Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-3">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={22} />
              </div>
              <h2 className="text-base font-bold text-slate-800 text-center">Delete role {deleteTarget.name}?</h2>
              <p className="text-xs text-slate-500 text-center">
                All of its permission rows will be removed. This only succeeds when no active
                users are still assigned to the role.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-3">
              <button
                disabled={isDeletingRole}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingRole}
                onClick={handleDeleteRole}
                className="px-5 py-2 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white active:scale-95"
              >
                {isDeletingRole ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserRoleConfig;
