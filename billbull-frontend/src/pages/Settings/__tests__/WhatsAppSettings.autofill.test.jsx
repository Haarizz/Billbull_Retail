import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WhatsAppSettings from "../WhatsAppSettings";
import { getWhatsAppConfig, saveWhatsAppConfig } from "../../../api/whatsappApi";

vi.mock("../../../api/whatsappApi", () => ({
  getWhatsAppConfig: vi.fn(),
  saveWhatsAppConfig: vi.fn(),
  testWhatsAppConnection: vi.fn(),
}));

vi.mock("@billbull/shared/api/axiosConfig", () => ({
  default: { defaults: { baseURL: "https://erp.example.com" } },
}));

// What GET /api/settings/whatsapp-config returns once secrets are saved: each one is the mask.
const MASK = "••••••••••••••••";
const SAVED = {
  enabled: false,
  graphApiVersion: "v21.0",
  phoneNumberId: "106540352242922",
  businessAccountId: "102290129340398",
  accessToken: MASK,
  appSecret: MASK,
  webhookVerifyToken: MASK,
  defaultCountryCode: "971",
  quotationTemplateName: "quotation_document",
  salesOrderTemplateName: "sales_order_document",
  salesInvoiceTemplateName: "sales_invoice_document",
  templateLanguage: "en",
};

const SECRETS = {
  "Permanent Access Token": "whatsapp-access-token",
  "App Secret": "whatsapp-app-secret",
  "Verify Token": "whatsapp-webhook-verify-token",
};

const renderPage = async () => {
  render(<WhatsAppSettings />);
  return screen.findByLabelText("Phone Number ID");
};

const toastText = () => document.querySelector(".fixed.right-5")?.textContent || "";

describe("WhatsAppSettings autofill protection (T-P0-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWhatsAppConfig.mockResolvedValue({ data: SAVED });
    saveWhatsAppConfig.mockImplementation(async (body) => ({
      data: { ...body, accessToken: MASK, appSecret: MASK, webhookVerifyToken: MASK },
    }));
  });

  it("asks browsers for a new password, never the saved login, on every secret", async () => {
    await renderPage();
    for (const [label, id] of Object.entries(SECRETS)) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("type", "password");
      expect(input).toHaveAttribute("autocomplete", "new-password");
      expect(input).toHaveAttribute("id", id);
      expect(input).toHaveAttribute("name", id);
      expect(input).toHaveAttribute("data-1p-ignore", "true");
    }
  });

  it("marks the Meta IDs as numeric, non-credential fields with unique ids and names", async () => {
    await renderPage();
    for (const [label, id] of [
      ["Phone Number ID", "whatsapp-phone-number-id"],
      ["WhatsApp Business Account ID", "whatsapp-business-account-id"],
    ]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("id", id);
      expect(input).toHaveAttribute("name", id);
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("inputmode", "numeric");
      expect(input).toHaveAttribute("pattern", "[0-9]*");
    }
    expect(screen.getByLabelText("Graph API Version")).toHaveAttribute("autocomplete", "off");

    const inputs = Array.from(document.querySelectorAll("input"));
    const ids = inputs.map((i) => i.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(inputs.map((i) => i.name)).size).toBe(inputs.length);
    for (const input of inputs) {
      expect(["username", "current-password", "email"]).not.toContain(input.getAttribute("autocomplete"));
    }
    // The input just before the first password field is the WABA ID, which Chrome would take
    // for a username without these hints.
    const firstPassword = inputs.findIndex((i) => i.type === "password");
    expect(inputs[firstPassword - 1].id).toBe("whatsapp-business-account-id");
    expect(inputs[firstPassword - 1]).toHaveAttribute("autocomplete", "off");
  });

  it("keeps saved secrets masked and sends the masks back unchanged when untouched", async () => {
    const user = userEvent.setup();
    await renderPage();
    for (const label of Object.keys(SECRETS)) {
      expect(screen.getByLabelText(label)).toHaveValue(MASK);
    }
    // Focusing and leaving a saved secret without typing must restore the mask, not clear it.
    await user.click(screen.getByLabelText("App Secret"));
    await user.click(screen.getByLabelText("Graph API Version"));
    expect(screen.getByLabelText("App Secret")).toHaveValue(MASK);

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(saveWhatsAppConfig).toHaveBeenCalledTimes(1);
    expect(saveWhatsAppConfig.mock.calls[0][0]).toMatchObject({
      phoneNumberId: "106540352242922",
      businessAccountId: "102290129340398",
      accessToken: MASK,
      appSecret: MASK,
      webhookVerifyToken: MASK,
    });
  });

  it("refuses to save a non-numeric WABA ID such as an autofilled username", async () => {
    const user = userEvent.setup();
    await renderPage();
    const waba = screen.getByLabelText("WhatsApp Business Account ID");
    await user.clear(waba);
    await user.type(waba, "admin");

    expect(waba).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(saveWhatsAppConfig).not.toHaveBeenCalled();
    expect(toastText()).toContain("WhatsApp Business Account ID must contain digits only.");
  });

  it("refuses to save a non-numeric Phone Number ID", async () => {
    const user = userEvent.setup();
    await renderPage();
    const phone = screen.getByLabelText("Phone Number ID");
    await user.clear(phone);
    await user.type(phone, "+971 50 123 4567");

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(saveWhatsAppConfig).not.toHaveBeenCalled();
    expect(toastText()).toContain("Phone Number ID must contain digits only.");
  });

  it("saves IDs with surrounding spaces and blank IDs, leaving trimming to the backend", async () => {
    const user = userEvent.setup();
    await renderPage();
    const phone = screen.getByLabelText("Phone Number ID");
    await user.clear(phone);
    await user.type(phone, " 106540352242922 ");
    await user.clear(screen.getByLabelText("WhatsApp Business Account ID"));

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(saveWhatsAppConfig).toHaveBeenCalledTimes(1);
    expect(saveWhatsAppConfig.mock.calls[0][0]).toMatchObject({
      phoneNumberId: " 106540352242922 ",
      businessAccountId: "",
    });
  });

  it("shows the backend's 400 message when the server refuses an ID", async () => {
    const user = userEvent.setup();
    saveWhatsAppConfig.mockRejectedValue({
      response: { status: 400, data: { message: "Phone Number ID must contain digits only (server).", requestId: "r1" } },
    });
    await renderPage();

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(await screen.findByText("Phone Number ID must contain digits only (server).")).toBeInTheDocument();
  });
});
