import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Pricing Phase 3 — the Quantity tiers tab: pick a product, see its tiers per level and branch
// scope, add / edit / deactivate / reactivate, all-branches tiers read-only at a branch, input
// validation and server errors (duplicate threshold, stale edit) surfaced.

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@billbull/shared/api/pricingApi", () => ({
  getQuantityTiers: vi.fn(),
  listTieredProducts: vi.fn(),
  createQuantityTier: vi.fn(),
  updateQuantityTier: vi.fn(),
  setQuantityTierActive: vi.fn(),
  resolvePrices: vi.fn(),
}));
vi.mock("@billbull/shared/api/productsApi", () => ({ getProductsList: vi.fn() }));
const branchCtx = { branches: [{ id: 1, name: "Main" }, { id: 2, name: "Airport" }], isAllBranches: true, activeBranchId: "ALL" };
vi.mock("@billbull/shared/context/BranchContext", () => ({ useBranch: () => branchCtx }));

import toast from "react-hot-toast";
import * as pricingApi from "@billbull/shared/api/pricingApi";
import { getProductsList } from "@billbull/shared/api/productsApi";
import QuantityTiersTab, { tierInputError } from "../QuantityTiersTab";

const LEVELS = [
  { id: 1, name: "Retail", systemDefault: true, active: true },
  { id: 2, name: "Wholesale", systemDefault: false, active: true },
];
const tier = (id, minQuantity, price, extra = {}) => ({
  id, productId: 10, productCode: "A", productName: "Product A", baseUnit: "PCS", priceLevelId: 2,
  priceLevelName: "Wholesale", branchId: null, branchName: null, minQuantity, price, active: true,
  updatedAt: "2026-11-02T10:00:00", ...extra,
});

async function pickProduct(user) {
  await user.type(screen.getByLabelText("Search product for tiers"), "A");
  await user.click(await screen.findByRole("button", { name: /Product A/ }));
  await screen.findByTestId("tier-editor");
}

describe("QuantityTiersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchCtx.isAllBranches = true;
    branchCtx.activeBranchId = "ALL";
    getProductsList.mockResolvedValue({ content: [{ id: 10, code: "A", name: "Product A" }] });
    pricingApi.listTieredProducts.mockResolvedValue({ content: [], totalElements: 0 });
    pricingApi.getQuantityTiers.mockResolvedValue([tier(1, 20, 25), tier(2, 100, 23), tier(3, 120, 21, { active: false })]);
    pricingApi.resolvePrices.mockResolvedValue({ lines: [{ price: 27, untieredPrice: 27 }] });
  });

  it("shows an empty state until a product is picked", async () => {
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    expect(screen.getByTestId("tiers-empty-product")).toBeInTheDocument();
    expect(await screen.findByText("No products have quantity tiers yet.")).toBeInTheDocument();
  });

  it("lists the level's live tiers in base units with the base price, inactive ones on request", async () => {
    const user = userEvent.setup();
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);

    const editor = screen.getByTestId("tier-editor");
    await waitFor(() => expect(within(editor).getByTestId("tier-row-1")).toHaveTextContent("20 PCS+"));
    expect(within(editor).getByTestId("tier-row-2")).toHaveTextContent("23.00");
    expect(within(editor).queryByTestId("tier-row-3")).toBeNull();
    expect(editor).toHaveTextContent("Wholesale price without a tier: 27.00 per PCS");
    expect(pricingApi.resolvePrices).toHaveBeenCalledWith({ priceLevelId: 2, items: [{ productId: 10, quantity: null }] });

    await user.click(screen.getByLabelText(/Show inactive/));
    expect(within(editor).getByTestId("tier-row-3")).toHaveTextContent("Inactive");
  });

  it("adds a tier for the chosen level and scope", async () => {
    const user = userEvent.setup();
    pricingApi.createQuantityTier.mockResolvedValue(tier(9, 50, 24));
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);

    await user.type(screen.getByLabelText("New tier minimum quantity"), "50");
    await user.type(screen.getByLabelText("New tier price"), "24");
    await user.click(screen.getByRole("button", { name: /Add tier/ }));

    await waitFor(() => expect(pricingApi.createQuantityTier).toHaveBeenCalledWith({
      productId: 10, priceLevelId: 2, branchId: null, minQuantity: 50, price: 24,
    }));
    expect(toast.success).toHaveBeenCalledWith("Tier added.");
  });

  it("rejects invalid input before calling the server", async () => {
    const user = userEvent.setup();
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);
    await user.type(screen.getByLabelText("New tier minimum quantity"), "0");
    await user.type(screen.getByLabelText("New tier price"), "24");
    await user.click(screen.getByRole("button", { name: /Add tier/ }));
    expect(toast.error).toHaveBeenCalledWith("The minimum quantity must be greater than zero.");
    expect(pricingApi.createQuantityTier).not.toHaveBeenCalled();

    expect(tierInputError("20", "-1")).toBe("The tier price must be greater than zero.");
    expect(tierInputError("1.2345", "5")).toBe("The minimum quantity can have at most 3 decimals.");
    expect(tierInputError("20", "5.123")).toBe("The tier price can have at most 2 decimals.");
    expect(tierInputError("20", "5.5")).toBeNull();
  });

  it("surfaces a duplicate threshold from the server", async () => {
    const user = userEvent.setup();
    pricingApi.createQuantityTier.mockRejectedValue({ response: { status: 409, data: { message: "A tier from 20 already exists for this product, level and all branches." } } });
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);
    await user.type(screen.getByLabelText("New tier minimum quantity"), "20");
    await user.type(screen.getByLabelText("New tier price"), "24");
    await user.click(screen.getByRole("button", { name: /Add tier/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A tier from 20 already exists for this product, level and all branches."));
  });

  it("edits a tier against the version it was loaded at, and reloads after a conflict", async () => {
    const user = userEvent.setup();
    pricingApi.updateQuantityTier.mockRejectedValueOnce({ response: { status: 409, data: { message: "This tier was changed by someone else meanwhile. Reload and try again." } } });
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);

    await user.click(await screen.findByRole("button", { name: "Edit tier 20+" }));
    const qty = screen.getByLabelText("Minimum quantity");
    await user.clear(qty);
    await user.type(qty, "25");
    await user.click(screen.getByRole("button", { name: "Save tier" }));

    await waitFor(() => expect(pricingApi.updateQuantityTier).toHaveBeenCalledWith(1, {
      minQuantity: 25, price: 25, expectedUpdatedAt: "2026-11-02T10:00:00",
    }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This tier was changed by someone else meanwhile. Reload and try again."));
    await waitFor(() => expect(pricingApi.getQuantityTiers.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("deactivates a tier", async () => {
    const user = userEvent.setup();
    pricingApi.setQuantityTierActive.mockResolvedValue(tier(2, 100, 23, { active: false }));
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);
    await user.click(await screen.findByRole("button", { name: "Deactivate tier 100+" }));
    await waitFor(() => expect(pricingApi.setQuantityTierActive).toHaveBeenCalledWith(2, false, "2026-11-02T10:00:00"));
    expect(toast.success).toHaveBeenCalledWith("Tier deactivated.");
  });

  it("at a branch, edits only that branch's tiers and shows the all-branches ones read-only", async () => {
    const user = userEvent.setup();
    pricingApi.getQuantityTiers.mockResolvedValue([
      tier(1, 20, 25),
      tier(4, 20, 24.5, { branchId: 1, branchName: "Main" }),
      tier(2, 100, 23),
    ]);
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await user.selectOptions(screen.getByLabelText("Tier branch scope"), "1");
    await pickProduct(user);

    const editor = screen.getByTestId("tier-editor");
    expect(editor).toHaveTextContent("Editing tiers for Main only");
    // Main's own 20+ replaces the all-branches 20+; the all-branches 100+ still applies, read-only.
    await waitFor(() => expect(within(editor).getByTestId("tier-row-4")).toHaveTextContent("Main"));
    expect(within(editor).queryByTestId("tier-row-1")).toBeNull();
    expect(within(editor).getByTestId("tier-row-2")).toHaveTextContent("Edit under All branches");
    expect(within(editor).queryByRole("button", { name: "Edit tier 100+" })).toBeNull();
    expect(within(editor).getByRole("button", { name: "Edit tier 20+" })).toBeInTheDocument();
  });

  it("is read-only without product edit permission", async () => {
    const user = userEvent.setup();
    render(<QuantityTiersTab levels={LEVELS} canEdit={false} />);
    await pickProduct(user);
    await screen.findByTestId("tier-row-1");
    expect(screen.queryByTestId("add-tier-form")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit tier/ })).toBeNull();
  });

  it("shows a load error", async () => {
    const user = userEvent.setup();
    pricingApi.getQuantityTiers.mockRejectedValue({ response: { data: { message: "Tiers down" } } });
    render(<QuantityTiersTab levels={LEVELS} canEdit />);
    await pickProduct(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tiers down");
  });
});
