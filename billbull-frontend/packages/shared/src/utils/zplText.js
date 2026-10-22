// ZPL field data that cannot escape its field.
//
// In ZPL, '^' starts the next command and '~' runs a device command the moment
// the printer reads it — even in the middle of ^FD field data. A backslash does
// not escape either of them. So a product named "Shirt^JUF" printed as
// "^FDShirt\^JUF^FS" would have factory-reset the label printer. Every field
// BillBull prints is therefore written with ^FH (hex escapes, '_' indicator):
// '^', '~' and '_' itself go out as _5E, _7E and _5F, which the printer prints
// as characters and never executes. Control characters become spaces.
//
// The print agent (tools/pos-print-agent/lib/zplPolicy.js) and the backend
// (pos/printer/ZplCommandPolicy.java) refuse any label job whose field data
// carries a literal '~' or control character, so this encoder is what keeps
// legitimate labels printable.

const DPI = 8; // 203 dpi ≈ 8 dots/mm (ZD220-class printers)

const HEX_ESCAPES = { '^': '_5E', '~': '_7E', _: '_5F' };

/**
 * Encodes text for `^FH^FD…^FS`.
 *
 * @param value any value; null/undefined print as empty
 * @param fieldBlock true when the field uses ^FB, where "\\" prints one backslash and
 *        "\&" would start a new line — so a backslash is doubled there
 */
export const zplFieldData = (value, { fieldBlock = false } = {}) => {
  let out = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code === 0x7f) out += ' ';
    else if (HEX_ESCAPES[ch]) out += HEX_ESCAPES[ch];
    else if (ch === '\\' && fieldBlock) out += '\\\\';
    else out += ch;
  }
  return out;
};

/** One text field: origin, optional block, font, hex-escaped data. */
export const zplTextField = ({ x, y, text, fontH, fontW = fontH, block = null }) => {
  const fb = block ? `^FB${block.width},${block.lines || 1},0,${block.align || 'L'},0` : '';
  return `^FO${x},${y}${fb}^A0N,${fontH},${fontW}^FH^FD${zplFieldData(text, { fieldBlock: Boolean(block) })}^FS`;
};

/** One Code 128 field with its human-readable line. */
export const zplCode128Field = ({ x, y, value, height, moduleWidth = 2 }) =>
  `^BY${moduleWidth},2,${height}\n^FO${x},${y}^BCN,${height},Y,N,N^FH^FD${zplFieldData(value)}^FS`;

/**
 * The label-printer test page: a small 50 × 25 mm label (it prints inside any
 * larger stock too) carrying the printer's identity, a size check and a Code 128
 * symbol, so the operator can see text, positioning and barcodes all work.
 */
export const buildZplTestLabel = ({ companyName = 'BillBull', printerName = '', branchName = '', widthMm = 50, heightMm = 25 } = {}) => {
  const w = Math.round(widthMm * DPI);
  const h = Math.round(heightMm * DPI);
  const margin = 2 * DPI;
  const inner = w - margin * 2;
  return [
    '^XA',
    '^CI28',
    `^PW${w}`,
    `^LL${h}`,
    '^LH0,0',
    zplTextField({ x: margin, y: margin, text: companyName, fontH: 22, block: { width: inner, align: 'C' } }),
    zplTextField({ x: margin, y: margin + 26, text: 'LABEL PRINTER TEST', fontH: 18, block: { width: inner, align: 'C' } }),
    zplTextField({ x: margin, y: margin + 48, text: [branchName, printerName].filter(Boolean).join(' / '), fontH: 16, block: { width: inner, align: 'C' } }),
    zplCode128Field({ x: margin + 24, y: margin + 70, value: 'BB-TEST-01', height: 50 }),
    '^XZ',
  ].join('\n');
};

/** UTF-8 → base64 (btoa alone is Latin-1 only; ^CI28 labels are UTF-8). */
export const zplToBase64 = (zpl) => {
  const bytes = new TextEncoder().encode(String(zpl));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
