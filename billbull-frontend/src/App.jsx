import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';

// Module dashboards (lazy loaded)
const BIEngineDashboardV2 = React.lazy(() => import('./pages/dashboards/bi-engine-dashboard-v2').then(m => ({ default: m.BillBullBIEngineDashboard })));
const CustomerConnectDashboard = React.lazy(() => import('./pages/dashboards/customer-connect-dashboard').then(m => ({ default: m.CustomerConnectDashboard ?? m.default })));
const CustomersSalesDashboard = React.lazy(() => import('./pages/dashboards/customers-sales-dashboard').then(m => ({ default: m.CustomersSalesDashboard ?? m.default })));
const InventoryRegistriesDashboard = React.lazy(() => import('./pages/dashboards/inventory-registries-dashboard').then(m => ({ default: m.InventoryRegistriesDashboard ?? m.default })));
const StorefrontAdminDashboard = React.lazy(() => import('./pages/dashboards/storefront-admin-dashboard').then(m => ({ default: m.StorefrontAdminDashboard ?? m.default })));
const VendorsPurchasesDashboard = React.lazy(() => import('./pages/dashboards/vendors-purchases-dashboard').then(m => ({ default: m.VendorsPurchasesDashboard ?? m.default })));

import Sidebar from "./layout/Sidebar";

// Pages
import Login from "./auth/login";
// import Customers from "./pages/Customer/Customers";
import Dashboard from "./pages/Dashboard";

// Route Guards
import PrivateRoute from "./auth/PrivateRoute";
import { PermissionProvider } from "./context/PermissionContext";
import { NotificationProvider } from "./context/NotificationContext";
import { CompanyProvider } from "./context/CompanyContext";
import { BranchProvider } from "./context/BranchContext";
import ResourceGuard from "./components/auth/ResourceGuard";// import CustomerInquiries from "./pages/Customer/CustomerInquiries";
import PrinterTestButton from "./components/PrinterTestButton";
import AedSymbolRenderer from "./components/AedSymbolRenderer";
import AppAlertBridge from "./components/AppAlertBridge";
import { logClientError, logClientEvent } from "./utils/clientLogger";
// import FollowUpModal from "./pages/Customer/FollowUpModal";
// import MessageModal from "./pages/Customer/MessageModal";
// import CustomerLedger from "./pages/Sales/CustomerLedger";
// import Payments from "./pages/Sales/Payments";
import Departments from "./pages/Inventory/Department/Departments";
import SubDepartments from "./pages/Inventory/SubDepartment/SubDepartment";
import Brand from "./pages/Inventory/Brand/Brand";
import Units from "./pages/Inventory/Units/Units";
import Products from "./pages/Inventory/Product/Products";
import Warehouse from "./pages/Inventory/Warehouse/Warehouse";
import Vendor from "./pages/Purchase/Vendor/Vendor";
import Customer from "./pages/Customer/Customer";
import SalePriceInquiry from "./pages/Customer/SalePriceInquiry";
import LPOList from "./pages/Purchase/LPO/lpo";
import PurchaseInvoices from "./pages/Purchase/Invoice/PurchaseInvoices";
import GRN from "./pages/Purchase/GRN/GRN";
import PaymentVoucher from "./pages/Purchase/Payment/PaymentVoucher";
import Employees from "./pages/HR/Emp_Role.jsx/Employees";
import SalaryPayments from "./pages/HR/SalaryPayment/SalaryPayments";
import SalaryAdvances from "./pages/HR/SalaryAdvance/SalaryAdvances";

import CustomerLedger from "./pages/Sales/CustomerLedger";
import Quotations from "./pages/Sales/Quotations";
import SalesOrders from "./pages/Sales/SalesOrders";
import ProformaInvoice from "./pages/Sales/ProformaInvoice";
import DeliveryNote from "./pages/Sales/DeliveryNote";
import SalesInvoice from "./pages/Sales/SalesInvoice";
import Ledger from "./pages/Financials/Ledger";
import SalesReturn from "./pages/Sales/SalesReturn";
import Payment from "./pages/Sales/Payment";
import JournalVoucher from "./pages/Financials/JournalVoucher";
import Expenses from "./pages/Financials/Expenses";
import Followups from "./pages/Customer/Followups";
import StockTransfer from "./pages/Inventory/StockTransfer/StockTransfer";
import BankReconciliation from "./pages/Financials/BankReconciliation";
import BarcodePrinter from "./pages/Inventory/Barcode/BarcodePrinter";
import ReceiptVoucher from "./pages/Financials/ReceiptVoucher";
import FinancialsPaymentVoucher from "./pages/Financials/PaymentVoucher";
import MyProfile from "./MyProfile/MyProfile";
import MySales from "./MyProfile/MySales";
import TasksActivities from "./MyProfile/TasksActivities";
import Messaging from "./pages/Customer/Messaging";
import TaxCompliance from "./pages/Financials/TaxCompliance";
import FinancialReports from "./pages/Financials/FinancialReports.tsx";
import FinancialConfig from "./pages/Financials/FinancialConfig";
import FinancialsPrintEmailTemplates from "./pages/Financials/FinancialsPrintEmailTemplates";
import PrintEmailTemplates from "./pages/Sales/PrintEmailTemplates";
import SalesSettings from "./pages/Sales/SalesSettings";
import POSSales from "./pages/Sales/POSSales";
import PurchasePrintEmailTemplates from "./pages/Purchase/PurchasePrintEmailTemplates";
import StockTaking from "./pages/Inventory/StockTaking/StockTaking";
import InventoryReports from "./pages/Inventory/Reports/InventoryReports.tsx";
import CompanySettings from "./pages/Settings/CompanySettings";
import DocumentNumbering from "./pages/Settings/DocumentNumbering";
import UserRoleConfig from "./pages/Settings/UserRoleConfig";
import BranchSetup from "./pages/Settings/BranchSetup";
import EmailSettings from "./pages/Settings/EmailSettings";
import BranchOutlets from "./pages/Enterprise/BranchOutlets";
import DataManagement from "./pages/Enterprise/DataManagement";
import SalesSummaryReport from "./pages/Sales/Reports/SalesSummaryReport";
import VendorsPurchasesReports from "./pages/Purchase/Reports/VendorsPurchasesReports.tsx";
import Notifications from "./pages/Notifications/Notifications";
// import Products from "./pages/Inventory/Product/Products";
// import Warehouse from "./pages/Inventory/Warehouse/Warehouse";
// import Quotations from "./pages/Sales/Quotations";
// import StockTaking from "./pages/Inventory/StockTaking/StockTaking";
// import SalesOrders from "./pages/Sales/SalesOrders";
// import SalesInvoices from "./pages/Sales/SalesInvoices";
// import SalesReturns from "./pages/Sales/SalesReturns";
// import SalesReturnDetail from "./pages/Sales/SalesReturnDetail";
// import VendorLedger from "./pages/Inventory/Purchases/VendorLedger";
// import LPO from "./pages/Inventory/Purchases/LOP";
// import PurchaseInvoice from "./pages/Inventory/Purchases/PurchaseInvoice";
// import PurchasePayment from "./pages/Inventory/Purchases/PurchasePayment";
// import GRV from "./pages/Inventory/Purchases/GRV";
// import StockIssueList from "./pages/Inventory/StockIssue/StockIssueList";
// import StockIssueForm from "./pages/Inventory/StockIssue/StockIssueForm";
// import StockIssueDetail from "./pages/Inventory/StockIssue/StockIssueDetail";
// import WarehouseStock from "./pages/Inventory/Warehouse/WarehouseStock";
// import DepartmentStock from "./pages/Inventory/Department/DepartmentStock";
// import Roles from "./pages/HR/Roles/Roles";
// import Salary from "./pages/HR/Roles/Salary";
// import Employees from "./pages/HR/Roles/Employees";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this._domErrorRetries = 0;
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App ErrorBoundary caught:', error, info);
    // Browser extensions (e.g. Adobe Acrobat) occasionally inject DOM nodes that
    // desync React's virtual DOM, producing transient removeChild / insertBefore
    // NotFoundErrors. These are recoverable — reset the boundary silently so the
    // user doesn't see the crash page.
    const isDomError =
      error?.name === 'NotFoundError' &&
      (error?.message?.includes('removeChild') || error?.message?.includes('insertBefore'));
    if (isDomError) {
      logClientEvent('warn', 'Recoverable browser DOM mutation error', {
        componentStack: info?.componentStack,
        errorName: error?.name,
        errorMessage: error?.message,
      });
    } else {
      logClientError('React ErrorBoundary caught', error, {
        componentStack: info?.componentStack,
      });
    }
    if (isDomError && this._domErrorRetries < 10) {
      this._domErrorRetries += 1;
      // Exponential back-off (50ms, 100ms, 200ms …) lets React fully finish its
      // current commit before we request a remount.
      const delay = Math.min(50 * Math.pow(2, this._domErrorRetries - 1), 1000);
      setTimeout(() => this.setState({ hasError: false, error: null }), delay);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#e53e3e' }}>Something went wrong</h2>
          <p style={{ color: '#718096', marginBottom: '16px' }}>{this.state.error?.message}</p>
          <button
            onClick={() => { this._domErrorRetries = 0; this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: '8px 20px', background: '#F5C742', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <BrowserRouter>
      <CompanyProvider>
        <BranchProvider>
        <AedSymbolRenderer />
        <AppAlertBridge />
        <Toaster position="top-right" reverseOrder={false} containerStyle={{ zIndex: 10000 }} />
        <SonnerToaster position="top-right" richColors />
        <Routes>
          {/* 🔓 Public Route */}
          <Route path="/login" element={<Login />} />

          {/* 🔐 Protected App */}
          <Route
            path="/*"
            element={
              <PrivateRoute>
                {/* PermissionProvider is inside PrivateRoute so it mounts
                    only when authenticated — useEffect fires with a valid
                    token and permissions load correctly on every login */}
                <PermissionProvider>
                <ErrorBoundary>
                <NotificationProvider>
                <Sidebar>
                  <Routes>
                    {/* Default redirect */}
                    <Route
                      path="/"
                      element={<Navigate to="/dashboard" replace />}
                    />

                    {/* Dashboard */}
                    <Route
                      path="/dashboard"
                      element={
                        <ResourceGuard module="dashboard">
                          <Dashboard />
                        </ResourceGuard>
                      }
                    />

                    {/* Temporary: QZ Tray printer test */}
                    <Route path="/printer-test" element={<PrinterTestButton />} />

                    {/* Module Dashboards */}
                    <Route path="/dashboard/bi" element={<React.Suspense fallback={null}><BIEngineDashboardV2 /></React.Suspense>} />
                    <Route path="/dashboard/customers" element={<React.Suspense fallback={null}><CustomersSalesDashboard /></React.Suspense>} />
                    <Route path="/dashboard/customer-connect" element={<React.Suspense fallback={null}><CustomerConnectDashboard /></React.Suspense>} />
                    <Route path="/dashboard/inventory" element={<React.Suspense fallback={null}><InventoryRegistriesDashboard /></React.Suspense>} />
                    <Route path="/dashboard/storefront" element={<React.Suspense fallback={null}><StorefrontAdminDashboard /></React.Suspense>} />
                    <Route path="/dashboard/vendors" element={<React.Suspense fallback={null}><VendorsPurchasesDashboard /></React.Suspense>} />

                    {/* Inventory -> Departments */}
                    <Route
                      path="/inventory/departments"
                      element={
                        <ResourceGuard module="inventory.category">
                          <Departments />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/subDepartments"
                      element={
                        <ResourceGuard module="inventory.category">
                          <SubDepartments />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/brands"
                      element={
                        <ResourceGuard module="inventory.category">
                          <Brand />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/units"
                      element={
                        <ResourceGuard module="inventory.category">
                          <Units />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/products"
                      element={
                        <ResourceGuard module="inventory.product">
                          <Products />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/warehouses"
                      element={
                        <ResourceGuard module="inventory.warehouse">
                          <Warehouse />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/stock-transfer"
                      element={
                        <ResourceGuard module="inventory.stock">
                          <StockTransfer />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/barcode"
                      element={
                        <ResourceGuard module="inventory.stock">
                          <BarcodePrinter />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/purchases/vendors"
                      element={
                        <ResourceGuard module="purchases.vendor">
                          <Vendor />
                        </ResourceGuard>
                      }
                    />
                    <Route
                      path="/customer/sale-price-inquiry"
                      element={
                        <ResourceGuard module="customer.inquiry">
                          <SalePriceInquiry />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/customer/inquiries"
                      element={
                        <ResourceGuard module="customer.inquiry">
                          <Customer />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/purchases/lpo"
                      element={
                        <ResourceGuard module="purchases.lpo">
                          <LPOList />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/purchases/invoice"
                      element={
                        <ResourceGuard module="purchases.invoice">
                          <PurchaseInvoices />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/purchases/grn"
                      element={
                        <ResourceGuard module="purchases.grn">
                          <GRN />
                        </ResourceGuard>
                      }
                    />



                    <Route
                      path="/purchases/payment"
                      element={
                        <ResourceGuard module="purchases.invoice">
                          <PaymentVoucher />
                        </ResourceGuard>
                      }
                    />
                    <Route
                      path="/purchases/templates"
                      element={
                        <ResourceGuard module="purchases.invoice">
                          <PurchasePrintEmailTemplates />
                        </ResourceGuard>
                      }
                    />



                    <Route
                      path="/payroll/employees"
                      element={
                        <ResourceGuard module="hr.employee">
                          <Employees />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/payroll/salary_payment"
                      element={
                        <ResourceGuard module="hr.payroll">
                          <SalaryPayments />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/payroll/salary_advance"
                      element={
                        <ResourceGuard module="hr.payroll">
                          <SalaryAdvances />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/customers"
                      element={
                        <ResourceGuard module="sales.customer">
                          <CustomerLedger />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/quotation"
                      element={
                        <ResourceGuard module="sales.quotation">
                          <Quotations />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/order"
                      element={
                        <ResourceGuard module="sales.order">
                          <SalesOrders />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/pro-forma"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <ProformaInvoice />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/deliverynote"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <DeliveryNote />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/invoice"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <SalesInvoice />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/return"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <SalesReturn />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/pos"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <POSSales />
                        </ResourceGuard>
                      }
                    />


                    <Route
                      path="/finance/ledger"
                      element={
                        <ResourceGuard module="finance.ledger">
                          <Ledger />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/receiptvoucher"
                      element={
                        <ResourceGuard module="finance.voucher">
                          <ReceiptVoucher />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/paymentvoucher"
                      element={
                        <ResourceGuard module="finance.voucher">
                          <FinancialsPaymentVoucher />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/journalvoucher"
                      element={
                        <ResourceGuard module="finance.voucher">
                          <JournalVoucher />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/Expenses"
                      element={
                        <ResourceGuard module="finance.voucher">
                          <Expenses />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/reconciliation"
                      element={
                        <ResourceGuard module="finance.reconcile">
                          <BankReconciliation />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/tax"
                      element={
                        <ResourceGuard module="finance.tax">
                          <TaxCompliance />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/reports"
                      element={
                        <ResourceGuard module="finance.tax">
                          <FinancialReports />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/config"
                      element={
                        <ResourceGuard module="finance.tax">
                          <FinancialConfig />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/finance/templates"
                      element={
                        <ResourceGuard module="finance.voucher">
                          <FinancialsPrintEmailTemplates />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/customer/followups"
                      element={
                        <ResourceGuard module="customer.followup">
                          <Followups />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/payment"
                      element={
                        <ResourceGuard module="sales.payment">
                          <Payment />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/customer/messaging"
                      element={
                        <ResourceGuard module="customer.message">
                          <Messaging />
                        </ResourceGuard>
                      }
                    />

                    <Route path="/notifications" element={<Notifications />} />

                    <Route path="/myprofile" element={<Navigate to="/myprofile/overview" replace />} />
                    <Route path="/myprofile/overview" element={<MyProfile />} />
                    <Route path="/myprofile/sales" element={<MySales />} />
                    <Route path="/myprofile/tasks" element={<TasksActivities />} />

                    <Route
                      path="/sales/templates"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <PrintEmailTemplates />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/settings"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <SalesSettings />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/stock-take"
                      element={
                        <ResourceGuard module="inventory.stock">
                          <StockTaking />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/inventory/reports"
                      element={
                        <ResourceGuard module="inventory.stock">
                          <InventoryReports />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/reports"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <SalesSummaryReport />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/sales/reports/summary"
                      element={
                        <ResourceGuard module="sales.invoice">
                          <SalesSummaryReport />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/purchases/reports/summary"
                      element={
                        <ResourceGuard module="purchases.invoice">
                          <VendorsPurchasesReports />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/settings/company"
                      element={
                        <ResourceGuard module="userManagement.setup">
                          <CompanySettings />
                        </ResourceGuard>
                      }
                    />

                    {/* Legacy redirects: Branches and User & Role Config moved into Enterprise Console */}
                    <Route
                      path="/settings/branches"
                      element={<Navigate to="/enterprise/branches" replace />}
                    />

                    <Route
                      path="/settings/roles"
                      element={<Navigate to="/enterprise/administration" replace />}
                    />

                    <Route
                      path="/enterprise/branches"
                      element={
                        <ResourceGuard module="userManagement.setup">
                          <BranchOutlets />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/enterprise/administration"
                      element={
                        <ResourceGuard module="userManagement.role">
                          <UserRoleConfig />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/enterprise/data-management"
                      element={
                        <ResourceGuard module="userManagement.setup">
                          <DataManagement />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/settings/email"
                      element={
                        <ResourceGuard module="userManagement.setup">
                          <EmailSettings />
                        </ResourceGuard>
                      }
                    />

                    <Route
                      path="/settings/document-numbering"
                      element={
                        <ResourceGuard module="userManagement.setup">
                          <DocumentNumbering />
                        </ResourceGuard>
                      }
                    />

                  </Routes>
                </Sidebar>
                </NotificationProvider>
                </ErrorBoundary>
                </PermissionProvider>
              </PrivateRoute>
            }
          />
        </Routes>
        </BranchProvider>
      </CompanyProvider>
    </BrowserRouter>
  );
}

export default App;
