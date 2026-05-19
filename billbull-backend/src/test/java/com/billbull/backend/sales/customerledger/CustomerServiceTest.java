package com.billbull.backend.sales.customerledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    @Mock
    private CustomerRepository repository;

    private CustomerService service;

    @BeforeEach
    void setUp() {
        service = new CustomerService();
        ReflectionTestUtils.setField(service, "repository", repository);
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
