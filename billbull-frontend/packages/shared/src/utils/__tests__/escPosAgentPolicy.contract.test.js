import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildEscPosDocument,
  buildEscPosDocumentFromCanvas,
  buildEscPosFromPlainText,
  buildEscPosReceipt,
  buildEscPosTestReceipt,
} from '../escPosReceipt';

/**
 * CONTRACT — every byte stream this app builds must pass the print agent's command policy.
 *
 * The BillBull Print Agent (tools/pos-print-agent, 0.6.0+) refuses any ESC/POS job that
 * contains a command outside its allow-list (drawer pulse, buzzer, NV writes, or simply a
 * command it does not know), and sends nothing to the printer. If someone adds a new
 * command to escPosReceipt.js without adding it to the agent's lib/escposPolicy.js, real
 * receipts would start failing at the till; this test fails first instead.
 *
 * The policy is loaded from the agent's own source so the two cannot drift. createRequire
 * with a resolved path (not an import specifier) keeps the workspace boundary rule intact:
 * nothing in the app imports the agent; only this test reads it.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(here, '../../../../../../tools/pos-print-agent/lib/escposPolicy.js');
const { inspectEscPos } = createRequire(import.meta.url)(policyPath);

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const expectAllowed = (bytes) => expect(inspectEscPos(bytes)).toEqual({ allowed: true });

// A fake canvas whose dithered raster contains the exact bytes of an ESC p drawer pulse
// (1B 70 00 19 FA) on every row: image data that LOOKS like a drawer command.
const canvasWithDrawerKickPattern = () => {
  const pattern = [0x1b, 0x70, 0x00, 0x19, 0xfa];
  const width = pattern.length * 8;
  const height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (pattern[x >> 3] >> (7 - (x & 7))) & 1;
      const o = (y * width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = on ? 0 : 255;
      data[o + 3] = 255;
    }
  }
  return { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };
};

describe('ESC/POS builders vs the print agent command policy', () => {
  it('plain-text bodies (layaway, vouchers, reports)', () => {
    expectAllowed(buildEscPosFromPlainText('ACME TRADING\nItem   1 x 10.00\nTotal  AED 10.00', '80mm'));
    expectAllowed(buildEscPosFromPlainText('Narrow paper\nTotal 10.00', '58mm'));
  });

  it('documents with a native barcode (credit voucher)', async () => {
    expectAllowed(await buildEscPosDocument('CREDIT VOUCHER\nAmount AED 50.00', { paperSize: '80mm', barcode: { value: 'CV-000123' } }));
  });

  it('the printer test page', () => {
    expectAllowed(fromBase64(buildEscPosTestReceipt({ companyName: 'ACME', printerName: 'POS-80C' })));
  });

  it('a canvas (Arabic) receipt whose raster bytes spell a drawer pulse is still allowed', () => {
    const bytes = buildEscPosDocumentFromCanvas(canvasWithDrawerKickPattern(), { paperSize: '80mm', barcode: { value: 'INV-1' } });
    const hex = Buffer.from(bytes).toString('hex');
    expect(hex).toContain('1b700019fa'); // the pattern really is in the stream
    expectAllowed(bytes);
  });

  it('a full sales receipt with the native QR code', async () => {
    const invoice = {
      id: 1,
      invoiceNumber: 'INV-2026-0040',
      invoiceDate: '2026-07-04',
      createdAt: '2026-07-04T04:00:00Z',
      customerName: 'Walk-in',
      items: [{ productName: 'Widget', quantity: 2, unitPrice: 50, netAmount: 100, taxPercent: 5, taxAmount: 5 }],
      subTotal: 100,
      taxTotal: 5,
      invoiceTotal: 105,
      paymentMode: 'CASH',
    };
    const bytes = await buildEscPosReceipt('80mm', invoice, {
      companyName: 'ACME TRADING', trn: '100123456700003', showLogo: false,
      showQRCode: true, qrContent: 'Type: TAX INVOICE\nTotal: AED 105.00',
    });
    expect(Buffer.from(bytes).toString('hex')).toContain('1d286b'); // GS ( k QR present
    expectAllowed(bytes);
  });

  it('receipt text using ^ and ~ the ordinary way still prints', () => {
    expectAllowed(buildEscPosFromPlainText('Cable 2m ~ approx\nx^2 = 4\n50%~60% off', '80mm'));
  });

  it('product names that spell ZPL commands print (Gift Box~Deluxe)', async () => {
    // Once refused by a ZPL substring heuristic; the agent now decides the protocol by the
    // destination's own setting, and an ESC/POS destination reads ^ and ~ as text.
    expectAllowed(buildEscPosFromPlainText('Gift Box~Deluxe  1 x 45.00\nTea ~JR blend ^XA\n~DY~DG^XZ', '80mm'));
    const invoice = {
      id: 2,
      invoiceNumber: 'INV-2026-0041',
      invoiceDate: '2026-07-04',
      createdAt: '2026-07-04T04:00:00Z',
      customerName: 'Walk-in ~DE',
      items: [{ productName: 'Gift Box~Deluxe', quantity: 1, unitPrice: 45, netAmount: 45, taxPercent: 5, taxAmount: 2.25 }],
      subTotal: 45,
      taxTotal: 2.25,
      invoiceTotal: 47.25,
      paymentMode: 'CASH',
    };
    const bytes = await buildEscPosReceipt('80mm', invoice, {
      companyName: 'ACME ^XA TRADING', showLogo: false, showQRCode: true, qrContent: 'Gift Box~Deluxe ~JR',
    });
    expect(Buffer.from(bytes).toString('latin1')).toContain('Gift Box~Deluxe');
    expectAllowed(bytes);
  });

  it('the policy really is the agent one (a drawer pulse is refused)', () => {
    const v = inspectEscPos(Uint8Array.from([0x1b, 0x40, 0x1b, 0x70, 0, 25, 250]));
    expect(v).toMatchObject({ allowed: false, category: 'DRAWER' });
  });
});
