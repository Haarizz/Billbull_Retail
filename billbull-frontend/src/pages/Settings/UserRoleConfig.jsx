import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Users, LayoutDashboard, ShoppingCart,
  Package, Truck, DollarSign, UserCog, Headphones,
  Eye, PlusCircle, Pencil, CheckCircle, Download,
  ChevronRight, AlertTriangle, RefreshCw, Check, X,
  Info, Settings2
} from 'lucide-react';
import { rolePermissionsApi } from '../../api/rolePermissionsApi';
import { usersApi } from '../../api/usersApi';
import { usePermissions } from '../../context/PermissionContext';

// ─── Module definitions ────────────────────────────────────────────────────
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
      { key: 'sales.quotation', label: 'Quotations' },
      { key: 'sales.order',     label: 'Sales Orders' },
      { key: 'sales.invoice',   label: 'Sales Invoices' },
      { key: 'sales.payment',   label: 'Customer Payments' },
      { key: 'sales.customer',  label: 'Customer Registry' },
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory & Registries',
    description: 'Products, warehouses, stock management',
    icon: Package,
    color: 'text-blue-500',
    resources: [
      { key: 'inventory.product',   label: 'Products' },
      { key: 'inventory.warehouse', label: 'Warehouses' },
      { key: 'inventory.stock',     label: 'Stock Levels / Transfers' },
      { key: 'inventory.category',  label: 'Categories & Brands' },
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
      { key: 'purchases.lpo',     label: 'Local Purchase Orders' },
      { key: 'purchases.grn',     label: 'GRN / Deliveries' },
      { key: 'purchases.invoice', label: 'Purchase Invoices' },
      { key: 'purchases.vendor',  label: 'Vendor Registry' },
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
      { key: 'finance.voucher',   label: 'Journal & Receipt Vouchers' },
      { key: 'finance.reconcile', label: 'Bank Reconciliation' },
      { key: 'finance.tax',       label: 'VAT & Tax Settings' },
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

// ─── Role visual config ───────────────────────────────────────────────────
const ROLE_META = {
  ADMIN:             { bg: 'bg-purple-50',  border: 'border-purple-200', dot: 'bg-purple-600', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  SALES:             { bg: 'bg-yellow-50',  border: 'border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' },
  HR:                { bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-600',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  ACCOUNTANT:        { bg: 'bg-green-50',   border: 'border-green-200',  dot: 'bg-green-600',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  INVENTORY_MANAGER: { bg: 'bg-orange-50',  border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
};

const DEFAULT_META = { bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600' };

const getRoleMeta = (name) => ROLE_META[name] || DEFAULT_META;

// ─── Toggle switch ─────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange, disabled, saving }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled || saving}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      ${checked ? 'bg-[#F5C742]' : 'bg-slate-200'}
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
  const [permMap, setPermMap]           = useState({});   // module → { id?, canView, canCreate, canEdit, canApprove, canExport }
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving]             = useState({});   // module → bool
  const [saveStatus, setSaveStatus]     = useState({});   // module → 'ok' | 'err'
  const [globalError, setGlobalError]   = useState(null);

  // New Role Modal state
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [newRole, setNewRole]           = useState({ name: '', description: '' });
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  // ── Load roles ──────────────────────────────────────────────────────────
  useEffect(() => {
    usersApi.getAllRoles()
      .then(r => {
        setRoles(r);
        if (r.length > 0) setSelectedRole(r[0]);
      })
      .catch(() => setGlobalError('Failed to load roles'))
      .finally(() => setLoadingRoles(false));
  }, []);

  // ── Load permissions for selected role ──────────────────────────────────
  useEffect(() => {
    if (!selectedRole) return;
    setLoadingPerms(true);
    setPermMap({});
    setGlobalError(null);

    rolePermissionsApi.getByRole(selectedRole.name)
      .then(rows => {
        const map = {};
        rows.forEach(rp => {
          map[rp.module] = {
            id:        rp.id,
            canView:   rp.canView,
            canCreate: rp.canCreate,
            canEdit:   rp.canEdit,
            canApprove:rp.canApprove,
            canExport: rp.canExport,
          };
        });
        setPermMap(map);
      })
      .catch(() => setGlobalError('Failed to load permissions for ' + selectedRole.name))
      .finally(() => setLoadingPerms(false));
  }, [selectedRole]);

  // ── Toggle a single flag ─────────────────────────────────────────────────
  const handleToggle = useCallback(async (key, flag) => {
    if (!selectedRole) return;

    const current  = permMap[key] || { canView:false, canCreate:false, canEdit:false, canApprove:false, canExport:false };
    const newValue = !current[flag];

    const next = { ...current, [flag]: newValue };
    
    // Inheritance logic
    // 1. If turning VIEW off -> also clear all vertical flags for THIS resource
    if (flag === 'canView' && !newValue) {
      next.canCreate  = false;
      next.canEdit    = false;
      next.canApprove = false;
      next.canExport  = false;
    }
    // 2. If turning any vertical ON -> ensure View is also ON
    if (flag !== 'canView' && newValue) {
      next.canView = true;
    }

    // Optimistic update for the clicked row
    setPermMap(prev => ({ ...prev, [key]: next }));
    setSaving(prev => ({ ...prev, [key]: true }));

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Hierarchical Cleanup: If turning off VIEW for a PARENT module, 
    //    we must also turn off EVERYTHING for all its sub-resources.
    // ─────────────────────────────────────────────────────────────────────────
    if (flag === 'canView' && !newValue) {
      const module = MODULES.find(m => m.key === key);
      if (module && module.resources) {
        module.resources.forEach(async (res) => {
           const resCurrent = permMap[res.key];
           if (resCurrent && resCurrent.id) {
              // We'll update the state optimistically for children too
              const resNext = { canView:false, canCreate:false, canEdit:false, canApprove:false, canExport:false };
              setPermMap(prev => ({ ...prev, [res.key]: resNext }));
              // Fire off updates for children (async background)
              rolePermissionsApi.update(resCurrent.id, resNext).catch(console.error);
           }
        });
      }
    }

    try {
      let result;
      if (current.id) {
        result = await rolePermissionsApi.update(current.id, {
          canView:   next.canView,
          canCreate: next.canCreate,
          canEdit:   next.canEdit,
          canApprove:next.canApprove,
          canExport: next.canExport,
        });
      } else {
        result = await rolePermissionsApi.create({
          roleName:  selectedRole.name,
          module:    key,
          canView:   next.canView,
          canCreate: next.canCreate,
          canEdit:   next.canEdit,
          canApprove:next.canApprove,
          canExport: next.canExport,
        });
      }
      setPermMap(prev => ({
        ...prev,
        [key]: {
          id:        result.id,
          canView:   result.canView,
          canCreate: result.canCreate,
          canEdit:   result.canEdit,
          canApprove:result.canApprove,
          canExport: result.canExport,
        }
      }));
      setSaveStatus(prev => ({ ...prev, [key]: 'ok' }));
      refreshPermissions();
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: null })), 1500);
    } catch (e) {
      setPermMap(prev => ({ ...prev, [key]: current }));
      setSaveStatus(prev => ({ ...prev, [key]: 'err' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: null })), 3000);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [selectedRole, permMap]);

  // ── Grant / revoke all for a module row ─────────────────────────────────
  const handleRowSelectAll = useCallback(async (key, grantAll) => {
    if (!selectedRole) return;
    
    const nextValues = {
      canView:   grantAll,
      canCreate: grantAll,
      canEdit:   grantAll,
      canApprove:grantAll,
      canExport: grantAll,
    };

    // 1. Update the clicked row
    const current = permMap[key] || {};
    setPermMap(prev => ({ ...prev, [key]: { ...current, ...nextValues } }));
    setSaving(prev => ({ ...prev, [key]: true }));

    // 2. Cascade to resources if this is a parent module
    const parentModule = MODULES.find(m => m.key === key);
    if (parentModule && parentModule.resources) {
      parentModule.resources.forEach(res => {
        const resCurrent = permMap[res.key] || {};
        setPermMap(prev => ({ ...prev, [res.key]: { ...resCurrent, ...nextValues } }));
        // API call for children
        if (resCurrent.id) {
          rolePermissionsApi.update(resCurrent.id, nextValues).catch(console.error);
        } else {
          rolePermissionsApi.create({ roleName: selectedRole.name, module: res.key, ...nextValues }).catch(console.error);
        }
      });
    }

    try {
      let result;
      if (current.id) {
        result = await rolePermissionsApi.update(current.id, nextValues);
      } else {
        result = await rolePermissionsApi.create({ roleName: selectedRole.name, module: key, ...nextValues });
      }
      setPermMap(prev => ({ ...prev, [key]: { id: result.id, ...nextValues } }));
      setSaveStatus(prev => ({ ...prev, [key]: 'ok' }));
      refreshPermissions();
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: null })), 1500);
    } catch {
      setPermMap(prev => ({ ...prev, [key]: current }));
      setSaveStatus(prev => ({ ...prev, [key]: 'err' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: null })), 3000);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [selectedRole, permMap]);

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
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="shrink-0" /> {globalError}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── Role selector panel ── */}
          <div className="w-full lg:w-56 shrink-0 space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles</p>
              <button
                onClick={() => setIsModalOpen(true)}
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
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-all flex items-center gap-3 group
                      ${active
                        ? `${meta.bg} ${meta.border} shadow-sm`
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? meta.dot : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold truncate ${active ? meta.text : 'text-slate-700'}`}>
                        {role.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {role.description || (role.name === 'ADMIN' ? 'Full system access' : 'Manage system resources')}
                      </div>
                    </div>
                    {active && <ChevronRight size={14} className={meta.text} />}
                  </button>
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
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                {/* Matrix header */}
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getRoleMeta(selectedRole.name).badge}`}>
                      {selectedRole.name}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Access Matrix</span>
                    {loadingPerms && (
                      <RefreshCw size={13} className="text-slate-400 animate-spin" />
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
                      Ensure at least one ADMIN user retains full access before making changes.
                    </span>
                  </div>
                )}

                {/* Column headers */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-5 py-3 font-semibold text-slate-500 w-[240px]">Module</th>

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
                        {[
                          { flag: 'canCreate',  label: 'Create',  icon: PlusCircle,   color: 'text-emerald-600' },
                          { flag: 'canEdit',    label: 'Edit',    icon: Pencil,        color: 'text-yellow-600' },
                          { flag: 'canApprove', label: 'Approve', icon: CheckCircle,   color: 'text-purple-600' },
                          { flag: 'canExport',  label: 'Export',  icon: Download,      color: 'text-slate-500'  },
                        ].map(col => (
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
                        const allOn     = viewOn && perm.canCreate && perm.canEdit && perm.canApprove && perm.canExport;
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
                              <td colSpan={4} className="px-3 py-3 text-[10px] text-slate-400 font-medium italic">
                                {viewOn ? 'Configure granular access below' : 'Module disabled'}
                              </td>

                              <td className="px-3 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {status === 'ok'  && <Check size={12} className="text-emerald-500" />}
                                  {status === 'err' && <X    size={12} className="text-red-500" />}
                                  {isRowSaving && <RefreshCw size={11} className="text-slate-400 animate-spin" />}
                                </div>
                              </td>
                            </tr>

                            {/* Resource Rows */}
                            {viewOn && mod.resources?.map(res => {
                              const rPerm = permMap[res.key] || {};
                              const rSaving = !!saving[res.key];
                              const rStatus = saveStatus[res.key];
                              const rAllOn = rPerm.canView && rPerm.canCreate && rPerm.canEdit && rPerm.canApprove && rPerm.canExport;

                              return (
                                <tr key={res.key} className="bg-white hover:bg-slate-50/50 transition-colors">
                                  <td className="px-5 py-2.5 pl-14">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                      <span className="text-xs font-medium text-slate-600">{res.label}</span>
                                    </div>
                                  </td>

                                  <td className="px-3 py-2.5 text-center">
                                    <Toggle
                                      checked={!!rPerm.canView}
                                      onChange={() => handleToggle(res.key, 'canView')}
                                      saving={rSaving}
                                    />
                                  </td>

                                  <td className="w-px bg-slate-50 p-0" />

                                  {['canCreate', 'canEdit', 'canApprove', 'canExport'].map(flag => (
                                    <td key={flag} className="px-3 py-2.5 text-center">
                                      <Toggle
                                        checked={!!rPerm[flag]}
                                        onChange={() => handleToggle(res.key, flag)}
                                        disabled={!rPerm.canView}
                                        saving={rSaving}
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
                  Changes are saved instantly. Users must <strong className="text-slate-500">log out and back in</strong> for permission changes to take effect in their session.
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
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Role Name</label>
                <input
                  type="text"
                  placeholder="e.g. REGIONAL_MANAGER"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] transition-all"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                />
                <p className="text-[10px] text-slate-400 ml-1">Use uppercase and underscores (e.g. HEAD_OFFICE)</p>
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
                onClick={async () => {
                  setIsCreatingRole(true);
                  try {
                    const created = await usersApi.createRole(newRole);
                    setRoles(prev => [...prev, created]);
                    setSelectedRole(created);
                    setIsModalOpen(false);
                    setNewRole({ name: '', description: '' });
                    refreshPermissions();
                  } catch (err) {
                    setGlobalError('Failed to create role. Name might already exist.');
                  } finally {
                    setIsCreatingRole(false);
                  }
                }}
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
    </div>
  );
};

export default UserRoleConfig;
