package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;

/**
 * The printed receipt's CUSTOMER block (Name / Mobile / Email / TRN / Address) is only
 * as good as what this service attaches — the invoice itself stores nothing but the
 * customer's code and name.
 */
@ExtendWith(MockitoExtension.class)
class InvoiceCustomerContactServiceTest {

    @Mock private CustomerRepository customerRepository;
    @InjectMocks private InvoiceCustomerContactService service;

    @Test
    void attachesContactDetailsFromTheCustomerRecord() {
        when(customerRepository.findByCode("CUST-00847")).thenReturn(Optional.of(customer()));

        SalesInvoice invoice = service.attach(invoice("CUST-00847"));

        assertEquals("+971 50 123 4567", invoice.getCustomerPhone());
        assertEquals("sarah@email.com", invoice.getCustomerEmail());
        assertEquals("100987654300003", invoice.getCustomerTrn());
        assertEquals("Villa 22, Street 7, Al Faseel, Fujairah", invoice.getCustomerAddress());
    }

    /** Mobile is the receipt's number; phone is only the fallback when mobile is blank. */
    @Test
    void fallsBackToPhoneWhenMobileIsBlank() {
        Customer c = customer();
        c.setMobile("  ");
        c.setPhone("+971 4 123 4567");
        when(customerRepository.findByCode("CUST-00847")).thenReturn(Optional.of(c));

        assertEquals("+971 4 123 4567", service.attach(invoice("CUST-00847")).getCustomerPhone());
    }

    @Test
    void skipsWalkInAndBlankCodesWithoutHittingTheRepository() {
        assertNull(service.attach(invoice("WALK-IN")).getCustomerTrn());
        assertNull(service.attach(invoice("  ")).getCustomerTrn());
        assertNull(service.attach(invoice(null)).getCustomerTrn());

        verify(customerRepository, never()).findByCode(anyString());
    }

    /** A missing customer record leaves the invoice untouched rather than failing the print. */
    @Test
    void leavesTheInvoiceUntouchedWhenTheCustomerIsGone() {
        when(customerRepository.findByCode("GONE")).thenReturn(Optional.empty());

        SalesInvoice invoice = service.attach(invoice("GONE"));

        assertNull(invoice.getCustomerTrn());
        assertNull(invoice.getCustomerPhone());
    }

    /** The delivery list can hold many invoices for one customer — look them up once. */
    @Test
    void batchLooksUpEachDistinctCodeOnlyOnce() {
        when(customerRepository.findByCode("CUST-00847")).thenReturn(Optional.of(customer()));

        List<SalesInvoice> invoices = List.of(
                invoice("CUST-00847"), invoice("CUST-00847"), invoice("WALK-IN"));
        service.attach(invoices);

        verify(customerRepository, times(1)).findByCode("CUST-00847");
        assertEquals("100987654300003", invoices.get(0).getCustomerTrn());
        assertEquals("100987654300003", invoices.get(1).getCustomerTrn());
        assertNull(invoices.get(2).getCustomerTrn());
    }

    private SalesInvoice invoice(String customerCode) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setCustomerCode(customerCode);
        invoice.setCustomerName("Sarah Johnson");
        return invoice;
    }

    private Customer customer() {
        Customer customer = new Customer();
        customer.setCode("CUST-00847");
        customer.setName("Sarah Johnson");
        customer.setMobile("+971 50 123 4567");
        customer.setEmail("sarah@email.com");
        customer.setTrn("100987654300003");
        customer.setDefaultShippingAddress("Villa 22, Street 7, Al Faseel, Fujairah");
        return customer;
    }
}
