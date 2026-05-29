// Dedicated Pick List print renderer that mirrors the rich layout of
// `pages/Sales/Templates/PickListDesigner.jsx`. The generic document renderer
// produces a plain item table that ignores the Pick List designer toggles, so
// `documentTemplateRenderer.js` short-circuits to this builder for the
// 'Pick List' category. Settings come from
// `template.displayOptions.salesDesignerSettings` (or `designerSettings`),
// merged with `defaultPickListSettings`.

import { defaultPickListSettings } from '../pages/Sales/Templates/PickListDesigner';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const asText = (value) => (value == null ? '' : String(value));

const parseObj = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
};

const getDesignerSettings = (template = {}) => {
    const displayOptions = parseObj(template.displayOptions);
    const stored = displayOptions.salesDesignerSettings
        || displayOptions.designerSettings
        || displayOptions.purchaseDesignerSettings
        || {};
    return { ...defaultPickListSettings(template.name || 'Pick List'), ...stored };
};

const formatDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return asText(value);
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Render a simple barcode-like stripe pattern (visual stand-in, matches the
// designer preview — actual scanning uses linked text below).
const renderBarcodeStripes = (gold) => {
    const bars = [];
    for (let i = 0; i < 32; i += 1) {
        const width = i % 3 === 0 ? 3 : i % 5 === 0 ? 1 : 2;
        const color = i % 7 === 0 ? '#fff' : '#374151';
        bars.push(`<div style="width:${width}px;height:26px;background:${color};"></div>`);
        // Suppress unused-variable warning for gold (used elsewhere)
    }
    void gold;
    return `<div style="display:flex;gap:1px;">${bars.join('')}</div>`;
};

const flattenItems = (rawItems = []) => {
    const flat = [];
    let seq = 0;
    for (const item of rawItems) {
        const selections = Array.isArray(item.batchSelections) ? item.batchSelections : [];
        if (selections.length === 0) {
            seq += 1;
            flat.push({
                seq,
                description: item.name || item.desc || item.description?.title || '-',
                brand: item.brand || item.brandName || '',
                sku: item.sku || item.skuCode || '',
                barcode: item.barcode || '',
                zone: item.zone || item.location || '-',
                binLocation: item.binLocation || item.location || '-',
                qtyRequired: `${Number(item.qty || 0)} ${asText(item.unit || '')}`.trim(),
                pickedQty: `${Number(item.pickedQty ?? item.qty ?? 0)} ${asText(item.unit || '')}`.trim(),
                batch: '',
                pickBatch: '',
                isFull: true
            });
        } else {
            for (const sel of selections) {
                seq += 1;
                const reqQty = Number(sel.quantity ?? item.qty ?? 0);
                const pickedQty = Number(sel.pickedQuantity ?? sel.quantity ?? 0);
                flat.push({
                    seq,
                    description: item.name || item.desc || item.description?.title || '-',
                    brand: item.brand || item.brandName || '',
                    sku: item.sku || item.skuCode || '',
                    barcode: item.barcode || '',
                    zone: sel.binCode || item.zone || item.location || '-',
                    binLocation: sel.binCode || item.binLocation || item.location || '-',
                    qtyRequired: `${reqQty} ${asText(item.unit || '')}`.trim(),
                    pickedQty: `${pickedQty} ${asText(item.unit || '')}`.trim(),
                    batch: sel.batchNumber || '',
                    pickBatch: sel.batchNumber || '',
                    isFull: pickedQty >= reqQty
                });
            }
        }
    }
    return flat;
};

const buildSummary = (rows) => {
    const items = rows.length;
    const totalQty = rows.reduce((acc, r) => acc + (parseFloat(r.qtyRequired) || 0), 0);
    const batchControlled = rows.filter((r) => r.batch).length;
    const zones = new Set(rows.map((r) => r.zone).filter(Boolean)).size;
    return { items, totalQty, batchControlled, zones };
};

export const generatePickListHtml = (template, data, options = {}) => {
    const s = getDesignerSettings(template);
    const gold = s.accentColor || '#F5C742';
    const f = Number(s.fontSize) || 9;
    const company = options.companyProfile || {};

    const customer = data.customer || {};
    const meta = data.meta || {};
    const docNo = data.docNo || '';
    const printDate = formatDate(data.date || new Date());

    const rows = flattenItems(data.items || []);
    const summary = buildSummary(rows);
    const pickRoute = Array.from(new Set(rows.map((r) => r.zone).filter((z) => z && z !== '-')));
    pickRoute.push('Packing Area');

    const logoHtml = s.showLogo
        ? (company.logoUrl
            ? `<img src="${escapeHtml(company.logoUrl)}" alt="logo" style="height:72px;object-fit:contain;" />`
            : `<div style="width:72px;height:72px;border-radius:50%;background:${gold}22;border:3px solid ${gold};display:flex;align-items:center;justify-content:center;">
                  <span style="font-size:32px;font-weight:900;color:${gold};">${escapeHtml((company.companyName || 'C').charAt(0))}</span>
               </div>`)
        : '';

    const metaItems = [
        s.showPickNumber && ['Pick List No.', docNo],
        s.showPrintDate && ['Print Date', printDate],
        s.showDeliveryNoteRef && meta.linkedDeliveryNote && ['Delivery Note', meta.linkedDeliveryNote],
        s.showSalesOrderRef && meta.linkedSalesOrder && ['Sales Order', meta.linkedSalesOrder],
        s.showSalesInvoiceRef && meta.linkedSalesInvoice && ['Ref Invoice', meta.linkedSalesInvoice],
        s.showWarehouse && (meta.warehouse || meta.location) && ['Warehouse', meta.warehouse || meta.location],
        s.showBranchOutlet && (company.branchName || company.companyName) && ['Branch', company.branchName || company.companyName]
    ].filter(Boolean);

    const headerMetaHtml = metaItems.length
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;align-self:flex-end;padding-bottom:2px;">
            ${metaItems.map(([label, value]) => `
                <div>
                  <p style="margin:0;font-size:${f - 1}px;color:#999;font-weight:500;">${escapeHtml(label)}</p>
                  <p style="margin:1px 0 0;font-size:${f}px;font-weight:700;color:#1a1a2e;">${escapeHtml(value)}</p>
                </div>
            `).join('')}
          </div>`
        : '';

    const customerBlock = s.showCustomerName ? `
        <div>
          <p style="font-weight:700;font-size:${f - 0.5}px;margin:0 0 4px 0;color:#888;letter-spacing:0.5px;text-transform:uppercase;">Delivering To</p>
          <p style="font-weight:700;font-size:${f + 1}px;margin:0 0 2px 0;">${escapeHtml(customer.name || '-')}</p>
          ${s.showCustomerCode && customer.code ? `<p style="color:#64748b;font-size:${f - 0.5}px;margin:1px 0;">${escapeHtml(customer.code)}</p>` : ''}
          ${s.showDeliveryAddress && (customer.address || customer.shippingAddress) ? `<p style="white-space:pre-line;line-height:1.65;color:#444;margin:0;">${escapeHtml(customer.address || customer.shippingAddress)}</p>` : ''}
          ${s.showCustomerPhone && customer.phone ? `<p style="margin:3px 0 0;color:#555;">${escapeHtml(customer.phone)}</p>` : ''}
        </div>
    ` : '';

    const companyBlock = `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
          ${logoHtml}
          ${s.showCompanyName ? `
            <div style="text-align:right;line-height:1.55;">
              <p style="font-weight:700;font-size:${f + 3}px;color:#1a1a2e;margin:0;">${escapeHtml(company.companyName || '')}</p>
              ${s.showCompanyAddress && company.address ? `<p style="margin:0;color:#555;white-space:pre-line;">${escapeHtml(company.address)}</p>` : ''}
              ${s.showCompanyPhone && company.phone ? `<p style="margin:0;">${escapeHtml(company.phone)}</p>` : ''}
              ${s.showCompanyEmail && company.email ? `<p style="margin:0;">${escapeHtml(company.email)}</p>` : ''}
              ${s.showTRN && company.trn ? `<p style="margin:0;color:#666;">TRN · ${escapeHtml(company.trn)}</p>` : ''}
            </div>
          ` : ''}
        </div>
    `;

    const infoCards = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div style="background:${gold}0d;border:1px solid ${gold}44;border-radius:8px;padding:10px 14px;">
            <p style="font-size:${f - 0.5}px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin:0 0 7px 0;">Customer · Delivery</p>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:${f}px;">
              <span style="color:#888;font-weight:600;">Customer:</span><span style="font-weight:700;color:#1a1a2e;">${escapeHtml(customer.name || '-')}</span>
              ${s.showCustomerCode && customer.code ? `<span style="color:#888;">Code:</span><span>${escapeHtml(customer.code)}</span>` : ''}
              ${s.showCustomerPhone && customer.phone ? `<span style="color:#888;">Mobile:</span><span>${escapeHtml(customer.phone)}</span>` : ''}
              ${s.showDeliveryAddress && (customer.address || customer.shippingAddress) ? `<span style="color:#888;">Delivery:</span><span style="line-height:1.5;">${escapeHtml((customer.address || customer.shippingAddress || '').replace(/\n/g, ' '))}</span>` : ''}
            </div>
          </div>
          <div style="background:${gold}0d;border:1px solid ${gold}44;border-radius:8px;padding:10px 14px;">
            <p style="font-size:${f - 0.5}px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin:0 0 7px 0;">Document References</p>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:${f}px;">
              ${s.showDeliveryNoteRef && meta.linkedDeliveryNote ? `<span style="color:#888;">Delivery Note:</span><span style="font-weight:700;color:#1a1a2e;">${escapeHtml(meta.linkedDeliveryNote)}</span>` : ''}
              ${s.showSalesOrderRef && meta.linkedSalesOrder ? `<span style="color:#888;">Sales Order:</span><span style="font-weight:700;">${escapeHtml(meta.linkedSalesOrder)}</span>` : ''}
              ${s.showSalesInvoiceRef && meta.linkedSalesInvoice ? `<span style="color:#888;">Ref Invoice:</span><span>${escapeHtml(meta.linkedSalesInvoice)}</span>` : ''}
              ${s.showWarehouse && (meta.warehouse || meta.location) ? `<span style="color:#888;">Warehouse:</span><span>${escapeHtml(meta.warehouse || meta.location)}</span>` : ''}
            </div>
            ${s.showPriorityBadge && (meta.priority || meta.status) ? `
              <div style="margin-top:9px;">
                <span style="background:#FEE2E2;color:#DC2626;border:1px solid #FCA5A5;font-size:${f - 1}px;font-weight:700;padding:3px 10px;border-radius:12px;">
                  ${escapeHtml((meta.priority || 'HIGH PRIORITY').toString().toUpperCase())}
                </span>
              </div>
            ` : ''}
          </div>
        </div>
    `;

    const summaryCards = s.showSummaryCards ? `
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:14px;">
          ${[
              { label: 'Items', value: String(summary.items) },
              { label: 'Total Qty', value: String(summary.totalQty) },
              { label: 'Batch Controlled', value: `${summary.batchControlled} Items` },
              { label: 'Warehouse Zones', value: String(summary.zones) }
          ].map((c) => `
            <div style="background:${gold}12;border:1px solid ${gold}55;border-radius:8px;padding:10px 12px;text-align:center;">
              <p style="margin:0;font-size:${f + 6}px;font-weight:800;color:#1a1a2e;">${escapeHtml(c.value)}</p>
              <p style="margin:3px 0 0;font-size:${f - 1}px;color:#888;font-weight:500;">${escapeHtml(c.label)}</p>
            </div>
          `).join('')}
        </div>
    ` : '';

    const thS = `padding:5px 7px;font-size:${f - 0.5}px;font-weight:700;color:#1a1a2e;background:${gold};text-align:left;white-space:nowrap;`;
    const thSCenter = `${thS}text-align:center;`;
    const tdS = (center = false) => `padding:5px 7px;font-size:${f}px;color:#374151;border-bottom:1px solid ${gold}22;text-align:${center ? 'center' : 'left'};vertical-align:top;`;

    const tableHtml = `
        <div style="margin-bottom:14px;">
          <p style="font-size:${f}px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin:0 0 6px 0;">Pick List Items</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid ${gold}44;">
            <thead>
              <tr>
                ${s.colSeq ? `<th style="${thS}">#</th>` : ''}
                ${s.colDescription ? `<th style="${thS}min-width:160px;">Item / Description</th>` : ''}
                ${s.colQtyRequired ? `<th style="${thSCenter}">Qty Req.</th>` : ''}
                ${s.colBatch ? `<th style="${thS}">Batch / Lot</th>` : ''}
                ${s.colPickedQty ? `<th style="${thSCenter}min-width:65px;">Picked Qty</th>` : ''}
                ${s.colPickBatch ? `<th style="${thS}min-width:110px;">Pick Batch</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? `<tr><td colspan="6" style="${tdS(true)}padding:18px;color:#888;">No items to pick.</td></tr>` : rows.map((item, idx) => `
                <tr style="background:${idx % 2 === 1 ? `${gold}08` : '#fff'};">
                  ${s.colSeq ? `<td style="${tdS(true)}font-weight:700;color:#888;">${item.seq}</td>` : ''}
                  ${s.colDescription ? `
                    <td style="${tdS()}">
                      <p style="margin:0;font-weight:700;color:#1a1a2e;font-size:${f}px;">${escapeHtml(item.description)}</p>
                      <div style="margin-top:5px;display:flex;flex-direction:column;gap:2px;">
                        ${s.colSubZone && item.zone && item.zone !== '-' ? `
                          <div style="display:flex;align-items:center;gap:5px;">
                            <span style="font-size:${f - 1.5}px;color:#9CA3AF;font-weight:600;width:42px;flex-shrink:0;">Zone</span>
                            <span style="font-size:${f - 1}px;font-weight:700;color:#92400e;background:${gold}28;border:1px solid ${gold}88;border-radius:4px;padding:0px 6px;">${escapeHtml(item.zone)}</span>
                          </div>` : ''}
                        ${s.colSubBarcode && item.barcode ? `
                          <div style="display:flex;align-items:center;gap:5px;">
                            <span style="font-size:${f - 1.5}px;color:#9CA3AF;font-weight:600;width:42px;flex-shrink:0;">Barcode</span>
                            <span style="font-size:${f - 1}px;font-family:monospace;color:#374151;font-weight:600;">${escapeHtml(item.barcode)}</span>
                          </div>` : ''}
                        ${s.colSubSKU && item.sku ? `
                          <div style="display:flex;align-items:center;gap:5px;">
                            <span style="font-size:${f - 1.5}px;color:#9CA3AF;font-weight:600;width:42px;flex-shrink:0;">SKU</span>
                            <span style="font-size:${f - 1}px;font-family:monospace;color:#1D4ED8;font-weight:700;">${escapeHtml(item.sku)}</span>
                          </div>` : ''}
                        ${s.colSubBrand && item.brand ? `
                          <div style="display:flex;align-items:center;gap:5px;">
                            <span style="font-size:${f - 1.5}px;color:#9CA3AF;font-weight:600;width:42px;flex-shrink:0;">Brand</span>
                            <span style="font-size:${f - 1}px;color:#15803D;font-weight:600;">${escapeHtml(item.brand)}</span>
                          </div>` : ''}
                        ${s.colSubBinLocation && item.binLocation && item.binLocation !== '-' ? `
                          <div style="display:flex;align-items:center;gap:5px;">
                            <span style="font-size:${f - 1.5}px;color:#9CA3AF;font-weight:600;width:42px;flex-shrink:0;">Bin</span>
                            <span style="font-size:${f - 1}px;font-family:monospace;color:#92400e;font-weight:700;">${escapeHtml(item.binLocation)}</span>
                          </div>` : ''}
                      </div>
                    </td>` : ''}
                  ${s.colQtyRequired ? `<td style="${tdS(true)}font-weight:700;color:#1a1a2e;">${escapeHtml(item.qtyRequired)}</td>` : ''}
                  ${s.colBatch ? `<td style="${tdS()}font-family:monospace;font-size:${f - 1}px;color:#6B7280;">${escapeHtml(item.batch || '-')}</td>` : ''}
                  ${s.colPickedQty ? `
                    <td style="${tdS(true)}">
                      <p style="margin:0;font-weight:700;color:${item.isFull ? '#15803D' : '#DC2626'};font-size:${f}px;">${escapeHtml(item.pickedQty)}</p>
                      <p style="margin:2px 0 0;font-size:${f - 2}px;color:#9CA3AF;">${item.isFull ? 'Full' : 'Partial'}</p>
                    </td>` : ''}
                  ${s.colPickBatch ? `
                    <td style="${tdS()}">
                      <p style="margin:0;font-family:monospace;font-size:${f - 1}px;color:#374151;font-weight:600;">${escapeHtml(item.pickBatch || '-')}</p>
                      <p style="margin:2px 0 0;font-size:${f - 2}px;color:#9CA3AF;">${item.pickBatch ? 'Scanned' : ''}</p>
                    </td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
    `;

    const pickRouteHtml = s.showPickRoute ? `
        <div style="background:${gold}10;border:1.5px solid ${gold}66;border-radius:8px;padding:12px 14px;">
          <p style="font-size:${f}px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Suggested Pick Route</p>
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
            ${pickRoute.map((stop, i) => `
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:26px;height:26px;border-radius:50%;background:${i === pickRoute.length - 1 ? '#10B981' : gold};display:flex;align-items:center;justify-content:center;">
                  <span style="font-size:${f - 0.5}px;font-weight:800;color:#fff;">${i === pickRoute.length - 1 ? '&#10003;' : i + 1}</span>
                </div>
                <span style="font-size:${f}px;font-weight:700;color:#1a1a2e;">${escapeHtml(stop)}</span>
              </div>
              ${i < pickRoute.length - 1 ? `<div style="width:26px;display:flex;justify-content:center;"><span style="font-size:${f + 2}px;color:#9CA3AF;line-height:1;">&#8595;</span></div>` : ''}
            `).join('')}
          </div>
        </div>
    ` : '';

    const barcodeSection = s.showBarcodeSection ? `
        <div style="border:1px solid ${gold}44;border-radius:8px;padding:12px 14px;">
          <p style="font-size:${f}px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Barcode Verification</p>
          ${[
              meta.linkedDeliveryNote && { label: 'Delivery Note', ref: meta.linkedDeliveryNote },
              docNo && { label: 'Pick List', ref: docNo }
          ].filter(Boolean).map((bc) => `
            <div style="margin-bottom:10px;">
              <p style="font-size:${f - 1}px;color:#9CA3AF;margin:0 0 4px 0;">${escapeHtml(bc.label)}</p>
              <div style="display:flex;align-items:center;gap:6px;">
                ${renderBarcodeStripes(gold)}
                <span style="font-size:${f - 1}px;font-family:monospace;color:#555;white-space:nowrap;">${escapeHtml(bc.ref)}</span>
              </div>
            </div>
          `).join('')}
        </div>
    ` : '';

    const pickRouteAndBarcode = (s.showPickRoute || s.showBarcodeSection) ? `
        <div style="display:grid;grid-template-columns:${s.showPickRoute && s.showBarcodeSection ? '1fr 1fr' : '1fr'};gap:12px;margin-bottom:14px;">
          ${pickRouteHtml}
          ${barcodeSection}
        </div>
    ` : '';

    const warehouseNotes = s.showWarehouseNotes ? `
        <div style="border:1px solid ${gold}44;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
          <p style="font-size:${f}px;font-weight:700;color:#374151;margin:0 0 8px 0;">Warehouse Notes</p>
          ${meta.notes ? `<p style="font-size:${f}px;color:#374151;margin:0;white-space:pre-line;">${escapeHtml(meta.notes)}</p>` : `
            <div style="border-bottom:1px solid #E5E7EB;margin-bottom:8px;height:18px;"></div>
            <div style="border-bottom:1px solid #E5E7EB;height:18px;"></div>
          `}
        </div>
    ` : '';

    const packingVerification = s.showPackingVerification ? `
        <div style="border:1px solid ${gold}44;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
          <p style="font-size:${f}px;font-weight:700;color:#374151;margin:0 0 10px 0;">Packing Verification</p>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;">
            ${['Packed By', 'Verified By', 'Dispatch Team'].map((role) => `
              <div style="text-align:center;">
                <div style="border-bottom:1px solid #374151;margin-bottom:5px;height:24px;"></div>
                <p style="font-size:${f - 0.5}px;color:#555;font-weight:600;margin:0;">${escapeHtml(role)}</p>
              </div>
            `).join('')}
          </div>
        </div>
    ` : '';

    const signatureStrip = (s.showSignatureStrip || s.showCompanyStamp) ? `
        <div style="display:flex;gap:20px;align-items:flex-end;margin-bottom:14px;">
          ${s.showSignatureStrip ? `
            <div style="flex:1;display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;">
              ${['Prepared By', 'Picked By', 'Verified By'].map((role) => `
                <div style="text-align:center;">
                  <div style="border-bottom:1.5px solid #374151;margin-bottom:5px;height:32px;"></div>
                  <p style="font-size:${f - 0.5}px;color:#374151;font-weight:600;margin:0;">${escapeHtml(role)}</p>
                  <p style="font-size:${f - 1.5}px;color:#9CA3AF;margin:0;">Name / Signature / Date</p>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${s.showCompanyStamp ? `
            <div style="text-align:center;flex-shrink:0;">
              ${s.stampUrl
                ? `<img src="${escapeHtml(s.stampUrl)}" alt="stamp" style="width:80px;height:80px;object-fit:contain;" />`
                : `<div style="width:80px;height:80px;border-radius:50%;border:2px dashed ${gold};display:flex;align-items:center;justify-content:center;background:${gold}0a;">
                     <span style="font-size:${f - 1}px;color:#92400e;font-weight:600;text-align:center;line-height:1.3;">Company<br />Stamp</span>
                   </div>`}
              <p style="font-size:${f - 1}px;color:#9CA3AF;margin:4px 0 0 0;">Official Stamp</p>
            </div>
          ` : ''}
        </div>
    ` : '';

    const footerBar = s.showFooterBar ? `
        <div style="background:${gold}14;border-top:2px solid ${gold};padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 4px 4px;">
          <span style="font-size:${f - 1}px;color:#888;">${meta.linkedDeliveryNote ? `Generated from Delivery Note ${escapeHtml(meta.linkedDeliveryNote)}` : 'System Generated Document'}</span>
          <span style="font-size:${f - 1}px;color:#888;">System Generated Document</span>
          <span style="font-size:${f - 1}px;font-weight:700;color:#1a1a2e;">BillBull Retail OS</span>
        </div>
    ` : '';

    const paper = s.paperSize === 'Letter' ? 'Letter' : 'A4';
    const styles = `
        @page { size: ${paper} portrait; margin: 12mm; }
        body {
            margin: 0;
            padding: 0;
            font-family: ${s.fontFamily || 'Inter, sans-serif'};
            color: #333;
            background: #fff;
        }
        .pick-list-doc {
            font-size: ${f}px;
            background: #fff;
            color: #333;
            padding: 28px 32px;
            position: relative;
        }
    `;

    const title = `Pick List ${docNo || ''}`.trim();

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(title)}</title>
          <style>${styles}</style>
        </head>
        <body>
          <div class="pick-list-doc">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:16px;">
              <div style="flex:1;">
                <h1 style="font-size:${f + 17}px;font-weight:700;color:#1a1a2e;margin:0 0 14px 0;letter-spacing:-0.5px;">PICK LIST</h1>
                ${customerBlock}
              </div>
              ${headerMetaHtml}
              ${companyBlock}
            </div>
            <div style="height:3px;background:${gold};border-radius:2px;margin-bottom:14px;"></div>
            ${infoCards}
            ${summaryCards}
            ${tableHtml}
            ${pickRouteAndBarcode}
            ${warehouseNotes}
            ${packingVerification}
            ${signatureStrip}
            ${footerBar}
          </div>
        </body>
        </html>
    `;
};
