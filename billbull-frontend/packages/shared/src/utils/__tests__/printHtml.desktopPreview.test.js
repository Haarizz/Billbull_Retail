import { afterEach, describe, expect, it, vi } from 'vitest';
import { printHtml } from '../printGenerator';

// The BillBull POS desktop app (Electron) has no print preview of its own, so printHtml hands
// non-fast documents to window.billbullDesktop.printPreview and keeps the iframe print for
// browsers, fast receipt prints, and any preview failure.

const HTML = '<html><head><style>@page { size: A4 portrait }</style></head><body>Invoice</body></html>';
const frame = () => document.getElementById('__bb_print_frame__');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  delete window.billbullDesktop;
  frame()?.remove();
});

describe('printHtml in the desktop app', () => {
  it('sends the document to the app preview instead of printing from an iframe', async () => {
    const printPreview = vi.fn().mockResolvedValue({ ok: true });
    window.billbullDesktop = { printPreview };

    printHtml(HTML);
    await flush();

    expect(printPreview).toHaveBeenCalledWith(HTML);
    expect(frame()).toBeNull();
  });

  it('keeps fast (thermal receipt) prints on the direct iframe path', async () => {
    const printPreview = vi.fn().mockResolvedValue({ ok: true });
    window.billbullDesktop = { printPreview };

    printHtml(HTML, { fast: true });
    await flush();

    expect(printPreview).not.toHaveBeenCalled();
    expect(frame()).not.toBeNull();
  });

  it('falls back to the iframe print when the preview fails', async () => {
    window.billbullDesktop = { printPreview: vi.fn().mockRejectedValue(new Error('Not allowed')) };

    printHtml(HTML);
    await flush();

    expect(frame()).not.toBeNull();
  });

  it('prints from an iframe in a normal browser (no desktop bridge)', () => {
    printHtml(HTML);
    expect(frame()).not.toBeNull();
  });
});
