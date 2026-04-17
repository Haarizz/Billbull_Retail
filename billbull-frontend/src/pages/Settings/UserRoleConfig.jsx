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

// ─── Module definitions ────────────────────────────────────────────────────
const MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'KPIs, quick stats, quick actions',
    icon: LayoutDashboard,
    color: 'text-slate-500',
  },
  {
    key: 'sales',
    label: 'Customers & Sales',
    description: 'Quotations, orders, invoices, payments',
    icon: ShoppingCart,
    color: 'text-yellow-600',
  },
  {
    key: 'inventory',
    label: 'Inventory & Registries',
    description: 'Products, warehouses, stock management',
    icon: Package,
    color: 'text-blue-500',
  },
  {
    key: 'purchases',
    label: 'Vendors & Purchases',
    description: 'LPOs, GRN, purchase invoices',
    icon: Truck,
    color: 'text-orange-500',
  },
  {
    key: 'finance',
    label: 'Financials',
    description: 'Ledger, vouchers, reconciliation, tax',
    icon: DollarSign,
    color: 'text-green-600',
  },
  {
    key: 'hr',
    label: 'Payroll & Employees',
    description: 'Staff records, salary, attendance',
    icon: Users,
    color: 'text-indigo-500',
  },
  {
    key: 'customer',
    label: 'Customer Connect',
    description: 'Inquiries, follow-ups, messaging',
    icon: Headphones,
    color: 'text-pink-500',
  },
  {
    key: 'userManagement',
    label: 'User Management',
    description: 'System users, roles, company config',
    icon: UserCog,
    color: 'text-purple-600',
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
  const [roles, setRoles]               = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [permMap, setPermMap]           = useState({});   // module → { id?, canView, canCreate, canEdit, canApprove, canExport }
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving]             = useState({});   // module → bool
  const [saveStatus, setSaveStatus]     = useState({});   // module → 'ok' | 'err'
  const [globalError, setGlobalError]   = useState(null);

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
  const handleToggle = useCallback(async (moduleKey, flag) => {
    if (!selectedRole) return;

    const current  = permMap[moduleKey] || { canView:false, canCreate:false, canEdit:false, canApprove:false, canExport:false };
    const newValue = !current[flag];

    // If turning VIEW off → also clear all vertical flags
    const next = { ...current, [flag]: newValue };
    if (flag === 'canView' && !newValue) {
      next.canCreate  = false;
      next.canEdit    = false;
      next.canApprove = false;
      next.canExport  = false;
    }
    // If turning any vertical ON → ensure View is also on
    if (flag !== 'canView' && newValue) {
      next.canView = true;
    }

    // Optimistic update
    setPermMap(prev => ({ ...prev, [moduleKey]: next }));
    setSaving(prev => ({ ...prev, [moduleKey]: true }));
    setSaveStatus(prev => ({ ...prev, [moduleKey]: null }));

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
          module:    moduleKey,
          canView:   next.canView,
          canCreate: next.canCreate,
          canEdit:   next.canEdit,
          canApprove:next.canApprove,
          canExport: next.canExport,
        });
      }
      setPermMap(prev => ({
        ...prev,
        [moduleKey]: {
          id:        result.id,
          canView:   result.canView,
          canCreate: result.canCreate,
          canEdit:   result.canEdit,
          canApprove:result.canApprove,
          canExport: result.canExport,
        }
      }));
      setSaveStatus(prev => ({ ...prev, [moduleKey]: 'ok' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [moduleKey]: null })), 1500);
    } catch (e) {
      // Revert on error
      setPermMap(prev => ({ ...prev, [moduleKey]: current }));
      setSaveStatus(prev => ({ ...prev, [moduleKey]: 'err' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [moduleKey]: null })), 3000);
    } finally {
      setSaving(prev => ({ ...prev, [moduleKey]: false }));
    }
  }, [selectedRole, permMap]);

  // ── Grant / revoke all for a module row ─────────────────────────────────
  const handleRowSelectAll = useCallback(async (moduleKey, grantAll) => {
    if (!selectedRole) return;
    const current = permMap[moduleKey] || {};
    const next = {
      canView:   grantAll,
      canCreate: grantAll,
      canEdit:   grantAll,
      canApprove:grantAll,
      canExport: grantAll,
    };
    setPermMap(prev => ({ ...prev, [moduleKey]: { ...current, ...next } }));
    setSaving(prev => ({ ...prev, [moduleKey]: true }));
    try {
      let result;
      if (current.id) {
        result = await rolePermissionsApi.update(current.id, next);
      } else {
        result = await rolePermissionsApi.create({ roleName: selectedRole.name, module: moduleKey, ...next });
      }
      setPermMap(prev => ({ ...prev, [moduleKey]: { id: result.id, ...next } }));
      setSaveStatus(prev => ({ ...prev, [moduleKey]: 'ok' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [moduleKey]: null })), 1500);
    } catch {
      setPermMap(prev => ({ ...prev, [moduleKey]: current }));
      setSaveStatus(prev => ({ ...prev, [moduleKey]: 'err' }));
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [moduleKey]: null })), 3000);
    } finally {
      setSaving(prev => ({ ...prev, [moduleKey]: false }));
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-3">Roles</p>

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
                        {role.name === 'ADMIN' && 'Full system access'}
                        {role.name === 'SALES' && 'Sales & customers'}
                        {role.name === 'HR' && 'Payroll & employees'}
                        {role.name === 'ACCOUNTANT' && 'Finance & accounts'}
                        {role.name === 'INVENTORY_MANAGER' && 'Stock & procurement'}
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
                          <tr key={mod.key}
                            className={`transition-colors ${viewOn ? 'bg-white hover:bg-slate-50/60' : 'bg-slate-50/40'}`}>

                            {/* Module info */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0
                                  ${viewOn ? 'bg-slate-100' : 'bg-slate-100 opacity-50'}`}>
                                  <ModIcon size={14} className={viewOn ? mod.color : 'text-slate-400'} />
                                </div>
                                <div>
                                  <div className={`font-semibold ${viewOn ? 'text-slate-700' : 'text-slate-400'}`}>
                                    {mod.label}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{mod.description}</div>
                                </div>
                              </div>
                            </td>

                            {/* Horizontal: canView */}
                            <td className="px-3 py-3.5 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Toggle
                                  checked={viewOn}
                                  onChange={() => handleToggle(mod.key, 'canView')}
                                  saving={isRowSaving}
                                />
                              </div>
                            </td>

                            {/* Separator */}
                            <td className="w-px bg-slate-100 p-0" />

                            {/* Vertical toggles */}
                            {['canCreate', 'canEdit', 'canApprove', 'canExport'].map(flag => (
                              <td key={flag} className="px-3 py-3.5 text-center">
                                <Toggle
                                  checked={!!perm[flag]}
                                  onChange={() => handleToggle(mod.key, flag)}
                                  disabled={!viewOn}
                                  saving={isRowSaving}
                                />
                              </td>
                            ))}

                            {/* All toggle + save indicator */}
                            <td className="px-3 py-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {status === 'ok'  && <Check size={12} className="text-emerald-500" />}
                                {status === 'err' && <X    size={12} className="text-red-500" />}
                                {!status && !isRowSaving && (
                                  <button
                                    onClick={() => handleRowSelectAll(mod.key, !allOn)}
                                    title={allOn ? 'Revoke all' : 'Grant all'}
                                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors font-medium
                                      ${allOn
                                        ? 'border-red-200 text-red-500 hover:bg-red-50'
                                        : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                  >
                                    {allOn ? 'None' : 'All'}
                                  </button>
                                )}
                                {isRowSaving && <RefreshCw size={11} className="text-slate-400 animate-spin" />}
                              </div>
                            </td>
                          </tr>
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
    </div>
  );
};

export default UserRoleConfig;
