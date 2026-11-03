import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Pricing Phase 2 — Customer Prices management: pick a customer, search a product, see what it
// costs them today, add / edit / deactivate / end / remove a negotiated price, branch scope shown,
// validation and server errors surfaced.

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@billbull/shared/api/pricingApi", () => ({
  listCustomerPrices: vi.fn(),
  createCustomerPrice: vi.fn(),
  updateCustomerPrice: vi.fn(),
  setCustomerPriceEnabled: vi.fn(),
  discontinueCustomerPrice: vi.fn(),
  deleteCustomerPrice: vi.fn(),
  getCustomerEffectivePrices: vi.fn(),
}));
vi.mock("@billbull/shared/api/customerledgerApi", () => ({ searchCustomersAllFields: vi.fn() }));
vi.mock("@billbull/shared/api/productsApi", () => ({ getProductsList: vi.fn() }));
vi.mock("@billbull/shared/context/BranchContext", () => ({
  useBranch: () => ({ branches: [{ id: 1, name: "Main" }, { id: 2, name: "Airport" }], isAllBranches: true, activeBranchId: "ALL" }),
}));
const perms = { edit: true, delete: true };
vi.mock("@billbull/shared/context/PermissionContext", () => ({
  usePermissions: () => ({ canEdit: () => perms.edit, canDelete: () => perms.delete }),
}));

import toast from "react-hot-toast";
import * as pricingApi from "@billbull/shared/api/pricingApi";
import { searchCustomersAllFields } from "@billbull/shared/api/customerledgerApi";
import { getProductsList } from "@billbull/shared/api/productsApi";
import CustomerPrices from "../CustomerPrices";

const ABC = { id: 501, code: "ABC", name: "ABC Trading" };
const ROW_GLOBAL = {
  id: 11, customerId: 501, customerCode: "ABC", customerName: "ABC Trading", productId: 10, productCode: "A",
  productName: "Product A", branchId: null, branchName: null, price: 25, effectiveFrom: "2026-10-01",
  effectiveTo: null, enabled: true, status: "CURRENT",
};
const ROW_BRANCH = { ...ROW_GLOBAL, id: 12, branchId: 1, branchName: "Main", price: 23 };
const page = (content) => ({ content, totalElements: content.length, totalPages: 1 });

async function chooseCustomer(user) {
  await user.type(screen.getByLabelText("Search customers"), "ABC");
  await user.click(await within(await screen.findByTestId("customer-results")).findByRole("button", { name: /ABC Trading/ }));
}

describe("CustomerPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.edit = true;
    perms.delete = true;
    pricingApi.listCustomerPrices.mockResolvedValue(page([ROW_GLOBAL, ROW_BRANCH]));
    searchCustomersAllFields.mockResolvedValue([ABC]);
    getProductsList.mockResolvedValue({ content: [{ id: 11, code: "B", name: "Product B", retailPrice: 50 }] });
    pricingApi.getCustomerEffectivePrices.mockResolvedValue({
      priceLevelName: "Wholesale",
      products: [{ productId: 11, price: 45, source: "PRICE_LEVEL", referencePrice: 45, referenceSource: "PRICE_LEVEL" }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("lists negotiated prices with their branch scope and status", async () => {
    render(<CustomerPrices />);
    const global = await screen.findByTestId("customer-price-row-11");
    expect(within(global).getByText("All branches")).toBeTruthy();
    expect(within(global).getByText("25.00")).toBeTruthy();
    expect(within(global).getByText("Current")).toBeTruthy();
    expect(within(screen.getByTestId("customer-price-row-12")).getByText("Main")).toBeTruthy();
  });

  it("filters to one customer and adds a negotiated price for a searched product", async () => {
    const user = userEvent.setup();
    pricingApi.createCustomerPrice.mockResolvedValue({ id: 13 });
    render(<CustomerPrices />);
    await chooseCustomer(user);
    await waitFor(() => expect(pricingApi.listCustomerPrices).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 501 }), expect.anything()));

    await user.click(screen.getByRole("button", { name: /Add negotiated price/ }));
    const form = screen.getByTestId("customer-price-form");
    await user.type(within(form).getByLabelText("Search products"), "B");
    await user.click(await within(form).findByRole("button", { name: /Product B/ }));
    expect(await within(form).findByTestId("reference-price")).toBeTruthy();
    expect(within(form).getByTestId("reference-price").textContent).toContain("45.00");

    await user.type(within(form).getByLabelText("Negotiated price"), "42");
    await user.selectOptions(within(form).getByLabelText("Branch"), "2");
    await user.click(within(form).getByRole("button", { name: /Add price/ }));

    await waitFor(() => expect(pricingApi.createCustomerPrice).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 501, productId: 11, branchId: 2, price: 42, effectiveTo: null, enabled: true,
    })));
    expect(toast.success).toHaveBeenCalled();
  });

  it("validates the price and shows a conflict from the server", async () => {
    const user = userEvent.setup();
    pricingApi.createCustomerPrice.mockRejectedValue({ response: { data: { message: "This customer already has a negotiated price for this product" } } });
    render(<CustomerPrices />);
    await chooseCustomer(user);
    await user.click(screen.getByRole("button", { name: /Add negotiated price/ }));
    const form = screen.getByTestId("customer-price-form");
    await user.type(within(form).getByLabelText("Search products"), "B");
    await user.click(await within(form).findByRole("button", { name: /Product B/ }));

    await user.click(within(form).getByRole("button", { name: /Add price/ }));
    expect(toast.error).toHaveBeenCalledWith("The negotiated price must be greater than zero.");
    expect(pricingApi.createCustomerPrice).not.toHaveBeenCalled();

    await user.type(within(form).getByLabelText("Negotiated price"), "42");
    await user.click(within(form).getByRole("button", { name: /Add price/ }));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("This customer already has a negotiated price for this product"));
  });

  it("edits, deactivates, ends and removes a price", async () => {
    const user = userEvent.setup();
    pricingApi.updateCustomerPrice.mockResolvedValue(ROW_GLOBAL);
    pricingApi.setCustomerPriceEnabled.mockResolvedValue(ROW_GLOBAL);
    pricingApi.discontinueCustomerPrice.mockResolvedValue(ROW_GLOBAL);
    pricingApi.deleteCustomerPrice.mockResolvedValue();
    render(<CustomerPrices />);
    const row = await screen.findByTestId("customer-price-row-11");

    await user.click(within(row).getByLabelText("Edit price for A"));
    const form = screen.getByTestId("customer-price-form");
    const price = within(form).getByLabelText("Negotiated price");
    await user.clear(price);
    await user.type(price, "24");
    await user.click(within(form).getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(pricingApi.updateCustomerPrice).toHaveBeenCalledWith(11, expect.objectContaining({ price: 24, branchId: null })));

    await user.click(within(row).getByLabelText("Deactivate price for A"));
    await waitFor(() => expect(pricingApi.setCustomerPriceEnabled).toHaveBeenCalledWith(11, false));
    await user.click(within(row).getByLabelText("End price for A"));
    await waitFor(() => expect(pricingApi.discontinueCustomerPrice).toHaveBeenCalledWith(11));
    await user.click(within(row).getByLabelText("Remove price for A"));
    await waitFor(() => expect(pricingApi.deleteCustomerPrice).toHaveBeenCalledWith(11));
  });

  it("is read-only without customer edit permission", async () => {
    perms.edit = false;
    render(<CustomerPrices />);
    const row = await screen.findByTestId("customer-price-row-11");
    expect(within(row).queryByLabelText("Edit price for A")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add negotiated price/ })).toBeNull();
  });

  it("says when the chosen customer has no negotiated prices", async () => {
    const user = userEvent.setup();
    render(<CustomerPrices />);
    await screen.findByTestId("customer-price-row-11");
    pricingApi.listCustomerPrices.mockResolvedValue(page([]));
    await chooseCustomer(user);
    expect(await screen.findByTestId("no-customer-prices")).toBeTruthy();
  });

  it("reports a failed load", async () => {
    pricingApi.listCustomerPrices.mockRejectedValue({ response: { data: { message: "Forbidden" } } });
    render(<CustomerPrices />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Forbidden"));
  });
});
