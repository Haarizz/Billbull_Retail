import {
  Users, LayoutDashboard, ShoppingCart, Package, Truck, DollarSign, UserCog,
  Headphones, Bell, Monitor,
} from 'lucide-react';

// ─── Module catalog ────────────────────────────────────────────────────────
// Keep in sync with backend security/ModuleCatalog.java. A resource key is
// "<parent>.<page>": with no explicit rule it inherits the parent's flags
// (ModulePermissionService / PermissionContext.canAction).
export const MODULES = [
  {
    key: 'dashboard', label: 'Dashboard', description: 'KPIs, quick stats, quick actions',
    icon: LayoutDashboard, color: 'text-slate-500',
    resources: [
      { key: 'dashboard.kpis', label: 'Main KPIs' },
      { key: 'dashboard.charts', label: 'Financial Charts' },
    ],
  },
  {
    key: 'sales', label: 'Customers & Sales', description: 'Quotations, orders, invoices, payments',
    icon: ShoppingCart, color: 'text-yellow-600',
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
    ],
  },
  {
    key: 'inventory', label: 'Inventory & Registries', description: 'Products, warehouses, stock management',
    icon: Package, color: 'text-blue-500',
    resources: [
      { key: 'inventory.category',  label: 'Departments & Brands' },
      { key: 'inventory.units',     label: 'Units' },
      { key: 'inventory.product',   label: 'Products / Services' },
      { key: 'inventory.warehouse', label: 'Warehouses & Storages' },
      { key: 'inventory.stock',     label: 'Stock Taking & Transfers' },
      { key: 'inventory.barcode',   label: 'Barcode Print & Design' },
      { key: 'inventory.reports',   label: 'Inventory Reports' },
    ],
  },
  {
    key: 'purchases', label: 'Vendors & Purchases', description: 'LPOs, GRN, purchase invoices',
    icon: Truck, color: 'text-orange-500',
    resources: [
      { key: 'purchases.vendor',    label: 'Vendor Ledger & Registry' },
      { key: 'purchases.rfq',       label: 'Vendor Price Shares (RFQs)' },
      { key: 'purchases.lpo',       label: 'LPOs & Approvals' },
      { key: 'purchases.grn',       label: 'GRN / Goods Receipt' },
      { key: 'purchases.invoice',   label: 'Purchase Invoices' },
      { key: 'purchases.payment',   label: 'Vendor Payments' },
      { key: 'purchases.templates', label: 'Print & Email Templates' },
      { key: 'purchases.reports',   label: 'Purchase Reports' },
    ],
  },
  {
    key: 'finance', label: 'Financials', description: 'Ledger, vouchers, reconciliation, tax',
    icon: DollarSign, color: 'text-green-600',
    resources: [
      { key: 'finance.ledger',    label: 'General Ledger' },
      { key: 'finance.voucher',   label: 'Journal / Receipt / Payment Vouchers' },
      { key: 'finance.expense',   label: 'Expenses' },
      { key: 'finance.reconcile', label: 'Bank Reconciliation' },
      { key: 'finance.tax',       label: 'VAT & Tax Dashboard' },
      { key: 'finance.reports',   label: 'Financial Reports' },
      { key: 'finance.config',    label: 'Chart of Accounts & Config' },
      { key: 'finance.templates', label: 'Print & Email Templates' },
    ],
  },
  {
    key: 'hr', label: 'Payroll & Employees', description: 'Staff records, salary, attendance',
    icon: Users, color: 'text-indigo-500',
    resources: [
      { key: 'hr.employee',   label: 'Employee Database' },
      { key: 'hr.payroll',    label: 'Payroll Processing' },
      { key: 'hr.attendance', label: 'Attendance & Leave' },
    ],
  },
  {
    key: 'customer', label: 'Customer Connect', description: 'Inquiries, follow-ups, messaging',
    icon: Headphones, color: 'text-pink-500',
    resources: [
      { key: 'customer.inquiry',  label: 'Inquiries' },
      { key: 'customer.followup', label: 'Follow-ups' },
      { key: 'customer.message',  label: 'Marketing Messages' },
    ],
  },
  {
    key: 'notification', label: 'Notifications', description: 'In-app notification centre',
    icon: Bell, color: 'text-rose-500', resources: [],
  },
  {
    key: 'userManagement', label: 'User Management', description: 'System users, roles, company config, access audit',
    icon: UserCog, color: 'text-purple-600',
    resources: [
      { key: 'userManagement.user',  label: 'User Setup' },
      { key: 'userManagement.role',  label: 'Role Permissions' },
      { key: 'userManagement.setup', label: 'Company Profile' },
      { key: 'userManagement.audit', label: 'Access Audit Log', hint: 'View the access-change history. Export also needs Export.' },
    ],
  },
  {
    key: 'pos', label: 'POS Administration',
    description: 'Terminals, sessions, counters, devices & hardware (checkout itself is Sales › POS Sales)',
    icon: Monitor, color: 'text-amber-600',
    resources: [
      { key: 'pos.terminals',        label: 'POS Terminal Management' },
      { key: 'pos.sessions',         label: 'POS Sessions' },
      { key: 'pos.counters',         label: 'POS Counters' },
      { key: 'pos.devices',          label: 'POS Devices' },
      { key: 'pos.printers',         label: 'POS Printers' },
      { key: 'pos.scanners',         label: 'POS Scanners' },
      { key: 'pos.hardwareprofiles', label: 'Hardware Profiles' },
      { key: 'pos.settings',         label: 'POS Settings' },
    ],
  },
];

// ─── Columns ───────────────────────────────────────────────────────────────
export const VIEW_COLUMN = {
  flag: 'canView', label: 'View', kind: 'Visibility',
  tip: 'Module visibility. Shows the module or page in the sidebar and lets the role open and read its records. Turning View off also removes every action on that row.',
};

export const ACTION_COLUMNS = [
  { flag: 'canCreate',  label: 'Create',  tip: 'Add new records, e.g. a new invoice, product or voucher.' },
  { flag: 'canEdit',    label: 'Edit',    tip: 'Change existing records that are not yet posted or locked.' },
  { flag: 'canDelete',  label: 'Delete',  tip: 'Delete, cancel or void records (BillBull soft-deletes, so history is kept).' },
  { flag: 'canApprove', label: 'Approve', tip: 'Approve, post or authorise records in maker-checker flows. POS Administration approvals are never inherited — they must be granted explicitly.' },
  { flag: 'canExport',  label: 'Export',  tip: 'Download lists and reports to Excel / PDF and print them.' },
];

export const ALL_FLAGS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove', 'canExport'];
export const EMPTY_PERM = Object.freeze({
  canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false,
});

// ─── Single-switch grants ──────────────────────────────────────────────────
// The backend checks one specific flag on these keys, so a grant sets every
// flag on the row and a revoke clears them all.
export const APPROVAL_GROUPS = [
  {
    key: 'finance', title: 'Finance approvals & policy overrides',
    description: 'Maker-checker controls on the general ledger',
    grants: [
      { key: 'permissions.journal.create',               label: 'Create Manual Journal Vouchers',  description: 'Draft manual JVs in the general ledger' },
      { key: 'permissions.journal.approve',              label: 'Approve Journal Vouchers',        description: 'Approve JVs up to the high-value threshold' },
      { key: 'permissions.journal.approve-high-value',   label: 'Approve High-Value JVs',          description: 'Second-approver sign-off above the AED threshold', risk: true },
      { key: 'permissions.posting.backdate-into-locked', label: 'Post Into Locked Periods',        description: 'Backdate postings into a closed accounting period', risk: true },
    ],
  },
  {
    key: 'parties', title: 'Customer & vendor overrides',
    description: 'Credit limits and advance balances',
    grants: [
      { key: 'permissions.sales.override-credit-limit', label: 'Override Credit Limit',        description: 'Complete sales that exceed a customer credit limit', risk: true },
      { key: 'permissions.customer.advance.view',       label: 'View Customer Advances',       description: 'See unapplied customer advance balances' },
      { key: 'permissions.customer.advance.receive',    label: 'Receive Customer Advances',    description: 'Record an advance payment from a customer' },
      { key: 'permissions.customer.advance.apply',      label: 'Apply Customer Advances',      description: 'Apply an advance against an invoice' },
      { key: 'permissions.customer.advance.refund',     label: 'Refund Customer Advances',     description: 'Refund unapplied customer advance balances', risk: true },
      { key: 'permissions.customer.advance.adjust',     label: 'Adjust Customer Advances',     description: 'Correct an advance balance', risk: true },
      { key: 'permissions.customer.advance.void',       label: 'Void Customer Advances',       description: 'Void a recorded advance', risk: true },
      { key: 'permissions.vendor.advance',              label: 'Manage Vendor Advances',       description: 'Record and apply vendor advance payments' },
    ],
  },
  {
    key: 'inventory', title: 'Inventory controls',
    description: 'Stock-sensitive actions on sales documents',
    grants: [
      { key: 'batch_manual_select', label: 'Manual Batch Selection', description: 'Pick batches by hand on invoices, orders and delivery notes instead of automatic FIFO/FEFO' },
    ],
  },
  {
    key: 'pos-terminal', title: 'POS terminal lifecycle',
    description: 'Register, archive, block and retire terminals',
    grants: [
      { key: 'permissions.pos.terminal.register',             label: 'Register Terminal',             description: 'Manually register a new terminal on behalf of a device' },
      { key: 'permissions.pos.terminal.rename',               label: 'Rename Terminal',               description: 'Change a terminal or counter display name' },
      { key: 'permissions.pos.terminal.assigncounter',        label: 'Assign Counter',                description: 'Change which counter a terminal is linked to' },
      { key: 'permissions.pos.terminal.setmain',              label: 'Set Main POS',                  description: "Designate a terminal as the branch's main POS" },
      { key: 'permissions.pos.terminal.approve',              label: 'Approve Terminal',              description: 'Approve a pending terminal registration' },
      { key: 'permissions.pos.terminal.reject',               label: 'Reject Terminal',               description: 'Reject a pending terminal registration' },
      { key: 'permissions.pos.terminal.archive',              label: 'Archive Terminal',              description: 'Temporarily deactivate a terminal (reversible, frees its slot)' },
      { key: 'permissions.pos.terminal.restore',              label: 'Restore Terminal',              description: 'Bring an archived terminal back into service' },
      { key: 'permissions.pos.terminal.block',                label: 'Block Terminal',                description: 'Prevent a terminal from starting sessions or reconnecting', risk: true },
      { key: 'permissions.pos.terminal.unblock',              label: 'Unblock Terminal',              description: 'Lift a block on a terminal' },
      { key: 'permissions.pos.terminal.decommission',         label: 'Decommission Terminal',         description: 'Permanently retire a terminal — cannot be undone', risk: true },
      { key: 'permissions.pos.terminal.keepactive',           label: 'Keep Active',                   description: 'Dismiss a stale-inactivity warning and keep a terminal in service' },
      { key: 'permissions.pos.terminal.setautoarchiveexempt', label: 'Toggle Auto-Archive Exemption', description: 'Exempt (or re-include) a terminal from the auto-archive sweep' },
      { key: 'permissions.pos.terminal.viewactivity',         label: 'View Terminal Activity',        description: 'See the recent POS activity log in Console › Terminals & Counters' },
    ],
  },
  {
    key: 'pos-cash', title: 'POS cash drops & outs',
    description: 'Cash movements during a till session',
    grants: [
      { key: 'permissions.pos.cashmovement.create', label: 'Record Cash Movement', description: 'Record a cash drop or cash out' },
      { key: 'permissions.pos.cashmovement.view',   label: 'View Cash Movements',  description: 'See cash movements (own records — see Data Scope for all)' },
      { key: 'permissions.pos.cashmovement.edit',   label: 'Edit Cash Movement',   description: 'Correct a recorded cash movement' },
      { key: 'permissions.pos.cashmovement.void',   label: 'Void Cash Movement',   description: 'Void a recorded cash movement', risk: true },
    ],
  },
  {
    key: 'pos-reports', title: 'POS reports & receipts',
    description: 'Historical X/Z reports and receipt reprints',
    grants: [
      { key: 'permissions.pos.reports.view',    label: 'View POS Reports',    description: 'Open historical X/Z reports' },
      { key: 'permissions.pos.reports.print',   label: 'Print POS Reports',   description: 'Print X/Z reports' },
      { key: 'permissions.pos.reports.export',  label: 'Export POS Reports',  description: 'Export X/Z reports' },
      { key: 'permissions.pos.receipt.reprint', label: 'Reprint Receipts',    description: 'Reprint a duplicate receipt for any invoice of an accessible branch' },
    ],
  },
];

/** Data-scope switches: "see everyone's records" vs "see only your own". */
export const SCOPE_GRANTS = [
  {
    key: 'permissions.records.view-all', label: 'All users\' transactions',
    ownLabel: 'Only records they created', allLabel: 'All records in their branches',
    description: 'When company-wide ownership filtering is on, users without this see only the documents they created. ADMIN and BRANCH_ADMIN always see all.',
    dependsOnOwnership: true,
  },
  {
    key: 'permissions.pos.cashmovement.viewall', label: 'POS cash movements',
    ownLabel: 'Own cash movements', allLabel: 'Every cashier\'s cash movements',
    description: 'Scope of the cash drop / cash out list.',
  },
  {
    key: 'permissions.pos.reports.viewall', label: 'POS X/Z reports',
    ownLabel: 'Own sessions', allLabel: 'Every session in their branches',
    description: 'Scope of the historical X/Z report browser.',
  },
];

/** Rows ADMIN must keep — the backend refuses them anyway (RolePermissionService.validateNoAdminLockout). */
export const ADMIN_PROTECTED = new Set(['userManagement', 'userManagement.role']);

// Must match RoleService.SYSTEM_ROLES on the backend
export const SYSTEM_ROLES = new Set([
  'ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'SUPERVISOR', 'SALES',
  'INVENTORY_MANAGER', 'ACCOUNTANT', 'HR', 'DELIVERY_PERSON',
]);

export const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;

const ROLE_META = {
  ADMIN:             { bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-600', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  SALES:             { bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' },
  HR:                { bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-600',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  ACCOUNTANT:        { bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-600',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  INVENTORY_MANAGER: { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  DELIVERY_PERSON:   { bg: 'bg-cyan-50',   border: 'border-cyan-200',   dot: 'bg-cyan-600',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700' },
};
const DEFAULT_META = { bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600' };
export const getRoleMeta = (name) => ROLE_META[name] || DEFAULT_META;

/** Human label for any permission key. */
export const labelFor = (key) => {
  for (const m of MODULES) {
    if (m.key === key) return m.label;
    const r = m.resources.find(x => x.key === key);
    if (r) return `${m.label} › ${r.label}`;
  }
  for (const g of APPROVAL_GROUPS) {
    const gr = g.grants.find(x => x.key === key);
    if (gr) return gr.label;
  }
  const s = SCOPE_GRANTS.find(x => x.key === key);
  if (s) return `Data scope › ${s.label}`;
  return key;
};

/** Every key the screen manages as a single grant switch. */
export const SINGLE_SWITCH_KEYS = new Set([
  ...APPROVAL_GROUPS.flatMap(g => g.grants.map(x => x.key)),
  ...SCOPE_GRANTS.map(s => s.key),
]);
