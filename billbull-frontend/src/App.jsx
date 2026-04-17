import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from 'react-hot-toast';

import Sidebar from "./layout/Sidebar";

// Pages
import Login from "./auth/login";
// import Customers from "./pages/Customer/Customers";
import Dashboard from "./pages/Dashboard";

// Route Guards
import PrivateRoute from "./auth/PrivateRoute";
import RoleRoute from "./auth/RoleRoute";
import { PermissionProvider } from "./context/PermissionContext";
import { CompanyProvider } from "./context/CompanyContext";// import CustomerInquiries from "./pages/Customer/CustomerInquiries";
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
import MyProfile from "./MyProfile/MyProfile";
import Messaging from "./pages/Customer/Messaging";
import TaxCompliance from "./pages/Financials/TaxCompliance";
import FinancialReports from "./pages/Financials/FinancialReports";
import FinancialConfig from "./pages/Financials/FinancialConfig";
import PrintEmailTemplates from "./pages/Sales/PrintEmailTemplates";
import SalesSettings from "./pages/Sales/SalesSettings";
import PurchasePrintEmailTemplates from "./pages/Purchase/PurchasePrintEmailTemplates";
import StockTaking from "./pages/Inventory/StockTaking/StockTaking";
import InventoryReports from "./pages/Inventory/Reports/InventoryReports";
import CompanySettings from "./pages/Settings/CompanySettings";
import UserRoleConfig from "./pages/Settings/UserRoleConfig";
import SalesSummaryReport from "./pages/Sales/Reports/SalesSummaryReport";
import PurchaseSummaryReport from "./pages/Purchase/Reports/PurchaseSummaryReport";
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
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#e53e3e' }}>Something went wrong</h2>
          <p style={{ color: '#718096', marginBottom: '16px' }}>{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
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
        <Toaster position="top-right" reverseOrder={false} />
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
                        <RoleRoute role="ADMIN|SALES">
                          <Dashboard />
                        </RoleRoute>
                      }
                    />

                    {/* Inventory -> Departments */}
                    <Route
                      path="/inventory/departments"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Departments />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/subDepartments"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SubDepartments />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/brands"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Brand />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/units"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Units />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/products"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Products />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/warehouses"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Warehouse />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/stock-transfer"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <StockTransfer />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/barcode"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <BarcodePrinter />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/purchases/vendors"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Vendor />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/customer/inquiries"
                      element={
                        <RoleRoute role="ADMIN|SALES">
                          <Customer />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/purchases/lpo"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <LPOList />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/purchases/invoice"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <PurchaseInvoices />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/purchases/grn"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <GRN />
                        </RoleRoute>
                      }
                    />



                    <Route
                      path="/purchases/payment"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <PaymentVoucher />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="/purchases/templates"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <PurchasePrintEmailTemplates />
                        </RoleRoute>
                      }
                    />



                    <Route
                      path="/payroll/employees"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Employees />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/payroll/salary_payment"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SalaryPayments />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/payroll/salary_advance"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SalaryAdvances />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/customers"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <CustomerLedger />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/quotation"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Quotations />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/order"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SalesOrders />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/pro-forma"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <ProformaInvoice />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/deliverynote"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <DeliveryNote />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/invoice"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SalesInvoice />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/return"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <SalesReturn />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/ledger"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <Ledger />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/receiptvoucher"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <ReceiptVoucher />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/journalvoucher"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <JournalVoucher />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/Expenses"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <Expenses />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/reconciliation"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <BankReconciliation />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/tax"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <TaxCompliance />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/reports"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <FinancialReports />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/finance/config"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT">
                          <FinancialConfig />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/customer/followups"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Followups />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/payment"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Payment />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/customer/messaging"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <Messaging />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/myprofile"
                      element={
                        <RoleRoute role="ADMIN|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR|SALES">
                          <MyProfile />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/templates"
                      element={
                        <RoleRoute role="ADMIN|SALES|SALES|INVENTORY_MANAGER|ACCOUNTANT|HR">
                          <PrintEmailTemplates />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/settings"
                      element={
                        <RoleRoute role="ADMIN">
                          <SalesSettings />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/stock-take"
                      element={
                        <RoleRoute role="ADMIN|INVENTORY_MANAGER">
                          <StockTaking />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/inventory/reports"
                      element={
                        <RoleRoute role="ADMIN|INVENTORY_MANAGER">
                          <InventoryReports />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/sales/reports/summary"
                      element={
                        <RoleRoute role="ADMIN|SALES|ACCOUNTANT">
                          <SalesSummaryReport />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/purchases/reports/summary"
                      element={
                        <RoleRoute role="ADMIN|ACCOUNTANT|INVENTORY_MANAGER">
                          <PurchaseSummaryReport />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/settings/company"
                      element={
                        <RoleRoute role="ADMIN">
                          <CompanySettings />
                        </RoleRoute>
                      }
                    />

                    <Route
                      path="/settings/roles"
                      element={
                        <RoleRoute role="ADMIN">
                          <UserRoleConfig />
                        </RoleRoute>
                      }
                    />

                  </Routes>
                </Sidebar>
                </ErrorBoundary>
                </PermissionProvider>
              </PrivateRoute>
            }
          />
        </Routes>
      </CompanyProvider>
    </BrowserRouter>
  );
}

export default App;
