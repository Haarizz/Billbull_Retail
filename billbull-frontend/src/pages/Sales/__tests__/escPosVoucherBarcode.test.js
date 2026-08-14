import { describe, expect, it } from 'vitest';

import { buildEscPosDocument, buildEscPosDocumentFromCanvas } from '../../../utils/escPosReceipt';

/**
 * The native Code 39 barcode emitted on a printed Credit Voucher.
 *
 * A voucher whose barcode does not scan is a voucher the cashier has to key by hand, so the
 * byte sequence matters: these assert the actual ESC/POS command structure rather than that
 * "something was emitted".
 */

const GS = 0x1d;

/** Finds `GS k 4 <data> NUL` and returns the decoded payload, or null. */
function extractCode39(bytes) {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === GS && bytes[i + 1] === 0x6b && bytes[i + 2] === 0x04) {
      let end = i + 3;
      while (end < bytes.length && bytes[end] !== 0x00) end += 1;
      return String.fromCharCode(...bytes.slice(i + 3, end));
    }
  }
  return null;
}

const hasCommand = (bytes, opcode) => {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === GS && bytes[i + 1] === opcode) return true;
  }
  return false;
};

describe('voucher barcode emission', () => {
  it('emits a native Code 39 symbol carrying the persisted barcode value', async () => {
    const bytes = await buildEscPosDocument('CREDIT VOUCHER', {
      paperSize: '80mm',
      barcode: { value: 'EDZHPBCR8C65' },
    });

    expect(extractCode39(bytes)).toBe('EDZHPBCR8C65');
  });

  it('sets height, module width and below-bars human-readable text', async () => {
    const bytes = await buildEscPosDocument('x', {
      paperSize: '80mm', barcode: { value: 'ABC123' },
    });

    expect(hasCommand(bytes, 0x68)).toBe(true); // GS h — height
    expect(hasCommand(bytes, 0x77)).toBe(true); // GS w — module width
    expect(hasCommand(bytes, 0x48)).toBe(true); // GS H — HRI position
  });

  it('upper-cases input, because Code 39 has no lowercase', async () => {
    const bytes = await buildEscPosDocument('x', {
      paperSize: '80mm', barcode: { value: 'edzhpbcr8c65' },
    });
    expect(extractCode39(bytes)).toBe('EDZHPBCR8C65');
  });

  it('emits nothing rather than a corrupt symbol when the value is unencodable', async () => {
    // Code 39 cannot represent these. A truncated symbol would scan to the wrong voucher,
    // which is worse than no barcode at all.
    const bytes = await buildEscPosDocument('x', {
      paperSize: '80mm', barcode: { value: 'ABC@#123' },
    });
    expect(extractCode39(bytes)).toBeNull();
  });

  it('omits the barcode entirely when no value is supplied', async () => {
    const bytes = await buildEscPosDocument('Sales Return receipt', { paperSize: '80mm' });
    expect(extractCode39(bytes)).toBeNull();
  });

  it('appears exactly once — a duplicated symbol could be scanned twice', async () => {
    const bytes = await buildEscPosDocument('x', {
      paperSize: '80mm', barcode: { value: 'ABC123' },
    });
    let count = 0;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === GS && bytes[i + 1] === 0x6b && bytes[i + 2] === 0x04) count += 1;
    }
    expect(count).toBe(1);
  });

  it('never emits a stringified object into the body', async () => {
    const bytes = await buildEscPosDocument('Voucher', { paperSize: '80mm' });
    expect(String.fromCharCode(...bytes)).not.toContain('[object Object]');
  });

  it('narrows the module width on 58mm so a long code stays on the paper', async () => {
    const wide = await buildEscPosDocument('x', { paperSize: '80mm', barcode: { value: 'ABC123' } });
    const narrow = await buildEscPosDocument('x', { paperSize: '58mm', barcode: { value: 'ABC123' } });

    const moduleWidth = (bytes) => {
      for (let i = 0; i < bytes.length - 2; i++) {
        if (bytes[i] === GS && bytes[i + 1] === 0x77) return bytes[i + 2];
      }
      return null;
    };
    expect(moduleWidth(wide)).toBe(3);
    expect(moduleWidth(narrow)).toBe(2);
  });
});

/**
 * The hybrid document: rasterised Arabic (these printers have no Arabic code page) plus a
 * NATIVE barcode (a dithered bitmap of Code 39 scans poorly).
 *
 * The trap this guards: `buildEscPosDocumentFromCanvas` ends with FEED + CUT. Concatenating
 * barcode bytes onto the finished document would put the symbol AFTER the blade — printing it
 * at the top of the next customer's receipt. The barcode must be emitted inside the document.
 */
describe('raster + native barcode coexistence', () => {
  const GS_ = 0x1d;

  /** Canvas stub — enough to exercise byte assembly without a real DOM canvas. */
  const stubCanvas = (w = 8, h = 8) => ({
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
    }),
  });

  const indexOfSeq = (bytes, seq) => {
    for (let i = 0; i <= bytes.length - seq.length; i++) {
      let hit = true;
      for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) { hit = false; break; }
      if (hit) return i;
    }
    return -1;
  };

  it('places the native barcode BEFORE the cut, not after it', () => {
    const bytes = buildEscPosDocumentFromCanvas(stubCanvas(), {
      paperSize: '80mm',
      barcode: { value: 'EDZHPBCR8C65' },
    });

    const barcodeAt = indexOfSeq(bytes, [GS_, 0x6b, 0x04]);
    const cutAt = indexOfSeq(bytes, [GS_, 0x56, 66]);

    expect(barcodeAt).toBeGreaterThan(-1);
    expect(cutAt).toBeGreaterThan(-1);
    // If this ever inverts, the voucher barcode prints on the NEXT receipt.
    expect(barcodeAt).toBeLessThan(cutAt);
  });

  it('restores left alignment after the raster before emitting the barcode', () => {
    const bytes = buildEscPosDocumentFromCanvas(stubCanvas(), {
      paperSize: '80mm', barcode: { value: 'ABC123' },
    });
    const alignLeftAt = indexOfSeq(bytes, [0x1b, 0x61, 0x00]);
    const barcodeAt = indexOfSeq(bytes, [GS_, 0x6b, 0x04]);
    expect(alignLeftAt).toBeGreaterThan(-1);
    expect(alignLeftAt).toBeLessThan(barcodeAt);
  });

  it('keeps the feed/cut terminator intact whether or not a barcode is present', () => {
    const withBarcode = buildEscPosDocumentFromCanvas(stubCanvas(), {
      paperSize: '80mm', barcode: { value: 'ABC123' },
    });
    const without = buildEscPosDocumentFromCanvas(stubCanvas(), { paperSize: '80mm' });

    expect(indexOfSeq(withBarcode, [GS_, 0x56, 66])).toBeGreaterThan(-1);
    expect(indexOfSeq(without, [GS_, 0x56, 66])).toBeGreaterThan(-1);
    // No barcode requested → none emitted; English receipts are unaffected by this change.
    expect(indexOfSeq(without, [GS_, 0x6b, 0x04])).toBe(-1);
  });
});
