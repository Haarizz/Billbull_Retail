/*
 * ThermalMock defines small, purely-presentational sub-components (Divider, Row,
 * SectionLabel) inside its render. They are stateless and prop-driven and close
 * over per-render font sizes (fs/fsS), so the usual "state resets on re-creation"
 * concern behind react-hooks/static-components does not apply here. This is a
 * static designer preview with no internal state, so the rule is disabled for
 * this file rather than threading fs/fsS through ~50 call sites.
 */
/* eslint-disable react-hooks/static-components */
import React, { useMemo } from 'react';
import { Upload } from 'lucide-react';
import { buildDocumentPreviewHtml, buildServiceJobA4Html, stripForPreview } from './posPrintUtils';
import { ROBOTO_MONO_FONT_FACE } from '../../../utils/receiptFont';

// Rich thermal receipt preview that mirrors the actual print output exactly
export const ThermalMock = ({
  paperSize = '80mm',
  outletName = 'Main Branch',
  outletAddress = 'Building 23, Marina Plaza\nDubai Marina, Dubai\nUnited Arab Emirates',
  outletPhone = '+971 4 123 4567',
  outletTrn = '100123456700003',
  logoDataUrl = null,
  stampDataUrl = null,
  headerText = 'Thank you for dining with us!',
  footerText = 'Visit us again soon\nwww.billbull.ae | @billbull',
  showLogo = true,
  showTrn = true,
  showCompanyDetails = true,
  showServiceCharge = true,
  showVatSummary = true,
  showPaymentDetails = true,
  showQRCode = true,
  showCustomerDetails = true,
  showLoyaltyPoints = true,
  showCreditBalance = true,
  showFooterText = true,
  templateType = 'receipt',
  // job card specific toggles
  showSerialNumber = true,
  showWarranty = true,
  showTechnician = true,
  showExpectedDate = true,
  showCustomerSignature = true,
}) => {
  const is58 = paperSize === '58mm';
  const fs = is58 ? 11 : 12;        // base font size
  const fsS = is58 ? 10 : 11;       // small font size
  const fsH = is58 ? 13 : 14;       // heading font size
  const isReturn = templateType === 'return';
  const isJobCard = templateType === 'jobcard';

  const mono = { fontFamily: "'Roboto Mono', 'Courier New', Courier, monospace" };

  // §1: collapse the multi-line / comma address into one continuous line.
  const addrLine = (outletAddress || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');

  const Divider = () => (
    <div style={{ borderTop: '1.5px dashed #d1d5db', margin: '10px 0', width: '100%' }} />
  );

  // Left label + right value row. `item` rows keep the long left text flexible
  // (line items); label rows keep the label fixed and let the right value wrap.
  const Row = ({ left, right, bold, small, teal, item }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3, ...mono }}>
      <span style={{
        fontSize: small ? fsS : fs,
        color: teal ? '#0d9488' : bold ? '#111827' : '#4b5563',
        fontWeight: bold ? '700' : '400',
        fontStyle: small ? 'italic' : 'normal',
        flex: item ? 1 : '0 0 auto',
        whiteSpace: item ? 'normal' : 'nowrap',
        lineHeight: 1.45,
      }}>{left}</span>
      {right !== undefined && (
        <span style={{
          fontSize: small ? fsS : fs,
          color: bold ? '#111827' : '#4b5563',
          fontWeight: bold ? '700' : '400',
          flex: 1,
          textAlign: 'right',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          lineHeight: 1.45,
        }}>{right}</span>
      )}
    </div>
  );

  // Section label (CUSTOMER, LOYALTY POINTS, etc.)
  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: fsS, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: '600', ...mono }}>{children}</div>
  );

  return (
    <div className="max-w-full" style={{
      width: '100%',
      maxWidth: is58 ? 260 : 330,
      margin: '0 auto',
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: is58 ? '20px 16px 18px' : '24px 20px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      ...mono,
    }}>
      {/* Registers the Roboto Mono @font-face for this directly-rendered DOM tree —
          unlike the iframe-based print previews, there's no <head> to embed it in,
          so the fontFamily above would silently fall back without this. */}
      <style>{ROBOTO_MONO_FONT_FACE}</style>

      {/* ── Logo ── */}
      {showLogo && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          {logoDataUrl
            ? <img src={logoDataUrl} alt="Logo" style={{ height: 64, maxWidth: '80%', objectFit: 'contain', borderRadius: 8, display: 'block', margin: '0 auto' }} />
            : (
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#f3f4f6', border: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}>
                <span style={{ fontSize: fsS, color: '#9ca3af' }}>Logo</span>
              </div>
            )
          }
        </div>
      )}

      {/* ── TAX INVOICE label (receipt/return only) ── */}
      {!isJobCard && (
        <div style={{ textAlign: 'center', fontSize: fs, fontWeight: '700', color: '#111827', marginBottom: 4 }}>
          {isReturn ? 'CREDIT NOTE' : 'TAX INVOICE'}
        </div>
      )}

      {/* ── Header text ── */}
      {headerText && (
        <div style={{ textAlign: 'center', fontSize: fs, color: '#374151', marginBottom: 4, lineHeight: 1.5 }}>
          {headerText}
        </div>
      )}

      {/* ── Company details — single-line address (§1) ── */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: fsH, fontWeight: '700', color: '#111827', marginBottom: 4 }}>{outletName || 'Branch Name'}</div>
        {showCompanyDetails && addrLine && <div style={{ fontSize: fsS, color: '#0d9488', lineHeight: 1.5 }}>{addrLine}</div>}
        {showCompanyDetails && outletPhone && <div style={{ fontSize: fsS, color: '#0d9488', lineHeight: 1.5 }}>Tel: {outletPhone}</div>}
        {showTrn && outletTrn && <div style={{ fontSize: fsS, color: '#0d9488', lineHeight: 1.5 }}>TRN: {outletTrn}</div>}
      </div>

      <Divider />

      {isJobCard ? (
        <>
          <Row left="Job No:" right="SRV-000028" />
          <Row left="Date:" right="22 Jun 2026" />
          {showTechnician && <Row left="Technician:" right="Mohammed Ali" />}
          <Divider />
          {showCustomerDetails && (
            <>
              <Row left="Customer:" right="Fatima Hassan" />
              <Row left="Phone:" right="+971 50 123 4567" small />
              <Divider />
            </>
          )}
          <Row left="Item:" right="Samsung A55" />
          {showSerialNumber && <Row left="Serial No:" right="SNSA55-20260312" />}
          {showWarranty && <Row left="Warranty:" right="Under Warranty" small />}
          <Row left="Problem:" right="Display issue" small />
          {showExpectedDate && <Row left="Expected:" right="29 Jun 2026" small />}
          <Divider />
          {showCustomerSignature && (
            <div style={{ fontSize: fsS, color: '#4b5563', marginTop: 6, ...mono }}>
              Cust. Signature: ___________________
            </div>
          )}
          {showFooterText && footerText && (
            <div style={{ textAlign: 'center', fontSize: fsS, color: '#0d9488', marginTop: 8, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{footerText}</div>
          )}
        </>
      ) : (
        <>
          {/* ── Transaction header (§2): Cashier, Terminal ID, Counter ── */}
          <Row left="Invoice No:" right={isReturn ? 'SR-28-042' : 'DI-28-042'} />
          <Row left="Date:" right="24-Jun-2026 03:15 PM" />
          <Row left="Cashier:" right="Hari K" />
          <Row left="Terminal ID:" right="POS-01" />
          <Row left="Counter:" right="Counter-01" />
          <Divider />

          {/* ── Line items ── */}
          {isReturn ? (
            <>
              <Row left="1x Samsung A55" right="-1,380.00" item />
              <Row left="  VAT Reversal" right="-69.00" small teal item />
            </>
          ) : (
            <>
              <Row left="1x Margherita Pizza" right="45.00" item />
              <Row left="  Extra cheese, No olives" small teal item />
              <Row left="2x Coke" right="16.00" item />
              <Row left="1x Caesar Salad" right="28.00" item />
            </>
          )}
          <Divider />

          {/* ── Totals (§3): Discount row + dynamic VAT label (no hardcoded %) ── */}
          <Row left="Subtotal:" right={isReturn ? '-1,380.00' : 'AED 89.00'} />
          {!isReturn && <Row left="Discount:" right="AED 0.00" />}
          {showServiceCharge && <Row left="Service Charge:" right={isReturn ? '-138.00' : 'AED 8.90'} />}
          {showVatSummary && <Row left="VAT:" right={isReturn ? '-69.00' : 'AED 4.90'} />}
          <Divider />

          {/* ── TOTAL — large bold row ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 6px', ...mono }}>
            <span style={{ fontSize: is58 ? 15 : 17, fontWeight: '800', color: '#111827' }}>TOTAL:</span>
            <span style={{ fontSize: is58 ? 15 : 17, fontWeight: '800', color: '#111827' }}>{isReturn ? 'AED -1,449.00' : 'AED 102.80'}</span>
          </div>
          <Divider />

          {/* ── Payment details (§4): mode, cash received, change ── */}
          {showPaymentDetails && !isReturn && (
            <>
              <Row left="Payment Mode:" right="Cash" />
              <Row left="Cash Received:" right="AED 150.00" />
              <Row left="Change Returned:" right="AED 47.20" />
              <Divider />
            </>
          )}
          {isReturn && (
            <>
              <Row left="Refund Method:" right="Cash" />
              <Divider />
            </>
          )}

          {/* ── QR / Stamp (§5): stamp uploaded → show stamp ONLY, hide QR ── */}
          {stampDataUrl ? (
            <div style={{ textAlign: 'center', margin: '12px 0 10px' }}>
              <img src={stampDataUrl} alt="Stamp" style={{ height: 90, maxWidth: '70%', objectFit: 'contain', margin: '0 auto', borderRadius: 6 }} />
            </div>
          ) : showQRCode && (
            <div style={{ textAlign: 'center', margin: '12px 0 10px' }}>
              <div style={{
                width: 90, height: 90,
                border: '1px solid #e5e7eb', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto', background: '#f9fafb',
              }}>
                <span style={{ fontSize: fsS, color: '#9ca3af' }}>QR Code</span>
              </div>
              <div style={{ fontSize: fsS - 1, color: '#9ca3af', marginTop: 2 }}>Scan to verify</div>
            </div>
          )}

          {/* ── Customer details ── */}
          {showCustomerDetails && (
            <>
              <Divider />
              <SectionLabel>Customer</SectionLabel>
              <Row left="Name:" right="Sarah Johnson" />
              <Row left="Mobile:" right="+971 50 123 4567" />
              <Row left="Email:" right="sarah@email.com" />
            </>
          )}

          {/* ── Loyalty Points ── */}
          {showLoyaltyPoints && (
            <>
              <Divider />
              <SectionLabel>Loyalty Points</SectionLabel>
              <Row left="Points Earned:" right="+ 10 pts" />
              <Row left="Points Used:" right="0 pts" />
              <Row left="Remaining Balance:" right="1,250 pts" />
            </>
          )}

          {/* ── Credit Account ── */}
          {showCreditBalance && (
            <>
              <Divider />
              <SectionLabel>Credit Account</SectionLabel>
              <Row left="Previous Balance:" right="AED 245.50" />
              <Row left="Invoice Credit:" right="AED 0.00" />
              <Row left="Amount Paid:" right="AED 102.80" />
              <Row left="Updated Balance:" right="AED 245.50" />
            </>
          )}

          {/* ── Footer text ── */}
          {showFooterText && footerText && (
            <>
              <Divider />
              <div style={{ textAlign: 'center', fontSize: fsS, color: '#0d9488', marginTop: 6, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{footerText}</div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const useA4BlobUrl = (html) => {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    if (!html) {
      setUrl('');
      return;
    }
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    setUrl(blobUrl);
    // Revoke on a macrotask well after React's commit + paint cycle. A delay
    // of 0ms can fire within the same animation frame in some browsers, racing
    // the iframe teardown. 100ms gives React ample headroom to finish removing
    // the iframe DOM node before the blob URL is freed.
    return () => {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    };
  }, [html]);
  return url;
};

export const A4PreviewFrame = ({ html, scale }) => {
  const url = useA4BlobUrl(html);
  const s = scale ?? 0.455;
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white w-full"
      style={{ height: Math.round(1055 * s) }}
    >
      <div style={{ width: 794, transformOrigin: 'top left', transform: `scale(${s})`, position: 'absolute', top: 0, left: 0 }}>
        {url && <iframe src={url} style={{ width: 794, height: 1055, border: 'none', display: 'block' }} title="A4 preview" />}
      </div>
    </div>
  );
};

export const A4LivePreview = ({ category, companyName, trn, address, phone, footerNote, scale, toggles }) => {
  const html = useMemo(
    () => buildDocumentPreviewHtml(category, { companyName, trn, address, phone, footerNote }, toggles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, companyName, trn, address, phone, footerNote, JSON.stringify(toggles)]
  );
  return <A4PreviewFrame html={html} scale={scale} />;
};

export const ServiceJobA4Preview = ({ companyName, trn, address, phone, footerNote, scale }) => {
  const html = useMemo(
    () => stripForPreview(buildServiceJobA4Html({ companyName, trn, address, phone, footerNote })),
    [companyName, trn, address, phone, footerNote]
  );
  return <A4PreviewFrame html={html} scale={scale} />;
};

export const PaperSizePicker = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {['80mm', '58mm', 'A4'].map(s => (
      <button
        type="button"
        key={s}
        onClick={() => onChange(s)}
        className={`px-3 py-1 rounded-lg border text-xs font-bold transition-all ${
          value === s
            ? 'border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B]'
            : 'border-gray-200 text-gray-400 hover:border-gray-300'
        }`}
      >
        {s}
      </button>
    ))}
  </div>
);

export const ImageUploadBox = ({ label, value, onChange, hint }) => {
  const inputRef = React.useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#F5C742] bg-gray-50 hover:bg-[#F5C742]/5 flex items-center justify-center overflow-hidden transition-all group"
      >
        {value
          ? <img src={value} alt={label} className="w-full h-full object-contain p-1.5" />
          : (
            <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-[#b8920e]">
              <Upload className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase">Upload</span>
            </div>
          )
        }
      </button>
      {value
        ? <button type="button" onClick={() => onChange(null)} className="text-[9px] text-red-400 hover:text-red-600 font-semibold">Remove</button>
        : hint && <span className="text-[9px] text-gray-300 text-center">{hint}</span>
      }
    </div>
  );
};

export function A4ScaledPreview({ src, fillWidth = false }) {
  const containerRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  const [containerSize, setContainerSize] = React.useState({ w: 794, h: 1055 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const scaleW = w / 794;
      const scaleH = h / 1055;
      setScale(fillWidth ? scaleW : Math.min(scaleW, scaleH));
      setContainerSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillWidth]);

  const scaledH = 1055 * scale;
  const leftOffset = fillWidth ? 0 : (containerSize.w - 794 * scale) / 2;
  const topOffset = fillWidth ? 0 : (containerSize.h - scaledH) / 2;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflowX: 'hidden', overflowY: fillWidth ? 'auto' : 'hidden' }}
    >
      <div
        style={{
          width: 794,
          height: 1055,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          position: fillWidth ? 'relative' : 'absolute',
          top: topOffset,
          left: leftOffset,
          marginBottom: fillWidth ? `${scaledH - 1055}px` : 0,
        }}
      >
        <iframe src={src} style={{ width: 794, height: 1055, border: 'none', display: 'block' }} title="Invoice Preview" />
      </div>
    </div>
  );
}

export function ThermalScaledPreview({ src }) {
  return (
    <div className="flex-1 flex justify-center bg-[#f0f2f5] p-6 overflow-y-auto">
      <div className="w-[340px] max-w-full bg-white shadow-2xl p-4 rounded-xl border border-gray-200 shrink-0 flex flex-col" style={{ minHeight: '500px' }}>
        <iframe src={src} style={{ width: '100%', flex: 1, border: 'none', display: 'block', height: '100%', minHeight: '600px' }} title="Thermal Receipt Preview" />
      </div>
    </div>
  );
}
