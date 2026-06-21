package com.billbull.backend.sales.customerledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    private CustomerService service;

    @BeforeEach
    void setUp() {
        service = new CustomerService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepo", salesInvoiceRepo);
        ReflectionTestUtils.setField(service, "openingInvoiceRepository", openingInvoiceRepository);
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
}
