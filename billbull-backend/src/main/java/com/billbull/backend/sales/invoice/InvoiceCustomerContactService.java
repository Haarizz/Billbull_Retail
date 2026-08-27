package com.billbull.backend.sales.invoice;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;

/**
 * Fills an invoice's {@code @Transient} customer contact fields — phone, email, TRN and
 * address — from the customer record, so the printed receipt's CUSTOMER block is
 * self-contained.
 *
 * <p>A SalesInvoice persists only customerCode and customerName. Every other row of that
 * block used to be resolved in the browser against the POS's locally cached customer
 * list, so those rows printed only when that list happened to be loaded AND to contain
 * the customer — from a fresh page load, or for a customer outside the cached set, the
 * TRN and address silently vanished from reprints.
 *
 * <p>Resolving server-side means the receipt data travels with the invoice, so a new
 * sale, a reprint, a delivery order and a delivery settlement all print the same block.
 */
@Service
public class InvoiceCustomerContactService {

    private static final String WALK_IN = "WALK-IN";

    private final CustomerRepository customerRepository;

    public InvoiceCustomerContactService(CustomerRepository customerRepository) {
        this.customerRepository = customerRepository;
    }

    /** Enriches one invoice; returns the same instance so it can wrap a return value. */
    public SalesInvoice attach(SalesInvoice invoice) {
        if (invoice == null) return null;
        String code = normalisedCode(invoice);
        if (code == null) return invoice;
        customerRepository.findByCode(code).ifPresent(c -> apply(invoice, c));
        return invoice;
    }

    /** Batch variant: one lookup per distinct customer code, not one per invoice. */
    public List<SalesInvoice> attach(List<SalesInvoice> invoices) {
        if (invoices == null || invoices.isEmpty()) return invoices;
        Map<String, Customer> byCode = new HashMap<>();
        for (SalesInvoice invoice : invoices) {
            String code = normalisedCode(invoice);
            if (code == null) continue;
            Customer customer = byCode.computeIfAbsent(code,
                    key -> customerRepository.findByCode(key).orElse(null));
            if (customer != null) apply(invoice, customer);
        }
        return invoices;
    }

    private void apply(SalesInvoice invoice, Customer customer) {
        invoice.setCustomerPhone(firstNonBlank(customer.getMobile(), customer.getPhone()));
        invoice.setCustomerEmail(customer.getEmail());
        invoice.setCustomerTrn(customer.getTrn());
        // The customer's single address of record (the default entry of their Shipping
        // Address tab) — NOT this sale's delivery address, which the receipt prints in
        // its own DELIVERY ADDRESS section.
        invoice.setCustomerAddress(customer.getDefaultShippingAddress());
    }

    /** Trimmed customer code, or null when there is nothing to look up (incl. walk-ins). */
    private String normalisedCode(SalesInvoice invoice) {
        String code = invoice.getCustomerCode();
        if (code == null || code.isBlank()) return null;
        String trimmed = code.trim();
        return WALK_IN.equalsIgnoreCase(trimmed) ? null : trimmed;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }
}
