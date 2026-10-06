package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.settings.PosDeliveryReturnChargePolicy;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnCondition;
import com.billbull.backend.sales.returns.SalesReturnEntryPoint;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnService;
import com.billbull.backend.sales.returns.SalesReturnStatus;

/**
 * Returning a refused delivery from the POS Delivery Settlement screen.
 *
 * <p>These tests deliberately do not re-test the returns engine. Restocking, the GL journal, the
 * receivable allocation and the authorization threshold all belong to {@link SalesReturnService}
 * and are covered by its own suite; here it is a mock, and what matters is <em>what this service
 * hands it</em> and <em>what it does afterwards</em>.
 *
 * <p>Four things are this class's own, and each one is a way the feature could be wrong while
 * every other test in the repo still passed:
 *
 * <ul>
 *   <li>the guard — a part-paid order must not be returnable here, because there would be money
 *       to hand back and no way on this screen to hand it back;</li>
 *   <li>the fixed settlement — an unpaid return has exactly one legal refund method, and sending
 *       any other would be rejected by the engine at approval;</li>
 *   <li>the delivery charge — whether it survives, and whose answer decides;</li>
 *   <li>the close-out — whether the order leaves the delivery list, which must follow what is
 *       still owed rather than the mere fact that a return happened.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosDeliveryReturnServiceTest {

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesReturnService salesReturnService;
    @Mock private InvoiceBalanceService invoiceBalanceService;
    @Mock private PosSettingsService posSettingsService;

    @InjectMocks private PosDeliveryReturnService service;

    private SalesInvoice invoice;

    @BeforeEach
    void setUp() {
        invoice = deliveryInvoice();
        // The service loads the order fetch-joined with its items (open-in-view is off); the
        // plain findById is still used by the post-approval re-reads. lenient() because the
        // guard tests return before one or the other is reached.
        lenient().when(invoiceRepository.findByIdWithItems(1L)).thenReturn(Optional.of(invoice));
        lenient().when(invoiceRepository.findById(1L)).thenReturn(Optional.of(invoice));
        when(invoiceRepository.save(any(SalesInvoice.class))).thenAnswer(i -> i.getArgument(0));
        when(salesReturnService.saveReturn(any(SalesReturn.class))).thenAnswer(i -> {
            SalesReturn r = i.getArgument(0);
            r.setId(99L);
            return r;
        });
        when(salesReturnService.updateStatus(eq(99L), eq(SalesReturnStatus.APPROVED), any(), any()))
                .thenAnswer(i -> {
                    SalesReturn approved = new SalesReturn();
                    approved.setId(99L);
                    approved.setReturnNumber("SR-0007");
                    approved.setTotalAmount(new BigDecimal("2800.00"));
                    return approved;
                });
        // Nothing left owing by default: the goods were the whole balance.
        when(invoiceBalanceService.recomputeInvoiceBalanceByNumber(anyString())).thenReturn(BigDecimal.ZERO);
        settingsPolicy(PosDeliveryReturnChargePolicy.WAIVE);
    }

    // ---------------------------------------------------------------
    // The guard
    // ---------------------------------------------------------------

    @Test
    void refusesAnOrderTheCustomerHasAlreadyPaidSomethingTowards() {
        invoice.setAmountPaid(new BigDecimal("500.00"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.returnDelivery(1L, request()));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        // The message has to send the cashier somewhere, not just say no.
        assertTrue(ex.getReason().contains("Sales Return"), ex.getReason());
        verify(salesReturnService, never()).saveReturn(any());
    }

    @Test
    void refusesAnInvoiceThatWasNeverOutForDelivery() {
        invoice.setPosDriverName(null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.returnDelivery(1L, request()));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        verify(salesReturnService, never()).saveReturn(any());
    }

    @Test
    void refusesAnOrderThatWasAlreadyReturned() {
        invoice.setPosDeliveryReturnedAt(LocalDateTime.now().minusDays(1));
        invoice.setPosDeliveryReturnNumber("SR-0001");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.returnDelivery(1L, request()));

        // A conflict, not a validation error: the request was reasonable, the world moved on.
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("SR-0001"), ex.getReason());
    }

    // ---------------------------------------------------------------
    // What the engine is handed
    // ---------------------------------------------------------------

    @Test
    void settlesAsCustomerCreditBecauseAnUnpaidReturnCanSettleNoOtherWay() {
        service.returnDelivery(1L, request());

        SalesReturn sent = captureSavedReturn();
        // Anything else is rejected by assertSettlementMethodMatchesSplit at approval: the
        // customer has handed over nothing, so there is nothing to hand back.
        assertEquals(SalesReturnRefundMethod.CUSTOMER_CREDIT, sent.getRefundMethod());
        assertEquals(SalesReturnEntryPoint.POS, sent.getEntryPoint());
        // Branch is the engine's to stamp from the authenticated user, and it checks that
        // against the invoice afterwards — setting it here would answer its own question.
        assertNull(sent.getBranch());
    }

    @Test
    void returnsEveryUnvoidedLineInFullWhenNoLinesAreNamed() {
        service.returnDelivery(1L, request());

        SalesReturn sent = captureSavedReturn();
        assertEquals(2, sent.getItems().size());
        assertEquals(2, sent.getItems().get(0).getReturnQty());
        assertEquals(1, sent.getItems().get(1).getReturnQty());
        // The voided line never left the shop, so there is nothing of it to bring back.
        assertTrue(sent.getItems().stream().noneMatch(i -> "VOIDED".equals(i.getItemCode())));
    }

    @Test
    void proRatesLineMoneyFromTheInvoiceRatherThanRecomputingIt() {
        PosDeliveryReturnRequest req = request();
        req.setLines(List.of(line("WIDGET", 1)));

        service.returnDelivery(1L, req);

        SalesReturnItem only = captureSavedReturn().getItems().get(0);
        assertEquals(1, only.getReturnQty());
        // Half of a 2-unit line that was billed 2000.00 net and 100.00 tax — the customer's own
        // figures halved, not price x qty, so a line discount cannot drift out of the credit.
        assertEquals(new BigDecimal("1000.00"), only.getTotal());
        assertEquals(new BigDecimal("50.00"), only.getTaxAmount());
    }

    @Test
    void refusesAQuantityLargerThanWasEverSold() {
        PosDeliveryReturnRequest req = request();
        req.setLines(List.of(line("WIDGET", 5)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.returnDelivery(1L, req));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("only 2 were sold"), ex.getReason());
    }

    @Test
    void refusesAnItemThatIsNotOnTheOrder() {
        PosDeliveryReturnRequest req = request();
        req.setLines(List.of(line("NOT-ON-THIS-ORDER", 1)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.returnDelivery(1L, req));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    void defaultsToGoodConditionSoRefusedGoodsGoBackToSaleableStock() {
        service.returnDelivery(1L, request());

        SalesReturnItem first = captureSavedReturn().getItems().get(0);
        assertEquals(SalesReturnCondition.GOOD, first.getCondition());
        // The legacy free-text column the restock/COGS path still branches on, kept in step.
        assertEquals("Good", first.getItemStatus());
    }

    @Test
    void scrapsDamagedGoodsWithoutChangingWhatTheCustomerIsCredited() {
        PosDeliveryReturnRequest req = request();
        req.setCondition("DAMAGED");

        service.returnDelivery(1L, req);

        SalesReturn sent = captureSavedReturn();
        assertEquals(SalesReturnCondition.DAMAGED, sent.getItems().get(0).getCondition());
        assertEquals("Damaged", sent.getItems().get(0).getItemStatus());
        // Condition decides inventory, never the credit: the customer is made whole either way.
        assertEquals(new BigDecimal("2800.00"), sent.getTotalAmount());
    }

    // ---------------------------------------------------------------
    // The delivery charge
    // ---------------------------------------------------------------

    @Test
    void waivePolicyCancelsTheChargeOnAFullReturn() {
        settingsPolicy(PosDeliveryReturnChargePolicy.WAIVE);

        PosDeliveryReturnResponse res = service.returnDelivery(1L, request());

        assertTrue(res.deliveryChargeWaived());
        assertEquals(BigDecimal.ZERO, savedInvoice().getDeliveryCharge());
        // The charge comes off the invoice total too, or the order would still show as owing it.
        assertEquals(new BigDecimal("2800.00"), savedInvoice().getInvoiceTotal());
    }

    @Test
    void retainPolicyLeavesTheChargePayableAndTheOrderInTheList() {
        settingsPolicy(PosDeliveryReturnChargePolicy.RETAIN);
        when(invoiceBalanceService.recomputeInvoiceBalanceByNumber(anyString()))
                .thenReturn(new BigDecimal("10.00"));

        PosDeliveryReturnResponse res = service.returnDelivery(1L, request());

        assertFalse(res.deliveryChargeWaived());
        assertFalse(res.orderClosed());
        assertEquals(new BigDecimal("10.00"), res.outstanding());
        // Still collectable, so it must stay listed — that is the whole point of retaining it.
        assertNull(invoice.getPosDeliveryReturnedAt());
    }

    @Test
    void aBranchThatHasChosenItsPolicyCannotBeOverruledByTheTill() {
        settingsPolicy(PosDeliveryReturnChargePolicy.RETAIN);
        PosDeliveryReturnRequest req = request();
        req.setWaiveDeliveryCharge(Boolean.TRUE);

        assertFalse(service.returnDelivery(1L, req).deliveryChargeWaived());
    }

    @Test
    void askPolicyTakesTheCashierAnswer() {
        settingsPolicy(PosDeliveryReturnChargePolicy.ASK);
        PosDeliveryReturnRequest req = request();
        req.setWaiveDeliveryCharge(Boolean.FALSE);

        assertFalse(service.returnDelivery(1L, req).deliveryChargeWaived());
    }

    @Test
    void askPolicyWaivesWhenTheTillSaysNothing() {
        settingsPolicy(PosDeliveryReturnChargePolicy.ASK);

        assertTrue(service.returnDelivery(1L, request()).deliveryChargeWaived());
    }

    @Test
    void aPartialReturnNeverWaivesTheCharge() {
        settingsPolicy(PosDeliveryReturnChargePolicy.WAIVE);
        PosDeliveryReturnRequest req = request();
        req.setLines(List.of(line("WIDGET", 1)));
        when(invoiceBalanceService.recomputeInvoiceBalanceByNumber(anyString()))
                .thenReturn(new BigDecimal("1810.00"));

        PosDeliveryReturnResponse res = service.returnDelivery(1L, req);

        // The customer kept something, so the trip was made for goods they still have.
        assertFalse(res.fullReturn());
        assertFalse(res.deliveryChargeWaived());
        assertEquals(new BigDecimal("10.00"), invoice.getDeliveryCharge());
    }

    // ---------------------------------------------------------------
    // The close-out
    // ---------------------------------------------------------------

    @Test
    void closesTheOrderOutOnlyWhenNothingIsLeftToCollect() {
        PosDeliveryReturnResponse res = service.returnDelivery(1L, request());

        assertTrue(res.orderClosed());
        assertEquals("SR-0007", invoice.getPosDeliveryReturnNumber());
        // The lifecycle fact lives in its own column: the sale still happened and its journals
        // stand, so the invoice status is left exactly as it was.
        assertEquals(com.billbull.backend.sales.invoice.SalesInvoiceStatus.CONFIRMED, invoice.getStatus());
    }

    @Test
    void leavesTheOrderOpenWhileAnyBalanceRemains() {
        when(invoiceBalanceService.recomputeInvoiceBalanceByNumber(anyString()))
                .thenReturn(new BigDecimal("250.00"));

        PosDeliveryReturnResponse res = service.returnDelivery(1L, request());

        assertFalse(res.orderClosed());
        assertNull(invoice.getPosDeliveryReturnedAt());
    }

    @Test
    void doesNotTouchTheOrderWhenTheReturnItselfFails() {
        when(salesReturnService.updateStatus(anyLong(), any(), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "SUPERVISOR_AUTHORIZATION_REQUIRED"));

        assertThrows(ResponseStatusException.class, () -> service.returnDelivery(1L, request()));

        // Nothing after the approval ran, so the order is still out for delivery and still owes
        // its full amount — a rejected sign-off must not leave a half-returned order behind.
        assertNull(invoice.getPosDeliveryReturnedAt());
        assertEquals(new BigDecimal("10.00"), invoice.getDeliveryCharge());
    }

    @Test
    void forwardsSupervisorCredentialsToTheReturnsEngine() {
        PosDeliveryReturnRequest req = request();
        req.setSupervisorUsername("sup@example.com");
        req.setSupervisorPassword("secret");

        service.returnDelivery(1L, req);

        // The engine decides whether sign-off was needed, using the same policy as any other
        // return. This service only carries the credentials to it.
        verify(salesReturnService).updateStatus(99L, SalesReturnStatus.APPROVED, "sup@example.com", "secret");
    }

    // ---------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------

    private SalesReturn captureSavedReturn() {
        ArgumentCaptor<SalesReturn> captor = ArgumentCaptor.forClass(SalesReturn.class);
        verify(salesReturnService).saveReturn(captor.capture());
        return captor.getValue();
    }

    private SalesInvoice savedInvoice() {
        ArgumentCaptor<SalesInvoice> captor = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceRepository, org.mockito.Mockito.atLeastOnce()).save(captor.capture());
        return captor.getValue();
    }

    private void settingsPolicy(PosDeliveryReturnChargePolicy policy) {
        PosSettings settings = new PosSettings();
        settings.setDeliveryReturnChargePolicy(policy.name());
        lenient().when(posSettingsService.getForBranch(any())).thenReturn(settings);
    }

    private static PosDeliveryReturnRequest request() {
        PosDeliveryReturnRequest req = new PosDeliveryReturnRequest();
        req.setReason("CUSTOMER_RETURN");
        req.setSessionId(158L);
        req.setTerminalId("T1");
        return req;
    }

    private static PosDeliveryReturnRequest.Line line(String itemCode, int qty) {
        PosDeliveryReturnRequest.Line l = new PosDeliveryReturnRequest.Line();
        l.setItemCode(itemCode);
        l.setReturnQty(qty);
        return l;
    }

    /** AED 2800 of goods out with a driver, plus a AED 10 delivery charge, nothing paid. */
    private static SalesInvoice deliveryInvoice() {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(1L);
        inv.setInvoiceNumber("INV-2026-0228");
        inv.setCustomerCode("CUST-2026-0003");
        inv.setCustomerName("Test Customer");
        inv.setPosDriverName("Delivery person");
        inv.setStatus(com.billbull.backend.sales.invoice.SalesInvoiceStatus.CONFIRMED);
        inv.setInvoiceTotal(new BigDecimal("2810.00"));
        inv.setDeliveryCharge(new BigDecimal("10.00"));
        inv.setAmountPaid(BigDecimal.ZERO);
        inv.setTaxInclusive(Boolean.TRUE);

        List<SalesInvoiceItem> items = new ArrayList<>();
        items.add(item("WIDGET", "Widget", 2, "1000.00", "2000.00", "100.00"));
        items.add(item("GADGET", "Gadget", 1, "800.00", "800.00", "40.00"));
        SalesInvoiceItem voided = item("VOIDED", "Struck off", 3, "100.00", "300.00", "15.00");
        voided.setVoided(Boolean.TRUE);
        items.add(voided);
        inv.setItems(items);
        return inv;
    }

    private static SalesInvoiceItem item(String code, String name, int qty,
                                         String price, String net, String tax) {
        SalesInvoiceItem it = new SalesInvoiceItem();
        it.setItemCode(code);
        it.setItemName(name);
        it.setUnit("PCS");
        it.setQuantity(qty);
        it.setPrice(new BigDecimal(price));
        it.setNetAmount(new BigDecimal(net));
        it.setTaxAmount(new BigDecimal(tax));
        return it;
    }
}
