package com.billbull.backend.purchase.rfq;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.lpo.LpoDetailResponse;
import com.billbull.backend.purchase.lpo.LpoRequest;
import com.billbull.backend.purchase.lpo.LpoService;
import com.billbull.backend.purchase.rfq.RfqDtos.*;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@ExtendWith(MockitoExtension.class)
class RfqServiceTest {

    @Mock RfqRepository rfqRepository;
    @Mock RfqNegotiationRepository negotiationRepository;
    @Mock RfqActivityRepository activityRepository;
    @Mock RfqPriceHistoryRepository priceHistoryRepository;
    @Mock VendorRepository vendorRepository;
    @Mock ProductRepository productRepository;
    @Mock WarehouseRepository warehouseRepository;
    @Mock BranchAccessService branchAccessService;
    @Mock LpoService lpoService;

    RfqService service;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        service = new RfqService(rfqRepository, negotiationRepository, activityRepository, priceHistoryRepository,
                vendorRepository, productRepository, warehouseRepository, branchAccessService, lpoService, mapper);
        lenient().when(branchAccessService.canAccessTransactionBranch(any())).thenReturn(true);
        lenient().when(negotiationRepository.save(any())).thenAnswer(inv -> {
            RfqNegotiation n = inv.getArgument(0);
            if (n.getId() == null) n.setId(900L);
            return n;
        });
    }

    @Test
    void submittingOneOfTwoQuotesMovesSentRfqToPartiallyResponded() {
        Rfq rfq = rfq(RfqStatus.SENT);
        RfqVendor first = rfq.getVendors().get(0);

        RfqDetail detail = service.saveQuote(1L, first.getId(), quote("SUBMIT", offerReq(null, 11L, "480", 5)));

        assertEquals("PARTIAL", detail.status());
        assertEquals(RfqVendorResponseStatus.SUBMITTED, first.getResponseStatus());
        assertEquals(1, first.getVersion());
        assertEquals(1, first.getOffers().size());
    }

    @Test
    void secondSubmissionByEveryVendorMarksReceivedAndRevisesVersion() {
        Rfq rfq = rfq(RfqStatus.SENT);
        RfqVendor first = rfq.getVendors().get(0);
        RfqVendor second = rfq.getVendors().get(1);
        service.saveQuote(1L, first.getId(), quote("SUBMIT", offerReq(null, 11L, "480", 5)));
        service.saveQuote(1L, second.getId(), quote("DECLINE"));

        RfqDetail detail = service.saveQuote(1L, first.getId(), quote("SUBMIT", offerReq(null, 11L, "470", 5)));

        assertEquals("RECEIVED", detail.status());
        assertEquals(RfqVendorResponseStatus.REVISED, first.getResponseStatus());
        assertEquals(2, first.getVersion());
    }

    @Test
    void submitWithoutAPricedOfferIsRefused() {
        Rfq rfq = rfq(RfqStatus.SENT);
        RfqVendor first = rfq.getVendors().get(0);
        assertThrows(IllegalArgumentException.class,
                () -> service.saveQuote(1L, first.getId(), quote("SUBMIT", offerReq(null, 11L, "0", 5))));
    }

    @Test
    void removingAnAwardedOfferClearsTheAward() {
        Rfq rfq = rfq(RfqStatus.RECEIVED);
        RfqOffer offer = addOffer(rfq.getVendors().get(0), 101L, 11L, "480", 5);
        rfq.getItems().get(0).setAwardedOfferId(offer.getId());

        service.saveQuote(1L, rfq.getVendors().get(0).getId(), quote("SUBMIT", offerReq(null, 11L, "450", 5)));

        assertNull(rfq.getItems().get(0).getAwardedOfferId());
    }

    @Test
    void negotiationRevisedReplyUpdatesOfferPrice() {
        Rfq rfq = rfq(RfqStatus.RECEIVED);
        RfqVendor vendor = rfq.getVendors().get(0);
        vendor.setResponseStatus(RfqVendorResponseStatus.SUBMITTED);
        vendor.setVersion(1);
        RfqOffer offer = addOffer(vendor, 101L, 11L, "495", 5);
        when(negotiationRepository.findByRfqIdOrderByIdAsc(1L)).thenReturn(List.of());

        RfqDetail afterRequest = service.requestBetterPrice(1L,
                new NegotiationRequest(101L, new BigDecimal("460"), 5, "Can you do 460?", null));
        assertEquals("NEGOTIATION", afterRequest.status());
        assertEquals(RfqVendorResponseStatus.REVISION_REQUESTED, vendor.getResponseStatus());

        ArgumentCaptor<RfqNegotiation> saved = ArgumentCaptor.forClass(RfqNegotiation.class);
        verify(negotiationRepository).save(saved.capture());
        RfqNegotiation neg = saved.getValue();
        when(negotiationRepository.findById(neg.getId())).thenReturn(Optional.of(neg));

        service.recordNegotiationReply(1L, neg.getId(), new NegotiationReplyRequest("REVISED", new BigDecimal("475"), "Best we can do"));

        assertEquals(0, new BigDecimal("475").compareTo(offer.getUnitPrice()));
        assertEquals(RfqNegotiationStatus.REVISED, neg.getStatus());
        assertEquals(0, new BigDecimal("495").compareTo(neg.getPreviousPrice()));
        assertEquals(RfqVendorResponseStatus.REVISED, vendor.getResponseStatus());
        assertEquals(2, vendor.getVersion());
    }

    @Test
    void targetPriceMustBeBelowCurrentPrice() {
        Rfq rfq = rfq(RfqStatus.RECEIVED);
        addOffer(rfq.getVendors().get(0), 101L, 11L, "495", 5);
        assertThrows(IllegalArgumentException.class, () -> service.requestBetterPrice(1L,
                new NegotiationRequest(101L, new BigDecimal("500"), 5, "", null)));
    }

    @Test
    void createLposMakesOneDraftPerVendorAndCompletesWhenEverythingIsOrdered() {
        Rfq rfq = rfq(RfqStatus.EVALUATION);
        RfqVendor gulf = rfq.getVendors().get(0);
        RfqVendor noor = rfq.getVendors().get(1);
        addOffer(gulf, 101L, 11L, "480", 5);
        addOffer(noor, 201L, 12L, "180", 5);
        when(lpoService.create(any(LpoRequest.class))).thenAnswer(inv -> lpo(inv.getArgument(0)));

        RfqDetail detail = service.createLpos(1L, new CreateLposRequest(7L, List.of(
                new LpoLine(11L, 101L, 5), new LpoLine(12L, 201L, 5))));

        ArgumentCaptor<LpoRequest> requests = ArgumentCaptor.forClass(LpoRequest.class);
        verify(lpoService, times(2)).create(requests.capture());
        LpoRequest first = requests.getAllValues().get(0);
        assertEquals(10L, first.getVendorId());
        assertEquals("RFQ-2026-0001", first.getReferenceDocument());
        assertEquals(7L, first.getWarehouseId());
        assertEquals(1, first.getItems().size());
        assertEquals(0, new BigDecimal("2400.00").compareTo(first.getItems().get(0).getLineTotal()));
        assertEquals(0, new BigDecimal("5").compareTo(first.getItems().get(0).getPurchaseTax()), "vendor-quoted VAT carried to the LPO line");
        assertEquals("COMPLETED_LPO", detail.status());
        assertEquals(2, detail.lpos().size());
        assertTrue(rfq.getItems().stream().allMatch(i -> i.getQtyOrdered() == 5));
    }

    @Test
    void partialOrderLeavesRfqPartiallyOrdered() {
        Rfq rfq = rfq(RfqStatus.EVALUATION);
        addOffer(rfq.getVendors().get(0), 101L, 11L, "480", 5);
        when(lpoService.create(any(LpoRequest.class))).thenAnswer(inv -> lpo(inv.getArgument(0)));

        RfqDetail detail = service.createLpos(1L, new CreateLposRequest(7L, List.of(new LpoLine(11L, 101L, 3))));

        assertEquals("PARTIAL_ORDERED", detail.status());
        assertEquals(3, rfq.getItems().get(0).getQtyOrdered());
    }

    @Test
    void orderingMoreThanRemainingIsRefusedBeforeAnyLpoIsCreated() {
        Rfq rfq = rfq(RfqStatus.EVALUATION);
        addOffer(rfq.getVendors().get(0), 101L, 11L, "480", 9);
        assertThrows(IllegalArgumentException.class,
                () -> service.createLpos(1L, new CreateLposRequest(7L, List.of(new LpoLine(11L, 101L, 6)))));
        verify(lpoService, never()).create(any());
    }

    @Test
    void closedRfqRejectsQuotes() {
        Rfq rfq = rfq(RfqStatus.CANCELLED);
        assertThrows(IllegalStateException.class,
                () -> service.saveQuote(1L, rfq.getVendors().get(0).getId(), quote("SAVE")));
    }

    @Test
    void cancellingNeedsAReason() {
        rfq(RfqStatus.SENT);
        assertThrows(IllegalArgumentException.class, () -> service.changeStatus(1L, new StatusRequest("CANCELLED", " ")));
        RfqDetail detail = service.changeStatus(1L, new StatusRequest("cancelled", "Budget withdrawn"));
        assertEquals("CANCELLED", detail.status());
    }

    @Test
    void completedWithLpoRequiresAnLpo() {
        rfq(RfqStatus.EVALUATION);
        assertThrows(IllegalArgumentException.class, () -> service.changeStatus(1L, new StatusRequest("COMPLETED_LPO", null)));
    }

    @Test
    void suggestionsRankTheBiggestCheaperRecentSupplierFirst() {
        when(branchAccessService.currentListScope()).thenReturn(new BranchAccessService.ListScope(true, java.util.Set.of()));
        java.time.LocalDate recent = java.time.LocalDate.now().minusDays(10);
        java.time.LocalDate old = java.time.LocalDate.now().minusDays(300);
        // vendor 10: 200 pcs over 6 lines at 40; vendor 20: 20 pcs over 1 line at 55, long ago
        when(priceHistoryRepository.lpoSuppliersOf(any(), any(Boolean.class), any())).thenReturn(List.of(
                new Object[] { 20L, "Al Noor", 101L, 1L, old, 20L, new BigDecimal("55") },
                new Object[] { 10L, "Gulf Tech", 101L, 6L, recent, 200L, new BigDecimal("40") }));
        // vendor 30 has only quoted
        when(priceHistoryRepository.quotingVendorsOf(any(), any())).thenReturn(List.<Object[]>of(
                new Object[] { 30L, "Quote Only", 101L, 1L, java.time.LocalDateTime.now().minusDays(5), new BigDecimal("38") }));
        when(priceHistoryRepository.responseStatsOf(any(), any())).thenReturn(List.of());

        List<VendorSuggestion> out = service.suggestVendors(List.of(101L));

        assertEquals(List.of(10L, 30L, 20L), out.stream().map(VendorSuggestion::vendorId).toList());
        assertEquals(1, out.get(0).products().get(0).rank());
        assertEquals(200L, out.get(0).totalQty());
        assertTrue(out.get(0).score() > out.get(1).score());
    }

    @Test
    void suggestionsPenaliseVendorsThatIgnoreInvitations() {
        when(branchAccessService.currentListScope()).thenReturn(new BranchAccessService.ListScope(true, java.util.Set.of()));
        java.time.LocalDate d = java.time.LocalDate.now().minusDays(30);
        when(priceHistoryRepository.lpoSuppliersOf(any(), any(Boolean.class), any())).thenReturn(List.of(
                new Object[] { 10L, "Silent", 101L, 3L, d, 100L, new BigDecimal("40") },
                new Object[] { 20L, "Responsive", 101L, 3L, d, 100L, new BigDecimal("40") }));
        when(priceHistoryRepository.quotingVendorsOf(any(), any())).thenReturn(List.of());
        when(priceHistoryRepository.responseStatsOf(any(), any())).thenReturn(List.of(
                new Object[] { 10L, 4L, 0L }, new Object[] { 20L, 4L, 4L }));

        List<VendorSuggestion> out = service.suggestVendors(List.of(101L));

        assertEquals(20L, out.get(0).vendorId());
        assertEquals(4, out.get(1).invitations());
    }

    @Test
    void alternativeIsRefusedWhenTheItemDoesNotAllowIt() {
        Rfq rfq = rfq(RfqStatus.SENT);
        rfq.getItems().get(0).setAltBrandAllowed(false);
        OfferRequest alt = new OfferRequest(null, 11L, "Other", null, null, "Other scanner", new BigDecimal("400"), 5, 5,
                "in-stock", null, null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                null, null, true, "cheaper", List.of());

        assertThrows(IllegalArgumentException.class,
                () -> service.saveQuote(1L, rfq.getVendors().get(0).getId(), quote("SAVE", alt)));
    }

    @Test
    void shortQuantityIsRefusedOnSubmitWhenPartialIsNotAllowedButDraftIsKept() {
        Rfq rfq = rfq(RfqStatus.SENT);
        rfq.getItems().get(0).setPartialAllowed(false);
        Long vendorId = rfq.getVendors().get(0).getId();

        assertThrows(IllegalArgumentException.class, () -> service.saveQuote(1L, vendorId, quote("SUBMIT", offerReq(null, 11L, "480", 3))));
        RfqDetail draft = service.saveQuote(1L, vendorId, quote("SAVE", offerReq(null, 11L, "480", 3)));
        assertEquals(1, draft.vendors().get(0).offers().size());
        service.saveQuote(1L, vendorId, quote("SUBMIT", offerReq(null, 11L, "480", 5)));
        assertEquals(RfqVendorResponseStatus.SUBMITTED, rfq.getVendors().get(0).getResponseStatus());
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    private Rfq rfq(RfqStatus status) {
        Rfq rfq = new Rfq();
        rfq.setId(1L);
        rfq.setRfqNumber("RFQ-2026-0001");
        rfq.setTitle("Retail Scanner Procurement");
        rfq.setStatus(status);
        rfq.getItems().add(item(rfq, 11L, 101L, "Wireless Barcode Scanner"));
        rfq.getItems().add(item(rfq, 12L, 102L, "Cash Drawer 410mm"));
        rfq.getVendors().add(vendor(rfq, 21L, 10L, "Gulf Tech Supplies LLC"));
        rfq.getVendors().add(vendor(rfq, 22L, 20L, "Al Noor Trading Co."));
        lenient().when(rfqRepository.findById(1L)).thenReturn(Optional.of(rfq));
        lenient().when(activityRepository.findByRfqIdOrderByOccurredAtDescIdDesc(anyLong())).thenReturn(List.of());
        lenient().when(negotiationRepository.findByRfqIdOrderByIdAsc(1L)).thenReturn(new ArrayList<>());
        return rfq;
    }

    private RfqItem item(Rfq rfq, Long id, Long productId, String name) {
        RfqItem item = new RfqItem();
        item.setId(id);
        item.setRfq(rfq);
        item.setProductId(productId);
        item.setItemName(name);
        item.setUnit("Pcs");
        item.setQtyNeeded(5);
        item.setQtyOrdered(0);
        return item;
    }

    private RfqVendor vendor(Rfq rfq, Long id, Long vendorId, String name) {
        RfqVendor v = new RfqVendor();
        v.setId(id);
        v.setRfq(rfq);
        v.setVendorId(vendorId);
        v.setVendorName(name);
        return v;
    }

    private RfqOffer addOffer(RfqVendor vendor, Long id, Long itemId, String price, int qty) {
        RfqOffer o = new RfqOffer();
        o.setId(id);
        o.setRfqVendor(vendor);
        o.setRfqItemId(itemId);
        o.setUnitPrice(new BigDecimal(price));
        o.setQuotedQty(qty);
        o.setDiscountPercent(BigDecimal.ZERO);
        o.setTaxPercent(new BigDecimal("5"));
        vendor.getOffers().add(o);
        return o;
    }

    private QuoteRequest quote(String action, OfferRequest... offers) {
        return new QuoteRequest(action, "Net 30", "DDP", null, List.of(offers));
    }

    private OfferRequest offerReq(Long id, Long itemId, String price, int qty) {
        return new OfferRequest(id, itemId, "Zebra", "LI4278", null, null, new BigDecimal(price), qty, qty, "in-stock",
                null, null, "1 Year", null, new BigDecimal("5"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                null, null, false, null, List.of());
    }

    private LpoDetailResponse lpo(LpoRequest request) {
        LpoDetailResponse r = new LpoDetailResponse();
        r.setId(request.getVendorId() * 100);
        r.setLpoNumber("LPO-" + request.getVendorId());
        return r;
    }
}
