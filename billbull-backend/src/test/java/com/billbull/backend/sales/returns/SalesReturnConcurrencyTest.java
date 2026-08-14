package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * §29 — the returnable-quantity revalidation that runs inside the approval transaction,
 * under a pessimistic lock on the original invoice row.
 *
 * <p>The scenario these guard against: two terminals each load invoice INV-1, each see
 * "2 available" for a non-batch product, and each approve a return of 2. Whichever commits
 * second must be rejected, because by then only 0 remain. Batch-controlled lines were
 * already protected by the row lock on BatchAllocation; non-batch lines were not.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnConcurrencyTest {

    private static final String INVOICE = "INV-2026-04812";

    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;

    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        // Only the two repositories the guard touches are exercised here; the rest of the
        // service's collaborators are irrelevant to this code path.
        ReflectionTestUtils.setField(service, "salesReturnRepository", salesReturnRepository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
    }

    @Test
    void approvalSucceedsWhenTheFullQuantityIsStillReturnable() {
        stubInvoice(soldItem("ITEM-A", 2));
        stubPriorReturns(); // none

        SalesReturn pending = returnOf("SR-1", "ITEM-A", 2);

        assertDoesNotThrow(() -> invokeGuard(pending));
    }

    @Test
    void approvalIsRejectedWhenAnotherReturnAlreadyConsumedTheQuantity() {
        stubInvoice(soldItem("ITEM-A", 2));
        // Terminal A got there first and its return is already APPROVED.
        stubPriorReturns(approvedReturn("SR-A", "ITEM-A", 2));

        // Terminal B built its return when 2 still looked available.
        SalesReturn pending = returnOf("SR-B", "ITEM-A", 2);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> invokeGuard(pending));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("only 0"),
                "Message should state how many remain, was: " + ex.getReason());
    }

    @Test
    void approvalIsRejectedWhenOnlyPartOfTheRequestedQuantityRemains() {
        stubInvoice(soldItem("ITEM-A", 5));
        stubPriorReturns(approvedReturn("SR-A", "ITEM-A", 4));

        SalesReturn pending = returnOf("SR-B", "ITEM-A", 2); // only 1 left

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> invokeGuard(pending));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("only 1"), ex.getReason());
    }

    @Test
    void draftReturnsDoNotConsumeReturnableQuantity() {
        stubInvoice(soldItem("ITEM-A", 2));
        // A draft return exists but has moved no stock, so it must not block this approval.
        SalesReturn draft = approvedReturn("SR-DRAFT", "ITEM-A", 2);
        draft.setStatus(SalesReturnStatus.DRAFT);
        stubPriorReturns(draft);

        assertDoesNotThrow(() -> invokeGuard(returnOf("SR-B", "ITEM-A", 2)));
    }

    @Test
    void theReturnBeingApprovedDoesNotCountAgainstItself() {
        stubInvoice(soldItem("ITEM-A", 2));

        SalesReturn pending = returnOf("SR-1", "ITEM-A", 2);
        pending.setId(77L);

        // The same row, already visible as APPROVED from a prior save in this transaction.
        SalesReturn sameRow = approvedReturn("SR-1", "ITEM-A", 2);
        sameRow.setId(77L);
        stubPriorReturns(sameRow);

        assertDoesNotThrow(() -> invokeGuard(pending));
    }

    @Test
    void returningAnItemThatIsNotOnTheInvoiceIsRejected() {
        stubInvoice(soldItem("ITEM-A", 2));
        stubPriorReturns();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> invokeGuard(returnOf("SR-1", "ITEM-GHOST", 1)));

        assertTrue(ex.getReason().contains("ITEM-GHOST"), ex.getReason());
    }

    @Test
    void voidedInvoiceLinesContributeNoReturnableQuantity() {
        SalesInvoiceItem voided = soldItem("ITEM-A", 2);
        voided.setVoided(Boolean.TRUE);
        stubInvoice(voided);
        stubPriorReturns();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> invokeGuard(returnOf("SR-1", "ITEM-A", 1)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void missingLinkedInvoiceSkipsTheGuardRatherThanFailing() {
        SalesReturn unlinked = returnOf("SR-1", "ITEM-A", 1);
        unlinked.setLinkedInvoice(null);

        // Nothing to serialise on, and no invoice to over-return against.
        assertDoesNotThrow(() -> invokeGuard(unlinked));
    }

    // ---------------------------------------------------------------
    // Condition ↔ legacy itemStatus mapping (§12)
    // ---------------------------------------------------------------

    @Test
    void conditionDrivesTheLegacyItemStatusTheRestockLogicReads() {
        assertEquals("Good", SalesReturnCondition.GOOD.toLegacyItemStatus());
        assertTrue(SalesReturnCondition.GOOD.isRestockable());

        for (SalesReturnCondition c : List.of(SalesReturnCondition.DAMAGED,
                SalesReturnCondition.OPENED, SalesReturnCondition.DEFECTIVE,
                SalesReturnCondition.EXPIRED)) {
            assertEquals("Damaged", c.toLegacyItemStatus(), c + " must not restock");
            assertTrue(!c.isRestockable(), c + " must not be restockable");
        }
    }

    @Test
    void unknownLegacyItemStatusMapsToDamagedNotGood() {
        // A historic row must never be silently promoted to saleable stock.
        assertEquals(SalesReturnCondition.DAMAGED,
                SalesReturnCondition.fromLegacyItemStatus("Scrapped"));
        assertEquals(SalesReturnCondition.GOOD,
                SalesReturnCondition.fromLegacyItemStatus("  good  "));
    }

    @Test
    void bothLegacyCashLabelsCollapseOntoOneCashRefundConcept() {
        // §14 — "Cash Back" and "Cash Return" were two labels for one drawer cash-out.
        assertEquals(SalesReturnRefundMethod.CASH_REFUND,
                SalesReturnRefundMethod.fromLegacyLabel("Cash Back"));
        assertEquals(SalesReturnRefundMethod.CASH_REFUND,
                SalesReturnRefundMethod.fromLegacyLabel("Cash Return"));
        assertEquals(SalesReturnRefundMethod.CASH_REFUND,
                SalesReturnRefundMethod.fromLegacyLabel("CASH_REFUND"));
    }

    // ---------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------

    private void invokeGuard(SalesReturn salesReturn) {
        ReflectionTestUtils.invokeMethod(service, "assertReturnableQuantitiesStillAvailable", salesReturn);
    }

    private void stubInvoice(SalesInvoiceItem... items) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setItems(new ArrayList<>(List.of(items)));
        lenient().when(salesInvoiceRepository.findByInvoiceNumberForUpdate(INVOICE))
                .thenReturn(Optional.of(invoice));
    }

    private void stubPriorReturns(SalesReturn... priors) {
        lenient().when(salesReturnRepository.findByLinkedInvoiceWithItems(anyString()))
                .thenReturn(new ArrayList<>(List.of(priors)));
    }

    private static SalesInvoiceItem soldItem(String code, int qty) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setItemCode(code);
        item.setQuantity(qty);
        return item;
    }

    private static SalesReturn returnOf(String returnNumber, String itemCode, int qty) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber(returnNumber);
        r.setLinkedInvoice(INVOICE);
        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode(itemCode);
        item.setReturnQty(qty);
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }

    private static SalesReturn approvedReturn(String returnNumber, String itemCode, int qty) {
        SalesReturn r = returnOf(returnNumber, itemCode, qty);
        r.setStatus(SalesReturnStatus.APPROVED);
        return r;
    }
}
