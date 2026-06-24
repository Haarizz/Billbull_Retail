import React, { useMemo } from 'react';
import { Upload } from 'lucide-react';
import { buildDocumentPreviewHtml, buildServiceJobA4Html, stripForPreview } from './posPrintUtils';

export const ThermalMock = ({ paperSize = '80mm', lines = [] }) => (
  <div
    className="mx-auto border border-dashed border-gray-300 rounded-xl p-3 bg-white font-mono text-center space-y-0.5 shadow-sm"
    style={{ width: paperSize === '58mm' ? 190 : 240 }}
  >
    {lines.map((l, i) => (
      <p
        key={i}
        className={`text-[9px] leading-tight ${
          i === 0
            ? 'font-black text-gray-800'
            : l.startsWith('─')
              ? 'text-gray-300'
              : l.startsWith('TOTAL') || l.startsWith('REFUND') || l.startsWith('JOB')
                ? 'font-black text-gray-800'
                : 'text-gray-500'
        }`}
      >
        {l}
      </p>
    ))}
  </div>
);

export const useA4BlobUrl = (html) => {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
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
  <div className="flex gap-1.5">
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
