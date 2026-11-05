import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Price Levels workspace (Figma redesign): summary cards, the product × level matrix with margins,
// editing a cell, the low-margin filter, bulk update preview → apply, the customer price list tab
// and the Excel import parser.

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
vi.mock("@billbull/shared/api/pricingApi", () => ({
  listPriceLevels: vi.fn(),
  getPricingSummary: vi.fn(),
  getPricingRules: vi.fn(),
  savePricingRules: vi.fn(),
  getPriceMatrix: vi.fn(),
  upsertProductLevelPrices: vi.fn(),
  bulkUpdateLevelPrices: vi.fn(),
  importLevelPrices: vi.fn(),
  getProductPriceHistory: vi.fn(),
  listCustomerPriceRows: vi.fn(),
  createCustomerPrice: vi.fn(),
  updateCustomerPrice: vi.fn(),
  setCustomerPriceEnabled: vi.fn(),
  discontinueCustomerPrice: vi.fn(),
  deleteCustomerPrice: vi.fn(),
  getCustomerEffectivePrices: vi.fn(),
  listLevelCustomers: vi.fn(),
  listCustomerGroups: vi.fn(),
  assignLevelToCustomers: vi.fn(),
  bulkCustomerPrices: vi.fn(),
  copyCustomerPrices: vi.fn(),
  createPriceLevel: vi.fn(),
  updatePriceLevel: vi.fn(),
  setPriceLevelActive: vi.fn(),
  getQuantityTiers: vi.fn(),
  listTieredProducts: vi.fn(),
  resolvePrices: vi.fn(),
  createQuantityTier: vi.fn(),
  updateQuantityTier: vi.fn(),
  setQuantityTierActive: vi.fn(),
}));
vi.mock("@billbull/shared/api/departmentsApi", () => ({ getDepartments: vi.fn().mockResolvedValue([{ id: 5, name: "Electronics" }]) }));
vi.mock("@billbull/shared/api/brandsApi", () => ({ getBrands: vi.fn().mockResolvedValue([{ id: 7, name: "Samsung" }]) }));
vi.mock("@billbull/shared/api/customerledgerApi", () => ({ searchCustomersAllFields: vi.fn().mockResolvedValue([]) }));
vi.mock("@billbull/shared/api/productsApi", () => ({ getProductsList: vi.fn().mockResolvedValue({ content: [] }) }));
vi.mock("@billbull/shared/hooks/useCustomerPricingStatus", () => ({ clearCustomerPricingStatusCache: vi.fn() }));
vi.mock("@billbull/shared/context/BranchContext", () => ({
  useBranch: () => ({ branches: [{ id: 1, name: "Main" }, { id: 2, name: "Airport" }], isAllBranches: true, activeBranchId: "ALL" }),
}));
vi.mock("@billbull/shared/context/CompanyContext", () => ({ useCompany: () => ({ company: { currency: "AED" } }) }));
const perms = { edit: true };
vi.mock("@billbull/shared/context/PermissionContext", () => ({
  usePermissions: () => ({ canView: () => true, canEdit: () => perms.edit, canDelete: () => perms.edit }),
}));

import * as api from "@billbull/shared/api/pricingApi";
import PricingWorkspace from "../PricingWorkspace";
import { cellFor } from "../PriceMatrixTab";
import { sheetToImportRows } from "../ToolDialogs";

const LEVELS = [
  { id: 1, name: "Retail", code: "RETAIL", systemDefault: true, active: true, productPriceCount: 0, quantityTierCount: 0 },
  { id: 2, name: "Wholesale", code: "WHOLESALE", systemDefault: false, active: true, productPriceCount: 1, quantityTierCount: 0 },
  { id: 3, name: "VIP", code: "VIP", systemDefault: false, active: true, productPriceCount: 0, quantityTierCount: 0 },
];
const PHONE = {
  id: 10, code: "SAM-S23", name: "Samsung Galaxy S23", cost: 2500, basePrice: 3299, baseMarginPercent: 24.22,
  prices: [
    { priceLevelId: 2, branchId: null, price: 3100, marginPercent: 19.35 },
    { priceLevelId: 2, branchId: 1, price: 3050, marginPercent: 18.03 },
  ],
};
const SUMMARY = {
  activeLevels: 3, totalLevels: 3, customerPriceLists: 1, customersOnLevels: 4, customerPrices: 7, customersWithPrices: 2,
  marginAlerts: 18, customerPricesBelowCost: 1, minMarginPercent: 15, costVisible: true, customersByLevel: { 2: 4 },
};
const OVERRIDE = {
  id: 11, customerId: 501, customerCode: "TMS", customerName: "Tech Mega Store", productId: 10, productCode: "SAM-S23",
  productName: "Samsung Galaxy S23", branchId: null, price: 2300, effectiveFrom: "2026-10-01", effectiveTo: null, enabled: true,
  status: "CURRENT", cost: 2500, basePrice: 3299, marginPercent: -8.7, discountPercent: 30.28, belowCost: true,
};
const page = (content) => ({ content, totalElements: content.length, totalPages: 1, costVisible: true, minMarginPercent: 15 });

describe("PricingWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.edit = true;
    api.listPriceLevels.mockResolvedValue(LEVELS);
    api.getPricingSummary.mockResolvedValue(SUMMARY);
    api.getPricingRules.mockResolvedValue({ minMarginPercent: 15, blockBelowCost: false, roundTo: 0.01 });
    api.getPriceMatrix.mockResolvedValue(page([PHONE]));
    api.listCustomerPriceRows.mockResolvedValue(page([OVERRIDE]));
    api.upsertProductLevelPrices.mockResolvedValue([]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the summary cards and the price matrix with margins and default fallbacks", async () => {
    render(<PricingWorkspace />);
    const row = await screen.findByTestId("matrix-row-10");
    expect(within(screen.getByTestId("stat-alerts")).getByText("18")).toBeTruthy();
    expect(within(screen.getByTestId("stat-overrides")).getByText("7")).toBeTruthy();
    // Wholesale is set (all branches); VIP has no price so it shows the default price, greyed.
    expect(within(screen.getByTestId("cell-10-2")).getByText("3100.00 AED")).toBeTruthy();
    expect(within(screen.getByTestId("cell-10-2")).getByText("19.4% GP")).toBeTruthy();
    expect(within(screen.getByTestId("cell-10-3")).getByText("3299.00 AED")).toBeTruthy();
    expect(within(screen.getByTestId("cell-10-3")).getByText("default")).toBeTruthy();
    expect(within(row).getByText("Cost: 2500.00 AED")).toBeTruthy();
  });

  it("edits a cell for all branches through the price dialog", async () => {
    const user = userEvent.setup();
    render(<PricingWorkspace />);
    await user.click(await screen.findByTestId("cell-10-3"));
    const dialog = await screen.findByTestId("price-edit-dialog");
    await user.type(within(dialog).getByLabelText("Level price"), "2999");
    await user.click(within(dialog).getByRole("button", { name: /Save Price/ }));
    await waitFor(() => expect(api.upsertProductLevelPrices).toHaveBeenCalledWith([
      { productId: 10, priceLevelId: 3, branchId: null, price: 2999 },
    ]));
  });

  it("shows branch overrides when a branch is selected", async () => {
    const user = userEvent.setup();
    render(<PricingWorkspace />);
    await screen.findByTestId("matrix-row-10");
    await user.selectOptions(screen.getByLabelText("Branch"), "1");
    await waitFor(() => expect(within(screen.getByTestId("cell-10-2")).getByText("3050.00 AED")).toBeTruthy());
    expect(within(screen.getByTestId("cell-10-2")).getByText("Branch")).toBeTruthy();
    await waitFor(() => expect(api.getPriceMatrix).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: "1" }), expect.anything()));
  });

  it("the margin alerts card filters the matrix to low-margin products", async () => {
    const user = userEvent.setup();
    render(<PricingWorkspace />);
    await screen.findByTestId("matrix-row-10");
    await user.click(screen.getByTestId("stat-alerts"));
    await waitFor(() => expect(api.getPriceMatrix).toHaveBeenLastCalledWith(expect.objectContaining({ filter: "LOW_MARGIN" }), expect.anything()));
  });

  it("previews a bulk update before applying it", async () => {
    const user = userEvent.setup();
    api.bulkUpdateLevelPrices
      .mockResolvedValueOnce({ products: 1, changed: 2, unchanged: 0, skipped: 0, skippedReasons: {}, samples: [], applied: false })
      .mockResolvedValueOnce({ products: 1, changed: 2, unchanged: 0, skipped: 0, skippedReasons: {}, samples: [], applied: true });
    render(<PricingWorkspace />);
    await screen.findByTestId("matrix-row-10");
    await user.click(screen.getByRole("button", { name: /Bulk Update/ }));
    const dialog = await screen.findByTestId("bulk-update-dialog");
    await user.type(within(dialog).getByLabelText("Bulk value"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Preview" }));
    await within(dialog).findByTestId("bulk-summary");
    expect(api.bulkUpdateLevelPrices).toHaveBeenLastCalledWith(expect.objectContaining({
      priceLevelIds: [2, 3], action: "INCREASE_PERCENT", basis: "LEVEL", value: 5, dryRun: true,
    }));
    await user.click(within(dialog).getByRole("button", { name: /Apply \(2\)/ }));
    await waitFor(() => expect(api.bulkUpdateLevelPrices).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false })));
  });

  it("hides editing for read-only users", async () => {
    perms.edit = false;
    render(<PricingWorkspace />);
    await screen.findByTestId("matrix-row-10");
    expect(screen.queryByRole("button", { name: /Create New Price Level/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bulk Update/ })).toBeNull();
    expect(screen.queryByLabelText("Quick edit")).toBeNull();
  });

  it("lists customer overrides with discount, margin and a below-cost flag, and removes one", async () => {
    const user = userEvent.setup();
    api.deleteCustomerPrice.mockResolvedValue(undefined);
    render(<PricingWorkspace initialTab="customers" />);
    const row = await screen.findByTestId("customer-price-row-11");
    expect(within(row).getByText("2300.00 AED")).toBeTruthy();
    expect(within(row).getByText("−30.3%")).toBeTruthy();
    expect(within(row).getByText("-8.7% GP")).toBeTruthy();
    expect(within(row).getByText("Below cost")).toBeTruthy();
    expect(within(screen.getByTestId("price-list-cards")).getByText("4 customers")).toBeTruthy();
    await user.click(within(row).getByLabelText("Remove price for SAM-S23"));
    await waitFor(() => expect(api.deleteCustomerPrice).toHaveBeenCalledWith(11));
  });

  it("filters customer overrides by status and below cost", async () => {
    const user = userEvent.setup();
    render(<PricingWorkspace initialTab="customers" />);
    await screen.findByTestId("customer-price-row-11");
    await user.selectOptions(screen.getByLabelText("Status"), "EXPIRED");
    await user.click(screen.getByLabelText(/Prices below cost/));
    await waitFor(() => expect(api.listCustomerPriceRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "EXPIRED", belowCost: true }), expect.anything()));
  });
});

describe("cellFor", () => {
  it("prefers the branch row, then the all-branches row, then the default price", () => {
    expect(cellFor(PHONE, 2, "1")).toMatchObject({ kind: "branch", row: { price: 3050 } });
    expect(cellFor(PHONE, 2, "2")).toMatchObject({ kind: "inherited", row: { price: 3100 } });
    expect(cellFor(PHONE, 2, "")).toMatchObject({ kind: "set", row: { price: 3100 } });
    expect(cellFor(PHONE, 3, "")).toMatchObject({ kind: "base", row: null });
  });
});

describe("sheetToImportRows", () => {
  const sheet = {
    header: ["Product Code", "Product Name", "Retail Price (AED)", "Wholesale", "vip", "Unknown"],
    rows: [
      { n: 2, cells: ["SAM-S23", "Phone", "3299", "3100", "", "9"] },
      { n: 3, cells: ["", "No code", "1", "1", "1", "1"] },
    ],
  };

  it("maps level columns by name or code and skips blank cells by default", () => {
    const { rows, levelNames } = sheetToImportRows(sheet, LEVELS, { blankClears: false });
    expect(levelNames).toEqual(["Wholesale", "VIP"]);
    expect(rows).toEqual([{ row: 2, productCode: "SAM-S23", priceLevel: "Wholesale", price: "3100" }]);
  });

  it("sends blank cells as removals when asked", () => {
    const { rows } = sheetToImportRows(sheet, LEVELS, { blankClears: true });
    expect(rows).toContainEqual({ row: 2, productCode: "SAM-S23", priceLevel: "VIP", price: "" });
  });

  it("requires a product code column", () => {
    expect(() => sheetToImportRows({ header: ["Name"], rows: [] }, LEVELS, { blankClears: false })).toThrow(/Product Code/);
  });
});
