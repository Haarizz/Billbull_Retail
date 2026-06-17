import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfPath = resolve(__dirname, '../BillBull_Financial_Flow.pdf');

const buf = readFileSync(pdfPath);
const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const doc = await getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
console.log('Pages:', doc.numPages);
let fullText = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const items = content.items;
  let pageText = '';
  for (const item of items) {
    if (item.str) pageText += item.str + (item.hasEOL ? '\n' : ' ');
  }
  fullText += `\n\n=== PAGE ${i} ===\n` + pageText;
}
writeFileSync(resolve(__dirname, 'pdf_extracted.txt'), fullText);
console.log('Chars:', fullText.length);
console.log(fullText.substring(0, 20000));
