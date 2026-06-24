import { generateDocumentPrintHtml } from '../../../utils/documentTemplateRenderer';

export const stripForPreview = (html) => {
  let out = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g, '$1width:100%');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g, '$1min-height:0');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g, '$1width:100%');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g, '$1min-height:0');
  out = out.replace(/(\s\.document-footer-group\s*\{[^}]*?)(margin-top\s*:\s*auto)/g, '$1margin-top:16px');
  const reset = `<style id="__pr__">html,body{min-height:0!important;height:auto!important;background:#fff!important}.document-shell{min-height:0!important;height:auto!important}.document-footer-group{margin-top:16px!important}.content-stack{flex:none!important}#footer-push-spacer,#footer-inner-spacer{display:none!important}</style>`;
  return out.replace(/<\/head>/i, reset + '</head>');
};

export const buildDocumentPreviewHtml = (category, { companyName, trn, address, phone, footerNote }, toggles = {}) => {
  const isReturn = category === 'Sales Return';
  const t = toggles;
  const salesDesignerSettings = {
    showLogo:              t.showLogo             !== false,
    showCompanyAddress:    t.showCompanyDetails    !== false,
    showTRN:               t.showTrn               !== false,
    showCustomerDetails:   t.showCustomerDetails   !== false,
    showTerms:             t.showTerms             !== false && !!footerNote,
    showNotes:             t.showNotes             !== false,
    showBankDetails:       !!t.showBankDetails,
    showQRCode:            !!t.showQRCode,
    showQR:                !!t.showQRCode,
    showCompanyStamp:      !!t.showStamp,
    showStamp:             !!t.showStamp,
    showSignatures:        !!t.showSignature,
    showSignatureStrip:    !!t.showSignature,
    showGrandTotalBanner:  t.showGrandTotalBanner  !== false,
    showSummaryBar:        t.showGrandTotalBanner  !== false,
    showSubtotal:          true,
    showVATTotal:          true,
    showGrandTotal:        true,
    primaryColor:          '#F5C742',
    accentColor:           '#F5C742',
    logoUrl:               t.logoDataUrl  || undefined,
    companyLogoUrl:        t.logoDataUrl  || undefined,
    stampUrl:              t.stampDataUrl || undefined,
    stampImage:            t.stampDataUrl || undefined,
  };
  const columns = JSON.stringify({
    productId:      t.colItemCode     !== false,
    image:          !!t.colItemImage,
    description:    true,
    qty:            true,
    unitPrice:      true,
    taxableAmount:  true,
    barcode:        !!t.colBarcode,
    batchNumber:    t.colBatchNo      !== false,
    discount:       t.colDiscount     !== false,
    taxPercent:     t.colVatPct       !== false,
    tax:            t.colVatAmt       !== false,
    total:          true,
  });
  const displayOptions = JSON.stringify({
    showLogo:            t.showLogo            !== false,
    showCompanyDetails:  t.showCompanyDetails  !== false,
    showCustomerDetails: t.showCustomerDetails !== false,
    showTerms:           t.showTerms           !== false && !!footerNote,
    showBankDetails:     !!t.showBankDetails,
    showQRCode:          !!t.showQRCode,
    primaryColor:        '#F5C742',
    accentColor:         '#F5C742',
    salesDesignerSettings,
  });
  const template = {
    category,
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote || '',
    columns,
    displayOptions,
    salesDesignerSettings,
  };
  const items = isReturn
    ? [{ code: 'SGAL-A55', name: 'Samsung Galaxy A55', desc: '128GB · Black', qty: 1, price: 1380, disc: 0, tax: 5, taxAmt: 69, total: 1449, batchNumber: 'SGAL-120526' }]
    : [
        { code: 'SGAL-A55', name: 'Samsung Galaxy A55', desc: '128GB · Black', qty: 1, price: 1380, disc: 0, tax: 5, taxAmt: 69, total: 1449, batchNumber: 'SGAL-120526' },
        { code: 'IPH-CASE', name: 'iPhone Leather Case', desc: 'Brown · Genuine leather', qty: 2, price: 22.5, disc: 0, tax: 5, taxAmt: 2.25, total: 47.25, batchNumber: '' },
      ];
  const data = {
    title: isReturn ? 'CREDIT NOTE' : 'TAX INVOICE',
    docNo: isReturn ? 'SR-POS-000042' : 'SI-POS-000001',
    date: '22 Jun 2026',
    customer: { name: 'Fatima Hassan', address: 'Dubai, UAE', phone: '+971 50 123 4567' },
    items,
    totals: isReturn
      ? { subTotal: 1380, tax: 69, grandTotal: 1449, discountAmount: 0, billDiscountAmount: 0 }
      : { subTotal: 1425, tax: 71.25, grandTotal: 1496.25, discountAmount: 0, billDiscountAmount: 0 },
    meta: { notes: t.showNotes !== false ? (footerNote || 'Sample note line') : '', paymentTerm: '', dueDate: '', salesPerson: '', location: companyName || '' },
  };
  const options = {
    companyProfile: {
      companyName: companyName || 'Your Company',
      trn: trn || '',
      address: address || '',
      phone: phone || '',
      currency: 'AED',
      logoUrl: t.logoDataUrl || undefined,
      stampUrl: t.stampDataUrl || undefined,
    },
  };
  try { return stripForPreview(generateDocumentPrintHtml(template, data, options)); }
  catch (e) {
    console.warn('A4 preview generation failed:', e);
    return `<html><body style="padding:20px;font-family:Arial,sans-serif;color:#666;text-align:center;padding-top:60px"><p>Preview unavailable</p></body></html>`;
  }
};

export const buildThermalPrintHtml = (paperSize, { companyName, trn, header, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
<div class="d"></div>
<div>INV: SI-POS-000001</div><div>22 Jun 2026  10:30 AM</div>
<div>Cust: Fatima Hassan</div>
<div class="d"></div>
<div class="row"><span>Samsung A55 x1</span><span>AED 1,380</span></div>
<div class="row"><span>iPhone Case x2</span><span>AED 45</span></div>
<div class="d"></div>
<div class="row"><span>Subtotal</span><span>AED 1,425</span></div>
<div class="row"><span>VAT 5%</span><span>AED 71.25</span></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>AED 1,496.25</span></div>
<div class="d"></div>
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

// Encodes UAE FTA ZATCA Phase-1 QR data as base64 TLV (mirrors ZatcaQrGenerator.java).
export const buildZatcaTlvBase64 = (sellerName, trn, isoTimestamp, totalWithVat, vatTotal) => {
  const enc = new TextEncoder();
  const tlvField = (tag, value) => {
    const bytes = enc.encode(String(value || ''));
    return [tag, bytes.length, ...bytes];
  };
  const bytes = new Uint8Array([
    ...tlvField(0x01, sellerName || ''),
    ...tlvField(0x02, trn && trn.trim() ? trn.trim() : 'N/A'),
    ...tlvField(0x03, isoTimestamp || new Date().toISOString()),
    ...tlvField(0x04, parseFloat(totalWithVat || 0).toFixed(2)),
    ...tlvField(0x05, parseFloat(vatTotal || 0).toFixed(2)),
  ]);
  return btoa(String.fromCharCode(...bytes));
};

export const buildThermalReceiptHtml = (paperSize, invoice, { companyName, trn, header, footer, showTrn, isReprint = false, zatcaQrDataUrl = null }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const items = (invoice.items || []).filter(it => !it.voided);
  const subTotal = invoice.subTotal || 0;
  const taxTotal = invoice.taxTotal || 0;
  const grandTotal = invoice.invoiceTotal || 0;
  const payMode = invoice.paymentMode || '';
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const invTime = invoice.createdAt ? new Date(invoice.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const customer = invoice.customerName || 'Walk-in Customer';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
${isReprint ? '<div class="c b" style="font-size:9px;margin:2px 0">*** COPY / REPRINT ***</div>' : ''}
<div class="d"></div>
<div>INV: ${esc(invoice.invoiceNumber || '')}</div>
<div>${esc(invDate)}${invTime ? '  ' + esc(invTime) : ''}</div>
<div>Cust: ${esc(customer)}</div>
${payMode ? `<div>Pay: ${esc(payMode)}</div>` : ''}
<div class="d"></div>
${items.map(it => {
  const qty = it.quantity || 0;
  const price = it.unitPrice || it.price || 0;
  const total = it.netAmount || it.lineTotal || (qty * price);
  const batch = it.batchNumber || it.pinnedBatchNumber || '';
  return `<div class="row"><span>${esc(it.itemName || it.productName || '')} x${qty}</span><span>AED ${fmt(total)}</span></div>${batch ? `<div style="font-size:9px;color:#555;padding-left:2px">Batch: ${esc(batch)}</div>` : ''}`;
}).join('')}
<div class="d"></div>
<div class="row"><span>Subtotal</span><span>AED ${fmt(subTotal)}</span></div>
<div class="row"><span>VAT</span><span>AED ${fmt(taxTotal)}</span></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>AED ${fmt(grandTotal)}</span></div>
<div class="d"></div>
${zatcaQrDataUrl ? `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="width:80px;height:80px" alt="ZATCA QR" /><div style="font-size:8px;color:#555;margin-top:2px">Scan to verify</div></div>` : ''}
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

export const buildLayawayReceiptHtml = (paperSize, layaway, { companyName, trn, header, footer, showTrn }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const layDate = layaway.createdAt
    ? new Date(layaway.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const dueStr = layaway.dueDate
    ? new Date(layaway.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const items = layaway.items || [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
<div class="d"></div>
<div class="c b" style="font-size:10px;margin:2px 0">NOT A TAX INVOICE</div>
<div class="c b" style="font-size:10px">LAYAWAY RECEIPT</div>
<div class="d"></div>
<div>LAY: ${esc(layaway.layawayNumber || 'Auto')}</div>
<div>${esc(layDate)}</div>
<div>Cust: ${esc(layaway.customerName || '')}</div>
${layaway.customerPhone ? `<div>Tel: ${esc(layaway.customerPhone)}</div>` : ''}
<div class="d"></div>
${items.map(it => {
  const qty = it.quantity || 0;
  const price = it.price || it.unitPrice || 0;
  const total = it.lineTotal || it.netAmount || (qty * price);
  return `<div class="row"><span>${esc(it.itemName || '')} x${qty}</span><span>AED ${fmt(total)}</span></div>`;
}).join('')}
<div class="d"></div>
<div class="row"><span>Sale Total</span><span>AED ${fmt(layaway.saleTotal)}</span></div>
${parseFloat(layaway.depositAmount || 0) > 0 ? `<div class="row"><span>Deposit (${esc(layaway.depositPaymentMode || '')})</span><span>AED ${fmt(layaway.depositAmount)}</span></div>` : ''}
<div class="row b" style="font-size:13px"><span>BALANCE DUE</span><span>AED ${fmt(layaway.balanceAmount)}</span></div>
${dueStr ? `<div class="d"></div><div>Due Date: ${esc(dueStr)}</div>` : ''}
${layaway.remarks ? `<div style="font-size:9px;margin-top:2px">Note: ${esc(layaway.remarks)}</div>` : ''}
<div class="d"></div>
<div class="c" style="font-size:9px">Items reserved until due date.</div>
<div class="c" style="font-size:9px">Balance must be paid on collection.</div>
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

export const buildServiceJobA4Html = ({ companyName, trn, address, phone, footerNote }) => {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const abbr = n => esc(n || 'BB').substring(0, 2).toUpperCase();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:9px;color:#222;background:#fff;padding:20px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:2.5px solid #F5C742}
.logo{width:52px;height:52px;background:linear-gradient(135deg,#F5C742,#e6b838);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff}
.dt{font-size:13px;font-weight:900;color:#1E293B;letter-spacing:.5px;margin-left:10px;align-self:center}
.co{text-align:right;font-size:8px;color:#555;line-height:1.5}.co-n{font-size:12px;font-weight:700;color:#1E293B}
.meta{display:flex;gap:6px;margin-bottom:12px}.mb{flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:5px 7px}
.ml{font-size:7px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px}.mv{font-size:8.5px;color:#1E293B;font-weight:600}
.srow{display:flex;gap:6px;margin-bottom:8px}.sbox{flex:1;border:1px solid #E5E7EB;border-radius:6px;padding:6px 8px}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:7px;font-weight:700;background:#F0FDF4;color:#16A34A}
.sig{border-top:1px solid #D1D5DB;margin-top:30px;font-size:7px;color:#9CA3AF;padding-top:3px;text-align:center}
.fn{margin-top:10px;padding:6px 10px;background:#FFFBEB;border-left:3px solid #F5C742;font-size:8px;color:#666;line-height:1.4}
@page{size:A4 portrait;margin:15mm}
</style></head><body>
<div class="hdr">
  <div style="display:flex;align-items:center"><div class="logo">${abbr(companyName)}</div><div class="dt">SERVICE JOB CARD</div></div>
  <div class="co"><div class="co-n">${esc(companyName || 'Your Company')}</div><div>TRN: ${esc(trn)}</div><div>${esc(address)}</div><div>${esc(phone)}</div></div>
</div>
<div class="meta">
  <div class="mb"><div class="ml">Job No</div><div class="mv">SRV-000028</div></div>
  <div class="mb"><div class="ml">Date</div><div class="mv">22 Jun 2026</div></div>
  <div class="mb"><div class="ml">Technician</div><div class="mv">Mohammed Ali</div></div>
</div>
<div class="srow">
  <div class="sbox"><div class="ml">Customer</div><div class="mv">Fatima Hassan</div><div style="font-size:8px;color:#555;margin-top:2px">+971 50 123 4567</div></div>
  <div class="sbox"><div class="ml">Device / Item</div><div class="mv">Samsung Galaxy A55</div><div style="font-size:8px;color:#555;margin-top:2px">Serial: SNSA55-20260312</div></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Problem Description</div>
  <div style="font-size:8.5px;color:#1E293B">Display issue — screen flickering when brightness above 70%.</div>
  <div style="margin-top:6px"><span class="badge">Under Warranty</span></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Service Notes / Work Done</div>
  <div style="font-size:8px;color:#bbb;font-style:italic">To be filled after diagnosis...</div>
</div>
<div class="sig">Customer Signature ___________________</div>
${footerNote ? `<div class="fn">${esc(footerNote)}</div>` : ''}
</body></html>`;
};

export const buildPosPrintData = (full, footerNote = '') => ({
  title: 'TAX INVOICE',
  docNo: full.invoiceNumber || '',
  date: full.invoiceDate || '',
  customer: {
    name: full.customerName || 'Walk-in Customer',
    address: full.customerAddress || '',
    phone: full.customerPhone || '',
    email: full.customerEmail || '',
    trn: full.customerTrn || '',
  },
  items: (full.items || []).filter(it => !it.voided).map(it => ({
    code: it.itemCode || '',
    name: it.itemName || it.productName || '',
    desc: it.description || '',
    qty: it.quantity || 0,
    price: it.unitPrice || it.price || 0,
    disc: it.discountPercent || 0,
    tax: it.taxPercent || it.taxRate || 5,
    taxAmt: it.taxAmount || 0,
    total: it.netAmount || it.lineTotal || 0,
    batchNumber: it.batchNumber || '',
    image: it.image || '',
  })),
  totals: {
    subTotal: full.subTotal || 0,
    tax: full.taxTotal || 0,
    grandTotal: full.invoiceTotal || 0,
    discountAmount: full.discountTotal || 0,
    billDiscountAmount: full.billDiscountAmount || 0,
    footerDiscountAmount: full.footerDiscountAmount || 0,
  },
  meta: {
    notes: footerNote,
    paymentMode: full.paymentMode || '',
    location: full.branchName || '',
    salesPerson: full.posCounterName || '',
  },
});

export const buildPosA4Template = (footerNote = '', opts = {}) => {
  const ds = {
    showLogo:             opts.showLogo             !== false,
    showCompanyName:      opts.showCompanyDetails   !== false,
    showCompanyAddress:   opts.showCompanyDetails   !== false,
    showTRN:              opts.showTrn              !== false,
    showBillTo:           opts.showCustomerDetails  !== false,
    showCustomerName:     opts.showCustomerDetails  !== false,
    showTerms:            opts.showTerms            !== false,
    showNotes:            opts.showNotes            !== false,
    showBankDetails:      !!opts.showBankDetails,
    showQRCode:           !!opts.showQRCode,
    showCompanyStamp:     !!opts.showStamp,
    showSignatures:       !!opts.showSignature,
    showGrandTotalBanner: opts.showGrandTotalBanner !== false,
    colItemCode:          opts.colItemCode          !== false,
    colProductImage:      !!opts.colItemImage,
    colBarcode:           !!opts.colBarcode,
    colBatchNumber:       !!opts.colBatchNo,
    colDiscount:          opts.colDiscount          !== false,
    colVAT:               opts.colVatPct            !== false,
    colVATAmount:         opts.colVatAmt            !== false,
    primaryColor: '#F5C742',
    accentColor:  '#F5C742',
  };
  return {
    category: 'Sales Invoice',
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote,
    displayOptions: JSON.stringify({
      showLogo:            ds.showLogo,
      showCompanyDetails:  ds.showCompanyName,
      showCustomerDetails: ds.showBillTo,
      showTerms:           ds.showTerms,
      showBankDetails:     ds.showBankDetails,
      showQRCode:          ds.showQRCode,
      primaryColor:        '#F5C742',
      accentColor:         '#F5C742',
      salesDesignerSettings: ds,
    }),
  };
};
