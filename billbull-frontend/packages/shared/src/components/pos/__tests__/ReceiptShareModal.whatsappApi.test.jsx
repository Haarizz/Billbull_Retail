import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// POS "Share Receipt → WhatsApp" with the WhatsApp Business API on and the POS Receipt template
// set: the receipt PDF is sent from the business number (send-whatsapp-receipt), no link.

const sendDocumentWhatsApp = vi.fn();
const loadWhatsAppStatus = vi.fn();
vi.mock('../../../api/whatsappSendApi', () => ({
  loadWhatsAppStatus: (...a) => loadWhatsAppStatus(...a),
  isWhatsAppApiReady: (status, type) => Boolean(status?.enabled && status?.templates?.[type]),
  getWhatsAppMessages: vi.fn(async () => ({ data: [] })),
  sendDocumentWhatsApp: (...a) => sendDocumentWhatsApp(...a),
}));

const createDocumentLink = vi.fn(async () => ({
  path: '/d/tok',
  company: { name: 'Pulse Retail' },
  summary: { documentType: 'SALES_INVOICE', label: 'Receipt', documentNo: 'INV-2026-0130', total: 105, paid: 105, balance: 0, status: 'PAID', statusLabel: 'Paid', statusTone: 'success' },
}));
vi.mock('../../../api/documentLinkApi', () => ({
  createDocumentLink: (...a) => createDocumentLink(...a),
  getDocumentLinks: vi.fn(async () => []),
  getWhatsAppDefaultCountryCode: vi.fn(async () => '971'),
  documentLinkUrl: (path) => `https://acme.billbull.app${path}`,
}));

import ReceiptShareModal from '../ReceiptShareModal';

const linkDoc = () => ({
  documentType: 'SALES_INVOICE',
  documentId: 130,
  documentNo: 'INV-2026-0130',
  customerName: 'Sara Ali',
  phone: '050 123 4567',
  amountText: 'AED 105.00',
  presentation: 'RECEIPT',
  buildHtml: vi.fn(async () => '<html>receipt</html>'),
});

const apiOn = (templates) => loadWhatsAppStatus.mockResolvedValue({ enabled: true, defaultCountryCode: '971', templates });

describe('ReceiptShareModal — WhatsApp Business API', () => {
  beforeEach(() => {
    sendDocumentWhatsApp.mockReset();
    createDocumentLink.mockClear();
    loadWhatsAppStatus.mockReset();
  });

  it('sends the receipt PDF as POS_RECEIPT and confirms it in the dialog', async () => {
    apiOn({ POS_RECEIPT: true });
    sendDocumentWhatsApp.mockResolvedValue({ status: 'ACCEPTED' });
    const doc = linkDoc();
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={doc} />);

    const send = await screen.findByText('Send with PDF');
    expect(screen.getByText('POS_Receipt_INV-2026-0130.pdf')).toBeTruthy();
    fireEvent.click(send);

    await waitFor(() => expect(sendDocumentWhatsApp).toHaveBeenCalledWith(
      'POS_RECEIPT', 130, { toPhone: '+971501234567', html: '<html>receipt</html>' }));
    expect(await screen.findByText('Sent to +971501234567')).toBeTruthy();
    expect(createDocumentLink).not.toHaveBeenCalled();
  });

  it('shows a Meta error and keeps the dialog open', async () => {
    apiOn({ POS_RECEIPT: true });
    sendDocumentWhatsApp.mockRejectedValue(new Error('Template pos_receipt_document does not exist in en'));
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc()} />);
    fireEvent.click(await screen.findByText('Send with PDF'));
    expect((await screen.findByRole('alert')).textContent).toContain('does not exist');
    expect(screen.getByText('Send with PDF')).toBeTruthy();
  });

  it('"Share a link instead" switches to the link flow, keeping the typed number', async () => {
    apiOn({ POS_RECEIPT: true });
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc()} />);
    fireEvent.change(await screen.findByLabelText('Customer WhatsApp number'), { target: { value: '+91 70126 40219' } });
    fireEvent.click(screen.getByText('Share a link instead'));

    await waitFor(() => expect(createDocumentLink).toHaveBeenCalledWith('SALES_INVOICE', 130, '<html>receipt</html>', 'RECEIPT'));
    expect(await screen.findByText('Opens the chat with +917012640219')).toBeTruthy();
    expect(sendDocumentWhatsApp).not.toHaveBeenCalled();
  });

  it('API on but no POS Receipt template: the till keeps the link flow', async () => {
    apiOn({ SALES_INVOICE: true, POS_RECEIPT: false });
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc()} />);
    await waitFor(() => expect(createDocumentLink).toHaveBeenCalled());
    expect(screen.queryByText('Send with PDF')).toBeNull();
  });
});
