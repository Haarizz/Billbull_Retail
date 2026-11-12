package com.billbull.backend.purchase.rfq.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.purchase.rfq.Rfq;
import com.billbull.backend.purchase.rfq.RfqDtos.QuoteRequest;
import com.billbull.backend.purchase.rfq.RfqItem;
import com.billbull.backend.purchase.rfq.RfqNegotiation;
import com.billbull.backend.purchase.rfq.RfqNegotiationRepository;
import com.billbull.backend.purchase.rfq.RfqOffer;
import com.billbull.backend.purchase.rfq.RfqRepository;
import com.billbull.backend.purchase.rfq.RfqService;
import com.billbull.backend.purchase.rfq.RfqStatus;
import com.billbull.backend.purchase.rfq.RfqVendor;
import com.billbull.backend.purchase.rfq.portal.RfqPortalDtos.PortalRfq;
import com.billbull.backend.purchase.rfq.portal.RfqPortalDtos.Session;
import com.billbull.backend.settings.email.DocumentEmailSender;

@ExtendWith(MockitoExtension.class)
class RfqPortalServiceTest {

    private static final String TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

    @Mock RfqRepository rfqRepository;
    @Mock RfqService rfqService;
    @Mock RfqNegotiationRepository negotiationRepository;
    @Mock RfqPortalSessionRepository sessionRepository;
    @Mock DocumentEmailSender emailSender;
    @Mock NotificationEventPublisher notifications;

    RfqPortalService service;
    Rfq rfq;
    RfqVendor vendor;

    @BeforeEach
    void setUp() {
        service = new RfqPortalService(rfqRepository, rfqService, negotiationRepository, sessionRepository,
                emailSender, notifications, new RfqPortalRateLimiter());
        rfq = new Rfq();
        rfq.setId(1L);
        rfq.setRfqNumber("RFQ-2026-0001");
        rfq.setTitle("Scanners");
        rfq.setStatus(RfqStatus.SENT);
        rfq.setDeadline(LocalDate.now().plusDays(5));
        rfq.setNotes("INTERNAL — budget 2000");
        RfqItem item = new RfqItem();
        item.setId(11L);
        item.setRfq(rfq);
        item.setItemName("Scanner");
        item.setQtyNeeded(5);
        item.setAwardedOfferId(999L);
        rfq.getItems().add(item);
        vendor = vendor(21L, 10L, "Gulf Tech", "procurement@gulftech.ae", TOKEN);
        RfqVendor other = vendor(22L, 20L, "Al Noor", "orders@alnoor.ae", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
        RfqOffer competitor = new RfqOffer();
        competitor.setId(500L);
        competitor.setRfqVendor(other);
        competitor.setRfqItemId(11L);
        competitor.setUnitPrice(new BigDecimal("1.00"));
        other.getOffers().add(competitor);
        rfq.getVendors().add(vendor);
        rfq.getVendors().add(other);
        lenient().when(rfqRepository.findVendorByPortalToken(TOKEN)).thenReturn(Optional.of(vendor));
        lenient().when(rfqRepository.findVendorById(21L)).thenReturn(Optional.of(vendor));
        lenient().when(rfqService.asPortalVendor(anyString(), any())).thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        lenient().when(sessionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void inviteShowsMaskedEmailOnly() {
        var invite = service.invite(TOKEN, "1.1.1.1");
        assertEquals("p***t@g***.ae", invite.maskedEmail());
        assertTrue(invite.open());
    }

    @Test
    void unknownOrMalformedLinkIs404() {
        assertEquals(HttpStatus.NOT_FOUND, status(() -> service.invite("short", "1.1.1.1")));
        assertEquals(HttpStatus.NOT_FOUND, status(() -> service.invite("x".repeat(43), "1.1.1.1")));
    }

    @Test
    void draftRfqCannotBeOpened() {
        rfq.setStatus(RfqStatus.DRAFT);
        assertFalse(service.invite(TOKEN, "1.1.1.1").open());
        assertEquals(HttpStatus.CONFLICT, status(() -> service.requestCode(TOKEN, "1.1.1.1")));
    }

    @Test
    void codeIsEmailedAndOnlyItsHashStored() throws Exception {
        String code = sendCode();
        assertNotNull(vendor.getOtpHash());
        assertFalse(vendor.getOtpHash().contains(code));
        assertEquals(64, vendor.getOtpHash().length());
        assertTrue(vendor.getOtpExpiresAt().isAfter(LocalDateTime.now().plusMinutes(9)));
    }

    @Test
    void resendIsBlockedDuringCooldown() throws Exception {
        sendCode();
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, status(() -> service.requestCode(TOKEN, "1.1.1.2")));
    }

    @Test
    void sendsPerHourAreCapped() {
        vendor.setOtpWindowStart(LocalDateTime.now().minusMinutes(5));
        vendor.setOtpSendCount(5);
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, status(() -> service.requestCode(TOKEN, "1.1.1.3")));
    }

    @Test
    void failedEmailLeavesNoUsableCode() throws Exception {
        doThrow(new IllegalStateException("smtp down")).when(emailSender).send(anyString(), anyString(), anyString(), isNull(), any());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, status(() -> service.requestCode(TOKEN, "1.1.1.4")));
        assertNull(vendor.getOtpHash());
    }

    @Test
    void wrongCodesAreCountedThenTheCodeIsBurned() throws Exception {
        String code = sendCode();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 1; i < RfqPortalService.MAX_WRONG_CODES; i++) {
            assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.verify(TOKEN, wrong, "2.2.2.2")));
            assertEquals(i, vendor.getOtpAttempts());
        }
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, status(() -> service.verify(TOKEN, wrong, "2.2.2.2")));
        assertNull(vendor.getOtpHash());
        // even the right code is now useless
        assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.verify(TOKEN, code, "2.2.2.2")));
    }

    @Test
    void expiredCodeIsRefused() throws Exception {
        String code = sendCode();
        vendor.setOtpExpiresAt(LocalDateTime.now().minusSeconds(1));
        assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.verify(TOKEN, code, "3.3.3.3")));
    }

    @Test
    void correctCodeIssuesHashedSessionAndClearsCode() throws Exception {
        String code = sendCode();
        Session s = service.verify(TOKEN, code, "4.4.4.4");
        assertNotNull(s.sessionToken());
        assertNull(vendor.getOtpHash());
        ArgumentCaptor<RfqPortalSession> saved = ArgumentCaptor.forClass(RfqPortalSession.class);
        verify(sessionRepository).save(saved.capture());
        assertEquals(RfqPortalService.sha256(s.sessionToken()), saved.getValue().getTokenHash());
        assertEquals(21L, saved.getValue().getRfqVendorId());
        verify(rfqService).logPortalEvent(eq(rfq), eq("portal_opened"), anyString(), eq(true));
    }

    @Test
    void viewOnlyCarriesThisVendorsData() {
        String sessionToken = activeSession();
        RfqNegotiation mine = negotiation(1L, 10L);
        RfqNegotiation theirs = negotiation(2L, 20L);
        when(negotiationRepository.findByRfqIdOrderByIdAsc(1L)).thenReturn(List.of(mine, theirs));

        PortalRfq view = service.view(sessionToken);

        assertEquals(1, view.priceRequests().size());
        assertEquals(1L, view.priceRequests().get(0).id());
        assertTrue(view.response().offers().isEmpty(), "competitor offers must not leak");
        assertTrue(view.canEditQuote());
        String json = view.toString();
        assertFalse(json.contains("INTERNAL"), "internal notes must not leak");
        assertFalse(json.contains("999"), "awards must not leak");
        assertFalse(json.contains("Al Noor"), "other vendors must not leak");
    }

    @Test
    void expiredOrUnknownSessionIs401() {
        assertEquals(HttpStatus.UNAUTHORIZED, status(() -> service.view(null)));
        assertEquals(HttpStatus.UNAUTHORIZED, status(() -> service.view("y".repeat(43))));
        RfqPortalSession s = new RfqPortalSession();
        s.setRfqVendorId(21L);
        s.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(RfqPortalService.sha256("e".repeat(43)))).thenReturn(Optional.of(s));
        assertEquals(HttpStatus.UNAUTHORIZED, status(() -> service.view("e".repeat(43))));
    }

    @Test
    void quoteAfterDeadlineIsRefused() {
        String sessionToken = activeSession();
        rfq.setDeadline(LocalDate.now().minusDays(1));
        assertEquals(HttpStatus.CONFLICT, status(() -> service.saveQuote(sessionToken, new QuoteRequest("SUBMIT", null, null, null, List.of()))));
        verify(rfqService, never()).applyQuote(any(), anyLong(), any());
    }

    @Test
    void submittedQuoteIsAppliedForTheSessionVendorAndBuyerNotified() {
        String sessionToken = activeSession();
        rfq.setCreatedBy("buyer1");
        QuoteRequest q = new QuoteRequest("SUBMIT", "Net 30", null, null, List.of());
        service.saveQuote(sessionToken, q);
        verify(rfqService).applyQuote(rfq, 21L, q);
        verify(notifications).notifyUser(eq("buyer1"), anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), eq("RFQ-2026-0001"), eq("RFQ"));
    }

    @Test
    void priceReplyIsRestrictedToTheSessionVendor() {
        String sessionToken = activeSession();
        service.replyToPriceRequest(sessionToken, 7L, null);
        verify(rfqService).applyNegotiationReply(rfq, 7L, 10L, null);
    }

    @Test
    void baseUrlMustBeHttp() {
        assertEquals("https://erp.example.com", RfqPortalService.normalizeBaseUrl("https://erp.example.com/"));
        assertThrows(IllegalArgumentException.class, () -> RfqPortalService.normalizeBaseUrl("javascript:alert(1)"));
        assertThrows(IllegalArgumentException.class, () -> RfqPortalService.normalizeBaseUrl("https://x.com/?a=<b>"));
    }

    @Test
    void emailBodiesEscapeVendorText() {
        assertEquals("&lt;script&gt;", RfqPortalService.html("<script>"));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private String sendCode() throws Exception {
        service.requestCode(TOKEN, "9.9.9." + System.nanoTime() % 200);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailSender).send(eq("procurement@gulftech.ae"), anyString(), body.capture(), isNull(), any());
        Matcher m = Pattern.compile(">(\\d{6})<").matcher(body.getValue());
        assertTrue(m.find(), "code in email");
        return m.group(1);
    }

    private String activeSession() {
        String token = "s".repeat(43);
        RfqPortalSession s = new RfqPortalSession();
        s.setRfqVendorId(21L);
        s.setExpiresAt(LocalDateTime.now().plusHours(1));
        lenient().when(sessionRepository.findByTokenHashAndIsActiveTrue(RfqPortalService.sha256(token))).thenReturn(Optional.of(s));
        return token;
    }

    private RfqVendor vendor(Long id, Long vendorId, String name, String email, String token) {
        RfqVendor v = new RfqVendor();
        v.setId(id);
        v.setRfq(rfq);
        v.setVendorId(vendorId);
        v.setVendorName(name);
        v.setEmail(email);
        v.setPortalToken(token);
        return v;
    }

    private RfqNegotiation negotiation(Long id, Long vendorId) {
        RfqNegotiation n = new RfqNegotiation();
        n.setId(id);
        n.setRfqId(1L);
        n.setVendorId(vendorId);
        n.setRfqItemId(11L);
        n.setOfferId(100L);
        n.setStatus(com.billbull.backend.purchase.rfq.RfqNegotiationStatus.REQUESTED);
        return n;
    }

    private static HttpStatus status(Runnable r) {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, r::run);
        return HttpStatus.valueOf(e.getStatusCode().value());
    }
}
