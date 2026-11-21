import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// A link built on a dev/LAN address (the app opened on localhost:5174 or the server's internal
// IP) cannot be opened by the customer's phone: the dialog says so before it is sent.

vi.mock('../../../api/documentLinkApi', () => ({
  createDocumentLink: vi.fn(async () => ({
    path: '/d/tok',
    expiresAt: '2027-05-19T10:00:00',
    company: { name: 'Pulse Retail' },
    summary: {
      documentType: 'SALES_INVOICE', label: 'Receipt', documentNo: 'INV-1', customerName: 'Sara',
      currency: 'AED', total: 10, paid: 10, balance: 0, status: 'PAID', statusLabel: 'Paid', statusTone: 'success',
    },
  })),
  getDocumentLinks: vi.fn(async () => []),
  getWhatsAppDefaultCountryCode: vi.fn(async () => '971'),
  documentLinkUrl: (path) => `http://localhost:5174${path}`,
}));

vi.mock('../../../api/whatsappSendApi', () => ({
  loadWhatsAppStatus: vi.fn(async () => ({ enabled: false, defaultCountryCode: '971', templates: {} })),
  isWhatsAppApiReady: () => false,
  getWhatsAppMessages: vi.fn(async () => ({ data: [] })),
  sendDocumentWhatsApp: vi.fn(),
}));

import ReceiptShareModal from '../ReceiptShareModal';

describe('ReceiptShareModal — link on a local address', () => {
  it('warns that the customer cannot open it', async () => {
    const doc = { documentType: 'SALES_INVOICE', documentId: 1, documentNo: 'INV-1', presentation: 'RECEIPT', buildHtml: async () => '<p/>' };
    render(<ReceiptShareModal channel="whatsapp" onSend={vi.fn()} onClose={vi.fn()} linkDoc={doc} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('localhost:5174');
    expect(alert.textContent).toMatch(/customer.s phone can.t open it/);
  });
});
