package com.billbull.backend.purchase.vendor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;

/**
 * Vendor summary — the payables arithmetic behind the global search details panel,
 * and the authorization gate in front of it.
 *
 * <p>The figures must match {@code VendorService.list()} exactly, which is what most of
 * these assertions are really checking: the panel resolves one vendor through
 * single-vendor queries, but it must not arrive at a different number than the vendor
 * page shows for the same record.
 */
@ExtendWith(MockitoExtension.class)
class VendorSummaryTest {

    @Mock private VendorRepository repo;
    @Mock private com.billbull.backend.purchase.lpo.LpoRepository lpoRepo;
    @Mock private com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo;
    @Mock private com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo;
    @Mock private com.billbull.backend.settings.branch.BranchRepository branchRepo;
    @Mock private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @Mock private VendorImportService importService;
    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;

    private VendorService service() {
        return new VendorService(repo, lpoRepo, invRepo, payRepo, branchRepo, branchAccessService);
    }

    private VendorController controller(VendorService service) {
        return new VendorController(service, importService, auditLogService, modulePermissionService);
    }

    private Vendor vendor(Long id, String code, String name, BigDecimal openingBalance) {
        Vendor v = new Vendor();
        v.setId(id);
        v.setCode(code);
        v.setName(name);
        v.setOpeningBalance(openingBalance);
        v.setStatus("Active");
        return v;
    }

    /** Stubs the four name-keyed accounting queries the summary runs. */
    private void stubAccounting(String name, String onAccount, String invGross, String invPaid, String totalPaid) {
        when(payRepo.sumOnAccountPaidByVendorName(name)).thenReturn(new BigDecimal(onAccount));
        when(invRepo.sumOutstandingForVendorName(name)).thenReturn(new BigDecimal(invGross));
        when(payRepo.sumInvoiceLinkedPaymentsByVendorName(name)).thenReturn(new BigDecimal(invPaid));
        when(payRepo.sumPaymentsByVendorName(name)).thenReturn(new BigDecimal(totalPaid));
    }

    // ── Arithmetic ───────────────────────────────────────────────────────────

    @Test
    void payableIsInvoiceOutstandingPlusRemainingOpeningBalance() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("5000.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        // opening: 5000 − 3500 on-account = 1500 left
        // invoices: 12000 gross − 4300 linked payments = 7700 outstanding
        stubAccounting("TechSupply FZCO", "3500.00", "12000.00", "4300.00", "41000.00");

        VendorSummaryResponse s = service().getSummary(21L);

        assertThat(s.getOpeningBalanceOutstanding()).isEqualByComparingTo("1500.00");
        assertThat(s.getPayableBalance()).isEqualByComparingTo("9200.00");
        // Opening balance is echoed as entered, distinct from what remains of it.
        assertThat(s.getOpeningBalance()).isEqualByComparingTo("5000.00");
    }

    @Test
    void overpaidOpeningBalanceFloorsAtZeroRatherThanGoingNegative() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("1000.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        // More paid on account than the opening balance ever was.
        stubAccounting("TechSupply FZCO", "4000.00", "0.00", "0.00", "4000.00");

        VendorSummaryResponse s = service().getSummary(21L);

        assertThat(s.getOpeningBalanceOutstanding()).isEqualByComparingTo("0.00");
        assertThat(s.getPayableBalance()).isEqualByComparingTo("0.00");
    }

    @Test
    void overpaidInvoicesFloorAtZeroToo() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "500.00", "900.00", "900.00");

        assertThat(service().getSummary(21L).getPayableBalance()).isEqualByComparingTo("0.00");
    }

    @Test
    void totalPaidIsTheLifetimePostedAndClearedPaymentFigure() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("5000.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "3500.00", "12000.00", "4300.00", "41000.00");

        // Unlike its customer counterpart this figure has an existing unambiguous
        // definition, so it is exposed rather than omitted.
        assertThat(service().getSummary(21L).getTotalPaid()).isEqualByComparingTo("41000.00");
    }

    @Test
    void summaryMatchesTheVendorListForTheSameVendor() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("5000.00"));

        // The list path, through the grouped all-vendor aggregates.
        when(repo.findByIsActiveTrue()).thenReturn(java.util.List.of(v));
        when(invRepo.sumOutstandingByVendorName())
                .thenReturn(java.util.List.<Object[]>of(new Object[] { "TechSupply FZCO", new BigDecimal("12000.00") }));
        when(payRepo.sumInvoiceLinkedPaymentsGroupedByVendorName())
                .thenReturn(java.util.List.<Object[]>of(new Object[] { "TechSupply FZCO", new BigDecimal("4300.00") }));
        when(payRepo.sumOnAccountPaidGroupedByVendorName())
                .thenReturn(java.util.List.<Object[]>of(new Object[] { "TechSupply FZCO", new BigDecimal("3500.00") }));

        VendorListResponse fromList = service().list().get(0);

        // The summary path, through the single-vendor queries.
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "3500.00", "12000.00", "4300.00", "41000.00");

        VendorSummaryResponse summary = service().getSummary(21L);

        // The list surfaces the payable in its `balance` field (see the VendorListResponse
        // constructor), which is the same figure this summary calls payableBalance.
        assertThat(summary.getPayableBalance()).isEqualByComparingTo(fromList.getBalance());
        assertThat(summary.getOpeningBalanceOutstanding())
                .isEqualByComparingTo(fromList.getOpeningBalanceOutstanding());
    }

    // ── Name-keying ──────────────────────────────────────────────────────────

    @Test
    void resolvesTheVendorByIdThenRunsTheNameKeyedAccountingQueries() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");

        service().getSummary(21L);

        // The accounting tables store vendorName, not vendorId, so the authoritative
        // record's current name is what drives them.
        verify(invRepo).sumOutstandingForVendorName("TechSupply FZCO");
        verify(payRepo).sumOnAccountPaidByVendorName("TechSupply FZCO");
        verify(payRepo).sumInvoiceLinkedPaymentsByVendorName("TechSupply FZCO");
        verify(payRepo).sumPaymentsByVendorName("TechSupply FZCO");
    }

    @Test
    void aVendorWithNoNameStillRendersButJoinsToNoAccounting() {
        Vendor v = vendor(21L, "VEN-021", null, new BigDecimal("250.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));

        VendorSummaryResponse s = service().getSummary(21L);

        assertThat(s.getVendorCode()).isEqualTo("VEN-021");
        assertThat(s.getPayableBalance()).isEqualByComparingTo("250.00");
        assertThat(s.getTotalPaid()).isEqualByComparingTo("0.00");
        verify(invRepo, never()).sumOutstandingForVendorName(anyString());
        verify(payRepo, never()).sumPaymentsByVendorName(anyString());
    }

    @Test
    void nullAccountingSumsAreTreatedAsZero() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("300.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        when(payRepo.sumOnAccountPaidByVendorName("TechSupply FZCO")).thenReturn(null);
        when(invRepo.sumOutstandingForVendorName("TechSupply FZCO")).thenReturn(null);
        when(payRepo.sumInvoiceLinkedPaymentsByVendorName("TechSupply FZCO")).thenReturn(null);
        when(payRepo.sumPaymentsByVendorName("TechSupply FZCO")).thenReturn(null);

        VendorSummaryResponse s = service().getSummary(21L);

        assertThat(s.getPayableBalance()).isEqualByComparingTo("300.00");
        assertThat(s.getTotalPaid()).isEqualByComparingTo("0.00");
    }

    // ── Bounded work ─────────────────────────────────────────────────────────

    @Test
    void summaryNeverAggregatesEveryVendor() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");

        service().getSummary(21L);

        // A panel for one vendor must not pay for the whole vendor roster.
        verify(repo, never()).findByIsActiveTrue();
        verify(invRepo, never()).sumOutstandingByVendorName();
        verify(payRepo, never()).sumOnAccountPaidGroupedByVendorName();
        verify(payRepo, never()).sumInvoiceLinkedPaymentsGroupedByVendorName();
    }

    @Test
    void anUnknownVendorIdYieldsNotFoundRatherThanAnEmptyPanel() {
        when(repo.findById(999L)).thenReturn(Optional.empty());
        VendorService service = service();

        assertThat(service.getSummary(999L)).isNull();

        ResponseEntity<VendorSummaryResponse> response = controller(service).summary(999L);
        assertThat(response.getStatusCode().value()).isEqualTo(404);
    }

    // ── Authorization ────────────────────────────────────────────────────────

    @Test
    void summaryRequiresTheVendorViewPermission() {
        VendorService service = service();
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("purchases.vendor");

        assertThatThrownBy(() -> controller(service).summary(21L))
                .isInstanceOf(AccessDeniedException.class);

        // The gate runs before any read, so a denied caller never touches the repository.
        verify(repo, never()).findById(any());
    }

    @Test
    void summaryReturnsThePayloadWhenThePermissionIsHeld() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", new BigDecimal("5000.00"));
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "3500.00", "12000.00", "4300.00", "41000.00");

        ResponseEntity<VendorSummaryResponse> response = controller(service()).summary(21L);

        verify(modulePermissionService).requireCanView("purchases.vendor");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().getPayableBalance()).isEqualByComparingTo("9200.00");
    }

    // ── Shape ────────────────────────────────────────────────────────────────

    @Test
    void summaryCarriesIdentityAndNoUnsupportedFigures() throws Exception {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");

        VendorSummaryResponse s = service().getSummary(21L);

        assertThat(s.getId()).isEqualTo(21L);
        assertThat(s.getVendorName()).isEqualTo("TechSupply FZCO");
        assertThat(s.getStatus()).isEqualTo("Active");
        // A count of past-due invoices is supported — paymentStatus is a fact the invoice
        // already carries. An overdue *amount* is not, and no accessor for one may appear:
        // PurchaseInvoice stores no per-invoice balance, so any amount would be invented.
        assertThat(VendorSummaryResponse.class.getMethods())
                .extracting(java.lang.reflect.Method::getName)
                .noneMatch(n -> n.toLowerCase().contains("overdueamount")
                        || n.toLowerCase().contains("dueamount"));
    }

    // ── Overdue (count only) ─────────────────────────────────────────────────

    @Test
    void overdueCountComesFromThePastDueUnsettledInvoices() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");
        when(invRepo.countOverdueForVendorName(eq("TechSupply FZCO"), any(java.time.LocalDate.class)))
                .thenReturn(3L);

        assertThat(service().getSummary(21L).getOverdueInvoiceCount()).isEqualTo(3L);
    }

    @Test
    void overdueIsAgedAgainstTodayNotACallerSuppliedCutoff() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");

        service().getSummary(21L);

        ArgumentCaptor<java.time.LocalDate> today = ArgumentCaptor.forClass(java.time.LocalDate.class);
        verify(invRepo).countOverdueForVendorName(eq("TechSupply FZCO"), today.capture());
        assertThat(today.getValue()).isEqualTo(java.time.LocalDate.now());
    }

    @Test
    void aVendorWithNoNameReportsNoOverdueRatherThanQueryingForOne() {
        Vendor v = vendor(21L, "VEN-021", null, BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));

        assertThat(service().getSummary(21L).getOverdueInvoiceCount()).isZero();
        verify(invRepo, never()).countOverdueForVendorName(anyString(), any());
    }

    /**
     * The one thing this panel must never do. PurchaseInvoice has no per-invoice balance,
     * so the only amount within reach is the gross grandTotal or a vendor-level payment
     * subtraction — both of which would attribute money to documents it was never applied
     * to. The summary must therefore read no amount-bearing query for its overdue figure.
     */
    @Test
    void overdueNeverReachesForAnAmount() {
        Vendor v = vendor(21L, "VEN-021", "TechSupply FZCO", BigDecimal.ZERO);
        when(repo.findById(21L)).thenReturn(Optional.of(v));
        stubAccounting("TechSupply FZCO", "0.00", "0.00", "0.00", "0.00");

        service().getSummary(21L);

        // sumOutstandingForVendorName is read once, for payableBalance — not a second
        // time under an overdue label.
        verify(invRepo, org.mockito.Mockito.times(1)).sumOutstandingForVendorName("TechSupply FZCO");
        verify(invRepo, never()).sumInvoicedByVendorName(anyString());
    }
}
