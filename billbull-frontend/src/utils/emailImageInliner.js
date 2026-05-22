// QA-040: Email images can't be loaded by the recipient's mail client (they
// would have to fetch from the dev server / authenticated /uploads/ path).
// This util rewrites every <img src> in the email HTML to a base64 data URI
// so the body is self-contained when shipped to the backend / SMTP.

const isAlreadyInline = (src) =>
    !src ||
    src.startsWith('data:') ||
    src.startsWith('cid:');

const fetchAsDataUrl = async (src) => {
    try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

/**
 * Rewrites every <img src="..."> in the HTML to a base64 data: URI.
 * Returns the rewritten HTML — never throws; any image that fails to fetch
 * keeps its original src (so worst case it just renders broken, same as today).
 */
export const inlineEmailImages = async (html) => {
    if (typeof html !== 'string' || !html.includes('<img')) return html;

    const srcRegex = /<img\b[^>]*?\bsrc=("([^"]*)"|'([^']*)')/gi;
    const uniqueSources = new Set();
    let match;
    while ((match = srcRegex.exec(html)) !== null) {
        const src = match[2] || match[3] || '';
        if (!isAlreadyInline(src)) uniqueSources.add(src);
    }

    if (uniqueSources.size === 0) return html;

    const entries = await Promise.all(
        Array.from(uniqueSources).map(async (src) => [src, await fetchAsDataUrl(src)])
    );
    const map = new Map(entries.filter(([, dataUrl]) => Boolean(dataUrl)));

    if (map.size === 0) return html;

    return html.replace(srcRegex, (full, _quoted, doubleQuoted, singleQuoted) => {
        const original = doubleQuoted ?? singleQuoted ?? '';
        const replacement = map.get(original);
        if (!replacement) return full;
        return full.replace(_quoted, `"${replacement}"`);
    });
};
