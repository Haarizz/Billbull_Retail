'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { injectBaseHref, findPageSize, classifyPageSize, pdfOptions } = require('../src/printPreview');

const BASE = 'https://shop.example.com/pos/';

test('injectBaseHref puts a <base> first in <head> so server-relative images still load', () => {
  assert.equal(
    injectBaseHref('<html><head><title>x</title></head><body><img src="/uploads/a.png"></body></html>', BASE),
    `<html><head><base href="${BASE}"><title>x</title></head><body><img src="/uploads/a.png"></body></html>`,
  );
  assert.equal(injectBaseHref('<HTML lang="en"><body>x</body></HTML>', BASE),
    `<HTML lang="en"><head><base href="${BASE}"></head><body>x</body></HTML>`);
  assert.equal(injectBaseHref('<div>x</div>', BASE), `<base href="${BASE}"><div>x</div>`);
});

test('injectBaseHref keeps a document base and does not confuse <header> with <head>', () => {
  const own = '<html><head><base href="https://cdn.example.com/"></head></html>';
  assert.equal(injectBaseHref(own, BASE), own);
  assert.equal(injectBaseHref('<header>h</header>', BASE), `<base href="${BASE}"><header>h</header>`);
  assert.equal(injectBaseHref('<head></head>', 'https://x.example.com/?a="b"'),
    '<head><base href="https://x.example.com/?a=&quot;b&quot;"></head>');
});

test('findPageSize returns the last @page size, ignoring margin boxes', () => {
  assert.equal(findPageSize('<style>@page { size: A4 portrait; margin: 10mm }</style>'), 'A4 portrait');
  assert.equal(findPageSize('<style>@page{margin:0;size:80mm auto}</style>'), '80mm auto');
  assert.equal(findPageSize(
    '@page { size: A4 portrait; }\n@page { @bottom-right { content: "Page " counter(page); font-size: 7pt } }',
  ), 'A4 portrait');
  assert.equal(findPageSize('@page{size:A4}@media print{@page{size:A5 landscape}}'), 'A5 landscape');
  assert.equal(findPageSize('<p>no page rule</p>'), null);
  assert.equal(findPageSize('@page { margin: 0 }'), null);
});

test('classifyPageSize: receipt rolls are measured, sheet sizes are left to the CSS', () => {
  assert.deepEqual(classifyPageSize('80mm auto'), { kind: 'roll', widthMm: 80 });
  assert.deepEqual(classifyPageSize('58mm'), { kind: 'roll', widthMm: 58 });
  assert.deepEqual(classifyPageSize('8cm auto'), { kind: 'roll', widthMm: 80 });
  assert.deepEqual(classifyPageSize('A4 portrait'), { kind: 'css' });
  assert.deepEqual(classifyPageSize('A5 landscape'), { kind: 'css' });
  assert.deepEqual(classifyPageSize('80mm 160mm'), { kind: 'css' });
  assert.deepEqual(classifyPageSize('210mm'), { kind: 'css' });
  assert.deepEqual(classifyPageSize(null), { kind: 'css' });
});

test('pdfOptions: sheet sizes come from CSS; a roll is one page as long as the receipt', () => {
  assert.deepEqual(pdfOptions({ kind: 'css' }), { printBackground: true, preferCSSPageSize: true, pageSize: 'A4' });

  const roll = pdfOptions({ kind: 'roll', widthMm: 80 }, 960);
  assert.equal(roll.preferCSSPageSize, false);
  assert.ok(Math.abs(roll.pageSize.width - 80 / 25.4) < 1e-9);
  assert.ok(Math.abs(roll.pageSize.height - (254 + 4) / 25.4) < 1e-9); // 960px = 254mm, +4mm slack
  assert.deepEqual(roll.margins, { top: 0, bottom: 0, left: 0, right: 0 });

  assert.equal(pdfOptions({ kind: 'roll', widthMm: 80 }, 10_000_000).pageSize.height, 200);
});
