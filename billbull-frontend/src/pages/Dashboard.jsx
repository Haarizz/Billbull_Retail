import { BillBullDashboard } from "./dashboards/billbull-dashboard";
import { useNavigate } from "react-router-dom";
import { billbullDashboardService } from "../api/billbull-dashboard-service";
import { navigateToEntity } from "../utils/entityNavigation";

// Kick off the summary fetch as soon as this module is evaluated —
// before the component even mounts — so the cache is warm on first render.
// Only runs when a session token exists to avoid unauthenticated 403s.
if (sessionStorage.getItem("token")) {
  billbullDashboardService.prefetch();
}

const Dashboard = () => {
    const navigate = useNavigate();

    // The route map itself now lives in utils/entityNavigation.js so the global
    // search modal navigates through exactly the same contract.
    const handleDashboardNavigate = (section, params = {}) =>
        navigateToEntity(navigate, section, params, { dashboardSource: true });

    return <BillBullDashboard onNavigate={handleDashboardNavigate} />;
};

export default Dashboard;
