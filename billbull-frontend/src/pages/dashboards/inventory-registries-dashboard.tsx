import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  PackageX,
  ClipboardCheck,
  RefreshCw,
  Plus,
  Printer,
  Download,
  Settings,
  Calendar,
  Clock,
  ArrowRightLeft,
  Trash2,
  Boxes,
  BarChart3,
  ShoppingCart,
  TrendingUp,
  CheckCircle,
  XCircle,
  Edit,
  ChevronRight,
  Layers,
  PackageOpen,
  PackagePlus,
  FileText,
  AlertCircle,
} from "lucide-react";

interface InventoryRegistriesDashboardProps {
  onNavigate?: (section: string) => void;
}

// -----------------------------------------------
// KPI DATA
// -----------------------------------------------
const kpis = [
  {
    id: "total-products",
    title: "Total Products",
    value: "3,487",
    subtitle: "Active SKUs",
    icon: Package,
  },
  {
    id: "active-batches",
    title: "Active Batches",
    value: "1,243",
    subtitle: "In circulation",
    icon: Boxes,
  },
  {
    id: "near-expiry",
    title: "Items Near Expiry",
    value: "28",
    subtitle: "Within 30 days",
    icon: AlertTriangle,
    alert: true,
  },
  {
    id: "out-of-stock",
    title: "Items Out of Stock",
    value: "42",
    subtitle: "Reorder required",
    icon: PackageX,
    alert: true,
  },
  {
    id: "upcoming-grn",
    title: "Upcoming GRN / Arrivals",
    value: "18",
    subtitle: "Expected this week",
    icon: PackagePlus,
  },
  {
    id: "pending-transfers",
    title: "Pending Stock Transfers",
    value: "9",
    subtitle: "Awaiting approval",
    icon: ArrowRightLeft,
  },
  {
    id: "pending-wastage",
    title: "Pending Wastage Approvals",
    value: "5",
    subtitle: "Requires action",
    icon: Trash2,
    alert: true,
  },
];

// -----------------------------------------------
// ITEMS NEAR EXPIRY DATA
// -----------------------------------------------
const itemsNearExpiry = [
  {
    product: "Organic Milk 1L",
    batch: "BTH-2024-1045",
    expiry: "15 Dec 2024",
    daysLeft: 5,
    qty: 48,
    warehouse: "Main Warehouse",
    alert: "critical",
  },
  {
    product: "Fresh Cream 200ml",
    batch: "BTH-2024-1123",
    expiry: "18 Dec 2024",
    daysLeft: 8,
    qty: 24,
    warehouse: "Store A",
    alert: "warning",
  },
  {
    product: "Yogurt Pack 4x125g",
    batch: "BTH-2024-1089",
    expiry: "22 Dec 2024",
    daysLeft: 12,
    qty: 36,
    warehouse: "Main Warehouse",
    alert: "warning",
  },
  {
    product: "Cheese Slice 200g",
    batch: "BTH-2024-0998",
    expiry: "25 Dec 2024",
    daysLeft: 15,
    qty: 18,
    warehouse: "Store B",
    alert: "info",
  },
  {
    product: "Butter Salted 250g",
    batch: "BTH-2024-1201",
    expiry: "28 Dec 2024",
    daysLeft: 18,
    qty: 30,
    warehouse: "Main Warehouse",
    alert: "info",
  },
];

// -----------------------------------------------
// NEWLY ADDED STOCK DATA
// -----------------------------------------------
const newlyAddedStock = [
  {
    grnNo: "GRN-2024-345",
    supplier: "ABC Traders LLC",
    date: "08 Dec 2024",
    items: 24,
    qty: 480,
    costVariation: "+2.5%",
    receivedBy: "Ahmed K.",
  },
  {
    grnNo: "GRN-2024-344",
    supplier: "Fresh Foods Co",
    date: "07 Dec 2024",
    items: 18,
    qty: 360,
    costVariation: "â€”",
    receivedBy: "Sarah M.",
  },
  {
    grnNo: "GRN-2024-343",
    supplier: "Emirates Wholesale",
    date: "06 Dec 2024",
    items: 32,
    qty: 640,
    costVariation: "-1.2%",
    receivedBy: "Mohammed R.",
  },
  {
    grnNo: "GRN-2024-342",
    supplier: "Global Supplies",
    date: "05 Dec 2024",
    items: 15,
    qty: 300,
    costVariation: "+3.8%",
    receivedBy: "Fatima A.",
  },
];

// -----------------------------------------------
// WAREHOUSE ACTIVITY TIMELINE DATA
// -----------------------------------------------
const activityTimeline = [
  {
    time: "2 hours ago",
    type: "transfer",
    description: "Stock transfer from Main Warehouse to Store A",
    details: "24 items transferred",
    icon: ArrowRightLeft,
    color: "text-blue-600",
  },
  {
    time: "4 hours ago",
    type: "grn",
    description: "GRN-2024-345 received from ABC Traders",
    details: "480 units added",
    icon: PackagePlus,
    color: "text-green-600",
  },
  {
    time: "5 hours ago",
    type: "adjustment",
    description: "Stock adjustment in Electronics dept",
    details: "8 items adjusted",
    icon: Edit,
    color: "text-orange-600",
  },
  {
    time: "Yesterday",
    type: "wastage",
    description: "Wastage entry approved",
    details: "12 expired items removed",
    icon: Trash2,
    color: "text-red-600",
  },
  {
    time: "Yesterday",
    type: "consumption",
    description: "Internal consumption for demo units",
    details: "5 items consumed",
    icon: Package,
    color: "text-purple-600",
  },
  {
    time: "2 days ago",
    type: "packing",
    description: "12 packs of Milk 1L x 6 created",
    details: "Repackaging operation",
    icon: Boxes,
    color: "text-indigo-600",
  },
];

// -----------------------------------------------
// PACKINGS & TRANSFERS DATA
// -----------------------------------------------
const packingsTransfers = [
  {
    date: "08 Dec",
    operation: "12 Packs of 'Milk 1L x 6' created from master stock",
    source: "Bulk Stock",
    converted: "Retail Packs",
    qtyConsumed: 72,
    qtyProduced: 12,
    costImpact: "Neutral",
  },
  {
    date: "07 Dec",
    operation: "4 Packs broken into single units",
    source: "Retail Packs",
    converted: "Single Units",
    qtyConsumed: 4,
    qtyProduced: 24,
    costImpact: "Neutral",
  },
  {
    date: "06 Dec",
    operation: "Bulk pasta divided into 500g packs",
    source: "10kg Bulk",
    converted: "500g Units",
    qtyConsumed: 50,
    qtyProduced: 100,
    costImpact: "+AED 120",
  },
];

// -----------------------------------------------
// SCHEDULED STOCK TAKING DATA
// -----------------------------------------------
const scheduledStockTaking = [
  {
    title: "Store-wide physical count",
    date: "28 Dec 2024",
    status: "scheduled",
    assignedTo: "Team A",
  },
  {
    title: "Electronics department cycle count",
    date: "Tomorrow",
    status: "urgent",
    assignedTo: "Ahmed K.",
  },
  {
    title: "Warehouse Zone A recount",
    date: "Pending",
    status: "pending",
    assignedTo: "Unassigned",
  },
];

// -----------------------------------------------
// WASTAGE & CONSUMPTION DATA
// -----------------------------------------------
const wastageData = {
  today: 8,
  thisMonth: 142,
  trend: "+15%",
  topItems: [
    { name: "Organic Milk 1L", qty: 24 },
    { name: "Fresh Bread", qty: 18 },
    { name: "Yogurt Cups", qty: 16 },
    { name: "Cheese Slices", qty: 12 },
    { name: "Fresh Cream", qty: 10 },
  ],
};

// -----------------------------------------------
// LOW STOCK ALERTS DATA
// -----------------------------------------------
const lowStockAlerts = [
  { product: "Premium Coffee Beans 1kg", current: 8, minimum: 20, status: "critical" },
  { product: "Tea Bags Premium 100s", current: 15, minimum: 30, status: "warning" },
  { product: "Sugar White 1kg", current: 22, minimum: 50, status: "warning" },
  { product: "Olive Oil Extra Virgin 1L", current: 12, minimum: 25, status: "warning" },
];

// -----------------------------------------------
// SLOW MOVING STOCK DATA
// -----------------------------------------------
const slowMovingStock = [
  { product: "Exotic Spice Mix", lastSale: "58 days ago", qty: 45, value: "AED 1,350" },
  { product: "Premium Vinegar Bottle", lastSale: "42 days ago", qty: 28, value: "AED 840" },
  { product: "Specialty Sauce 500ml", lastSale: "35 days ago", qty: 18, value: "AED 540" },
];

// -----------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------
export function InventoryRegistriesDashboard({ onNavigate }: InventoryRegistriesDashboardProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState("Main Warehouse");

  const handleNavigation = (navId: string) => {
    if (onNavigate) {
      onNavigate(navId);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-6 space-y-6">
      
      {/* HERO HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#1E293B]">
            Inventory & Registries
          </h1>
          <p className="text-sm text-gray-600">
            Overview of stock health, activities & upcoming actions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select 
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
          >
            <option>Main Warehouse</option>
            <option>Store A</option>
            <option>Store B</option>
            <option>Warehouse 2</option>
          </select>

          <Button variant="outline" className="text-sm">
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>

          <Button variant="outline" className="text-sm">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>

          <Button variant="outline" className="text-sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* QUICK ACTION BUTTONS */}
      <div className="flex items-center gap-3">
        <Button
          className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
          onClick={() => handleNavigation("inventory-products-services")}
        >
          <Plus className="h-4 w-4 mr-1" />
          Create Item
        </Button>

        <Button
          className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
          onClick={() => handleNavigation("inventory-stock-transfer")}
        >
          <ArrowRightLeft className="h-4 w-4 mr-1" />
          Create Stock Transfer
        </Button>

        <Button
          className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
          onClick={() => handleNavigation("inventory-stock-taking")}
        >
          <ClipboardCheck className="h-4 w-4 mr-1" />
          Start Stock Taking
        </Button>

        <Button
          className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
          onClick={() => handleNavigation("vendors-purchases-grn")}
        >
          <PackagePlus className="h-4 w-4 mr-1" />
          Add GRN
        </Button>
      </div>

      {/* KPI SUMMARY STRIP */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.id}
            className={`border-l-4 ${kpi.alert ? 'border-l-red-500' : 'border-l-[#F5C742]'} bg-white shadow-sm`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[#1E293B]">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.alert ? 'text-red-500' : 'text-[#F5C742]'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1E293B]">{kpi.value}</div>
              <p className="text-xs text-gray-600 mt-1">{kpi.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ITEMS NEAR EXPIRY & UPCOMING GRN ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ITEMS NEAR EXPIRY */}
        <Card className="bg-white shadow-sm border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Items Near Expiry
            </CardTitle>
            <CardDescription>Products approaching expiration date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {itemsNearExpiry.slice(0, 4).map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    item.alert === "critical"
                      ? "bg-red-50 border-red-200"
                      : item.alert === "warning"
                      ? "bg-orange-50 border-orange-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm text-[#1E293B]">{item.product}</div>
                      <div className="text-xs text-gray-600">Batch: {item.batch}</div>
                    </div>
                    <Badge
                      className={
                        item.alert === "critical"
                          ? "bg-red-200 text-red-800"
                          : item.alert === "warning"
                          ? "bg-orange-200 text-orange-800"
                          : "bg-yellow-200 text-yellow-800"
                      }
                    >
                      {item.daysLeft} days
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Qty: {item.qty}</span>
                    <span>{item.warehouse}</span>
                    <span>Exp: {item.expiry}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      View Batch
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Clearance Price
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-reports")}
            >
              View All Expiring Items <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* UPCOMING GRN / INCOMING STOCK */}
        <Card className="bg-white shadow-sm border-l-4 border-l-[#F5C742]">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-[#F5C742]" />
              Upcoming GRN / Incoming Stock
            </CardTitle>
            <CardDescription>Expected arrivals this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { lpo: "LPO-2024-445", supplier: "ABC Traders", items: 32, eta: "Tomorrow", qty: 640 },
                { lpo: "LPO-2024-448", supplier: "Fresh Foods", items: 18, eta: "12 Dec", qty: 360 },
                { lpo: "LPO-2024-451", supplier: "Emirates Wholesale", items: 24, eta: "13 Dec", qty: 480 },
                { lpo: "LPO-2024-453", supplier: "Global Supplies", items: 15, eta: "14 Dec", qty: 300 },
              ].map((grn, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm text-[#1E293B]">{grn.lpo}</div>
                    <Badge className="bg-green-100 text-green-700">{grn.eta}</Badge>
                  </div>
                  <div className="text-xs text-gray-600 mb-1">{grn.supplier}</div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{grn.items} items</span>
                    <span>{grn.qty} units</span>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("vendors-purchases-grn")}
            >
              View GRN Register <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* NEWLY ADDED STOCK & WAREHOUSE ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* NEWLY ADDED STOCK */}
        <Card className="bg-white shadow-sm border-l-4 border-l-[#F5C742]">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-[#F5C742]" />
              Newly Added Stock (Last 7 Days)
            </CardTitle>
            <CardDescription>Recent inbound stock activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {newlyAddedStock.map((stock, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F7F7FA] rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm text-[#1E293B]">{stock.grnNo}</div>
                    <div className="text-xs text-gray-600">{stock.date}</div>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">{stock.supplier}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{stock.items} items â€¢ {stock.qty} units</span>
                    <div className="flex items-center gap-2">
                      {stock.costVariation !== "â€”" && (
                        <Badge
                          className={
                            stock.costVariation.startsWith("+")
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }
                        >
                          {stock.costVariation}
                        </Badge>
                      )}
                      <span className="text-gray-500">By: {stock.receivedBy}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("vendors-purchases-grn")}
            >
              View Full GRN Register <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* WAREHOUSE ACTIVITY TIMELINE */}
        <Card className="bg-white shadow-sm border-l-4 border-l-[#F5C742]">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[#F5C742]" />
              Warehouse Activity Timeline
            </CardTitle>
            <CardDescription>Recent inventory operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activityTimeline.map((activity, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`p-2 rounded-full bg-gray-100 ${activity.color}`}>
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#1E293B]">{activity.description}</div>
                    <div className="text-xs text-gray-600 mt-1">{activity.details}</div>
                    <div className="text-xs text-gray-500 mt-1">{activity.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PACKINGS & STOCK TAKING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PACKINGS & ITEM TRANSFERS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-[#F5C742]">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Boxes className="h-5 w-5 text-[#F5C742]" />
              Packings & Item Transfers
            </CardTitle>
            <CardDescription>Packaging operations & UOM conversions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {packingsTransfers.map((pack, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F7F7FA] rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs">{pack.date}</Badge>
                    <Badge
                      className={
                        pack.costImpact === "Neutral"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-blue-100 text-blue-700"
                      }
                    >
                      {pack.costImpact}
                    </Badge>
                  </div>
                  <div className="text-sm text-[#1E293B] mb-2">{pack.operation}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium">Source:</span> {pack.source}
                    </div>
                    <div>
                      <span className="font-medium">Converted:</span> {pack.converted}
                    </div>
                    <div>
                      <span className="font-medium">Consumed:</span> {pack.qtyConsumed}
                    </div>
                    <div>
                      <span className="font-medium">Produced:</span> {pack.qtyProduced}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-packings-item-transfer")}
            >
              View All Packing Operations <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* SCHEDULED STOCK TAKING */}
        <Card className="bg-white shadow-sm border-l-4 border-l-[#F5C742]">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#F5C742]" />
              Scheduled Stock Taking & Notifications
            </CardTitle>
            <CardDescription>Planned physical inventories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledStockTaking.map((schedule, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    schedule.status === "urgent"
                      ? "bg-red-50 border-red-200"
                      : schedule.status === "scheduled"
                      ? "bg-green-50 border-green-200"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm text-[#1E293B]">{schedule.title}</div>
                    <Badge
                      className={
                        schedule.status === "urgent"
                          ? "bg-red-200 text-red-800"
                          : schedule.status === "scheduled"
                          ? "bg-green-200 text-green-800"
                          : "bg-gray-200 text-gray-800"
                      }
                    >
                      {schedule.date}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    Assigned to: {schedule.assignedTo}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Start Now
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Postpone
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Notify Staff
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-stock-taking")}
            >
              Manage Stock Taking <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* WASTAGE, LOW STOCK & SLOW MOVING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* INTERNAL WASTAGE & CONSUMPTION */}
        <Card className="bg-white shadow-sm border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Wastage & Consumption
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-xs text-gray-600 mb-1">Today</div>
                  <div className="text-2xl font-bold text-[#1E293B]">{wastageData.today}</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-xs text-gray-600 mb-1">This Month</div>
                  <div className="text-2xl font-bold text-[#1E293B]">{wastageData.thisMonth}</div>
                </div>
              </div>

              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-xs font-medium text-red-700 mb-1">Trend vs Last Month</div>
                <div className="text-lg font-bold text-red-700">{wastageData.trend}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-[#1E293B] mb-2">Top 5 Wasted Items</div>
                <div className="space-y-2">
                  {wastageData.topItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{item.name}</span>
                      <Badge variant="outline" className="bg-red-50">{item.qty} units</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-internal-wastage")}
            >
              View Wastage Reports <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* LOW STOCK ALERTS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-orange-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>Items requiring replenishment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    alert.status === "critical"
                      ? "bg-red-50 border-red-200"
                      : "bg-orange-50 border-orange-200"
                  }`}
                >
                  <div className="text-sm font-medium text-[#1E293B] mb-2">{alert.product}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Current: {alert.current}</span>
                    <span className="text-gray-600">Min: {alert.minimum}</span>
                    <Badge
                      className={
                        alert.status === "critical"
                          ? "bg-red-200 text-red-800"
                          : "bg-orange-200 text-orange-800"
                      }
                    >
                      {alert.status}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        alert.status === "critical" ? "bg-red-500" : "bg-orange-500"
                      }`}
                      style={{ width: `${(alert.current / alert.minimum) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-reports")}
            >
              Create Purchase Order <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* SLOW MOVING STOCK */}
        <Card className="bg-white shadow-sm border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-purple-500" />
              Slow Moving Stock
            </CardTitle>
            <CardDescription>Items with low turnover</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {slowMovingStock.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-purple-50 border border-purple-200 rounded-lg"
                >
                  <div className="text-sm font-medium text-[#1E293B] mb-2">{item.product}</div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                    <span>Last sale: {item.lastSale}</span>
                    <Badge className="bg-purple-200 text-purple-800">{item.qty} units</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-purple-700">Value: {item.value}</span>
                    <Button variant="link" className="text-xs h-auto p-0 text-[#F5C742]">
                      Apply Discount
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="text-[#F5C742] p-0 h-auto mt-4"
              onClick={() => handleNavigation("inventory-analytics")}
            >
              View Stock Analytics <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ADDITIONAL ALERTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* NEGATIVE STOCK ALERTS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Negative Stock Alerts
            </CardTitle>
            <CardDescription>Items requiring reconciliation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { product: "Premium Tea 100g", qty: -8, warehouse: "Store A" },
                { product: "Coffee Beans 500g", qty: -5, warehouse: "Main Warehouse" },
                { product: "Sugar Packets", qty: -12, warehouse: "Store B" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-[#1E293B]">{item.product}</div>
                    <div className="text-xs text-gray-600">{item.warehouse}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-200 text-red-800">{item.qty} units</Badge>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Reconcile
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* PRICE VARIANCE ALERTS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-yellow-500">
          <CardHeader>
            <CardTitle className="text-[#1E293B] flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-yellow-600" />
              Price Variance Alerts
            </CardTitle>
            <CardDescription>Purchase cost changes beyond threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { product: "Olive Oil 1L", oldPrice: "AED 45", newPrice: "AED 52", change: "+15.5%" },
                { product: "Rice 5kg", oldPrice: "AED 28", newPrice: "AED 32", change: "+14.3%" },
                { product: "Pasta 500g", oldPrice: "AED 8", newPrice: "AED 10", change: "+25%" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-[#1E293B]">{item.product}</div>
                    <Badge className="bg-red-200 text-red-800">{item.change}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Previous: {item.oldPrice}</span>
                    <span>Current: {item.newPrice}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

export default InventoryRegistriesDashboard;

