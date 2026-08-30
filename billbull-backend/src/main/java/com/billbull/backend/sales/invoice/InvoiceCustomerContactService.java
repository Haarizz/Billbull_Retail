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
        Customer customer = code != null ? customerRepository.findByCode(code).orElse(null) : null;
        if (customer == null) customer = resolveByNameFallback(invoice);
        if (customer != null) apply(invoice, customer);
        return invoice;
    }

    /** Batch variant: one lookup per distinct customer code (or, for blank-code
     *  invoices, per distinct customer name), not one per invoice. */
    public List<SalesInvoice> attach(List<SalesInvoice> invoices) {
        if (invoices == null || invoices.isEmpty()) return invoices;
        Map<String, Customer> byCode = new HashMap<>();
        Map<String, Customer> byName = new HashMap<>();
        for (SalesInvoice invoice : invoices) {
            String code = normalisedCode(invoice);
            Customer customer = null;
            if (code != null) {
                customer = byCode.computeIfAbsent(code, key -> customerRepository.findByCode(key).orElse(null));
            }
            if (customer == null) customer = resolveByNameFallback(invoice, byName);
            if (customer != null) apply(invoice, customer);
        }
        return invoices;
    }

    /**
     * Last-resort lookup by customerName for an invoice whose customerCode came back
     * blank (seen on some older/edge-case invoices) — without it, that invoice's
     * CUSTOMER block silently drops TRN/phone/email/address even though the customer
     * is otherwise correctly identified by name. Only used when exactly one customer
     * shares that exact (case-insensitive) name, so an ambiguous name never attaches
     * the wrong customer's details.
     */
    private Customer resolveByNameFallback(SalesInvoice invoice) {
        return resolveByNameFallback(invoice, null);
    }

    private Customer resolveByNameFallback(SalesInvoice invoice, Map<String, Customer> cache) {
        String name = invoice.getCustomerName();
        if (name == null || name.isBlank() || "Walk-in Customer".equalsIgnoreCase(name.trim())) return null;
        String key = name.trim().toLowerCase();
        if (cache == null) return lookupByExactName(key);
        // computeIfAbsent can't store a null "no match" result, so a name that misses
        // (or is ambiguous) is simply re-queried if it recurs — acceptable since misses
        // are the rare case, not the common one.
        Customer cached = cache.get(key);
        if (cached != null) return cached;
        Customer resolved = lookupByExactName(key);
        if (resolved != null) cache.put(key, resolved);
        return resolved;
    }

    private Customer lookupByExactName(String lowerCaseName) {
        List<Customer> matches = customerRepository.findByNameIgnoreCase(lowerCaseName);
        return matches.size() == 1 ? matches.get(0) : null;
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
