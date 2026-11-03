import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SendDocumentEmailModal from "../SendDocumentEmailModal";
import { getTemplatesByCategory } from "@billbull/shared/api/printTemplateApi";
import { generateEmailHtml, generatePrintHtmlAsync } from "@billbull/shared/utils/printGenerator";
import toast from "react-hot-toast";

vi.mock("@billbull/shared/api/printTemplateApi", () => ({
  getTemplatesByCategory: vi.fn(),
}));

vi.mock("@billbull/shared/utils/printGenerator", () => ({
  generateEmailHtml: vi.fn(),
  generatePrintHtmlAsync: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const TEMPLATE = { id: 3, isDefault: true, category: "Delivery Note (DO/DN)" };
const PAYLOAD = { docNo: "DN-0042", items: [{ code: "A1" }] };
const PROFILE = { companyName: "Acme", logoUrl: "https://erp.example.com/uploads/logo.png" };
const EMAIL_HTML = '<html><body><img src="/uploads/logo.png">email</body></html>';
const PRINT_HTML = '<html><head><style>@page{size:A4}</style></head><body><img src="https://erp.example.com/uploads/logo.png">print</body></html>';

const renderModal = (props = {}) => {
  const apiFn = props.apiFn || vi.fn().mockResolvedValue({ message: "ok" });
  const onError = vi.fn();
  render(
    <SendDocumentEmailModal
      isOpen
      onClose={vi.fn()}
      category="Delivery Note (DO/DN)"
      docId={42}
      docNumber="DN-0042"
      customerEmail="buyer@example.com"
      docLabel="Delivery Note"
      companyProfile={PROFILE}
      buildPayload={() => PAYLOAD}
      apiFn={apiFn}
      onError={onError}
      {...props}
    />
  );
  return { apiFn, onError };
};

const clickSend = async () => {
  await userEvent.click(screen.getByRole("button", { name: /send email/i }));
};

describe("SendDocumentEmailModal PDF attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTemplatesByCategory.mockResolvedValue([TEMPLATE]);
    generateEmailHtml.mockReturnValue(EMAIL_HTML);
    generatePrintHtmlAsync.mockResolvedValue(PRINT_HTML);
  });

  it("sends the message as the body and the document only as the PDF", async () => {
    const { apiFn } = renderModal();
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    const [id, body] = apiFn.mock.calls[0];
    expect(id).toBe(42);
    expect(body.toEmail).toBe("buyer@example.com");
    expect(body.htmlBody).toContain("Please find attached Delivery Note DN-0042.");
    expect(body.htmlBody).not.toContain("email");
    expect(body.htmlBody).not.toContain("<img");
    expect(body.inlineAttachments).toEqual([]);
    expect(body.pdfHtml).toBe(PRINT_HTML);
    // Same template, payload and branch profile as the preview.
    expect(generatePrintHtmlAsync).toHaveBeenCalledWith(TEMPLATE, PAYLOAD, expect.objectContaining({ companyProfile: PROFILE }));
  });

  it("uses the page's own Download PDF builder when one is passed", async () => {
    const buildPdfHtml = vi.fn().mockResolvedValue("<html>download-pdf</html>");
    const { apiFn } = renderModal({ buildPdfHtml });
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    expect(apiFn.mock.calls[0][1].pdfHtml).toBe("<html>download-pdf</html>");
    expect(generatePrintHtmlAsync).not.toHaveBeenCalled();
    // Rendered with the template the preview shows, not the page's own last-used choice.
    expect(buildPdfHtml).toHaveBeenCalledWith(TEMPLATE);
  });

  it("does not send when the PDF cannot be prepared", async () => {
    for (const buildPdfHtml of [vi.fn().mockResolvedValue(null), vi.fn().mockRejectedValue(new Error("boom"))]) {
      const { apiFn, onError } = renderModal({ buildPdfHtml });
      await clickSend();
      await waitFor(() => expect(onError).toHaveBeenCalled());
      expect(apiFn).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/PDF attachment/));
      document.body.innerHTML = "";
    }
  });

  it("does not send without a print template", async () => {
    getTemplatesByCategory.mockResolvedValue([]);
    const { apiFn, onError } = renderModal();
    await clickSend();

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(apiFn).not.toHaveBeenCalled();
  });

  it("shows the server's error instead of reporting success", async () => {
    const apiFn = vi.fn().mockRejectedValue(new Error("Failed to send email: Could not generate the PDF attachment, so the email was not sent."));
    const { onError } = renderModal({ apiFn });
    await clickSend();

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/PDF attachment/)));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("names the attachment after the document number", () => {
    renderModal({ docNumber: "DN/2026/7" });
    expect(screen.getByText("DN_2026_7.pdf")).toBeInTheDocument();
  });
});

describe("SendDocumentEmailModal message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTemplatesByCategory.mockResolvedValue([TEMPLATE]);
    generateEmailHtml.mockReturnValue(EMAIL_HTML);
    generatePrintHtmlAsync.mockResolvedValue(PRINT_HTML);
  });

  it("pre-fills a message naming the document and company", () => {
    renderModal();
    const box = screen.getByLabelText("Message");
    expect(box.value).toContain("Please find attached Delivery Note DN-0042.");
    expect(box.value).toContain("Acme");
  });

  it("previews the message above the document", async () => {
    renderModal();
    const frame = screen.getByTitle("Email Preview");
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toMatch(/<body><div[^>]*><p[^>]*>Dear Customer,<\/p>.*<img src="\/uploads\/logo.png">email/s));
  });

  it("sends exactly the edited message as the body", async () => {
    const { apiFn } = renderModal();
    const box = screen.getByLabelText("Message");
    await userEvent.clear(box);
    await userEvent.type(box, "Hello <team>");
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    const body = apiFn.mock.calls[0][1];
    expect(body.htmlBody).toMatch(/^<div[^>]*><p[^>]*>Hello &lt;team&gt;<\/p><\/div>$/);
    expect(body.pdfHtml).toBe(PRINT_HTML);
  });

  it("falls back to the default message when the box is cleared", async () => {
    const { apiFn } = renderModal();
    await userEvent.clear(screen.getByLabelText("Message"));
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    expect(apiFn.mock.calls[0][1].htmlBody).toContain("Please find attached Delivery Note DN-0042.");
  });
});
