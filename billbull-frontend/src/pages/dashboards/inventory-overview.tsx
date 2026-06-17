import React from "react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";

import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

import {
  Package,
  Layers,
  Boxes,
  ClipboardCheck,
  RefreshCw,
  Cog,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  Truck,
  FileText,
  Building2,
  Ruler,
  BarChart2
} from "lucide-react";


// -----------------------------------------------
// KPI MOCK DATA (Replace with API later)
// -----------------------------------------------
const kpis = [
  {
    id: "skus",
    title: "Total Active SKUs",
    value: "1,248",
    subtitle: "+18 added this week",
    icon: Package,
  },
  {
    id: "stockValue",
    title: "Stock Value (On Hand)",
    value: "AED 1,245,600",
    subtitle: "At landing cost",
    icon: DollarSign,
  },
  {
    id: "lowStock",
    title: "Low / Reorder Items",
    value: "34",
    subtitle: "12 critical (0 stock)",
    icon: TrendingDown,
  },
  {
    id: "expiryAlerts",
    title: "Expiry Alerts",
    value: "21",
    subtitle: "Next 30 days",
    icon: AlertTriangle,
  },
];


// -----------------------------------------------
// SECTIONS CONFIG â€“ For Masters, Operations, Controls, Config
// -----------------------------------------------
const sections = [
  {
    id: "masters",
    title: "Masters & Registries",
    description: "Maintain item structures, price lists, units and categories.",
    icon: Layers,
    items: [
      {
        label: "Products & Services",
        description: "Item master, SKU, barcodes, pricing, tax & image.",
        navId: "inventory-products-services",
        primary: "New Product",
      },
      {
        label: "Departments",
        description: "Manage item departments.",
        navId: "inventory-departments",
      },
      {
        label: "Sub Departments",
        description: "Define item sub-categories.",
        navId: "inventory-sub-departments",
      },
      {
        label: "Brands",
        description: "Brand management for items.",
        navId: "inventory-brands",
      },
      {
        label: "Units & Packings",
        description: "Base unit, packs, conversions.",
        navId: "inventory-units",
      },
      {
        label: "Warehouses",
        description: "Define warehouses, showrooms & stock locations.",
        navId: "inventory-warehouses",
      },
    ],
  },

  {
    id: "operations",
    title: "Stock Operations",
    description: "Daily stock entries, transfers and adjustments.",
    icon: Boxes,
    items: [
      {
        label: "Stock Transfer",
        description: "Transfer stock between warehouses.",
        navId: "inventory-stock-transfer",
      },
      {
        label: "Stock In / Stock Out",
        description: "Manual adjustments with reasons.",
        navId: "inventory-stock-in-out",
      },
      {
        label: "Packings & Item Transfer",
        description: "Packing conversion & item repacking.",
        navId: "inventory-packings-item-transfer",
      },
      {
        label: "Internal Wastage",
        description: "Record damaged / wasted stock.",
        navId: "inventory-internal-wastage",
      },
      {
        label: "Internal Consumption",
        description: "Stock consumed internally.",
        navId: "inventory-internal-consumption",
      },
      {
        label: "Weighing Scale Files",
        description: "Generate scale upload files.",
        navId: "inventory-weighing-scale-files",
      },
    ],
  },

  {
    id: "controls",
    title: "Controls, Batches & Audits",
    description: "Expiry tracking, physical stock counts & location mapping.",
    icon: ClipboardCheck,
    items: [
      {
        label: "Stock Taking",
        description: "Cycle count, audits & variance reports.",
        navId: "inventory-stock-taking",
      },
      {
        label: "Stock Reconciliation",
        description: "Post physical quantity adjustments.",
        navId: "inventory-stock-reconciliation",
      },
      {
        label: "Locator & Bin Mapping",
        description: "Warehouse â†’ Zone â†’ Locator â†’ Bin.",
        navId: "inventory-locator-bin",
      },
      {
        label: "Price Levels",
        description: "Branch-wise price lists & special prices.",
        navId: "inventory-price-levels",
      },
    ],
  },

  {
    id: "config",
    title: "Configure & Customize",
    description: "Inventory settings, automation rules & templates.",
    icon: Cog,
    items: [
      {
        label: "Inventory Settings",
        description: "Negative stock, costing method, posting rules.",
        navId: "inventory-settings",
      },
      {
        label: "Document Numbering",
        description: "Prefix & running numbers for inventory docs.",
        navId: "inventory-doc-numbering",
      },
      {
        label: "Barcode Print & Design",
        description: "Label design & batch printing.",
        navId: "inventory-barcode-print-design",
      },
      {
        label: "Reports & Analytics",
        description: "Stock movement, valuation & age analysis.",
        navId: "inventory-reports",
      },
    ],
  },
];


// -----------------------------------------------
// ALERTS & RECENT ACTIVITY (Static for now)
// -----------------------------------------------
const alerts = [
  "12 items below reorder level",
  "8 batches expiring in next 15 days",
  "3 products have negative stock",
  "4 stock transfers pending approval",
];

const recentActivity = [
  { doc: "GRN-00245", type: "Goods Receipt", warehouse: "Main Warehouse", time: "Today 14:09" },
  { doc: "STR-00088", type: "Stock Transfer", warehouse: "Showroom 1", time: "Today 11:42" },
  { doc: "ADJ-00122", type: "Stock Adjustment", warehouse: "Main Warehouse", time: "Yesterday" },
];


// -----------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------
interface InventoryOverviewProps {
  onNavigate?: (section: string) => void;
}

export function InventoryOverview({ onNavigate }: InventoryOverviewProps) {
  const handleNavigation = (navId: string) => {
    if (onNavigate) {
      onNavigate(navId);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-6 space-y-8">

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#1E293B]">
            Inventory & Registries
          </h1>
          <p className="text-sm text-gray-600">
            Products, stock movements, batches, locations & warehouse operations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
            onClick={() => handleNavigation("inventory-products-services")}
          >
            + Add New Product
          </Button>

          <Button variant="outline">
            Switch Warehouse
          </Button>
        </div>
      </div>


      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {kpis.map((k) => (
          <Card
            key={k.id}
            className="border-l-4 border-l-[#F5C742] bg-white shadow-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#1E293B] text-lg">{k.title}</CardTitle>
              <k.icon className="h-7 w-7 text-[#F5C742]" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[#1E293B] mb-1">{k.value}</p>
              <p className="text-sm text-gray-600">{k.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>


      {/* MAIN GRID: LEFT â†’ Sections / RIGHT â†’ Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* LEFT SIDE â€“ SECTIONS */}
        <div className="xl:col-span-2 space-y-6">
          {sections.map((section) => (
            <Card key={section.id} className="bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <section.icon className="h-5 w-5 text-[#F5C742]" />
                  <CardTitle className="text-xl text-[#1E293B]">{section.title}</CardTitle>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    onClick={() => handleNavigation(item.navId)}
                    className="p-4 bg-[#F7F7FA] border border-gray-200 rounded-lg hover:bg-[#FFF8DA] cursor-pointer transition flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-medium text-[#1E293B]">{item.label}</h4>
                      <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                    </div>

                    {item.primary && (
                      <Button
                        className="bg-[#F5C742] text-black hover:bg-[#e8bb3c]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigation(item.navId);
                        }}
                      >
                        {item.primary}
                      </Button>
                    )}

                    {!item.primary && (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>


        {/* RIGHT SIDE â€“ ALERTS + ACTIVITY */}
        <div className="space-y-6">

          {/* ALERTS */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <CardTitle className="text-[#1E293B]">Alerts & Exceptions</CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{a}</span>
                </div>
              ))}
            </CardContent>
          </Card>


          {/* RECENT ACTIVITY */}
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-[#F5C742]" />
                <CardTitle className="text-[#1E293B]">Recent Inventory Activity</CardTitle>
              </div>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F7F7FA]">
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {recentActivity.map((r, idx) => (
                    <TableRow key={idx} className="hover:bg-[#FFF8DA]">
                      <TableCell>{r.doc}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{r.warehouse}</TableCell>
                      <TableCell>{r.time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

      </div>

    </div>
  );
}

export default InventoryOverview;

