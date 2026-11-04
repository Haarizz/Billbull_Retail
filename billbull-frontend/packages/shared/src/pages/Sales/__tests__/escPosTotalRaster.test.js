import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildEscPosReceipt } from '../../../utils/escPosReceipt';

/**
 * The receipt TOTAL row prints as a raster, not as GS ! double-height text.
 *
 * Le Royal's POS-80C prints only the lower part of GS ! enlarged glyphs, even with
 * a tall ESC 3 pitch, so TOTAL came out cut in half. Rasters (logo, stamp) print
 * correctly on it. jsdom has no 2D canvas, so a minimal stub stands in for one.
 */

const GS = 0x1d;
const ESC = 0x1b;

const indexOfSequence = (bytes, seq) => {
  for (let i = 0; i <= bytes.length - seq.length; i++) {
    let hit = true;
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) { hit = false; break; }
    }
    if (hit) return i;
  }
  return -1;
};

const stubCanvas = () => {
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
    if (tag !== 'canvas') return realCreate(tag, ...rest);
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => ({
      measureText: (t) => ({ width: String(t).length * 24 }),
      fillRect: () => {},
      fillText: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) }),
    });
    return canvas;
  });
};

const invoice = {
  invoiceNumber: 'INV-2026-0342',
  invoiceDate: '2026-11-02',
  paymentMode: 'Visa',
  subTotal: 150,
  taxTotal: 0,
  invoiceTotal: 150,
  items: [{ itemName: 'CHOCOLATE BOX 12PCS', quantity: 1, unitPrice: 150, netAmount: 150 }],
};
const opts = { companyName: 'Le Royal', showLogo: false, showQRCode: false, hasTax: false };

const DOUBLE_HEIGHT = [GS, 0x21, 0x01];

afterEach(() => vi.restoreAllMocks());

describe('receipt TOTAL row', () => {
  it('prints as a full-width raster when a canvas is available', async () => {
    stubCanvas();
    const bytes = await buildEscPosReceipt('80mm', invoice, opts);
    // GS v 0, normal mode, 72 bytes (576 dots) wide.
    expect(indexOfSequence(bytes, [GS, 0x76, 0x30, 0x00, 72, 0])).toBeGreaterThan(-1);
    expect(indexOfSequence(bytes, DOUBLE_HEIGHT)).toBe(-1);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('TOTAL:');
  });

  it('prints an Arabic customer name as a raster instead of "????"', async () => {
    stubCanvas();
    const arabic = { ...invoice, customerName: 'نور الهدى للزهور' };
    const bytes = await buildEscPosReceipt('80mm', arabic, opts);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toMatch(/Name:\s+\?{3,}/);
    // Latin-only rows are unchanged text.
    expect(text).toContain('Payment Mode:');
  });

  it('falls back to double-height text with a tall line pitch when canvas fails', async () => {
    const bytes = await buildEscPosReceipt('80mm', invoice, opts);
    const size = indexOfSequence(bytes, DOUBLE_HEIGHT);
    expect(size).toBeGreaterThan(-1);
    const pitch = indexOfSequence(bytes, [ESC, 0x33, 56]);
    expect(pitch).toBeGreaterThan(-1);
    expect(pitch).toBeLessThan(size);
    expect(Buffer.from(bytes).toString('latin1')).toContain('TOTAL:');
  });
});
