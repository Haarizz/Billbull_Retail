import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EmailSettings from "../EmailSettings";
import { getEmailConfig, saveEmailConfig } from "../../../api/emailConfigApi";

vi.mock("../../../api/emailConfigApi", () => ({
  getEmailConfig: vi.fn(),
  saveEmailConfig: vi.fn(),
  sendTestEmail: vi.fn(),
}));

// What GET /api/settings/email-config returns for a saved account: the password is the mask.
const MASK = "••••••••••••••••";
const SAVED = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  username: "accounts@example.com",
  password: MASK,
  fromName: "Acme Trading",
  enabled: true,
};

const renderPage = async () => {
  render(<EmailSettings />);
  return screen.findByLabelText("Email Address");
};

describe("EmailSettings autofill protection (T-P0-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailConfig.mockResolvedValue({ data: SAVED });
    saveEmailConfig.mockImplementation(async (body) => ({ data: { ...body, password: MASK } }));
  });

  it("asks browsers for a new password, never the saved login, on the app password", async () => {
    await renderPage();
    const password = screen.getByLabelText("App Password");

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("id", "smtp-app-password");
    expect(password).toHaveAttribute("name", "smtp-app-password");
    expect(password).toHaveAttribute("data-1p-ignore", "true");
    expect(password).toHaveAttribute("data-lpignore", "true");
  });

  it("gives every input a unique id and name and turns autofill off on ordinary fields", async () => {
    await renderPage();
    const fields = {
      "Email Address": "smtp-username",
      "Sender Name": "smtp-sender-name",
      "Test email recipient": "smtp-test-recipient",
    };
    for (const [label, id] of Object.entries(fields)) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("id", id);
      expect(input).toHaveAttribute("name", id);
      expect(input).toHaveAttribute("autocomplete", "off");
    }

    const inputs = Array.from(document.querySelectorAll("input"));
    const ids = inputs.map((i) => i.id);
    const names = inputs.map((i) => i.name);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    // No input on the page may invite a saved login.
    for (const input of inputs) {
      expect(["username", "current-password", "email"]).not.toContain(input.getAttribute("autocomplete"));
    }
  });

  it("keeps the saved password masked and sends the mask back unchanged so the backend keeps it", async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(screen.getByLabelText("App Password")).toHaveValue(MASK);

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(saveEmailConfig).toHaveBeenCalledTimes(1);
    expect(saveEmailConfig.mock.calls[0][0]).toMatchObject({
      username: "accounts@example.com",
      password: MASK,
      fromName: "Acme Trading",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
    });
    expect(screen.getByLabelText("App Password")).toHaveValue(MASK);
  });
});
