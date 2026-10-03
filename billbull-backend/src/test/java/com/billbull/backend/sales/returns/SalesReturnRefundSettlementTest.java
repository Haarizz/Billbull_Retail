package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;

/**
 * Every refund method has to say what clears the {@code Cr Accounts Receivable} the return
 * journal posts, or the credit dangles on the customer's account forever.
 *
 * <p>Cash clears it through the drawer movement and a voucher through its issue journal. Card
 * and bank refunds previously cleared it with nothing: the money left the business, but AR
 * stayed credited and the bank/merchant account never moved. These cases pin the settlement
 * journal that closes that gap, and the matching classification rule the Customer SoA reads.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnRefundSettlementTest {

    @Mock private PostingEngineService postingEngineService;

    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "postingEngineService", postingEngineService);
    }

    private SalesReturn returnWith(SalesReturnRefundMethod method, String amount) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-2026-0022");
        r.setReturnDate(LocalDate.of(2026, 10, 1));
        r.setCustomerCode("CUST-2026-0003");
        r.setTotalAmount(new BigDecimal(amount));
        r.setRefundAmount(new BigDecimal(amount));
        r.setRefundMethod(method);
        r.setStatus(SalesReturnStatus.APPROVED);
        return r;
    }

    /**
     * Settles at the return's full value, which is what these cases are about: the shape of the
     * settlement journal per method. The amount now comes from the server-derived split rather
     * than from {@code refundAmount ?? totalAmount}, so a fully paid invoice is passed here —
     * {@code paidPortion == returnValue} — keeping every asserted figure identical. The split's
     * own arithmetic is covered by {@link SalesReturnSettlementSplitTest}, and the fact that it
     * overrides whatever the client sent by {@link SalesReturnApprovalSplitTest}.
     */
    private void settle(SalesReturn r) {
        ReflectionTestUtils.invokeMethod(service, "postRefundSettlementIfRequired", r,
                SalesReturnSettlementSplit.fullyPaid(r.getTotalAmount()));
    }

    @Test
    void cardRefundPostsTheSettlementAgainstMerchantClearing() {
        SalesReturn r = returnWith(SalesReturnRefundMethod.CARD_REFUND, "137.50");

        settle(r);

        verify(postingEngineService).createJournalFromSalesReturnRefundSettlement(
                eq(r), eq(new BigDecimal("137.50")), eq(false));
    }

    @Test
    void bankTransferRefundPostsTheSettlementAgainstTheBank() {
        SalesReturn r = returnWith(SalesReturnRefundMethod.BANK_TRANSFER, "137.50");

        settle(r);

        verify(postingEngineService).createJournalFromSalesReturnRefundSettlement(
                eq(r), eq(new BigDecimal("137.50")), eq(true));
    }

    @Test
    void cashAndVoucherRefundsAreSettledElsewhereSoNoExtraJournalIsPosted() {
        settle(returnWith(SalesReturnRefundMethod.CASH_REFUND, "137.50"));
        settle(returnWith(SalesReturnRefundMethod.CREDIT_VOUCHER, "137.50"));

        verify(postingEngineService, never())
                .createJournalFromSalesReturnRefundSettlement(any(), any(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void customerCreditLeavesTheCreditOnTheLedgerAndPostsNothingFurther() {
        SalesReturn r = returnWith(SalesReturnRefundMethod.CUSTOMER_CREDIT, "137.50");

        settle(r);

        verify(postingEngineService, never())
                .createJournalFromSalesReturnRefundSettlement(any(), any(), org.mockito.ArgumentMatchers.anyBoolean());
        assertFalse(r.settlesOutsideReceivable(),
                "A Customer Credit return is the settlement — the credit stays on the account.");
    }

    // -- The classification rule the Customer SoA and the Customer List both read -------------

    @Test
    void everyPaidOutRefundMethodSettlesOutsideReceivable() {
        for (SalesReturnRefundMethod method : SalesReturnRefundMethod.values()) {
            if (method == SalesReturnRefundMethod.CUSTOMER_CREDIT) continue;
            assertTrue(returnWith(method, "10.00").settlesOutsideReceivable(),
                    method + " hands the customer value from outside their ledger");
        }
    }

    @Test
    void legacyRowsWithoutARefundMethodFallBackToTheReturnAction() {
        SalesReturn creditNote = returnWith(SalesReturnRefundMethod.CASH_REFUND, "10.00");
        creditNote.setRefundMethod(null);
        creditNote.setReturnAction("Credit Note");
        assertFalse(creditNote.settlesOutsideReceivable());

        SalesReturn paidOut = returnWith(SalesReturnRefundMethod.CASH_REFUND, "10.00");
        paidOut.setRefundMethod(null);
        paidOut.setReturnAction("Refund");
        assertTrue(paidOut.settlesOutsideReceivable());

        SalesReturn unknown = returnWith(SalesReturnRefundMethod.CASH_REFUND, "10.00");
        unknown.setRefundMethod(null);
        unknown.setReturnAction(null);
        assertFalse(unknown.settlesOutsideReceivable(),
                "With nothing recorded, leaving the credit on the ledger is the recoverable default");
    }
}
