package com.billbull.backend.sales.customerledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    @Mock
    private CustomerRepository repository;
    @Mock
    private SalesInvoiceRepository salesInvoiceRepo;
    @Mock
    private OpeningInvoiceRepository openingInvoiceRepository;
    @Mock
    private jakarta.persistence.EntityManager entityManager;
    @Mock
    private com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;
    @Mock
    private com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    private CustomerService service;

    @BeforeEach
    void setUp() {
        service = new CustomerService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepo", salesInvoiceRepo);
        ReflectionTestUtils.setField(service, "openingInvoiceRepository", openingInvoiceRepository);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        ReflectionTestUtils.setField(service, "effectiveCorrectionViewService", effectiveCorrectionViewService);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
        
        org.mockito.Mockito.lenient().when(effectiveCorrectionViewService.resolveOverlays(
                any(), org.mockito.ArgumentMatchers.anyList(), any()
        )).thenAnswer(inv -> inv.getArgument(1));
    }

    /** Empty aggregate rows so getAllCustomers exercises the getOrDefault(ZERO) balance path. */
    private void stubEmptyAggregates() {
        when(salesInvoiceRepo.sumOutstandingBalanceByCustomerCode()).thenReturn(Collections.emptyList());
        when(salesInvoiceRepo.sumInvoiceTotalByCustomerCode()).thenReturn(Collections.emptyList());
        when(openingInvoiceRepository.sumOutstandingByCustomerCode()).thenReturn(Collections.emptyList());
    }

    private Customer customer(Long id, String code, BigDecimal balance) {
        Customer c = new Customer();
        c.setId(id);
        c.setCode(code);
        c.setBalance(balance);
        return c;
    }

    private CustomerBranchAllocation allocation(String branchName) {
        Branch b = new Branch();
        b.setName(branchName);
        CustomerBranchAllocation a = new CustomerBranchAllocation();
        a.setBranch(b);
        return a;
    }

    // ARCHFIX §4.2 — getAllCustomers bulk-fetches via findAllWithSavedAddresses (no per-customer
    // lazy-init N+1) and never falls back to plain findAll().
    @Test
    void getAllCustomersBulkFetchesSavedAddressesAndComputesBalances() {
        Customer a = customer(1L, "CUST-001", new BigDecimal("100.00"));
        Customer b = customer(2L, "CUST-002", null); // null opening balance -> ZERO
        when(repository.findAllWithSavedAddresses()).thenReturn(List.of(a, b));
        stubEmptyAggregates();

        List<Customer> result = service.getAllCustomers();

        assertEquals(2, result.size());
        // opening balance flows into totalSales; currentBalance is outstanding (ZERO with empty aggregates)
        assertEquals(0, new BigDecimal("100.00").compareTo(result.get(0).getTotalSales()));
        assertEquals(0, BigDecimal.ZERO.compareTo(result.get(0).getCurrentBalance()));
        assertEquals(0, BigDecimal.ZERO.compareTo(result.get(1).getTotalSales()));
        verify(repository).findAllWithSavedAddresses();
        verify(repository, never()).findAll();
        // no branch filter -> the branch-allocations query is not run
        verify(repository, never()).findAllWithBranchAllocations();
    }

    // Branch filter: unallocated customers visible everywhere; allocated only where the branch matches.
    @Test
    void getAllCustomersByBranchKeepsUnallocatedAndMatchingHidesOthers() {
        Customer unallocated = customer(1L, "CUST-001", BigDecimal.ZERO);          // no allocations -> visible
        Customer matching    = customer(2L, "CUST-002", BigDecimal.ZERO);
        matching.getBranchAllocations().add(allocation("Downtown"));
        Customer other       = customer(3L, "CUST-003", BigDecimal.ZERO);
        other.getBranchAllocations().add(allocation("Marina"));

        when(repository.findAllWithSavedAddresses()).thenReturn(List.of(unallocated, matching, other));
        when(repository.findAllWithBranchAllocations()).thenReturn(List.of(unallocated, matching, other));
        stubEmptyAggregates();

        List<Customer> result = service.getAllCustomers("Downtown");

        List<String> codes = result.stream().map(Customer::getCode).toList();
        assertTrue(codes.contains("CUST-001"), "unallocated customer visible in every branch");
        assertTrue(codes.contains("CUST-002"), "customer allocated to Downtown is visible");
        assertFalse(codes.contains("CUST-003"), "customer allocated only to Marina is hidden");
    }

    @Test
    void getOpeningInvoicesMaterializesDirectCustomerOpeningBalance() {
        Customer customer = new Customer();
        customer.setCode("CUST-001");
        customer.setBalance(new BigDecimal("250.00"));

        when(repository.findByCode("CUST-001")).thenReturn(Optional.of(customer));
        when(repository.save(any(Customer.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<OpeningInvoice> invoices = service.getOpeningInvoicesByCustomerCode("CUST-001");

        assertEquals(1, invoices.size());
        OpeningInvoice openingInvoice = invoices.get(0);
        assertEquals("OB-CUST-001", openingInvoice.getNumber());
        assertEquals(new BigDecimal("250.00"), openingInvoice.getAmount());
        assertEquals(new BigDecimal("250.00"), openingInvoice.getOutstanding());
        assertEquals(new BigDecimal("250.00"), openingInvoice.getOpeningBalanceAmount());
        verify(repository).save(customer);
    }

    // =========================
    // CUSTOMER SUMMARY (global search details panel)
    // =========================

    @Test
    void customerSummaryKeepsOpeningBalanceOutstandingAndTotalSalesDistinct() {
        Customer c = customer(3L, "CUST-003", new BigDecimal("1200.00"));
        c.setName("Acme Corp Ltd");
        c.setStatus("Active");

        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode("CUST-003")).thenReturn(new BigDecimal("17100.00"));
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode("CUST-003")).thenReturn(new BigDecimal("4000.00"));
        when(openingInvoiceRepository.sumOutstandingForCustomer("CUST-003")).thenReturn(new BigDecimal("550.25"));

        CustomerSummaryResponse summary = service.getCustomerSummary(3L);

        assertEquals("CUST-003", summary.getCustomerCode());
        assertEquals("Acme Corp Ltd", summary.getCustomerName());
        // Opening balance is Customer.balance as stored — not the current balance.
        assertEquals(0, new BigDecimal("1200.00").compareTo(summary.getOpeningBalance()));
        // Outstanding = invoice outstanding + opening outstanding.
        assertEquals(0, new BigDecimal("4550.25").compareTo(summary.getOutstanding()));
        // Total sales = opening balance + lifetime invoiced.
        assertEquals(0, new BigDecimal("18300.00").compareTo(summary.getTotalSales()));
    }

    @Test
    void customerSummaryMatchesTheListForTheSameCustomer() {
        Customer c = customer(3L, "CUST-003", new BigDecimal("1200.00"));

        // The list path, using the grouped aggregates.
        when(repository.findAllWithSavedAddresses()).thenReturn(List.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalByCustomerCode())
                .thenReturn(List.<Object[]>of(new Object[] { "CUST-003", new BigDecimal("17100.00") }));
        when(salesInvoiceRepo.sumOutstandingBalanceByCustomerCode())
                .thenReturn(List.<Object[]>of(new Object[] { "CUST-003", new BigDecimal("4000.00") }));
        when(openingInvoiceRepository.sumOutstandingByCustomerCode())
                .thenReturn(List.<Object[]>of(new Object[] { "CUST-003", new BigDecimal("550.25") }));

        Customer fromList = service.getAllCustomers().get(0);

        // The summary path, using the single-customer sums.
        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode("CUST-003")).thenReturn(new BigDecimal("17100.00"));
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode("CUST-003")).thenReturn(new BigDecimal("4000.00"));
        when(openingInvoiceRepository.sumOutstandingForCustomer("CUST-003")).thenReturn(new BigDecimal("550.25"));

        CustomerSummaryResponse summary = service.getCustomerSummary(3L);

        // Two query shapes, one formula: the panel and the list can never disagree.
        assertEquals(0, fromList.getCurrentBalance().compareTo(summary.getOutstanding()));
        assertEquals(0, fromList.getTotalSales().compareTo(summary.getTotalSales()));
    }

    @Test
    void customerSummaryNeverTouchesTheAllCustomerAggregates() {
        Customer c = customer(3L, "CUST-003", BigDecimal.ZERO);

        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode("CUST-003")).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode("CUST-003")).thenReturn(BigDecimal.ZERO);
        when(openingInvoiceRepository.sumOutstandingForCustomer("CUST-003")).thenReturn(BigDecimal.ZERO);

        service.getCustomerSummary(3L);

        // A details panel for one customer must not pay for every customer in the table.
        verify(repository, never()).findAllWithSavedAddresses();
        verify(salesInvoiceRepo, never()).sumInvoiceTotalByCustomerCode();
        verify(salesInvoiceRepo, never()).sumOutstandingBalanceByCustomerCode();
        verify(openingInvoiceRepository, never()).sumOutstandingByCustomerCode();
    }

    @Test
    void customerSummaryReturnsNullForAnUnknownId() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertNull(service.getCustomerSummary(999L));
    }

    @Test
    void customerSummaryFallsBackToTheOpeningBalanceWhenTheCustomerHasNoCode() {
        Customer c = customer(3L, null, new BigDecimal("75.00"));

        when(repository.findById(3L)).thenReturn(Optional.of(c));

        CustomerSummaryResponse summary = service.getCustomerSummary(3L);

        // Invoices and opening invoices are keyed by code; with none there is nothing to
        // join to, so the figures stay at the opening balance rather than being guessed.
        assertEquals(0, new BigDecimal("75.00").compareTo(summary.getOpeningBalance()));
        assertEquals(0, BigDecimal.ZERO.compareTo(summary.getOutstanding()));
        assertEquals(0, new BigDecimal("75.00").compareTo(summary.getTotalSales()));
        verify(salesInvoiceRepo, never()).sumInvoiceTotalForCustomerCode(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void customerSummaryPrefersTheBranchEntityNameOverTheLegacyString() {
        Customer c = customer(3L, "CUST-003", BigDecimal.ZERO);
        c.setBranch("Legacy Branch");
        Branch branch = new Branch();
        branch.setName("Dubai");
        c.setBranchEntity(branch);

        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode("CUST-003")).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode("CUST-003")).thenReturn(BigDecimal.ZERO);
        when(openingInvoiceRepository.sumOutstandingForCustomer("CUST-003")).thenReturn(BigDecimal.ZERO);

        assertEquals("Dubai", service.getCustomerSummary(3L).getBranch());
    }

    @Test
    void customerSummaryTreatsNullAggregatesAsZero() {
        Customer c = customer(3L, "CUST-003", new BigDecimal("100.00"));

        when(repository.findById(3L)).thenReturn(Optional.of(c));
        when(salesInvoiceRepo.sumInvoiceTotalForCustomerCode("CUST-003")).thenReturn(null);
        when(salesInvoiceRepo.sumOutstandingBalanceForCustomerCode("CUST-003")).thenReturn(null);
        when(openingInvoiceRepository.sumOutstandingForCustomer("CUST-003")).thenReturn(null);

        CustomerSummaryResponse summary = service.getCustomerSummary(3L);

        assertEquals(0, BigDecimal.ZERO.compareTo(summary.getOutstanding()));
        assertEquals(0, new BigDecimal("100.00").compareTo(summary.getTotalSales()));
    }

    // ── Empty-query preview ──────────────────────────────────────────

    /**
     * The global search modal's empty-query suggestion list. The customer search caps its
     * rows in Java, which is fine for a term but would be a whole-table read with nothing
     * to match on — so the preview has its own query with the cap in the database.
     */
    @Test
    void previewIsCappedInTheDatabaseRatherThanInJava() {
        when(branchAccessService.currentSearchScope()).thenReturn(
                new com.billbull.backend.settings.branch.BranchAccessService.ListScope(true, java.util.Set.of(-1L)));
        when(repository.previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(List.of());
        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> pageable =
                org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);

        service.preview(2);

        verify(repository).previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(), pageable.capture());
        assertEquals(2, pageable.getValue().getPageSize());
        assertEquals(0, pageable.getValue().getPageNumber());
        verify(repository, never()).searchAllFields(any(), org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection());
    }

    @Test
    void previewSizeIsCappedServerSide() {
        when(branchAccessService.currentSearchScope()).thenReturn(
                new com.billbull.backend.settings.branch.BranchAccessService.ListScope(true, java.util.Set.of(-1L)));
        when(repository.previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(List.of());
        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> pageable =
                org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);

        service.preview(10_000);

        verify(repository).previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(), pageable.capture());
        assertEquals(com.billbull.backend.util.SearchLimit.MAX_SIZE, pageable.getValue().getPageSize());
    }

    @Test
    void previewIsBranchScopedLikeTheSearch() {
        when(branchAccessService.currentSearchScope()).thenReturn(
                new com.billbull.backend.settings.branch.BranchAccessService.ListScope(false, java.util.Set.of(3L, 8L)));
        when(repository.previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(List.of());

        service.preview(2);

        verify(repository).previewCustomers(org.mockito.ArgumentMatchers.eq(false),
                org.mockito.ArgumentMatchers.eq(java.util.Set.of(3L, 8L)),
                any(org.springframework.data.domain.Pageable.class));
    }

    @Test
    void aBlankSearchTermStillReadsNothingAtAll() {
        // The preview is opt-in: an empty q on the search path must not become a read.
        assertTrue(service.search("").isEmpty());
        assertTrue(service.search(null).isEmpty());

        verify(repository, never()).previewCustomers(org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection(), any());
        verify(repository, never()).searchAllFields(any(), org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyCollection());
    }

}
