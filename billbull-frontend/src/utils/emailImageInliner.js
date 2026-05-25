// QA-040: Make a rendered print/email HTML document survive delivery to a
// real mail client.
//
// Problems we solve:
//   1. Gmail / Outlook strip <style> blocks → run juice to move every CSS
//      rule onto its matching element as an inline style="..." attribute.
//   2. /uploads/ and /assets/ image paths are unreachable from the
//      recipient's mail client → extract every <img src> as a CID-attached
//      inline MIME part. CID inline attachments are the standard way to
//      embed images in HTML email; they don't count against Gmail's 102KB
//      body limit (data: URIs do, which is why we don't use them here).
//
// The frontend hands the backend two things:
//   - the rewritten HTML (with <img src="cid:imgN">)
//   - the array of attachments (base64 payloads + contentType + cid)
// The backend reassembles them via JavaMail's MimeMessageHelper.addInline.

import juice from 'juice';

const isAlreadyInline = (src) =>
    !src ||
    src.startsWith('data:') ||
    src.startsWith('cid:');

const guessContentType = (src, blob) => {
    if (blob?.type) return blob.type;
    const lower = src.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
};

const fetchAsBase64 = async (src) => {
    try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) return null;
        const blob = await res.blob();
        const contentType = guessContentType(src, blob);
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                // dataUrl shape: "data:image/png;base64,XXXX" — strip prefix.
                const commaIdx = result.indexOf(',');
                resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : '');
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
        return base64 ? { contentType, base64 } : null;
    } catch {
        return null;
    }
};

const IMG_SRC_REGEX = /<img\b[^>]*?\bsrc=("([^"]*)"|'([^']*)')[^>]*?>/gi;

/**
 * Inline CSS via juice + rewrite every <img src> to a unique cid: reference
 * (the actual bytes are returned alongside as `inlineAttachments` so the
 * backend can attach them as MIME inline parts).
 *
 * Returns: { html, inlineAttachments: [{ cid, contentType, base64 }] }
 *
 * Images that fail to fetch get dropped from the HTML entirely (better than
 * a broken image icon in the recipient's mail client).
 */
export const buildEmailBody = async (html) => {
    if (typeof html !== 'string' || !html) {
        return { html: html || '', inlineAttachments: [] };
    }

    // Step 1: inline CSS so Gmail/Outlook honor the styling.
    let processed = html;
    try {
        processed = juice(processed, {
            removeStyleTags: true,
            preserveMediaQueries: true,
            preserveFontFaces: false,
            applyAttributesTableElements: true,
            applyWidthAttributes: true,
            applyHeightAttributes: true,
            inlinePseudoElements: false,
        });
    } catch (err) {
        console.warn('CSS inlining failed; continuing with un-inlined HTML.', err);
    }

    if (!processed.includes('<img')) {
        return { html: processed, inlineAttachments: [] };
    }

    // Step 2: collect every unique src that needs hosting (skip data:/cid:).
    const uniqueSources = new Set();
    let match;
    while ((match = IMG_SRC_REGEX.exec(processed)) !== null) {
        const src = match[2] || match[3] || '';
        if (!isAlreadyInline(src)) uniqueSources.add(src);
    }

    if (uniqueSources.size === 0) {
        return { html: processed, inlineAttachments: [] };
    }

    // Step 3: fetch each, base64 the bytes, assign a stable CID per src.
    const sources = Array.from(uniqueSources);
    const fetched = await Promise.all(sources.map((src) => fetchAsBase64(src)));
    const srcToAttachment = new Map();
    const inlineAttachments = [];
    sources.forEach((src, idx) => {
        const payload = fetched[idx];
        if (!payload) return;
        const cid = `inline-img-${idx}`;
        srcToAttachment.set(src, cid);
        inlineAttachments.push({ cid, contentType: payload.contentType, base64: payload.base64 });
    });

    // Step 4: rewrite every <img src> — point to cid: or drop the tag if its
    // fetch failed (no point shipping <img> with a dead src).
    const rewrittenHtml = processed.replace(IMG_SRC_REGEX, (full, quoted, doubleQuoted, singleQuoted) => {
        const original = doubleQuoted ?? singleQuoted ?? '';
        if (isAlreadyInline(original)) return full;
        const cid = srcToAttachment.get(original);
        if (!cid) return '';
        return full.replace(quoted, `"cid:${cid}"`);
    });

    return { html: rewrittenHtml, inlineAttachments };
};
