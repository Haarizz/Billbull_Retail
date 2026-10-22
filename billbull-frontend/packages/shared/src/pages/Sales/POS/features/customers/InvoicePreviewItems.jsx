import React, { useEffect, useState } from 'react';
import { Package, ChevronDown, ZoomIn, X } from 'lucide-react';
import { getImageUrl } from '../../../../../utils/urlUtils';

/**
 * Resolves a sales-invoice line image to a loadable URL. The backend stores
 * `image` as an upload path (e.g. "uploads/products/x.jpg"); older rows may
 * carry raw base64. Paths go through getImageUrl, bare base64 gets a data: URI.
 */
export const resolveInvoiceItemImage = (image) => {
  if (!image) return null;
  const raw = String(image).trim();
  if (!raw) return null;
  if (/^(data:|https?:|blob:|\/\/|\/)/.test(raw) || raw.includes('/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(raw)) {
    return getImageUrl(raw);
  }
  return `data:image/jpeg;base64,${raw}`;
};

const num = (v) => Number(v) || 0;

function ItemThumb({ src, alt, onZoom }) {
  const [failed, setFailed] = useState(false);
  const usable = src && !failed;

  return (
    <button
      type="button"
      disabled={!usable}
      onClick={(e) => { e.stopPropagation(); if (usable) onZoom(); }}
      title={usable ? 'View image' : 'No image'}
      className="group/thumb relative w-11 h-11 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-[#F5C742] transition-shadow"
    >
      {usable
        ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        : <Package className="w-4 h-4 text-gray-300" />}
      {usable && (
        <span className="absolute inset-0 bg-black/35 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
          <ZoomIn className="w-4 h-4 text-white" />
        </span>
      )}
    </button>
  );
}

function ImageLightbox({ item, src, formatCurrency, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 pointer-events-auto"
      onClick={onClose}
      role="dialog"
      aria-label="Product image"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-gray-500 hover:text-gray-800 shadow">
          <X className="h-4 w-4" />
        </button>
        <div className="bg-gray-50 flex items-center justify-center h-64 sm:h-80">
          <img src={src} alt={item.itemName || item.itemCode || ''} className="max-w-full max-h-full object-contain" />
        </div>
        <div className="p-4 space-y-1">
          <p className="text-sm font-bold text-[#1E293B]">{item.itemName || item.productName || item.itemCode}</p>
          <p className="text-[11px] font-mono text-gray-400">{[item.itemCode, item.barcode].filter(Boolean).join(' · ')}</p>
          <div className="flex justify-between text-xs pt-2">
            <span className="text-gray-500">{item.quantity} × {formatCurrency(item.price ?? 0)}</span>
            <span className="font-bold text-[#327F74]">{formatCurrency(item.netAmount ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCell({ label, value, className = '' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={`text-[11px] font-semibold text-[#1E293B] ${className}`}>{value}</span>
    </div>
  );
}

/**
 * Line-item list for the POS Customer History invoice preview: product
 * thumbnails (click to enlarge), and click-a-row to expand discount/VAT/batch detail.
 */
export default function InvoicePreviewItems({ items, formatCurrency }) {
  const [expanded, setExpanded] = useState(null);
  const [zoomIndex, setZoomIndex] = useState(null);
  const zoomItem = zoomIndex != null ? items[zoomIndex] : null;

  if (!items.length) {
    return (
      <div className="border border-gray-100 rounded-xl px-3 py-6 text-center text-xs text-gray-400">
        No line items on this invoice.
      </div>
    );
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto_16px] gap-x-3 px-3 py-2 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <span>Item</span>
        <span className="w-10 text-right">Qty</span>
        <span className="w-20 text-right">Price</span>
        <span className="w-20 text-right">Total</span>
        <span />
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {items.map((it, i) => {
          const src = resolveInvoiceItemImage(it.image);
          const isOpen = expanded === i;
          const discountPct = num(it.discount);
          const batch = it.pinnedBatchNumber || it.batchNumber;
          const foc = num(it.foc);
          return (
            <div key={it.id ?? i} className={isOpen ? 'bg-[#FFF8E7]/60' : ''}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : i); } }}
                className="grid grid-cols-[1fr_auto_auto_auto_16px] gap-x-3 items-center px-3 py-2.5 text-xs cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ItemThumb key={src || 'none'} src={src} alt={it.itemName || ''} onZoom={() => setZoomIndex(i)} />
                  <div className="min-w-0">
                    <p className="font-medium text-[#1E293B] leading-tight truncate" title={it.itemName || it.itemCode}>{it.itemName || it.itemCode}</p>
                    <p className="text-[10px] font-mono text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {it.itemCode && <span>{it.itemCode}</span>}
                      {discountPct > 0 && <span className="font-sans font-semibold text-orange-500">−{discountPct}%</span>}
                      {foc > 0 && <span className="font-sans font-semibold text-emerald-600">+{foc} FOC</span>}
                    </p>
                  </div>
                </div>
                <span className="w-10 text-right text-[#1E293B]">{it.quantity}{it.unit ? <span className="text-[9px] text-gray-400 ml-0.5">{it.unit}</span> : null}</span>
                <span className="w-20 text-right text-[#1E293B]">{formatCurrency(it.price ?? it.unitPrice ?? 0)}</span>
                <span className="w-20 text-right font-semibold text-[#1E293B]">{formatCurrency(it.netAmount ?? it.lineTotal ?? 0)}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
              {isOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 px-3 pb-3 pl-[3.75rem]">
                  <DetailCell label="Gross" value={formatCurrency(it.grossAmount ?? num(it.price) * num(it.quantity))} />
                  <DetailCell label="Discount" value={discountPct > 0 ? `${discountPct}%` : '—'} className={discountPct > 0 ? 'text-orange-600' : ''} />
                  <DetailCell label={`VAT${it.taxRate != null ? ` (${num(it.taxRate)}%)` : ''}`} value={formatCurrency(it.taxAmount ?? 0)} />
                  <DetailCell label="Net" value={formatCurrency(it.netAmount ?? 0)} className="text-[#327F74]" />
                  {it.barcode && <DetailCell label="Barcode" value={it.barcode} className="font-mono" />}
                  {it.brandName && <DetailCell label="Brand" value={it.brandName} />}
                  {batch && <DetailCell label="Batch" value={batch} className="text-amber-600" />}
                  {it.serialNumber && <DetailCell label="Serial" value={it.serialNumber} className="font-mono" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {zoomItem && (
        <ImageLightbox
          item={zoomItem}
          src={resolveInvoiceItemImage(zoomItem.image)}
          formatCurrency={formatCurrency}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}
