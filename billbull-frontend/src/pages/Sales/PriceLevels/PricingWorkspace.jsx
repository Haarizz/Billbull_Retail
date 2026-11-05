import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, BadgeDollarSign, Calculator, ChevronRight, Copy, Download, FileSpreadsheet, Plus, Settings2,
  Shield, Tag, Upload, UserCheck, Users,
} from 'lucide-react';
import { getPricingRules, getPricingSummary, listPriceLevels } from '@billbull/shared/api/pricingApi';
import { getDepartments } from '@billbull/shared/api/departmentsApi';
import { getBrands } from '@billbull/shared/api/brandsApi';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { useCompany } from '@billbull/shared/context/CompanyContext';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import PriceMatrixTab, { EMPTY_FILTERS, filtersActive } from './PriceMatrixTab';
import CustomerPricingTab from './CustomerPricingTab';
import { LevelFormDialog, ManageLevelsDialog, PriceEditDialog } from './LevelDialogs';
import {
  BulkUpdateDialog, GlobalRulesDialog, HistoryDialog, ImportDialog, TierDialog, exportPriceMatrix,
} from './ToolDialogs';
import {
  AssignPriceListDialog, CopyPriceListDialog, CreatePriceListDialog, CustomerBulkDialog, CustomerPriceDialog,
  LevelCustomersDialog, PriceSimulatorDialog,
} from './CustomerDialogs';
import { btn, errorText, inputClass } from './pricingUi';

// Price Levels workspace — named price levels, the product × level price matrix with margins, and
// customer price lists / negotiated customer prices (Figma "Price Levels" redesign).

const asList = (data) => (Array.isArray(data) ? data : (data?.content || []));

function StatCard({ label, value, icon: Icon, tone, onClick, testId }) {
  const tones = {
    amber: ['border-l-[#F5C742]', 'text-slate-900', 'text-[#F5C742]'],
    emerald: ['border-l-emerald-500', 'text-emerald-600', 'text-emerald-500'],
    blue: ['border-l-blue-500', 'text-blue-600', 'text-blue-500'],
    purple: ['border-l-purple-500', 'text-purple-600', 'text-purple-500'],
    red: ['border-l-red-500', 'text-red-600', 'text-red-500'],
  }[tone];
  const Tag2 = onClick ? 'button' : 'div';
  return (
    <Tag2 type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testId}
      className={`rounded-lg border border-l-4 border-slate-200 ${tones[0]} bg-white p-4 text-left ${onClick ? 'transition hover:shadow-md' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[1]}`}>{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${tones[2]}`} />
      </div>
    </Tag2>
  );
}

export default function PricingWorkspace({ initialTab = 'levels' }) {
  const { canView, canEdit, canDelete } = usePermissions();
  const { branches = [], isAllBranches, activeBranchId } = useBranch();
  const { company } = useCompany() || {};
  const currency = company?.currency || 'AED';

  const showLevels = canView('sales.settings') || canView('inventory.product');
  const showCustomers = canView('sales.customer') || canView('sales.settings');
  const canManageLevels = canEdit('sales.settings');
  const canEditPrices = canEdit('inventory.product');
  const canEditCustomer = canEdit('sales.customer');

  const [tab, setTab] = useState(() => (initialTab === 'customers' ? (showCustomers ? 'customers' : 'levels') : (showLevels ? 'levels' : 'customers')));
  const [levels, setLevels] = useState([]);
  const [summary, setSummary] = useState(null);
  const [rules, setRules] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [branchId, setBranchId] = useState(() => (isAllBranches || !activeBranchId || activeBranchId === 'ALL' ? '' : String(activeBranchId)));
  const [costVisible, setCostVisible] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState(null); // { type, ...payload }

  const minMargin = Number(rules?.minMarginPercent ?? summary?.minMarginPercent ?? 15);
  const close = () => setDialog(null);

  const loadLevels = useCallback(async () => {
    try {
      setLevels(await listPriceLevels({ includeInactive: true }));
    } catch (err) {
      toast.error(errorText(err, 'Price levels could not be loaded.'));
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const s = await getPricingSummary();
      setSummary(s);
      if (s && s.costVisible === false) setCostVisible(false);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    listPriceLevels({ includeInactive: true }).then(setLevels)
      .catch((err) => toast.error(errorText(err, 'Price levels could not be loaded.')));
    getPricingSummary().then((s) => { setSummary(s); if (s && s.costVisible === false) setCostVisible(false); })
      .catch(() => setSummary(null));
    getPricingRules().then(setRules).catch(() => setRules(null));
    getDepartments().then((d) => setDepartments(asList(d))).catch(() => setDepartments([]));
    getBrands().then((b) => setBrands(asList(b))).catch(() => setBrands([]));
  }, []);

  /** After any change: refresh levels (counts), summary cards and the visible table. */
  const refreshAll = useCallback(() => {
    loadLevels();
    loadSummary();
    setReloadKey((k) => k + 1);
  }, [loadLevels, loadSummary]);

  const onCostVisible = useCallback((v) => setCostVisible(v), []);

  const doExport = async () => {
    try {
      toast.loading('Preparing export…', { id: 'price-export' });
      const n = await exportPriceMatrix({ filters, branchId, levels, costVisible, currency });
      toast.success(`${n} product${n === 1 ? '' : 's'} exported.`, { id: 'price-export' });
    } catch (err) {
      toast.error(errorText(err, 'Export failed.'), { id: 'price-export' });
    }
  };

  const fmt = (v) => (v == null ? '—' : v);
  const priceLevelsCount = useMemo(() => levels.filter((l) => l.active && !l.systemDefault).length, [levels]);
  const branchName = branches.find((b) => String(b.id) === branchId)?.name;

  const tabBtn = (id, label, Icon) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${tab === id ? 'bg-[#F5C742] text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F7F7FA]" data-testid="pricing-workspace">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Sales</span><ChevronRight className="h-4 w-4" /><span className="font-medium text-slate-900">Price Levels</span>
            </div>
            <div className="flex items-center gap-2">
              <BadgeDollarSign className="h-7 w-7 text-[#F5C742]" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Price Levels</h1>
            </div>
            <p className="text-sm text-slate-500 md:text-base">Manage multi-tier product pricing for different customers, customer price lists &amp; branches</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'levels' ? (
              <>
                {canManageLevels && <button type="button" className={btn.primary} onClick={() => setDialog({ type: 'level' })}><Plus size={16} /> Create New Price Level</button>}
                {canEditPrices && <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'import' })}><Upload size={16} /> Import</button>}
                <button type="button" className={btn.outline} onClick={doExport}><Download size={16} /> Export</button>
                {canEditPrices && <button type="button" className={btn.accent} onClick={() => setDialog({ type: 'bulk' })}><FileSpreadsheet size={16} /> Bulk Update</button>}
                <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'manage' })}><Settings2 size={16} /> Manage Levels</button>
              </>
            ) : (
              <>
                {canManageLevels && canEditPrices && <button type="button" className={btn.primary} onClick={() => setDialog({ type: 'createList' })}><Plus size={16} /> Create New Customer Price List</button>}
                {canEditCustomer && <button type="button" className={btn.accent} onClick={() => setDialog({ type: 'assign' })}><Users size={16} /> Assign to Customer</button>}
                {canEditCustomer && <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'override' })}><Tag size={16} /> Add Override</button>}
                {canEditCustomer && <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'customerBulk' })}><FileSpreadsheet size={16} /> Bulk Pricing</button>}
                {canEditCustomer && <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'copy' })}><Copy size={16} /> Copy Price List</button>}
                <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'simulator' })}><Calculator size={16} /> Price Simulator</button>
              </>
            )}
            <button type="button" className={btn.outline} onClick={() => setDialog({ type: 'rules' })}><Shield size={16} /> Global Rules</button>
          </div>
        </div>

        {tab === 'levels' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select aria-label="Branch" className={`${inputClass} w-56!`} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {isAllBranches && <option value="">All Branches</option>}
              {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
            <select aria-label="Department (quick)" className={`${inputClass} w-56!`} value={filters.departmentId} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {branchId && <span className="text-xs text-slate-500">Showing {branchName || 'branch'} prices; branch overrides are marked.</span>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 py-4 md:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard testId="stat-levels" label="Active Price Levels" value={fmt(summary?.activeLevels ?? (levels.length ? levels.filter((l) => l.active).length : null))} icon={Tag} tone="amber" />
          <StatCard testId="stat-lists" label="Customer Price Lists" value={fmt(summary?.customerPriceLists)} icon={FileSpreadsheet} tone="emerald" onClick={showCustomers ? () => setTab('customers') : undefined} />
          <StatCard testId="stat-overrides" label="Customer Overrides" value={fmt(summary?.customerPrices)} icon={UserCheck} tone="blue" onClick={showCustomers ? () => setTab('customers') : undefined} />
          <StatCard testId="stat-customers" label="Customers with Pricing" value={fmt(summary ? summary.customersWithPrices : null)} icon={Users} tone="purple" />
          <StatCard testId="stat-alerts" label={`Margin Alerts (< ${minMargin}%)`} value={summary?.costVisible === false ? 'Hidden' : fmt(summary?.marginAlerts)} icon={AlertTriangle} tone="red"
            onClick={showLevels && summary?.costVisible !== false ? () => { setTab('levels'); setFilters((f) => ({ ...f, filter: 'LOW_MARGIN' })); } : undefined} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
        {showLevels && showCustomers && (
          <div className="flex w-full max-w-md gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
            {tabBtn('levels', 'Price Levels', Tag)}
            {tabBtn('customers', 'Customer Price-List', Users)}
          </div>
        )}

        {tab === 'levels' && showLevels && (
          <PriceMatrixTab levels={levels} filters={filters} setFilters={setFilters} branchId={branchId}
            departments={departments} brands={brands} branches={branches} minMargin={minMargin} currency={currency}
            canEdit={canEditPrices} reloadKey={reloadKey} onCostVisible={onCostVisible}
            onEditCell={(product, level) => setDialog({ type: 'cell', product, level })}
            onTiers={(product) => setDialog({ type: 'tiers', product })}
            onHistory={(product) => setDialog({ type: 'history', product })} />
        )}
        {tab === 'levels' && showLevels && priceLevelsCount === 0 && levels.length > 0 && (
          <p className="rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-4 py-3 text-sm text-slate-700">
            Only the default level exists. Create a price level (e.g. Wholesale or VIP) to give products other selling prices.
          </p>
        )}

        {tab === 'customers' && showCustomers && (
          <CustomerPricingTab levels={levels} customersByLevel={summary?.customersByLevel} minMargin={minMargin} currency={currency}
            costVisible={costVisible && summary?.costVisible !== false} canEdit={canEditCustomer} canDelete={canDelete('sales.customer')}
            canAssign={canEditCustomer} reloadKey={reloadKey} onChanged={refreshAll}
            onAddOverride={(customer) => setDialog({ type: 'override', customer })}
            onEditOverride={(row) => setDialog({ type: 'override', row })}
            onOpenList={(level) => setDialog({ type: 'listCustomers', level })}
            onAssignList={(level) => setDialog({ type: 'assign', levelId: level.id })} />
        )}
      </div>

      {/* Dialogs */}
      <LevelFormDialog open={dialog?.type === 'level'} onClose={close} initial={dialog?.level} departments={departments} brands={brands}
        rules={rules} costVisible={costVisible} canPrice={canEditPrices}
        onSaved={() => { close(); refreshAll(); }} />
      <ManageLevelsDialog open={dialog?.type === 'manage'} onClose={close} levels={levels} customersByLevel={summary?.customersByLevel}
        canManage={canManageLevels} onEdit={(level) => setDialog({ type: 'level', level })} onChanged={refreshAll} />
      <PriceEditDialog open={dialog?.type === 'cell'} onClose={close} product={dialog?.product} level={dialog?.level} branchId={branchId}
        branches={branches} isAllBranches={isAllBranches} minMargin={minMargin} costVisible={costVisible} currency={currency}
        canEdit={canEditPrices} onSaved={() => { close(); refreshAll(); }} />
      <BulkUpdateDialog open={dialog?.type === 'bulk'} onClose={close} levels={levels} filters={{ ...filters, active: filtersActive(filters) }}
        branches={branches} isAllBranches={isAllBranches} branchId={branchId} rules={rules} costVisible={costVisible} currency={currency}
        onApplied={refreshAll} />
      <ImportDialog open={dialog?.type === 'import'} onClose={close} levels={levels} branches={branches} isAllBranches={isAllBranches}
        branchId={branchId} onImported={refreshAll} />
      <GlobalRulesDialog open={dialog?.type === 'rules'} onClose={close} rules={rules} canEdit={canManageLevels}
        onSaved={(saved) => { setRules(saved); close(); refreshAll(); }} />
      <HistoryDialog open={dialog?.type === 'history'} onClose={close} product={dialog?.product} currency={currency} />
      <TierDialog open={dialog?.type === 'tiers'} onClose={close} product={dialog?.product} levels={levels}
        levelId={levels.find((l) => l.active && !l.systemDefault)?.id ?? null} canEdit={canEditPrices} onChanged={refreshAll} />

      <CustomerPriceDialog open={dialog?.type === 'override'} onClose={close} initial={dialog?.row} presetCustomer={dialog?.customer}
        branches={branches} isAllBranches={isAllBranches} activeBranchId={activeBranchId} minMargin={minMargin} costVisible={costVisible}
        currency={currency} onSaved={() => { close(); refreshAll(); }} />
      <CustomerBulkDialog open={dialog?.type === 'customerBulk'} onClose={close} departments={departments} brands={brands}
        branches={branches} isAllBranches={isAllBranches} activeBranchId={activeBranchId} rules={rules} costVisible={costVisible}
        currency={currency} onApplied={refreshAll} />
      <CopyPriceListDialog open={dialog?.type === 'copy'} onClose={close} currency={currency} onApplied={refreshAll} />
      <PriceSimulatorDialog open={dialog?.type === 'simulator'} onClose={close} minMargin={minMargin} costVisible={costVisible} currency={currency} />
      <CreatePriceListDialog open={dialog?.type === 'createList'} onClose={close} departments={departments} brands={brands} rules={rules}
        costVisible={costVisible} currency={currency}
        onCreated={(level) => { refreshAll(); setDialog(canEditCustomer ? { type: 'assign', levelId: level.id } : null); }} />
      <AssignPriceListDialog open={dialog?.type === 'assign'} onClose={close} levels={levels} presetLevelId={dialog?.levelId}
        onAssigned={() => { close(); refreshAll(); }} />
      <LevelCustomersDialog open={dialog?.type === 'listCustomers'} onClose={close} level={dialog?.level} canEdit={canEditCustomer}
        onAdd={(level) => setDialog({ type: 'assign', levelId: level.id })} onChanged={refreshAll} />
    </div>
  );
}
