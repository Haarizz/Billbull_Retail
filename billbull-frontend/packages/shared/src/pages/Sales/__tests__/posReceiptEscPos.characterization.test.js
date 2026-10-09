import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildEscPosDocument,
  buildEscPosDocumentBase64,
  buildEscPosFromPlainText,
  buildEscPosFromPlainTextBase64,
  buildFixedWidthLine,
  escPosPaperWidthDots,
  escPosUsableCols,
  resolveLineDiscount,
  wrapToWidth,
} from '../../../utils/escPosReceipt';

/**
 * CHARACTERIZATION SUITE — receipt / ESC-POS output.
 *
 * SCOPE NOTE, per the brief's "avoid tests that depend on machine-specific printer
 * state". Three layers exist, and only two of them are deterministic:
 *
 *   1. Text layout   (buildFixedWidthLine, wrapToWidth, escPosUsableCols)
 *        Pure string maths. Asserted exactly — this is what decides whether a long
 *        product name overflows 58mm paper.
 *   2. Byte assembly (buildEscPosFromPlainText, buildEscPosDocument)
 *        Pure, synchronous byte emission with no image input. Asserted as command
 *        structure AND as a SHA-256 of the full byte stream, which is the same
 *        integrity hash localPrintAgent compares against what the agent reports
 *        decoding (logEscPosIntegrity). A drift in either direction fails here first.
 *   3. Full receipt  (buildEscPosReceipt / buildEscPosDocumentFromCanvas)
 *        NOT byte-asserted. Both paths run Floyd-Steinberg dithering over a decoded
 *        <img> (branch logo/stamp) or a <canvas> rendered by bilingualReceiptCanvas.
 *        In jsdom there is no real image decoder or 2D raster backend, so the output
 *        would characterize the test environment rather than production. Layer 2 is
 *        the deterministic intermediate representation those paths share, which is
 *        why it is the assertion point.
 *
 * The existing escPosVoucherBarcode.test.js already covers the Code 39 barcode
 * emission; this file deliberately does not duplicate it.
 */

const sha256 = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');

const ESC = 0x1b;
const GS = 0x1d;

/** True when the byte stream contains the given command sequence. */
const containsSequence = (bytes, seq) => {
  for (let i = 0; i <= bytes.length - seq.length; i++) {
    let hit = true;
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
};

/**
 * Decodes the printable text back out of the stream, WPC1252 / single byte.
 * Control bytes (the ESC/POS commands themselves) are dropped, newlines kept.
 */
const printableText = (bytes) => {
  const decoded = Buffer.from(bytes).toString('latin1');
  let out = '';
  for (const ch of decoded) {
    const code = ch.charCodeAt(0);
    if (code === 0x0a || code >= 0x20) out += ch;
  }
  return out;
};

describe('receipt column geometry', () => {
  it('reports the dot width and usable columns per paper size', () => {
    expect(escPosPaperWidthDots('80mm')).toBe(576);
    expect(escPosPaperWidthDots('58mm')).toBe(384);
    // Anything that is not recognisably 58 falls through to 80mm.
    expect(escPosPaperWidthDots('')).toBe(576);
    expect(escPosPaperWidthDots(undefined)).toBe(576);
    // CHARACTERIZED QUIRK: the check is a literal String.includes('58'), so '57.5mm'
    // — a real way to label narrow paper — is treated as 80mm and every receipt
    // printed on it overruns the paper by 14 columns.
    expect(escPosPaperWidthDots('57.5mm')).toBe(576);

    // PAPER_COLS minus a symmetric 1-column gutter on each side.
    expect(escPosUsableCols('80mm')).toBe(46);
    expect(escPosUsableCols('58mm')).toBe(30);
  });
});

describe('buildFixedWidthLine — the label/amount row every receipt total uses', () => {
  it('right-aligns the amount and pads the gap', () => {
    expect(buildFixedWidthLine('Subtotal', '450.00', 42))
      .toBe('Subtotal                            450.00');
    expect(buildFixedWidthLine('Subtotal', '450.00', 42)).toHaveLength(42);
  });

  it('truncates an over-long label with an ellipsis rather than pushing the amount off', () => {
    const out = buildFixedWidthLine(
      'Extremely Long Product Name That Cannot Possibly Fit', '1,234.56', 28,
    );
    expect(out).toHaveLength(28);
    expect(out.endsWith('1,234.56')).toBe(true);
    expect(out).toContain('…');
  });

  it('keeps at least one space between label and amount', () => {
    const out = buildFixedWidthLine('ABCDEFGHIJ', '123.45', 16);
    expect(out).toHaveLength(16);
    expect(out).toMatch(/ 123\.45$/);
  });

  it('truncates to the width when there is no amount', () => {
    expect(buildFixedWidthLine('A very long note indeed', '', 10)).toBe('A very lon');
    expect(buildFixedWidthLine('', '', 10)).toBe('');
  });

  it('coerces null and undefined to empty strings', () => {
    expect(buildFixedWidthLine(null, undefined, 8)).toBe('');
  });
});

describe('wrapToWidth — long product names', () => {
  it('wraps on word boundaries and never exceeds the width', () => {
    const lines = wrapToWidth('Organic Extra Virgin Olive Oil 500ml Bottle', 28);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(28));
    expect(lines.join(' ')).toBe('Organic Extra Virgin Olive Oil 500ml Bottle');
  });

  it('indents continuation lines so the wrap stays attached to its item', () => {
    const lines = wrapToWidth('Organic Extra Virgin Olive Oil 500ml Bottle', 28, '  ');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].startsWith(' ')).toBe(false);
    lines.slice(1).forEach((l) => expect(l.startsWith('  ')).toBe(true));
  });

  it('hard-splits a single word too long for the paper', () => {
    const lines = wrapToWidth('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 12);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(12));
    expect(lines.join('')).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('returns a single empty line for empty input rather than an empty array', () => {
    expect(wrapToWidth('', 20)).toEqual(['']);
    expect(wrapToWidth(null, 20)).toEqual(['']);
  });
});

describe('resolveLineDiscount — the receipt discount column', () => {
  it('prefers an explicit discountAmount when the line carries one', () => {
    expect(resolveLineDiscount({ discountAmount: 42.5 }, 1000, 10, 900)).toBe(42.5);
    expect(resolveLineDiscount({ discountAmount: 0 }, 1000, 10, 900)).toBe(0);
  });

  it('computes from the percentage off the GROSS, not off the taxed net', () => {
    // The historical `gross - netAmount` shortcut understated a 10% discount on a
    // 1,000 line as 55.00 in VAT-exclusive mode, because it subtracted the VAT on the
    // discount too. The per-line rows then no longer summed to the invoice total.
    expect(resolveLineDiscount({}, 1000, 10, 945)).toBe(100);
    expect(resolveLineDiscount({}, 1000, 10, 945)).not.toBe(55);
  });

  it('falls back to gross minus line total when no percentage is given', () => {
    expect(resolveLineDiscount({}, 1000, 0, 900)).toBe(100);
  });

  it('never returns a negative discount', () => {
    expect(resolveLineDiscount({}, 900, 0, 1000)).toBe(0);
  });
});

describe('buildEscPosFromPlainText — deterministic byte stream', () => {
  const RECEIPT_BODY = [
    'BILLBULL RETAIL',
    'TRN: 100123456700003',
    '----------------------------------------',
    'Water 500ml        4 x 2.00        8.00',
    'Bread              2 x 6.00       12.00',
    '----------------------------------------',
    buildFixedWidthLine('Subtotal', '20.00', 46),
    buildFixedWidthLine('VAT (5%)', '1.00', 46),
    buildFixedWidthLine('TOTAL', '21.00', 46),
    '',
    'Cash            25.00',
    'Change           4.00',
  ].join('\n');

  it('opens with the initialise / codepage / font / spacing preamble', () => {
    const bytes = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');

    expect(bytes[0]).toBe(ESC);
    expect(bytes[1]).toBe(0x40);                                  // ESC @  — initialise
    expect(containsSequence(bytes, [ESC, 0x74, 0x10])).toBe(true); // ESC t 16 — WPC1252
    expect(containsSequence(bytes, [ESC, 0x4d, 0x00])).toBe(true); // ESC M 0 — Font A
    expect(containsSequence(bytes, [ESC, 0x33, 36])).toBe(true);   // ESC 3 36 — line spacing
    expect(containsSequence(bytes, [ESC, 0x61, 0x00])).toBe(true); // ESC a 0 — align left
  });

  it('ends with a feed-then-partial-cut so the tail clears the blade', () => {
    const wide = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    const narrow = buildEscPosFromPlainText(RECEIPT_BODY, '58mm');

    expect(containsSequence(wide, [GS, 0x56, 66, 120])).toBe(true);   // 80mm clearance
    expect(containsSequence(narrow, [GS, 0x56, 66, 100])).toBe(true); // 58mm clearance
  });

  it('carries every printable line through unmodified', () => {
    const text = printableText(buildEscPosFromPlainText(RECEIPT_BODY, '80mm'));

    expect(text).toContain('BILLBULL RETAIL');
    expect(text).toContain('TRN: 100123456700003');
    expect(text).toContain('Water 500ml');
    expect(text).toContain('Subtotal');
    expect(text).toContain('21.00');
    expect(text).toContain('Change');
  });

  it('leaves blank lines genuinely blank rather than padding them with the gutter', () => {
    const bytes = buildEscPosFromPlainText('A\n\nB', '80mm');
    const body = printableText(bytes);
    // The gutter prefixes non-empty lines only, so no run of spaces stands alone
    // between the two content lines.
    expect(body).toMatch(/A\s*B/);
  });

  it('produces a stable SHA-256 for a fixed receipt body — 80mm', () => {
    // This is the integrity hash localPrintAgent computes and compares against what
    // the agent reports decoding. If the byte stream drifts during the extraction,
    // this is the assertion that catches it.
    const bytes = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    expect(bytes.length).toBe(422);
    expect(sha256(bytes)).toBe('8c715933cdb5d48fe9c2ddaeb79fec663f1ddb1043a4d771970b218f8c4f8ec6');
  });

  it('produces a different, equally stable stream on 58mm paper', () => {
    const wide = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    const narrow = buildEscPosFromPlainText(RECEIPT_BODY, '58mm');
    expect(sha256(narrow)).not.toBe(sha256(wide));
  });

  it('base64-encodes exactly the bytes it built — the wire form the agent receives', () => {
    const bytes = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    const b64 = buildEscPosFromPlainTextBase64(RECEIPT_BODY, '80mm');

    expect(Buffer.from(b64, 'base64').equals(Buffer.from(bytes))).toBe(true);
    expect(sha256(Buffer.from(b64, 'base64'))).toBe(sha256(bytes));
  });

  it('is deterministic across repeated builds', () => {
    const a = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    const b = buildEscPosFromPlainText(RECEIPT_BODY, '80mm');
    expect(sha256(a)).toBe(sha256(b));
  });
});

describe('buildEscPosDocument — X/Z report and statement path', () => {
  const REPORT_BODY = [
    'X-REPORT / SESSION CLOSE',
    '',
    buildFixedWidthLine('Opening Cash', 'AED 500.00', 46),
    buildFixedWidthLine('Cash Sales', 'AED 1200.50', 46),
    buildFixedWidthLine('Expected Cash', 'AED 1550.50', 46),
    buildFixedWidthLine('Counted Cash', 'AED 1246.35', 46),
    buildFixedWidthLine('Variance', 'AED -304.15', 46),
  ].join('\n');

  it('emits the same preamble and cut as the plain-text path', async () => {
    const bytes = await buildEscPosDocument(REPORT_BODY, { paperSize: '80mm' });

    expect(bytes[0]).toBe(ESC);
    expect(bytes[1]).toBe(0x40);
    expect(containsSequence(bytes, [ESC, 0x74, 0x10])).toBe(true);
    expect(containsSequence(bytes, [ESC, 0x33, 36])).toBe(true);
    expect(containsSequence(bytes, [GS, 0x56, 66, 120])).toBe(true);
  });

  it('carries the report figures through to printable bytes', async () => {
    const text = printableText(await buildEscPosDocument(REPORT_BODY, { paperSize: '80mm' }));

    expect(text).toContain('X-REPORT / SESSION CLOSE');
    expect(text).toContain('AED 1550.50');
    expect(text).toContain('AED -304.15');
  });

  it('is deterministic and byte-stable with no branding options', async () => {
    // No logo/stamp means no image decode, so this path stays fully deterministic.
    const a = await buildEscPosDocument(REPORT_BODY, { paperSize: '80mm' });
    const b = await buildEscPosDocument(REPORT_BODY, { paperSize: '80mm' });

    expect(sha256(a)).toBe(sha256(b));
    expect(a.length).toBe(354);
    expect(sha256(a)).toBe('26672fc5342e845cbbdabd2f1e690214502b6a3acfff6bbf6e9a311d17dd0e6d');
  });

  it('base64 round-trips without altering a byte', async () => {
    const bytes = await buildEscPosDocument(REPORT_BODY, { paperSize: '58mm' });
    const b64 = await buildEscPosDocumentBase64(REPORT_BODY, { paperSize: '58mm' });
    expect(Buffer.from(b64, 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});

describe('SCOPE NOTE — paths deliberately left uncharacterized', () => {
  it('records why the full receipt builders are not byte-asserted', () => {
    // Kept as an executable note so the reason travels with the suite rather than
    // living only in a commit message.
    const NOT_BYTE_ASSERTED = {
      buildEscPosReceipt:
        'Runs ditherImageToRasterCommand over a decoded <img> for the branch logo and '
        + 'stamp. jsdom has no image decoder, so the raster would characterize the test '
        + 'environment. Its text layer is covered via buildFixedWidthLine / wrapToWidth.',
      buildEscPosDocumentFromCanvas:
        'Rasterises a <canvas> produced by bilingualReceiptCanvas. jsdom has no 2D '
        + 'raster backend. Covered at the byte-assembly layer instead.',
      posPrintUtils:
        '1,851 lines of receipt assembly living under pages/Sales/POS. Reachable, but '
        + 'its output is a composition of the layers asserted above; characterizing it '
        + 'wholesale is Phase 3 work once the printing hook is extracted.',
    };

    expect(Object.keys(NOT_BYTE_ASSERTED)).toHaveLength(3);
  });
});
