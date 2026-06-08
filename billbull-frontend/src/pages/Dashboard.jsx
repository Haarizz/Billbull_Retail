import { BillBullDashboard } from "./dashboards/billbull-dashboard";
import { useNavigate } from "react-router-dom";
import { billbullDashboardService } from "../api/billbull-dashboard-service";

// Kick off the summary fetch as soon as this module is evaluated —
// before the component even mounts — so the cache is warm on first render.
billbullDashboardService.prefetch();

const Dashboard = () => {
    const navigate = useNavigate();

    const handleDashboardNavigate = (section, params = {}) => {
        const routeMap = {
            "new-sale": { path: "/sales/invoice", state: { openCreate: true } },
            "sales-invoices": { path: "/sales/invoice" },
            "sales-invoice-detail": { path: "/sales/invoice", state: { invoiceId: params.invoiceId } },
            "new-purchase": { path: "/purchases/invoice", state: { openCreate: true } },
            purchases: { path: "/purchases/invoice" },
            "lpo-detail": { path: "/purchases/lpo", state: { lpoNumber: params.lpoNumber } },
            "grn-detail": { path: "/purchases/grn", state: { grnId: params.grnId } },
            "quotation-detail": { path: "/sales/quotation", state: { quotationId: params.quotationId } },
            "add-product": { path: "/inventory/products", state: { openCreate: true } },
            "inventory-add-item": { path: "/inventory/products", state: { openCreate: true } },
            "inventory-product-detail": { path: "/inventory/products", state: { productId: params.productId } },
            "customers-add": { path: "/sales/customers", state: { openCreate: true } },
            "customer-ledger": { path: "/sales/customers", state: { customerId: params.customerId } },
            "stock-transfer": { path: "/inventory/stock-transfer", state: { openCreate: true } },
            "financials-dashboard": { path: "/finance/reports" },
            notifications: { path: "/notifications" },
        };

        const target = routeMap[section] || (section?.startsWith("/") ? { path: section } : null);
        if (!target) return;

        navigate(target.path, {
            state: {
                ...(target.state || {}),
                dashboardSource: true,
            },
        });
    };

    return <BillBullDashboard onNavigate={handleDashboardNavigate} />;
};

export default Dashboard;
