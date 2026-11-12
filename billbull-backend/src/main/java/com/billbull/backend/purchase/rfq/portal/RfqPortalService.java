package com.billbull.backend.purchase.rfq.portal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.purchase.rfq.Rfq;
import com.billbull.backend.purchase.rfq.RfqDtos.EmailResult;
import com.billbull.backend.purchase.rfq.RfqDtos.NegotiationReplyRequest;
import com.billbull.backend.purchase.rfq.RfqDtos.QuoteRequest;
import com.billbull.backend.purchase.rfq.RfqItem;
import com.billbull.backend.purchase.rfq.RfqNegotiationRepository;
import com.billbull.backend.purchase.rfq.RfqRepository;
import com.billbull.backend.purchase.rfq.RfqService;
import com.billbull.backend.purchase.rfq.RfqStatus;
import com.billbull.backend.purchase.rfq.RfqVendor;
import com.billbull.backend.purchase.rfq.portal.RfqPortalDtos.*;
import com.billbull.backend.settings.email.DocumentEmailSender;

/**
 * Public vendor portal for RFQs.
 *
 * <p>Access needs two things: the per-vendor link secret ({@code RfqVendor.portalToken}) and a
 * six-digit one-time code emailed to the address on the vendor master. A correct code yields a
 * short-lived session token (sent back in {@code X-Vendor-Session}). Codes and session tokens are
 * stored only as SHA-256 hashes. Every endpoint answers for exactly one vendor on one RFQ.
 */
@Service
public class RfqPortalService {

    private static final Logger log = LoggerFactory.getLogger(RfqPortalService.class);

    static final Duration CODE_TTL = Duration.ofMinutes(10);
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    static final Duration SEND_WINDOW = Duration.ofHours(1);
    static final int MAX_SENDS_PER_WINDOW = 5;
    static final int MAX_WRONG_CODES = 5;
    static final Duration SESSION_TTL = Duration.ofHours(8);

    private static final Pattern TOKEN_FORMAT = Pattern.compile("^[A-Za-z0-9_-]{20,64}$");
    private static final Pattern CODE_FORMAT = Pattern.compile("^\\d{6}$");
    private static final Pattern BASE_URL = Pattern.compile("^https?://[^\\s/?#]+(/[^\\s?#]*)?$");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

    private final RfqRepository rfqRepository;
    private final RfqService rfqService;
    private final RfqNegotiationRepository negotiationRepository;
    private final RfqPortalSessionRepository sessionRepository;
    private final DocumentEmailSender emailSender;
    private final NotificationEventPublisher notifications;
    private final RfqPortalRateLimiter limiter;

    public RfqPortalService(RfqRepository rfqRepository, RfqService rfqService,
                            RfqNegotiationRepository negotiationRepository,
                            RfqPortalSessionRepository sessionRepository,
                            DocumentEmailSender emailSender,
                            NotificationEventPublisher notifications,
                            RfqPortalRateLimiter limiter) {
        this.rfqRepository = rfqRepository;
        this.rfqService = rfqService;
        this.negotiationRepository = negotiationRepository;
        this.sessionRepository = sessionRepository;
        this.emailSender = emailSender;
        this.notifications = notifications;
        this.limiter = limiter;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Before sign-in
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    public Invite invite(String token, String ip) {
        throttle("invite:" + ip, 60, Duration.ofMinutes(10));
        RfqVendor v = vendorByToken(token);
        Rfq rfq = v.getRfq();
        String notice = accessNotice(rfq);
        return new Invite(companyName(rfq), v.getVendorName(), rfq.getRfqNumber(), rfq.getTitle(), rfq.getDeadline(),
                maskEmail(v.getEmail()), notice == null, notice);
    }

    @Transactional
    public CodeSent requestCode(String token, String ip) {
        throttle("code:" + ip, 10, Duration.ofMinutes(15));
        RfqVendor v = vendorByToken(token);
        Rfq rfq = v.getRfq();
        String notice = accessNotice(rfq);
        if (notice != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, notice);
        }
        if (v.getEmail() == null || v.getEmail().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No email address is registered for your company. Please contact the buyer to update it.");
        }
        LocalDateTime now = LocalDateTime.now();
        if (v.getOtpSentAt() != null && v.getOtpSentAt().plus(RESEND_COOLDOWN).isAfter(now)) {
            long wait = Duration.between(now, v.getOtpSentAt().plus(RESEND_COOLDOWN)).getSeconds() + 1;
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Please wait " + wait + " seconds before requesting another code.");
        }
        if (v.getOtpWindowStart() == null || v.getOtpWindowStart().plus(SEND_WINDOW).isBefore(now)) {
            v.setOtpWindowStart(now);
            v.setOtpSendCount(0);
        }
        if (v.getOtpSendCount() >= MAX_SENDS_PER_WINDOW) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many codes requested. Please try again in an hour or contact the buyer.");
        }

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        try {
            emailSender.send(v.getEmail(), "Your access code for " + rfq.getRfqNumber(), codeEmail(rfq, v, code), null, rfq.getBranchId());
        } catch (Exception e) {
            log.warn("Vendor portal code email failed rfq={} rfqVendor={}: {}", rfq.getRfqNumber(), v.getId(), e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "We could not send the code right now. Please try again later or contact the buyer.");
        }
        v.setOtpHash(codeHash(v, code));
        v.setOtpExpiresAt(now.plus(CODE_TTL));
        v.setOtpAttempts(0);
        v.setOtpSentAt(now);
        v.setOtpSendCount(v.getOtpSendCount() + 1);
        return new CodeSent(maskEmail(v.getEmail()), (int) CODE_TTL.getSeconds(), (int) RESEND_COOLDOWN.getSeconds());
    }

    /** Wrong guesses must be counted even though the call fails, hence no rollback on the refusal. */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public Session verify(String token, String code, String ip) {
        throttle("verify:" + ip, 30, Duration.ofMinutes(15));
        RfqVendor v = vendorByToken(token);
        String notice = accessNotice(v.getRfq());
        if (notice != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, notice);
        }
        LocalDateTime now = LocalDateTime.now();
        if (v.getOtpHash() == null || v.getOtpExpiresAt() == null || v.getOtpExpiresAt().isBefore(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The code has expired. Please request a new one.");
        }
        String trimmed = code == null ? "" : code.trim();
        boolean match = CODE_FORMAT.matcher(trimmed).matches()
                && MessageDigest.isEqual(v.getOtpHash().getBytes(StandardCharsets.US_ASCII),
                        codeHash(v, trimmed).getBytes(StandardCharsets.US_ASCII));
        if (!match) {
            int attempts = v.getOtpAttempts() + 1;
            v.setOtpAttempts(attempts);
            if (attempts >= MAX_WRONG_CODES) {
                v.setOtpHash(null);
                v.setOtpExpiresAt(null);
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many wrong codes. Please request a new one.");
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That code is not correct. " + (MAX_WRONG_CODES - attempts) + " attempt(s) left.");
        }

        v.setOtpHash(null);
        v.setOtpExpiresAt(null);
        v.setOtpAttempts(0);
        v.setPortalLastAccessAt(now);

        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String sessionToken = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        RfqPortalSession s = new RfqPortalSession();
        s.setRfqVendorId(v.getId());
        s.setTokenHash(sha256(sessionToken));
        s.setExpiresAt(now.plus(SESSION_TTL));
        s.setClientIp(ip == null ? null : ip.substring(0, Math.min(64, ip.length())));
        sessionRepository.save(s);

        rfqService.asPortalVendor(v.getVendorName(), () -> {
            rfqService.logPortalEvent(v.getRfq(), "portal_opened", v.getVendorName() + " signed in to the vendor portal", true);
            return null;
        });
        return new Session(sessionToken, s.getExpiresAt());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Signed in
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    public PortalRfq view(String sessionToken) {
        SessionContext ctx = session(sessionToken);
        return toPortalRfq(ctx.vendor(), ctx.session());
    }

    @Transactional
    public PortalRfq saveQuote(String sessionToken, QuoteRequest request) {
        SessionContext ctx = session(sessionToken);
        RfqVendor v = ctx.vendor();
        Rfq rfq = v.getRfq();
        String blocked = quoteBlockedReason(rfq);
        if (blocked != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, blocked);
        }
        String action = request.action() == null ? "SAVE" : request.action().trim().toUpperCase(Locale.ROOT);
        rfqService.asPortalVendor(v.getVendorName(), () -> rfqService.applyQuote(rfq, v.getId(), request));
        if ("SUBMIT".equals(action) || "DECLINE".equals(action)) {
            notifyBuyer(rfq, "SUBMIT".equals(action) ? "Vendor quotation received" : "Vendor declined RFQ",
                    v.getVendorName() + ("SUBMIT".equals(action) ? " submitted a quotation for " : " declined to quote on ")
                            + rfq.getRfqNumber() + " via the vendor portal");
        }
        return toPortalRfq(v, ctx.session());
    }

    @Transactional
    public PortalRfq replyToPriceRequest(String sessionToken, Long negotiationId, NegotiationReplyRequest request) {
        SessionContext ctx = session(sessionToken);
        RfqVendor v = ctx.vendor();
        Rfq rfq = v.getRfq();
        if (rfq.getStatus().isClosed()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This RFQ is closed.");
        }
        rfqService.asPortalVendor(v.getVendorName(),
                () -> rfqService.applyNegotiationReply(rfq, negotiationId, v.getVendorId(), request));
        notifyBuyer(rfq, "Vendor answered a price request",
                v.getVendorName() + " answered a price request on " + rfq.getRfqNumber() + " via the vendor portal");
        return toPortalRfq(v, ctx.session());
    }

    @Transactional
    public void logout(String sessionToken) {
        if (sessionToken == null || sessionToken.isBlank()) return;
        sessionRepository.findByTokenHashAndIsActiveTrue(sha256(sessionToken)).ifPresent(s -> s.setActive(false));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Staff side: email invitations
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Emails each invited vendor its portal link. The RFQ must already be loaded with staff access
     * checks (the controller calls this right after {@code RfqService.send}). Failures are reported
     * per vendor and never undo the send.
     */
    @Transactional
    public List<EmailResult> emailInvitations(Long rfqId, String portalBaseUrl) {
        String base = normalizeBaseUrl(portalBaseUrl);
        Rfq rfq = rfqRepository.findById(rfqId).orElseThrow(() -> new IllegalArgumentException("RFQ not found."));
        List<EmailResult> results = new ArrayList<>();
        int sent = 0;
        for (RfqVendor v : rfq.getVendors()) {
            if (v.getEmail() == null || v.getEmail().isBlank()) {
                results.add(new EmailResult(v.getId(), v.getVendorName(), null, false, "No email on the vendor record"));
                continue;
            }
            try {
                emailSender.send(v.getEmail(), "Request for Quotation " + rfq.getRfqNumber() + " — " + rfq.getTitle(),
                        invitationEmail(rfq, v, base + "/vendor-portal/" + v.getPortalToken()), null, rfq.getBranchId());
                results.add(new EmailResult(v.getId(), v.getVendorName(), v.getEmail(), true, null));
                sent++;
            } catch (Exception e) {
                log.warn("RFQ invitation email failed rfq={} vendor={}: {}", rfq.getRfqNumber(), v.getVendorName(), e.getMessage());
                results.add(new EmailResult(v.getId(), v.getVendorName(), v.getEmail(), false,
                        e.getMessage() != null ? e.getMessage() : "Email could not be sent"));
            }
        }
        rfqService.logPortalEvent(rfq, "invitation_emailed",
                "Portal invitation emailed to " + sent + " of " + rfq.getVendors().size() + " vendor(s)", false);
        return results;
    }

    /** Validates the portal address up front so a bad value is refused before anything is changed. */
    public static void normalizeBaseUrlOrThrow(String raw) {
        normalizeBaseUrl(raw);
    }

    static String normalizeBaseUrl(String raw) {
        String s = raw == null ? "" : raw.trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (!BASE_URL.matcher(s).matches()) {
            throw new IllegalArgumentException("A valid portal address (http or https) is required to email invitations.");
        }
        return s;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════════════

    private record SessionContext(RfqPortalSession session, RfqVendor vendor) {
    }

    private SessionContext session(String sessionToken) {
        if (sessionToken == null || !TOKEN_FORMAT.matcher(sessionToken).matches()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your session has ended. Please sign in again.");
        }
        RfqPortalSession s = sessionRepository.findByTokenHashAndIsActiveTrue(sha256(sessionToken))
                .filter(x -> x.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your session has ended. Please sign in again."));
        RfqVendor v = rfqRepository.findVendorById(s.getRfqVendorId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This RFQ is no longer available."));
        if (v.getRfq().getStatus() == RfqStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This RFQ is no longer available.");
        }
        return new SessionContext(s, v);
    }

    private RfqVendor vendorByToken(String token) {
        if (token == null || !TOKEN_FORMAT.matcher(token).matches()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This link is not valid.");
        }
        return rfqRepository.findVendorByPortalToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "This link is not valid."));
    }

    /** Null when the vendor may sign in; otherwise the reason shown on the portal. */
    private static String accessNotice(Rfq rfq) {
        if (rfq.getStatus() == RfqStatus.DRAFT) return "This request has not been issued yet.";
        if (rfq.getStatus() == RfqStatus.CANCELLED || rfq.getStatus() == RfqStatus.REJECTED) return "This request has been withdrawn by the buyer.";
        return null;
    }

    /** Null when the vendor may change the quote; otherwise why not. */
    static String quoteBlockedReason(Rfq rfq) {
        if (rfq.getStatus().isClosed()) return "This RFQ is closed, so quotations can no longer be changed.";
        if (rfq.getDeadline() != null && rfq.getDeadline().isBefore(LocalDate.now())) {
            return "The submission deadline (" + DATE.format(rfq.getDeadline()) + ") has passed. Please contact the buyer.";
        }
        return null;
    }

    private PortalRfq toPortalRfq(RfqVendor v, RfqPortalSession s) {
        Rfq rfq = v.getRfq();
        List<Item> items = rfq.getItems().stream().map(this::toItem).toList();
        MyResponse response = new MyResponse(v.getVendorName(), v.getResponseStatus().name(), v.getSubmittedAt(),
                v.getPaymentTerms(), v.getDeliveryTerms(), v.getValidity(), v.getVersion(),
                v.getOffers().stream().map(rfqService::toOfferDto).toList());
        List<PriceRequest> requests = negotiationRepository.findByRfqIdOrderByIdAsc(rfq.getId()).stream()
                .filter(n -> n.getVendorId().equals(v.getVendorId()))
                .map(n -> new PriceRequest(n.getId(), n.getRfqItemId(), n.getOfferId(), n.getStatus().name(), n.getTargetPrice(),
                        n.getTargetQty(), n.getMessage(), n.getDeadline(), n.getRequestedAt(), n.getRespondedAt(),
                        n.getResponseMessage(), n.getPreviousPrice(), n.getRevisedPrice(), rfqService.readNegotiationHistory(n.getHistoryJson())))
                .toList();
        String blocked = quoteBlockedReason(rfq);
        String state = rfq.getStatus().isClosed() ? "CLOSED" : "OPEN";
        return new PortalRfq(companyName(rfq), rfq.getRfqNumber(), rfq.getTitle(), state, rfq.getDeadline(), rfq.getExpectedDelivery(),
                rfq.getDeliveryLocation(), rfq.getCurrency(), rfq.getTaxPref(), rfq.getPaymentTerms(), rfq.getDeliveryTerms(),
                rfq.getQuotationValidity(), rfq.getShippingReqs(), rfq.getVendorInstructions(), items, response, requests,
                blocked == null, blocked, s.getExpiresAt());
    }

    private Item toItem(RfqItem i) {
        return new Item(i.getId(), i.getLineNo(), i.getItemCode(), i.getItemName(), i.getDescription(), i.getCategory(),
                i.getBrand(), i.getModel(), i.getUnit(), i.getQtyNeeded(), i.getMinSpec(), i.isAltBrandAllowed(),
                i.isPartialAllowed(), i.getExpectedDelivery(), i.getWarrantyRequired());
    }

    private void notifyBuyer(Rfq rfq, String title, String message) {
        if (rfq.getCreatedBy() == null) return;
        try {
            notifications.notifyUser(rfq.getCreatedBy(), title, message, "INFO", "PURCHASE", "MEDIUM",
                    "/purchases/price-shares?view=detail&rfq=" + rfq.getId(), rfq.getRfqNumber(), "RFQ");
        } catch (Exception e) {
            log.warn("RFQ portal notification failed rfq={}: {}", rfq.getRfqNumber(), e.getMessage());
        }
    }

    private String companyName(Rfq rfq) {
        try {
            String name = emailSender.getFromNameForBranch(rfq.getBranchId());
            return name == null || name.isBlank() ? "BillBull" : name;
        } catch (Exception e) {
            return "BillBull";
        }
    }

    private void throttle(String key, int limit, Duration window) {
        if (!limiter.tryAcquire(key, limit, window.toMillis())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please wait a few minutes and try again.");
        }
    }

    static String maskEmail(String email) {
        if (email == null || email.isBlank()) return null;
        String e = email.trim();
        int at = e.indexOf('@');
        if (at <= 0) return "***";
        String local = e.substring(0, at);
        String domain = e.substring(at + 1);
        String shownLocal = local.length() <= 2 ? local.charAt(0) + "*" : local.charAt(0) + "***" + local.charAt(local.length() - 1);
        int dot = domain.lastIndexOf('.');
        String shownDomain = dot > 0 ? domain.charAt(0) + "***" + domain.substring(dot) : domain.charAt(0) + "***";
        return shownLocal + "@" + shownDomain;
    }

    /** Bound to the link secret so a code is only valid for the link it was issued to. */
    private static String codeHash(RfqVendor v, String code) {
        return sha256(v.getPortalToken() + ":" + v.getId() + ":" + code);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String html(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private String codeEmail(Rfq rfq, RfqVendor v, String code) {
        return """
                <div style="font-family:Arial,sans-serif;max-width:520px;color:#111827">
                  <p>Dear %s,</p>
                  <p>Use this code to open <strong>%s — %s</strong> in the %s vendor portal:</p>
                  <p style="font-size:28px;font-weight:bold;letter-spacing:6px;background:#FFF8E7;border:1px solid #FDE6A9;border-radius:8px;padding:12px 16px;display:inline-block">%s</p>
                  <p style="color:#6b7280;font-size:13px">The code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
                </div>
                """.formatted(html(v.getVendorName()), html(rfq.getRfqNumber()), html(rfq.getTitle()), html(companyName(rfq)), code);
    }

    private String invitationEmail(Rfq rfq, RfqVendor v, String link) {
        StringBuilder rows = new StringBuilder();
        for (RfqItem i : rfq.getItems()) {
            String spec = ((i.getBrand() == null ? "" : i.getBrand()) + " " + (i.getModel() == null ? "" : i.getModel())).trim();
            rows.append("<tr><td style=\"padding:6px;border-bottom:1px solid #eee\">").append(html(i.getItemName()))
                    .append(spec.isEmpty() ? "" : "<br><span style=\"color:#6b7280;font-size:12px\">" + html(spec) + "</span>")
                    .append("</td><td style=\"padding:6px;border-bottom:1px solid #eee;text-align:right\">")
                    .append(i.getQtyNeeded()).append(" ").append(html(i.getUnit())).append("</td></tr>");
        }
        String deadline = rfq.getDeadline() == null ? "—" : DATE.format(rfq.getDeadline());
        return """
                <div style="font-family:Arial,sans-serif;max-width:600px;color:#111827">
                  <p>Dear %s,</p>
                  <p>%s invites you to quote for the request below. Please submit your prices through the secure vendor portal by <strong>%s</strong>.</p>
                  <table style="border-collapse:collapse;font-size:14px;margin:8px 0 4px">
                    <tr><td style="padding:2px 12px 2px 0;color:#6b7280">RFQ</td><td><strong>%s</strong></td></tr>
                    <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Title</td><td>%s</td></tr>
                    <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Delivery</td><td>%s</td></tr>
                  </table>
                  <table style="border-collapse:collapse;width:100%%;font-size:14px;margin:12px 0">
                    <tr><th style="text-align:left;padding:6px;border-bottom:2px solid #F5C742">Item</th><th style="text-align:right;padding:6px;border-bottom:2px solid #F5C742">Qty</th></tr>
                    %s
                  </table>
                  %s
                  <p style="margin:20px 0"><a href="%s" style="background:#F5C742;color:#111827;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;display:inline-block">Open the vendor portal</a></p>
                  <p style="color:#6b7280;font-size:13px">For security you will receive a one-time code at this email address when you open the link. This link is personal to your company — please do not forward it.</p>
                  <p>Kind regards,<br>%s</p>
                </div>
                """.formatted(html(v.getVendorName()), html(companyName(rfq)), deadline, html(rfq.getRfqNumber()), html(rfq.getTitle()),
                html(rfq.getDeliveryLocation() == null ? "—" : rfq.getDeliveryLocation()), rows,
                rfq.getVendorInstructions() == null ? "" : "<p><strong>Instructions:</strong> " + html(rfq.getVendorInstructions()) + "</p>",
                html(link), html(companyName(rfq)));
    }
}
