package com.billbull.backend.purchase.rfq.portal;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.purchase.rfq.RfqDtos.NegotiationReplyRequest;
import com.billbull.backend.purchase.rfq.RfqDtos.QuoteRequest;
import com.billbull.backend.purchase.rfq.portal.RfqPortalDtos.*;
import com.billbull.backend.ratelimit.ClientIpResolver;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Public (no JWT) vendor portal API — permitted in SecurityConfig. Access is the per-vendor link
 * token plus an emailed one-time code; signed-in calls carry {@code X-Vendor-Session}.
 */
@RestController
@RequestMapping("/api/vendor-portal")
public class RfqPortalController {

    static final String SESSION_HEADER = "X-Vendor-Session";

    private final RfqPortalService service;
    private final ClientIpResolver ipResolver;

    public RfqPortalController(RfqPortalService service, ClientIpResolver ipResolver) {
        this.service = service;
        this.ipResolver = ipResolver;
    }

    @GetMapping("/invite/{token}")
    public Invite invite(@PathVariable String token, HttpServletRequest request) {
        return service.invite(token, ipResolver.resolve(request));
    }

    @PostMapping("/invite/{token}/code")
    public CodeSent requestCode(@PathVariable String token, HttpServletRequest request) {
        return service.requestCode(token, ipResolver.resolve(request));
    }

    @PostMapping("/invite/{token}/verify")
    public Session verify(@PathVariable String token, @RequestBody VerifyRequest body, HttpServletRequest request) {
        return service.verify(token, body == null ? null : body.code(), ipResolver.resolve(request));
    }

    @GetMapping("/rfq")
    public PortalRfq view(@RequestHeader(value = SESSION_HEADER, required = false) String session) {
        return service.view(session);
    }

    @PutMapping("/rfq/quote")
    public PortalRfq saveQuote(@RequestHeader(value = SESSION_HEADER, required = false) String session,
                               @RequestBody QuoteRequest body) {
        return service.saveQuote(session, body);
    }

    @PostMapping("/rfq/price-requests/{negotiationId}/reply")
    public PortalRfq reply(@RequestHeader(value = SESSION_HEADER, required = false) String session,
                           @PathVariable Long negotiationId, @RequestBody NegotiationReplyRequest body) {
        return service.replyToPriceRequest(session, negotiationId, body);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value = SESSION_HEADER, required = false) String session) {
        service.logout(session);
        return ResponseEntity.noContent().build();
    }
}
