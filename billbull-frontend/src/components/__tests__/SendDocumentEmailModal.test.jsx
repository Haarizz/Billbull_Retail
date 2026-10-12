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

// The real inliner fetches images; here it only rewrites the logo to a cid: part.
vi.mock("../../utils/emailImageInliner", () => ({
  buildEmailBody: vi.fn(async (html) => ({
    html: html.replace("/uploads/logo.png", "cid:inline-img-0"),
    inlineAttachments: [{ cid: "inline-img-0", contentType: "image/png", base64: "AA==" }],
  })),
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

  it("sends the cid email body and, separately, the print HTML for the PDF", async () => {
    const { apiFn } = renderModal();
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    const [id, body] = apiFn.mock.calls[0];
    expect(id).toBe(42);
    expect(body.toEmail).toBe("buyer@example.com");
    expect(body.htmlBody).toContain("cid:inline-img-0");
    expect(body.inlineAttachments).toHaveLength(1);
    expect(body.pdfHtml).toBe(PRINT_HTML);
    expect(body.pdfHtml).not.toContain("cid:");
    // Same template, payload and branch profile as the email body.
    expect(generatePrintHtmlAsync).toHaveBeenCalledWith(TEMPLATE, PAYLOAD, expect.objectContaining({ companyProfile: PROFILE }));
  });

  it("uses the page's own Download PDF builder when one is passed", async () => {
    const buildPdfHtml = vi.fn().mockResolvedValue("<html>download-pdf</html>");
    const { apiFn } = renderModal({ buildPdfHtml });
    await clickSend();

    await waitFor(() => expect(apiFn).toHaveBeenCalledTimes(1));
    expect(apiFn.mock.calls[0][1].pdfHtml).toBe("<html>download-pdf</html>");
    expect(generatePrintHtmlAsync).not.toHaveBeenCalled();
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
