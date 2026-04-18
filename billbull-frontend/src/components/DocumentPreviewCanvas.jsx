import React, { useEffect, useMemo, useRef, useState } from 'react';

const PAPER_DIMENSIONS = {
    A3: { width: 1123, height: 1587 },
    A4: { width: 794, height: 1123 },
    A5: { width: 559, height: 794 },
    Letter: { width: 816, height: 1056 },
    Legal: { width: 816, height: 1344 }
};

const PREVIEW_FRAME_PADDING = {
    width: 104,
    height: 112
};

const EMAIL_VIEWPORT = { width: 860, height: 1180 };
const ZOOM_OPTIONS = [
    { value: 'fit', label: 'Fit' },
    { value: '0.8', label: '80%' },
    { value: '1', label: '100%' },
    { value: '1.2', label: '120%' }
];

const getViewportDimensions = (paperSize, orientation, previewMode) => {
    if (previewMode === 'email') {
        return EMAIL_VIEWPORT;
    }

    const base = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.A4;
    const isLandscape = orientation === 'Landscape';
    const page = isLandscape
        ? { width: base.height, height: base.width }
        : base;

    return {
        width: page.width + PREVIEW_FRAME_PADDING.width,
        height: page.height + PREVIEW_FRAME_PADDING.height
    };
};

const DocumentPreviewCanvas = ({
    printHtml,
    emailHtml,
    paperSize = 'A4',
    orientation = 'Portrait',
    title = 'Live Preview',
    subtitle = 'Preview uses the same rendering engine as live output.'
}) => {
    const shellRef = useRef(null);
    const [previewMode, setPreviewMode] = useState('print');
    const [zoomLevel, setZoomLevel] = useState('fit');
    const [fitScale, setFitScale] = useState(0.84);

    const hasEmailPreview = Boolean(emailHtml);
    const dimensions = useMemo(
        () => getViewportDimensions(paperSize, orientation, previewMode),
        [paperSize, orientation, previewMode]
    );

    useEffect(() => {
        if (!hasEmailPreview && previewMode === 'email') {
            setPreviewMode('print');
        }
    }, [hasEmailPreview, previewMode]);

    useEffect(() => {
        const container = shellRef.current;
        if (!container) return undefined;

        const updateScale = () => {
            const horizontalPadding = 64;
            const verticalPadding = 64;
            const usableWidth = Math.max(container.clientWidth - horizontalPadding, 320);
            const usableHeight = Math.max(container.clientHeight - verticalPadding, 420);
            const widthScale = usableWidth / dimensions.width;
            const heightScale = usableHeight / dimensions.height;
            const nextFitScale = Math.min(widthScale, heightScale, 1);
            setFitScale(Math.max(nextFitScale, 0.42));
        };

        updateScale();

        const observer = new ResizeObserver(updateScale);
        observer.observe(container);
        window.addEventListener('resize', updateScale);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateScale);
        };
    }, [dimensions.height, dimensions.width]);

    const scale = zoomLevel === 'fit' ? fitScale : Number(zoomLevel);
    const activeHtml = previewMode === 'email' && hasEmailPreview ? emailHtml : printHtml;
    const scaledWidth = dimensions.width * scale;
    const scaledHeight = dimensions.height * scale;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
                    <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {hasEmailPreview && (
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setPreviewMode('print')}
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${previewMode === 'print'
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                Print
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewMode('email')}
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${previewMode === 'email'
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                Email
                            </button>
                        </div>
                    )}

                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                        Zoom
                        <select
                            value={zoomLevel}
                            onChange={(event) => setZoomLevel(event.target.value)}
                            className="border-0 bg-transparent text-xs font-semibold text-slate-900 outline-none"
                        >
                            {ZOOM_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div
                ref={shellRef}
                className="relative min-h-[760px] overflow-auto rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,_#f8fbff_0%,_#e6edf5_100%)] p-7 shadow-inner"
            >
                <div
                    className="mx-auto transition-[width,height] duration-200 ease-out"
                    style={{ width: scaledWidth, height: scaledHeight }}
                >
                    <div
                        className="origin-top-left overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] ring-1 ring-slate-200 transition-transform duration-200 ease-out"
                        style={{
                            width: dimensions.width,
                            height: dimensions.height,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left'
                        }}
                    >
                        <iframe
                            title={`${previewMode === 'email' ? 'Email' : 'Print'} Template Preview`}
                            srcDoc={activeHtml}
                            className="h-full w-full border-0 bg-white"
                            sandbox="allow-same-origin"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentPreviewCanvas;
