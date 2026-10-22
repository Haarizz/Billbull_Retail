package com.billbull.backend.document;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;

/**
 * Renders a document's print HTML with {@link HtmlPdfService} and refuses anything that is not a
 * complete PDF of acceptable size, for every channel that sends a PDF to a customer (email,
 * WhatsApp). A failed render therefore never produces a message without its document, and a
 * broken or oversized file is never handed to SMTP or uploaded to Meta.
 *
 * <p>"Complete" means the {@code %PDF-} header and an {@code %%EOF} marker in the last kilobyte,
 * which every PDF writer emits and a truncated render lacks.
 */
public final class DocumentPdfGuard {

    private static final Logger log = LoggerFactory.getLogger(DocumentPdfGuard.class);

    /**
     * Upper bound on the print HTML accepted for rendering. Print HTML carries its QR code, dirham
     * glyph and fonts as data: URIs; logos and stamps are URLs. 10M characters is far above any
     * real document and stops runaway payloads before they reach Chromium.
     */
    public static final int MAX_HTML_CHARS = 10_000_000;

    private static final byte[] SIGNATURE = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] EOF_MARKER = "%%EOF".getBytes(StandardCharsets.US_ASCII);
    private static final int EOF_SEARCH_WINDOW = 1024;

    private DocumentPdfGuard() {}

    /** Why a PDF was refused; the HTTP layer picks the status from it. */
    public enum Reason { RENDER_FAILED, NOT_A_PDF, TOO_LARGE }

    /**
     * Thrown instead of returning an unusable PDF. Extends IllegalStateException so callers that
     * already treat "nothing was sent" that way keep working. The message is safe to show: it
     * names the problem and the consequence, never renderer internals.
     */
    public static class PdfRejectedException extends IllegalStateException {
        private final Reason reason;

        PdfRejectedException(Reason reason, String message, Throwable cause) {
            super(message, cause);
            this.reason = reason;
        }

        public Reason reason() { return reason; }
    }

    /**
     * @param label       what is rendered, for the log only (e.g. a file name)
     * @param maxBytes    the channel's limit
     * @param noun        what the user calls it, e.g. "PDF attachment" or "PDF"
     * @param consequence the end of the user-facing sentence, e.g. "the email was not sent"
     */
    public static byte[] render(HtmlPdfService pdfService, String html, String label, int maxBytes,
                                String noun, String consequence) {
        byte[] bytes;
        try {
            bytes = pdfService.render(html);
        } catch (RuntimeException e) {
            log.warn("PDF render failed for {}: {}", label, e.getMessage());
            throw new PdfRejectedException(Reason.RENDER_FAILED,
                    "Could not generate the " + noun + ", so " + consequence + ".", e);
        }
        if (!hasSignature(bytes)) {
            log.warn("Renderer returned a non-PDF result for {} ({} bytes)", label, bytes == null ? 0 : bytes.length);
            throw new PdfRejectedException(Reason.NOT_A_PDF, "Could not generate the " + noun + ", so " + consequence + ".", null);
        }
        if (bytes.length > maxBytes) {
            log.warn("PDF for {} is {} bytes, over the {} byte limit", label, bytes.length, maxBytes);
            throw new PdfRejectedException(Reason.TOO_LARGE, "The " + noun + " is larger than "
                    + (maxBytes / (1024 * 1024)) + " MB, so " + consequence + ".", null);
        }
        if (!hasEofMarker(bytes)) {
            log.warn("PDF for {} has no %%EOF marker ({} bytes): truncated render", label, bytes.length);
            throw new PdfRejectedException(Reason.NOT_A_PDF, "Could not generate the " + noun + ", so " + consequence + ".", null);
        }
        return bytes;
    }

    /** {@code %PDF-} followed by at least one byte. */
    public static boolean hasSignature(byte[] bytes) {
        if (bytes == null || bytes.length <= SIGNATURE.length) return false;
        for (int i = 0; i < SIGNATURE.length; i++) {
            if (bytes[i] != SIGNATURE[i]) return false;
        }
        return true;
    }

    static boolean hasEofMarker(byte[] bytes) {
        int from = Math.max(SIGNATURE.length, bytes.length - EOF_SEARCH_WINDOW);
        outer:
        for (int i = bytes.length - EOF_MARKER.length; i >= from; i--) {
            for (int j = 0; j < EOF_MARKER.length; j++) {
                if (bytes[i + j] != EOF_MARKER[j]) continue outer;
            }
            return true;
        }
        return false;
    }
}
