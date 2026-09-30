package com.billbull.backend.sales.customerledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.sales.invoice.CustomerOverdueSummary;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;

/**
 * Customer summary — the receivables arithmetic behind the global search details panel.
 *
 * <p>Two things are pinned down here. First, that {@code totalPaid} is exactly
 * {@code totalSales - outstanding} and is computed on the server, so the panel can never
 * arrive at a third number. Second, that "overdue" means {@code dueDate < today AND
 * balance > 0} and nothing else — in particular not the global
 * {@code countOverdueInvoices} query, which ages from {@code invoiceDate} and carries no
 * customer predicate at all.
 */
@ExtendWith(MockitoExtension.class)
class CustomerSummaryTest {

    @Mock private CustomerRepository repository;
    @Mock private SalesInvoiceRepository salesInvoiceRepo;
    @Mock private OpeningInvoiceRepository openingInvoiceRepository;
    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;

    private CustomerService service;

    @BeforeEach
    void setUp() {
        service = new CustomerService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepo", salesInvoiceRepo);
        ReflectionTestUtils.setField(service, "openingInvoiceRepository", openingInvoiceRepository);
    }

    private CustomerController controller() {
        CustomerController c = new CustomerController();
        ReflectionTestUtils.setField(c, "service", service);
        ReflectionTestUtils.setField(c, "auditLogService", auditLogService);
        ReflectionTestUtils.setField(c, "modulePermissionService", modulePermissionService);
        return c;
    }

    private Customer customer(Long id, String code, String name, BigDecimal openingBalance) {
        Customer c = new Customer();
        c.setId(id);
        c.setCode(code);
        c.setName(name);
        c.setBalance(openingBalance);
        c.setStatus("Active");
        return c;
    }

    /** Stubs the three code-keyed receivables queries the summary runs. */
    private void stubReceivables(String code, String invoiced, String invOutstanding,
            String openingOutstanding) {
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode(code))
                .thenReturn(new BigDecimal(invoiced));
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode(code))
                .thenReturn(new BigDecimal(invOutstanding));
        when(openingInvoiceRepository.sumOutstandingForCustomer(code))
                .thenReturn(new BigDecimal(openingOutstanding));
    }

    private void stubOverdue(String code, long count, String amount) {
        when(salesInvoiceRepo.overdueSummaryForCustomerCode(eq(code), any(LocalDate.class)))
                .thenReturn(new CustomerOverdueSummary(count, new BigDecimal(amount)));
    }

    // -- Total paid -----------------------------------------------------------

    @Test
    void totalPaidIsTotalSalesMinusOutstanding() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", new BigDecimal("2000.00"));
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        // totalSales  = 2000 opening + 18000 invoiced = 20000
        // outstanding = 6500 invoice + 500 opening    = 7000
        stubReceivables("CUS-007", "18000.00", "6500.00", "500.00");

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getTotalSales()).isEqualByComparingTo("20000.00");
        assertThat(s.getOutstanding()).isEqualByComparingTo("7000.00");
        assertThat(s.getTotalPaid()).isEqualByComparingTo("13000.00");
        // The identity itself, not just the arithmetic of this one fixture.
        assertThat(s.getTotalPaid())
                .isEqualByComparingTo(s.getTotalSales().subtract(s.getOutstanding()));
    }

    @Test
    void totalPaidIsZeroWhenNothingHasBeenSettled() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", new BigDecimal("2000.00"));
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "5000.00", "5000.00", "2000.00");

        assertThat(service.getCustomerSummary(7L).getTotalPaid()).isEqualByComparingTo("0.00");
    }

    /**
     * The rejected alternative. A receipt-voucher sum misses any sale settled at the till
     * without one, so the summary must not reach for the receipt repository at all.
     */
    @Test
    void totalPaidIsNotBuiltFromReceiptVouchers() {
        com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository receiptRepo =
                org.mockito.Mockito.mock(
                        com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository.class);
        ReflectionTestUtils.setField(service, "receiptVoucherRepository", receiptRepo);

        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "1000.00", "400.00", "0.00");

        service.getCustomerSummary(7L);

        org.mockito.Mockito.verifyNoInteractions(receiptRepo);
    }

    // -- Overdue --------------------------------------------------------------

    @Test
    void oneOverdueInvoiceIsCountedWithItsBalance() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "5000.00", "1200.00", "0.00");
        stubOverdue("CUS-007", 1L, "1200.00");

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getOverdueInvoiceCount()).isEqualTo(1L);
        assertThat(s.getOverdueAmount()).isEqualByComparingTo("1200.00");
    }

    @Test
    void multipleOverdueInvoicesAggregateIntoOneCountAndOneAmount() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "20000.00", "4400.00", "0.00");
        stubOverdue("CUS-007", 4L, "3150.75");

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getOverdueInvoiceCount()).isEqualTo(4L);
        assertThat(s.getOverdueAmount()).isEqualByComparingTo("3150.75");
        // Overdue is a date-slice of outstanding, so it can never exceed it.
        assertThat(s.getOverdueAmount()).isLessThanOrEqualTo(s.getOutstanding());
    }

    @Test
    void noOverdueInvoicesReadsAsZeroRatherThanNull() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "5000.00", "0.00", "0.00");
        stubOverdue("CUS-007", 0L, "0.00");

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getOverdueInvoiceCount()).isZero();
        assertThat(s.getOverdueAmount()).isEqualByComparingTo("0.00");
    }

    @Test
    void aNullOverdueRowIsTreatedAsNothingOverdue() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "5000.00", "0.00", "0.00");
        when(salesInvoiceRepo.overdueSummaryForCustomerCode(eq("CUS-007"), any(LocalDate.class)))
                .thenReturn(null);

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getOverdueInvoiceCount()).isZero();
        assertThat(s.getOverdueAmount()).isEqualByComparingTo("0.00");
    }

    @Test
    void overdueIsAgedAgainstTodayAndAskedForByCustomerCode() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "0.00", "0.00", "0.00");

        service.getCustomerSummary(7L);

        ArgumentCaptor<LocalDate> today = ArgumentCaptor.forClass(LocalDate.class);
        verify(salesInvoiceRepo).overdueSummaryForCustomerCode(eq("CUS-007"), today.capture());
        assertThat(today.getValue()).isEqualTo(LocalDate.now());
    }

    /**
     * The global query ages from {@code invoiceDate} against a caller-supplied cutoff and
     * carries no customer predicate. Using it here would put a figure on the panel that
     * belongs to a different definition — and to every customer at once.
     */
    @Test
    void overdueNeverUsesTheGlobalInvoiceDateBasedQuery() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "0.00", "0.00", "0.00");

        service.getCustomerSummary(7L);

        verify(salesInvoiceRepo, never()).countOverdueInvoices(any(LocalDate.class));
    }

    /**
     * The predicate cannot be executed without a database, so it is pinned as a query
     * contract instead: due today is not overdue (strict {@code <}), a zero balance is not
     * overdue, and PAID/CANCELLED invoices are outside the window.
     */
    @Test
    void theOverdueQueryPredicateExcludesDueTodayZeroBalanceAndSettledInvoices() throws Exception {
        String jpql = SalesInvoiceRepository.class
                .getMethod("overdueSummaryForCustomerCode", String.class, LocalDate.class)
                .getAnnotation(org.springframework.data.jpa.repository.Query.class)
                .value()
                .replaceAll("\\s+", " ");

        // Strictly before today — an invoice due today has not yet fallen due.
        assertThat(jpql).contains("s.dueDate < :today");
        assertThat(jpql).doesNotContain("s.dueDate <= :today");
        // A settled invoice is not overdue however old it is.
        assertThat(jpql).contains("s.balance > 0");
        assertThat(jpql).contains("SalesInvoiceStatus.CANCELLED");
        assertThat(jpql).contains("SalesInvoiceStatus.PAID");
        // Aged by the invoice's own due date, never by invoiceDate arithmetic.
        assertThat(jpql).doesNotContain("invoiceDate");
        // The amount is the persisted balance, never the invoice total.
        assertThat(jpql).contains("SUM(s.balance)");
        assertThat(jpql).doesNotContain("SUM(s.invoiceTotal)");
        // One customer, one grouped pass.
        assertThat(jpql).contains("s.customerCode = :customerCode");
        assertThat(jpql).contains("COUNT(s)");
    }

    // -- Shape and bounded work ----------------------------------------------

    @Test
    void summaryCarriesNoDueAmountOrLastTransactionField() {
        // "Due Amount" would be `outstanding` under a second label, and Last Invoice is
        // derived on the client from the bounded recent-invoice list.
        // "overdueAmount" also contains "dueamount", so the check is anchored on the
        // accessor name rather than a substring.
        assertThat(CustomerSummaryResponse.class.getMethods())
                .extracting(java.lang.reflect.Method::getName)
                .doesNotContain("getDueAmount", "setDueAmount",
                        "getLastTransaction", "setLastTransaction",
                        "getLastTransactionDate", "setLastTransactionDate");
    }

    @Test
    void aCustomerWithNoCodeStillRendersButJoinsToNoInvoices() {
        Customer c = customer(7L, null, "Walk-in", new BigDecimal("300.00"));
        when(repository.findById(7L)).thenReturn(Optional.of(c));

        CustomerSummaryResponse s = service.getCustomerSummary(7L);

        assertThat(s.getCustomerName()).isEqualTo("Walk-in");
        assertThat(s.getTotalSales()).isEqualByComparingTo("300.00");
        assertThat(s.getOverdueInvoiceCount()).isZero();
        verify(salesInvoiceRepo, never()).overdueSummaryForCustomerCode(anyString(), any());
    }

    @Test
    void summaryNeverAggregatesEveryCustomer() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", BigDecimal.ZERO);
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "0.00", "0.00", "0.00");

        service.getCustomerSummary(7L);

        verify(salesInvoiceRepo, never()).sumOutstandingBalanceByCustomerCode();
        verify(salesInvoiceRepo, never()).sumInvoiceTotalByCustomerCode();
    }

    // -- Authorization --------------------------------------------------------

    @Test
    void summaryRequiresTheCustomerViewPermission() {
        doThrow(new AccessDeniedException("denied"))
                .when(modulePermissionService).requireCanView("sales.customer");

        assertThatThrownBy(() -> controller().getCustomerSummary(7L))
                .isInstanceOf(AccessDeniedException.class);

        // The gate runs before any read, so a denied caller never touches the repository.
        verify(repository, never()).findById(any());
    }

    @Test
    void summaryReturnsThePayloadWhenThePermissionIsHeld() {
        Customer c = customer(7L, "CUS-007", "Al Noor Trading", new BigDecimal("2000.00"));
        when(repository.findById(7L)).thenReturn(Optional.of(c));
        stubReceivables("CUS-007", "18000.00", "6500.00", "500.00");
        stubOverdue("CUS-007", 2L, "900.00");

        ResponseEntity<CustomerSummaryResponse> response = controller().getCustomerSummary(7L);

        verify(modulePermissionService).requireCanView("sales.customer");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().getTotalPaid()).isEqualByComparingTo("13000.00");
        assertThat(response.getBody().getOverdueAmount()).isEqualByComparingTo("900.00");
    }

    @Test
    void anUnknownCustomerIdYieldsNotFoundRatherThanAnEmptyPanel() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertThat(service.getCustomerSummary(999L)).isNull();
        assertThat(controller().getCustomerSummary(999L).getStatusCode().value()).isEqualTo(404);
    }
}
