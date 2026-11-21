package com.billbull.backend.document.share;

import com.billbull.backend.purchase.rfq.portal.RfqPortalRateLimiter;
import com.billbull.backend.ratelimit.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Public (no JWT, permitted in SecurityConfig) endpoints behind the /d/:token page the customer
 * opens from WhatsApp. The token is the only credential; responses are never cached or indexed.
 */
@RestController
@RequestMapping("/api/public/documents")
public class PublicDocumentController {

    private static final long MINUTE = 60_000L;
    private static final int VIEWS_PER_MINUTE = 60;
    private static final int PDFS_PER_MINUTE = 20;

    private final DocumentShareLinkService service;
    private final RfqPortalRateLimiter limiter;
    private final ClientIpResolver ipResolver;

    public PublicDocumentController(DocumentShareLinkService service, RfqPortalRateLimiter limiter,
                                    ClientIpResolver ipResolver) {
        this.service = service;
        this.limiter = limiter;
        this.ipResolver = ipResolver;
    }

    @GetMapping("/{token}")
    public ResponseEntity<DocumentShareLinkService.PublicView> view(@PathVariable String token, HttpServletRequest request) {
        throttle("doc-view:", VIEWS_PER_MINUTE, request);
        return ResponseEntity.ok().headers(privateHeaders()).body(service.view(token));
    }

    @GetMapping("/{token}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String token,
                                      @RequestParam(defaultValue = "false") boolean download,
                                      HttpServletRequest request) {
        throttle("doc-pdf:", PDFS_PER_MINUTE, request);
        DocumentShareLinkService.Pdf pdf = service.pdf(token);
        HttpHeaders headers = privateHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition((download ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename(pdf.filename()).build()); // safeFilename() keeps it plain ASCII
        return ResponseEntity.ok().headers(headers).body(pdf.bytes());
    }

    private void throttle(String prefix, int limit, HttpServletRequest request) {
        if (!limiter.tryAcquire(prefix + ipResolver.resolve(request), limit, MINUTE)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Please try again in a minute.");
        }
    }

    private static HttpHeaders privateHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setCacheControl(CacheControl.noStore().cachePrivate());
        h.set("X-Robots-Tag", "noindex, nofollow");
        h.set("Referrer-Policy", "no-referrer");
        return h;
    }
}
