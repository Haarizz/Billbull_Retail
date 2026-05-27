import React, { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FaStore, FaUsers, FaBoxOpen, FaTruck, FaCalculator,
  FaUserCog, FaBuilding, FaIndustry, FaWrench, FaBrain,
  FaUser, FaSignOutAlt, FaChevronRight, FaChevronDown,
  FaChevronUp, FaBars, FaTimes, FaTachometerAlt, FaTags,
  FaBalanceScale, FaExchangeAlt, FaCog, FaBoxes, FaHeadset
} from "react-icons/fa";
import {
  HelpCircle, Phone, MessageSquare, Building2, Layers,
  Tag, Scale, Package, Warehouse, ClipboardList,
  ArrowRightLeft, Barcode, BookUser, FileText, ShoppingCart,
  File, FileSpreadsheet, Truck, Undo2, CreditCard,
  Printer, Settings, FilePlus, Inbox, BookOpen,
  Receipt, PenTool, TrendingDown, Landmark, Percent,
  PieChart, Users, Wallet, Banknote, ShieldCheck, Mail
} from "lucide-react";
import { hasRole, logout, getUsernameFromToken } from "../api/auth";
import { usePermissions } from "../context/PermissionContext";
import { useCompany } from "../context/CompanyContext";
import { formatUserDisplayName } from "../utils/displayName";
import BranchSelector from "../components/common/BranchSelector";

const Sidebar = ({ children }) => {
  // --- STATE ---
  const [collapsed, setCollapsed] = useState(false);
  const username = formatUserDisplayName(getUsernameFromToken()) || "BillBull Admin";
  const { canView, canAction, permissionsLoaded } = usePermissions();
  const { setCompany } = useCompany();
  const userEmail = "admin@billbull.app";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

  // --- DROPDOWN STATES ---
  const [connectOpen, setConnectOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [purchOpen, setPurchOpen] = useState(false);
  const [finOpen, setFinOpen] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Responsive Check
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileOpen(false);
        setCollapsed(false);
      } else {
        setCollapsed(false); // Ensure full width when opened on mobile
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize(); // Init check
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- AUTO-EXPAND LOGIC ---
  useEffect(() => {
    if (collapsed) return;
    const path = location.pathname;
    if (path.startsWith("/customer")) setConnectOpen(true);
    if (path.startsWith("/inventory")) { setInvOpen(true); setStockOpen(true); }
    if (path.startsWith("/sales")) setSalesOpen(true);
    if (path.startsWith("/purchases")) setPurchOpen(true);
    if (path.startsWith("/finance")) setFinOpen(true);
    if (path.startsWith("/tally")) setTallyOpen(true);
    if (path.startsWith("/payroll")) setPayrollOpen(true);
    if (path.startsWith("/settings")) setSettingsOpen(true);
    if (path.startsWith("/enterprise")) setEnterpriseOpen(true);
  }, [location.pathname, collapsed]);

  // Toggle Handler
  const handleToggle = (isOpen, setIsOpen) => {
    if (collapsed) {
      setCollapsed(false);
      setTimeout(() => setIsOpen(true), 200);
    } else {
      setIsOpen(!isOpen);
    }
  };

  // --- MENU CONFIGURATION ---
  const menuItems = [
    {
      path: "/",
      label: "Dashboard",
      icon: <FaTachometerAlt />,
      module: "dashboard",
      roles: ["ADMIN", "SALES", "INVENTORY_MANAGER", "ACCOUNTANT", "HR", "SALES"],
    },
    {
      id: "connect-group",
      label: "Customer Connect",
      icon: <FaHeadset />,
      isDropdown: true,
      isOpen: connectOpen,
      onToggle: () => handleToggle(connectOpen, setConnectOpen),
      module: "customer",
      roles: ["ADMIN", "SALES"],
      subItems: [
        { path: "/customer/inquiries", label: "Inquiries",  module: "customer.inquiry", icon: <HelpCircle size={14} /> },
        { path: "/customer/followups", label: "Follow-ups", module: "customer.followup", icon: <Phone size={14} /> },
        { path: "/customer/messaging", label: "Messaging",  module: "customer.message", icon: <MessageSquare size={14} /> },
      ],
    },
    {
      id: "inventory-master",
      label: "Inventory & Registries",
      icon: <FaBoxOpen />,
      isDropdown: true,
      isOpen: invOpen,
      onToggle: () => handleToggle(invOpen, setInvOpen),
      module: "inventory",
      roles: ["ADMIN", "INVENTORY_MANAGER"],
      subItems: [
        { path: "/inventory/departments",     label: "Departments",           module: "inventory.category",  icon: <Building2 size={14} /> },
        { path: "/inventory/subDepartments",  label: "Sub Departments",       module: "inventory.category",  icon: <Layers size={14} /> },
        { path: "/inventory/brands",          label: "Brands ",               module: "inventory.category",  icon: <Tag size={14} /> },
        { path: "/inventory/units",           label: "Units ",                module: "inventory.category",  icon: <Scale size={14} /> },
        { path: "/inventory/products",        label: "Products / Services",   module: "inventory.product",   icon: <Package size={14} /> },
        { path: "/inventory/warehouses",      label: "Warehouses & Storages", module: "inventory.warehouse", icon: <Warehouse size={14} /> },
        { path: "/inventory/stock-take",      label: "Stock Taking",          module: "inventory.stock",     icon: <ClipboardList size={14} /> },
        { path: "/inventory/stock-transfer",  label: "Stock Transfers",       module: "inventory.stock",     icon: <ArrowRightLeft size={14} /> },
        { path: "/inventory/barcode",         label: "Barcode Print & Design",module: "inventory.stock",     icon: <Barcode size={14} /> },
        { path: "/inventory/reports",         label: "Reports",               module: "inventory.stock",     icon: <PieChart size={14} /> },
      ],
    },
    {
      id: "sales-group",
      label: "Customers & Sales",
      icon: <FaTags />,
      isDropdown: true,
      isOpen: salesOpen,
      onToggle: () => handleToggle(salesOpen, setSalesOpen),
      module: "sales",
      roles: ["ADMIN", "SALES", "ACCOUNTANT"],
      subItems: [
        { path: "/sales/customers",     label: "Customer Ledger",       module: "sales.customer", icon: <BookUser size={14} /> },
        { path: "/sales/quotation",     label: "Quotation",             module: "sales.quotation",icon: <FileText size={14} /> },
        { path: "/sales/order",         label: "Sales Order",           module: "sales.order",    icon: <ShoppingCart size={14} /> },
        { path: "/sales/pro-forma",     label: "Proforma Invoice",       module: "sales.invoice",  icon: <File size={14} /> },
        { path: "/sales/invoice",       label: "Sales Invoice",         module: "sales.invoice",  icon: <FileSpreadsheet size={14} /> },
        { path: "/sales/deliverynote",  label: "Delivery Note",         module: "sales.invoice",  icon: <Truck size={14} /> },
        { path: "/sales/return",        label: "Sales Return",          module: "sales.invoice",  icon: <Undo2 size={14} /> },
        { path: "/sales/payment",       label: "Payments",              module: "sales.payment",  icon: <CreditCard size={14} /> },
        { path: "/sales/templates",     label: "Print & Email Templates",module: "sales.invoice",  icon: <Printer size={14} /> },
        { path: "/sales/reports",        label: "Reports",              module: "sales.invoice",  icon: <PieChart size={14} /> },
        { path: "/sales/settings",      label: "Configure & customize", module: "sales.invoice",  icon: <Settings size={14} /> },
      ],
    },
    {
      id: "purchase-group",
      label: "Vendors & Purchases",
      icon: <FaTruck />,
      isDropdown: true,
      isOpen: purchOpen,
      onToggle: () => handleToggle(purchOpen, setPurchOpen),
      module: "purchases",
      roles: ["ADMIN", "INVENTORY_MANAGER", "ACCOUNTANT"],
      subItems: [
        { path: "/purchases/vendors",         label: "Vendor Ledger",           module: "purchases.vendor", icon: <BookUser size={14} /> },
        { path: "/purchases/lpo",             label: "LPO & Approvals",         module: "purchases.lpo",    icon: <FilePlus size={14} /> },
        { path: "/purchases/grn",             label: "GRN (Goods Reciept Note)",module: "purchases.grn",    icon: <Inbox size={14} /> },
        { path: "/purchases/invoice",         label: "Purchase Invoices",       module: "purchases.invoice",icon: <FileText size={14} /> },
        { path: "/purchases/payment",         label: "Payments",               module: "purchases.invoice",icon: <CreditCard size={14} /> },
        { path: "/purchases/templates",       label: "Print & Email Templates", module: "purchases.invoice",icon: <Printer size={14} /> },
        { path: "/purchases/reports/summary", label: "Purchase Summary Report", module: "purchases.invoice",icon: <PieChart size={14} /> },
      ],
    },


    {
      id: "finance-group",
      label: "Financials",
      icon: <FaBalanceScale />,
      isDropdown: true,
      isOpen: finOpen,
      onToggle: () => handleToggle(finOpen, setFinOpen),
      module: "finance",
      roles: ["ADMIN", "ACCOUNTANT"],
      subItems: [
        { path: "/finance/ledger",          label: "Ledger",                    module: "finance.ledger",   icon: <BookOpen size={14} /> },
        { path: "/finance/receiptvoucher",  label: "Receipt Voucher",           module: "finance.voucher",  icon: <Receipt size={14} /> },
        { path: "/finance/paymentvoucher",  label: "Payment Voucher",           module: "finance.voucher",  icon: <Wallet size={14} /> },
        { path: "/finance/journalvoucher",  label: "Journal Voucher",           module: "finance.voucher",  icon: <PenTool size={14} /> },
        { path: "/finance/expenses",        label: "Expenses",                  module: "finance.voucher",  icon: <TrendingDown size={14} /> },
        { path: "/finance/reconciliation",  label: "Bank Reconciliation",       module: "finance.reconcile",icon: <Landmark size={14} /> },
        { path: "/finance/tax",             label: "Tax Dashboard",             module: "finance.tax",      icon: <Percent size={14} /> },
        { path: "/finance/reports",         label: "Reports",                   module: "finance.tax",      icon: <PieChart size={14} /> },
        { path: "/finance/config",          label: "Chart of Accounts & Config",module: "finance.tax",      icon: <Settings size={14} /> },
        { path: "/finance/templates",       label: "Print & Email Templates",   module: "finance.voucher",  icon: <Printer size={14} /> },
      ],
    },
    {
      id: "hr-group",
      label: "Payroll & Employees",
      icon: <FaUsers />,
      isDropdown: true,
      isOpen: payrollOpen,
      onToggle: () => handleToggle(payrollOpen, setPayrollOpen),
      module: "hr",
      roles: ["ADMIN", "HR"],
      subItems: [
        { path: "/payroll/employees",       label: "Employees & Roles", module: "hr.employee",   icon: <Users size={14} /> },
        { path: "/payroll/salary_payment",  label: "Salary Payment",     module: "hr.payroll",    icon: <Wallet size={14} /> },
        { path: "/payroll/salary_advance",  label: "Salary Advance",     module: "hr.payroll",    icon: <Banknote size={14} /> },
      ],
    },
    // {
    //   id: "tally-group",
    //   label: "Tally Sync",
    //   icon: <FaExchangeAlt />,
    //   isDropdown: true,
    //   isOpen: tallyOpen,
    //   onToggle: () => handleToggle(tallyOpen, setTallyOpen),
    //   roles: ["ADMIN", "ACCOUNTANT"],
    //   subItems: [
    //     { path: "/tally/inventory-sync", label: "Inventory Sync" },
    //     { path: "/tally/voucher-sync", label: "Voucher Sync" },
    //     { path: "/tally/logs", label: "Audit Logs" },
    //   ],
    // },
    {
      id: "enterprise-group",
      label: "Enterprise Console",
      icon: <Building2 size={16} />,
      isDropdown: true,
      isOpen: enterpriseOpen,
      onToggle: () => handleToggle(enterpriseOpen, setEnterpriseOpen),
      module: "userManagement",
      roles: ["ADMIN"],
      subItems: [
        { path: "/enterprise/branches",        label: "Branch / Outlets",  module: "userManagement.setup", icon: <Building2 size={14} /> },
        { path: "/enterprise/administration",  label: "Administration",    module: "userManagement.role",  icon: <ShieldCheck size={14} /> },
        { path: "/enterprise/data-management", label: "Data Management",   module: "userManagement.setup", icon: <FileSpreadsheet size={14} /> },
      ],
    },
    {
      id: "settings-group",
      label: "Settings",
      icon: <Settings size={16} />,
      isDropdown: true,
      isOpen: settingsOpen,
      onToggle: () => handleToggle(settingsOpen, setSettingsOpen),
      module: "userManagement",
      roles: ["ADMIN"],
      subItems: [
        { path: "/settings/company",   label: "Company Profile",    module: "userManagement.setup", icon: <Building2 size={14} /> },
        { path: "/settings/email",     label: "Email Settings",     module: "userManagement.setup", icon: <Mail size={14} /> },
      ],
    },
    {
      path: "/myprofile",
      label: "My Profile",
      icon: <FaUser />,
      module: null, // always visible to any authenticated user
      roles: ["ADMIN", "SALES", "INVENTORY_MANAGER", "ACCOUNTANT", "HR", "SALES"],
    },
  ];

  // Helper for initials
  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'UA';

  // --- CSS STYLING ---
  const css = `
    :root {
      --font-main: 'Inter', sans-serif;
      --primary: #F5C742; 
      --primary-dark: #E5B732; 
      --primary-hover: rgba(245, 199, 66, 0.1); 
      --text-dark: #1E1E1E; 
      --text-slate: #334155; 
      --text-muted: #64748B; 
      --border-color: #E2E8F0; 
      --sidebar-bg: #FFFFFF; 
      --body-bg: #F7F7FA;
    }

    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow-x: hidden;
      font-family: var(--font-main);
      background: var(--body-bg);
    }
    * { box-sizing: border-box; }

    .app-shell {
      display: flex;
      height: 100%;
      min-height: 100%;
      width: 100%;
      background: var(--body-bg);
      overflow: hidden;
    }

    /* SIDEBAR CONTAINER */
    .sidebar {
      width: 256px; 
      height: 100%;
      background: #F7F7FA; 
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      transition: all 0.3s ease;
      z-index: 50;
      flex-shrink: 0;
    }

    .sidebar.collapsed { width: 70px; }

    /* HEADER */
    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      background: #FFFFFF;
      position: relative;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Logo Box */
    .logo-box {
      width: 44px;
      height: 44px;
      background: linear-gradient(to bottom right, var(--primary), var(--primary-dark));
      border-radius: 12px; 
      color: var(--text-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); 
      flex-shrink: 0;
    }

    .brand-info h2 {
      font-weight: 700;
      font-size: 1.125rem; 
      color: var(--text-dark);
      margin: 0;
    }

    .brand-info p {
      font-size: 0.875rem; 
      color: #475569; 
      margin: 0;
    }

    /* MENU LIST */
    .nav-list {
      flex: 1;
      padding: 16px; 
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px; 
      background: #F7F7FA; 
    }

    /* NAV ITEMS */
    .nav-item {
      display: flex;
      align-items: center;
      width: 100%;
      height: 32px; 
      padding: 0 8px; 
      border-radius: 8px; 
      font-size: 0.875rem; 
      font-weight: 500; 
      text-decoration: none;
      transition: all 0.3s;
      cursor: pointer;
      user-select: none;
      color: var(--text-slate); 
      border: 1px solid transparent; 
    }

    .nav-item:hover {
      background: var(--primary-hover);
      color: var(--text-dark);
    }

    .nav-item.active {
      background-color: var(--primary);
      color: var(--text-dark);
      font-weight: 600; 
    }

    .nav-icon {
      margin-right: 12px; 
      font-size: 16px; 
      display: flex; 
      justify-content: center; 
      align-items: center;
      min-width: 16px;
      pointer-events: none;
    }
    
    .nav-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }

    .chevron-icon {
      font-size: 14px; 
      margin-left: auto;
      opacity: 0.7;
    }

    /* SUB MENU */
    .submenu-wrapper {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.2s ease-out;
    }
    .submenu-wrapper.open { grid-template-rows: 1fr; }
    .submenu-inner { overflow: hidden; }

    .sub-menu {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 2px;
      margin-bottom: 2px;
    }
    
    .sub-item {
      padding: 6px 8px 6px 36px; 
      font-size: 0.8rem;
      color: var(--text-muted);
      text-decoration: none;
      border-radius: 6px;
      height: 28px;
      display: flex;
      align-items: center;
      transition: all 0.2s;
      cursor: pointer;
      user-select: none;
    }
    .sub-item * { pointer-events: none; }
    .sub-item:hover { color: var(--text-dark); background: rgba(0,0,0,0.03); }
    .sub-item.active { color: #B45309; font-weight: 500; background: transparent; }
    
    /* FOOTER */
    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #FFFFFF;
    }

    .user-profile {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 4px;
    }

    .user-avatar {
      width: 32px; 
      height: 32px;
      border-radius: 50%;
      background-color: var(--primary);
      color: var(--text-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
      border: 2px solid #E2E8F0;
    }

    .user-text { flex: 1; min-width: 0; }
    .user-name { font-size: 0.875rem; font-weight: 500; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-email { font-size: 0.75rem; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .logout-btn {
      display: flex;
      align-items: center;
      width: 100%;
      height: 32px; 
      padding: 0 12px;
      border: 1px solid #CBD5E1; 
      border-radius: 6px; 
      background: #FFFFFF; 
      color: var(--text-slate);
      font-size: 0.875rem; 
      font-weight: 500;
      cursor: pointer;
      gap: 8px;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background-color: var(--primary-hover);
      color: var(--text-dark);
      border-color: var(--primary);
    }
    
    .collapse-trigger {
       position: absolute;
       right: -12px;
       top: 28px;
       width: 24px;
       height: 24px;
       background: white;
       border: 1px solid var(--border-color);
       border-radius: 50%;
       display: flex;
       align-items: center;
       justify-content: center;
       cursor: pointer;
       z-index: 60;
       color: #64748B;
       font-size: 10px;
       display: none; /* Hidden by default, shown on desktop hover */
    }
    
    .sidebar:hover .collapse-trigger {
        display: flex;
    }

    /* COLLAPSED STATE LOGIC */
    .sidebar.collapsed .brand-info, 
    .sidebar.collapsed .nav-label, 
    .sidebar.collapsed .chevron-icon,
    .sidebar.collapsed .user-text,
    .sidebar.collapsed .logout-text { display: none; }
    
    .sidebar.collapsed .sidebar-header { justify-content: center; padding: 16px 0; }
    .sidebar.collapsed .header-content { justify-content: center; }
    .sidebar.collapsed .logo-box { padding: 0; }
    
    .sidebar.collapsed .nav-item { justify-content: center; padding: 0; }
    .sidebar.collapsed .nav-icon { margin-right: 0; }
    
    .sidebar.collapsed .sidebar-footer { padding: 16px 8px; }
    .sidebar.collapsed .user-profile { justify-content: center; }
    .sidebar.collapsed .logout-btn { justify-content: center; padding: 0; }

    /* MOBILE SPECIFIC */
    /* Refactored Mobile Header */
    .mobile-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: white;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      z-index: 60;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .mobile-trigger-btn {
      padding: 8px;
      margin-left: -8px;
      border-radius: 8px;
      color: #374151;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    
    .mobile-logo {
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--text-dark);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mobile-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40;
    }
    
    .close-mobile {
        position: absolute; top: 16px; right: 16px; z-index: 60;
        cursor: pointer; color: #64748B;
    }

    /* MAIN CONTENT AREA */
    .main-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      height: 100%;
      min-width: 0;
    }

    @media (max-width: 1024px) {
      .app-shell { flex-direction: column; }
      .sidebar { 
        position: fixed; left: 0; top: 0; bottom: 0; 
        transform: translateX(-105%); 
        width: 280px !important; /* Wider on mobile */
      }
      .sidebar.mobile-open { transform: translateX(0); box-shadow: 10px 0 30px rgba(0,0,0,0.15); }
      .sidebar.collapsed { width: 280px !important; } /* No collapse on mobile */
      
      .collapse-trigger { display: none !important; }
      
      /* Mobile Main Content Override */
      .main-content { 
        width: 100% !important; 
        height: calc(100% - 60px) !important; 
        margin-top: 60px !important; 
        padding-top: 0 !important;
      }
      
      .app-shell > main { /* Deprecated selector backup */
         margin-top: 60px !important;
         padding-top: 0 !important;
      }
    }

    @media print {
      .mobile-header,
      .mobile-overlay,
      .sidebar,
      .collapse-trigger {
        display: none !important;
      }

      .app-shell {
        display: block !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
      }

      .main-content,
      .app-shell > main {
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }
  `;

  return (
    <div className="app-shell">
      <style>{css}</style>

      {/* MOBILE HEADER BAR */}
      {isMobile && (
        <header className="mobile-header">
          <button className="mobile-trigger-btn" onClick={() => setMobileOpen(true)}>
            <FaBars size={20} />
          </button>
          <div className="mobile-logo">
            <div style={{ width: 28, height: 28, background: '#F5C742', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E1E1E' }}>
              <FaStore size={14} />
            </div>
            <span>BillBull</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <BranchSelector />
          </div>
        </header>
      )}

      {isMobile && mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>

        {/* DESKTOP COLLAPSE TRIGGER */}
        {!isMobile && (
          <button className="collapse-trigger" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <FaChevronRight /> : <FaChevronDown style={{ transform: 'rotate(90deg)' }} />}
          </button>
        )}

        {/* MOBILE CLOSE */}
        {isMobile && (
          <div className="close-mobile" onClick={() => setMobileOpen(false)}>
            <FaTimes size={20} />
          </div>
        )}

        {/* HEADER */}
        <div className="sidebar-header">
          <div className="header-content">
            <div className="logo-box">
              <FaStore size={20} />
            </div>
            {!collapsed && (
              <div className="brand-info">
                <h2>BillBull</h2>
                <p>Retail SaaS Platform</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <div style={{ marginTop: 12 }}>
              <BranchSelector />
            </div>
          )}
        </div>

        {/* NAVIGATION */}
        <nav className="nav-list">
          {menuItems
            .filter(item => {
              // Items with no module (My Profile) are always visible
              if (!item.module) return true;
              // While permissions are loading, fall back to primaryRole check so
              // the sidebar isn't blank during the brief API fetch.
              // We use primaryRole (not all JWT roles) to prevent modules from
              // other non-primary roles from flashing before permissions load.
              if (!permissionsLoaded) {
                const primaryRole = sessionStorage.getItem('primaryRole');
                return !item.roles || (primaryRole && item.roles.includes(primaryRole));
              }
              // ── HORIZONTAL ACCESS ──
              // canView(module) is the single source of truth once loaded
              return canView(item.module);
            })
            .map((item, index) => {

              const isActiveParent = item.isDropdown && item.subItems.some(sub => location.pathname === sub.path);

              if (item.isDropdown) {
                return (
                  <div key={index}>
                    <div
                      className={`nav-item ${isActiveParent && !item.isOpen ? "active" : ""}`}
                      onClick={item.onToggle}
                      title={collapsed ? item.label : ""}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                      {!collapsed && (
                        <span className="chevron-icon" style={{ transform: item.isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }}>
                          <FaChevronDown />
                        </span>
                      )}
                    </div>

                    {!collapsed && (
                      <div className={`submenu-wrapper ${item.isOpen ? "open" : ""}`}>
                        <div className="submenu-inner">
                          <div className="sub-menu">
                            {item.subItems.map((sub, i) => (
                              <NavLink
                                key={i}
                                to={sub.path}
                                className={({ isActive }) => `sub-item ${isActive ? "active" : ""}`}
                                onClick={() => isMobile && setMobileOpen(false)}
                              >
                                {sub.icon && <span style={{ marginRight: '10px', display: 'flex', alignItems: 'center', opacity: 0.75 }}>{sub.icon}</span>}
                                {sub.label}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={index}
                  to={item.path}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                  title={collapsed ? item.label : ""}
                  onClick={() => isMobile && setMobileOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              );
            })}
        </nav>

        {/* FOOTER */}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {getInitials(username)}
            </div>
            <div className="user-text">
              <p className="user-name">{username}</p>
              <p className="user-email">{userEmail}</p>
            </div>
          </div>

          <button className="logout-btn" onClick={() => { logout(); setCompany(null); navigate("/login"); }}>
            <span style={{ display: 'flex' }}><FaSignOutAlt /></span>
            <span className="logout-text">Sign Out</span>
          </button>
        </div>

      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Sidebar;
