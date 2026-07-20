import React from 'react';

/**
 * Renders an arbitrary HTML string (a real print/PDF output, not a hand-coded mock)
 * as a Blob URL so it can be loaded into an iframe. Extracted from POS's own A4
 * designer preview (POSPrintPreview.jsx) — this pattern renders the actual generated
 * HTML rather than a second, hand-written approximation of the layout, so it stays
 * generic and reusable by any A4 document family (POS or Back Office Sales/Purchases).
 */
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
