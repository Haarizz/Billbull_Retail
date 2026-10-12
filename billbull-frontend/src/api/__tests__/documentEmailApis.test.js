import { describe, it, expect, vi, beforeEach } from "vitest";

import api from "@billbull/shared/api/axiosConfig";
import { sendQuotationEmail } from "../quotationApi";
import { sendProformaEmail } from "../proformaApi";
import { sendDeliveryNoteEmail } from "../deliveryNoteApi";
import { sendSalesInvoiceEmail } from "@billbull/shared/api/salesInvoiceApi";
import { sendSalesOrderEmail } from "@billbull/shared/api/salesorderApi";
import { sendReceiptVoucherEmail } from "@billbull/shared/api/receiptVoucherApi";

vi.mock("@billbull/shared/api/axiosConfig", () => ({
  default: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const SENDERS = [
  ["quotation", sendQuotationEmail, "/api/sales/quotations/5/send-email"],
  ["proforma", sendProformaEmail, "/api/proforma/5/send-email"],
  ["delivery note", sendDeliveryNoteEmail, "/api/delivery-notes/5/send-email"],
  ["sales invoice", sendSalesInvoiceEmail, "/api/sales/invoices/5/send-email"],
  ["sales order", sendSalesOrderEmail, "/api/sales/sales-orders/5/send-email"],
  ["receipt voucher", sendReceiptVoucherEmail, "/api/sales/receipt-vouchers/5/send-email"],
];

describe.each(SENDERS)("%s email API", (_name, send, url) => {
  beforeEach(() => vi.clearAllMocks());

  it("posts pdfHtml next to the email body", async () => {
    api.post.mockResolvedValue({ data: { message: "ok" } });
    await send(5, { toEmail: "a@b.co", subject: "S", htmlBody: "<p>cid</p>", inlineAttachments: [], pdfHtml: "<html>print</html>" });

    expect(api.post).toHaveBeenCalledWith(url, expect.objectContaining({
      htmlBody: "<p>cid</p>", pdfHtml: "<html>print</html>",
    }));
  });

  it("leaves pdfHtml out for callers that do not supply one", async () => {
    api.post.mockResolvedValue({ data: {} });
    await send(5, { toEmail: "a@b.co", htmlBody: "<p>x</p>" });

    expect(JSON.parse(JSON.stringify(api.post.mock.calls[0][1]))).not.toHaveProperty("pdfHtml");
  });

  it("surfaces plain-text and JSON error bodies as readable messages", async () => {
    api.post.mockRejectedValueOnce({ response: { data: "Failed to send email: SMTP down" } });
    await expect(send(5, {})).rejects.toThrow("Failed to send email: SMTP down");

    api.post.mockRejectedValueOnce({ response: { data: { message: "Email is disabled.", requestId: "r1" } } });
    await expect(send(5, {})).rejects.toThrow("Email is disabled.");

    api.post.mockRejectedValueOnce(new Error("Network Error"));
    await expect(send(5, {})).rejects.toThrow("Failed to send email");
  });
});
