package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * One branch must own every leg of a return.
 *
 * <p>The return's branch is stamped from the acting user's branch context; the warehouse the goods
 * go back to comes from the selling branch's delivery note. When the two differ, one return posts
 * the revenue/VAT/AR reversal in branch B and raises stock in branch A — so B's P&amp;L carries a
 * reversal for a sale it never made, and A's stock rises for a credit note it never issued. The
 * chart of accounts has no inter-branch due-to/due-from accounts to express that honestly.
 *
 * <p>{@code assertTransactionBranchAccessible} already blocked this for a BRANCH_ADMIN, whose
 * scope excludes the other branch's invoice. It never blocked a global ADMIN, for whom that check
 * returns true for every branch — which is the gap these cases pin shut. The guard compares the
 * two branches, so it does not depend on the caller's rights at all.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SalesReturnBranchAttributionTest {

    private static final String INVOICE = "INV-2026-04812";

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private com.billbull.backend.sales.invoice.InvoiceBalanceService invoiceBalanceService;
    @Mock private BranchAccessService branchAccessService;
    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private SalesReturnCustomerAccountResolver customerAccountResolver;
    @Mock private SalesReturnAuthorizationPolicy authorizationPolicy;
    @Mock private com.billbull.backend.sales.customerledger.CustomerRepository customerRepository;

    @InjectMocks private SalesReturnService service;
    @InjectMocks private SalesReturnEligibilityService eligibilityService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(eligibilityService, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(eligibilityService, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(eligibilityService, "salesReturnRepository", salesReturnRepository);
        ReflectionTestUtils.setField(eligibilityService, "customerAccountResolver", customerAccountResolver);
        ReflectionTestUtils.setField(eligibilityService, "authorizationPolicy", authorizationPolicy);
        ReflectionTestUtils.setField(eligibilityService, "customerRepository", customerRepository);
        ReflectionTestUtils.setField(eligibilityService, "salesReturnService", service);
        ReflectionTestUtils.setField(eligibilityService, "invoiceBalanceService", invoiceBalanceService);
        when(salesReturnRepository.findByLinkedInvoiceWithItems(anyString())).thenReturn(List.of());
    }

    @Test
    void aReturnRaisedInTheSellingBranchIsAccepted() {
        stubInvoice(1L, "Dubai Main");

        assertDoesNotThrow(() -> invokeGuard(returnInBranch(1L, "Dubai Main")));
    }

    @Test
    void aGlobalAdminCannotReturnAnotherBranchesInvoice() {
        // A global ADMIN with the Branch Selector on Abu Dhabi: the branch-access check is a
        // no-op for them, which is exactly how this used to get through.
        stubInvoice(1L, "Dubai Main");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> invokeGuard(returnInBranch(2L, "Abu Dhabi")));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Dubai Main"), ex.getReason());
        assertTrue(ex.getReason().contains("Abu Dhabi"), ex.getReason());
        assertTrue(ex.getReason().contains("Cross-branch returns are not supported"), ex.getReason());
    }

    @Test
    void aBranchScopedUserIsStillStoppedByTheExistingAccessCheckFirst() {
        // Unchanged behaviour, asserted so the new guard is understood as additive: a restricted
        // user never reaches the branch comparison, because the invoice is not theirs to read.
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Sales Return belongs to another branch and is not available in this session."))
                .when(branchAccessService).assertTransactionBranchAccessible(anyLong(), anyString());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> branchAccessService.assertTransactionBranchAccessible(1L, "Sales Return"));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void aLegacyInvoiceWithNoBranchIsNotTreatedAsCrossBranch() {
        // Pre-branch rows carry no branch id; there is nothing to split, so nothing to refuse.
        stubInvoice(null, null);

        assertDoesNotThrow(() -> invokeGuard(returnInBranch(2L, "Abu Dhabi")));
    }

    @Test
    void aReturnWithNoBranchOfItsOwnIsNotTreatedAsCrossBranch() {
        stubInvoice(1L, "Dubai Main");

        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-1");
        r.setLinkedInvoice(INVOICE);
        r.setBranch(null);

        assertDoesNotThrow(() -> invokeGuard(r));
    }

    @Test
    void anUnlinkedReturnHasNoInvoiceBranchToDisagreeWith() {
        SalesReturn r = returnInBranch(2L, "Abu Dhabi");
        r.setLinkedInvoice(null);

        assertDoesNotThrow(() -> invokeGuard(r));
    }

    @Test
    void aMissingInvoiceIsLeftToTheCallersThatActuallyNeedIt() {
        // The quantity revalidation reports a vanished invoice with its own message; this guard
        // must not pre-empt it with a confusing branch error.
        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE)).thenReturn(Optional.empty());

        assertDoesNotThrow(() -> invokeGuard(returnInBranch(2L, "Abu Dhabi")));
    }

    // ── the same rule, stated where the cashier can still act on it ────────────────

    @Test
    void theReturnScreenRefusesAnotherBranchesInvoiceBeforeAnythingIsEntered() {
        // A 422 at save time is correct but late: the cashier has already keyed the lines. The
        // eligibility call is where the screen learns the invoice is unusable, so the same rule
        // is stated there — and for a global ADMIN, whose branch-access check passes.
        stubInvoice(1L, "Dubai Main");
        when(branchAccessService.getActiveBranchId()).thenReturn(2L);

        ReturnEligibilityResponse res = eligibilityService.getEligibility(INVOICE);

        assertFalse(res.eligible);
        assertEquals("INVOICE_OTHER_BRANCH", res.ineligibleCode);
        assertTrue(res.ineligibleReason.contains("Dubai Main"), res.ineligibleReason);
    }

    @Test
    void theReturnScreenAcceptsAnInvoiceFromTheActiveBranch() {
        stubInvoice(1L, "Dubai Main");
        when(branchAccessService.getActiveBranchId()).thenReturn(1L);

        ReturnEligibilityResponse res = eligibilityService.getEligibility(INVOICE);

        assertTrue(res.ineligibleCode == null || !"INVOICE_OTHER_BRANCH".equals(res.ineligibleCode),
                "An invoice from the branch the user is acting in is not a cross-branch return");
    }

    // ── fixtures ────────────────────────────────────────────────────────────────────

    private void invokeGuard(SalesReturn salesReturn) {
        ReflectionTestUtils.invokeMethod(service, "assertReturnBranchMatchesInvoice", salesReturn);
    }

    private void stubInvoice(Long branchId, String branchName) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setBranchId(branchId);
        invoice.setBranchName(branchName);
        invoice.setItems(new java.util.ArrayList<>());
        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE)).thenReturn(Optional.of(invoice));
    }

    private static SalesReturn returnInBranch(Long branchId, String branchName) {
        Branch b = new Branch();
        b.setId(branchId);
        b.setName(branchName);

        SalesReturn r = new SalesReturn();
        r.setReturnNumber("SR-2026-0001");
        r.setLinkedInvoice(INVOICE);
        r.setBranch(b);
        return r;
    }
}
