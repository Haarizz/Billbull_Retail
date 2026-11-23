import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// POS "Share Receipt → WhatsApp": with a linkDoc (the sale has a server invoice) the modal hands
// over to WhatsAppLinkShareDialog, which makes a receipt link; without one it keeps the old form.

const createDocumentLink = vi.fn();
vi.mock('../../../api/documentLinkApi', () => ({
  createDocumentLink: (...a) => createDocumentLink(...a),
  getDocumentLinks: vi.fn(async () => []),
  getWhatsAppDefaultCountryCode: vi.fn(async () => '971'),
  documentLinkUrl: (path) => `https://acme.billbull.app${path}`,
}));

// WhatsApp Business API off: the till uses the link flow.
vi.mock('../../../api/whatsappSendApi', () => ({
  loadWhatsAppStatus: vi.fn(async () => ({ enabled: false, defaultCountryCode: '971', templates: {} })),
  isWhatsAppApiReady: () => false,
  getWhatsAppMessages: vi.fn(async () => ({ data: [] })),
  sendDocumentWhatsApp: vi.fn(),
}));

import ReceiptShareModal from '../ReceiptShareModal';

const linkDoc = {
  documentType: 'SALES_INVOICE',
  documentId: 130,
  documentNo: 'INV-2026-0130',
  customerName: 'Sara Ali',
  phone: '050 123 4567',
  presentation: 'RECEIPT',
  buildHtml: vi.fn(async () => '<html>receipt</html>'),
};

describe('ReceiptShareModal — WhatsApp receipt link', () => {
  beforeEach(() => {
    createDocumentLink.mockReset();
    createDocumentLink.mockResolvedValue({
      path: '/d/tok',
      expiresAt: '2027-05-19T10:00:00',
      company: { name: 'Pulse Retail' },
      summary: {
        documentType: 'SALES_INVOICE', label: 'Receipt', documentNo: 'INV-2026-0130', customerName: 'Sara Ali',
        date: '2026-11-20', currency: 'AED', total: 105, paid: 105, balance: 0, status: 'PAID',
        statusLabel: 'Paid', statusTone: 'success',
      },
    });
  });

  it('makes a RECEIPT link from the receipt PDF HTML and writes it into the message', async () => {
    render(<ReceiptShareModal channel="whatsapp" initialValue="050 123 4567" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc} />);

    await waitFor(() => expect(createDocumentLink).toHaveBeenCalledWith('SALES_INVOICE', 130, '<html>receipt</html>', 'RECEIPT'));
    const message = await screen.findByLabelText('Message');
    expect(message.value).toContain('Receipt: *INV-2026-0130*');
    expect(message.value).toContain('https://acme.billbull.app/d/tok');
    expect(screen.getByText('Opens the chat with +971501234567')).toBeTruthy();
    expect(screen.queryByText('Attach PDF instead')).toBeNull();
  });

  it('opens WhatsApp with the message', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc} />);
    await screen.findByLabelText('Message');
    fireEvent.click(screen.getByText('WhatsApp Web'));
    fireEvent.click(screen.getByText('Open in WhatsApp'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/web\.whatsapp\.com\/send\?phone=971501234567&text=/), '_blank', 'noopener');
    open.mockRestore();
  });

  it('a public link shows no unreachable-address warning', async () => {
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc} />);
    await screen.findByLabelText('Message');
    expect(screen.queryByText(/customer.s phone can.t open it/)).toBeNull();
  });

  it('without a linkDoc (offline sale) keeps the plain number form', () => {
    render(<ReceiptShareModal channel="whatsapp" initialValue="" onSend={vi.fn()} onClose={vi.fn()} linkDoc={null} />);
    expect(screen.getByText('Send via WhatsApp')).toBeTruthy();
    expect(createDocumentLink).not.toHaveBeenCalled();
  });

  it('other channels ignore linkDoc', () => {
    render(<ReceiptShareModal channel="email" initialValue="" onSend={vi.fn()} onClose={vi.fn()} linkDoc={linkDoc} />);
    expect(screen.getByText('Send by Email')).toBeTruthy();
    expect(createDocumentLink).not.toHaveBeenCalled();
  });
});
