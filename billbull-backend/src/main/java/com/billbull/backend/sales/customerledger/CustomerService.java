package com.billbull.backend.sales.customerledger;

import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
public class CustomerService {

    @Autowired
    private CustomerRepository repository;

    @Autowired
    private com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;

    @Autowired
    private com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;

    @Autowired
    private com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepo;

    // =========================
    // GET ALL CUSTOMERS
    // =========================
    public List<Customer> getAllCustomers() {
        List<Customer> customers = repository.findAll();
        return customers;
    }

    // =========================
    // GET CUSTOMER BY ID
    // =========================
    @Transactional(readOnly = true)
    public Customer getCustomerById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Customer not found with id " + id));
    }

    // BB-005: @Transactional ensures lazy collections load without LazyInitializationException
    @Transactional(readOnly = true)
    public CustomerDTO getCustomerDtoById(Long id) {
        Customer customer = getCustomerById(id);
        CustomerDTO dto = new CustomerDTO();
        BeanUtils.copyProperties(customer, dto);
        dto.setGroup(customer.getGroupType());
        // Force-initialize lazy collections by copying into plain ArrayLists while
        // the session is still open. Without this, Jackson serialization after the
        // transaction closes would throw LazyInitializationException (open-in-view=false).
        dto.setSavedAddresses(new ArrayList<>(customer.getSavedAddresses()));
        dto.setOpeningInvoices(new ArrayList<>(customer.getOpeningInvoices()));
        dto.setContactPersons(new ArrayList<>(customer.getContactPersons()));
        dto.setDocuments(new ArrayList<>(customer.getDocuments()));
        return dto;
    }

    // =========================
    // CREATE / UPDATE CUSTOMER
    // =========================
    @Transactional
    public Customer saveCustomer(CustomerDTO dto) {

        Customer customer;

        // UPDATE
        if (dto.getId() != null) {
            customer = repository.findById(dto.getId())
                    .orElseThrow(() -> new RuntimeException("Customer not found"));
        }
        // CREATE
        else {
            customer = new Customer();
        }

        // -------------------------
        // COPY SIMPLE FIELDS
        // -------------------------
        BeanUtils.copyProperties(
                dto,
                customer,
                "id",
                "group",
                "savedAddresses",
                "openingInvoices",
                "contactPersons",
                "documents");

        // group (frontend) → groupType (entity)
        customer.setGroupType(dto.getGroup());

        // -------------------------
        // DEFAULT VALUES
        // -------------------------

        // QA-004: auto-generate code when not provided (quick-create from selector)
        if (customer.getCode() == null || customer.getCode().isBlank()) {
            String candidate;
            long seq = repository.count() + 1;
            do {
                candidate = String.format("CUST-%04d", seq++);
            } while (repository.existsByCode(candidate));
            customer.setCode(candidate);
        }

        if (customer.getStatus() == null)
            customer.setStatus("Active");

        if (customer.getBalance() == null)
            customer.setBalance(BigDecimal.ZERO);

        if (customer.getTotalSales() == null)
            customer.setTotalSales(BigDecimal.ZERO);

        // -------------------------
        // OPENING BALANCE
        // QA-002 fix: use outstanding (the actual unpaid portion entered at migration)
        // and fall back to amount only when outstanding is null or zero.
        // -------------------------
        BigDecimal openingBalance = BigDecimal.ZERO;

        if (dto.getOpeningInvoices() != null) {
            openingBalance = dto.getOpeningInvoices().stream()
                    .map(inv -> {
                        BigDecimal outstanding = inv.getOutstanding();
                        BigDecimal amount = inv.getAmount();
                        if (outstanding != null && outstanding.compareTo(BigDecimal.ZERO) > 0) {
                            return outstanding;
                        }
                        return amount != null ? amount : BigDecimal.ZERO;
                    })
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        customer.setBalance(openingBalance);

        // -------------------------
        // CHILD ENTITIES (OWNING SIDE)
        // -------------------------

        // Saved Addresses
        if (dto.getSavedAddresses() != null) {
            customer.getSavedAddresses().clear();
            // Enforce at most one default address
            boolean foundDefault = false;
            for (SavedAddress addr : dto.getSavedAddresses()) {
                if (addr.isDefault() && !foundDefault) {
                    foundDefault = true;
                } else {
                    addr.setDefault(false);
                }
                addr.setCustomer(customer);
                customer.getSavedAddresses().add(addr);
            }
            // Sync denormalised field so the customer list response always has it
            String defaultAddr = dto.getSavedAddresses().stream()
                    .filter(SavedAddress::isDefault)
                    .findFirst()
                    .map(a -> java.util.stream.Stream.of(a.getAddress1(), a.getAddress2(), a.getCity(), a.getCountry())
                            .filter(s -> s != null && !s.isBlank())
                            .collect(java.util.stream.Collectors.joining(", ")))
                    .orElse(null);
            customer.setDefaultShippingAddress(defaultAddr);
        }

        // Opening Invoices
        if (dto.getOpeningInvoices() != null) {
            customer.getOpeningInvoices().clear();
            for (OpeningInvoice inv : dto.getOpeningInvoices()) {
                inv.setCustomer(customer);
                customer.getOpeningInvoices().add(inv);
            }
        }

        // Contact Persons
        if (dto.getContactPersons() != null) {
            customer.getContactPersons().clear();
            for (ContactPerson cp : dto.getContactPersons()) {
                cp.setCustomer(customer);
                customer.getContactPersons().add(cp);
            }
        }

        // Documents
        if (dto.getDocuments() != null) {
            customer.getDocuments().clear();
            for (CustomerDocument doc : dto.getDocuments()) {
                doc.setCustomer(customer);
                customer.getDocuments().add(doc);
            }
        }

        // -------------------------
        // SAVE & RETURN
        // -------------------------
        return repository.save(customer);
    }

    // =========================
    // DELETE CUSTOMER
    // =========================
    @Transactional
    public void deleteCustomer(Long id) {
        Customer customer = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Customer not found with id " + id));

        // 🛑 CHECK USAGE IN OTHER MODULES
        if (quotationRepo.existsByCustomerContaining(customer.getCode())) {
            throw new RuntimeException("Cannot delete customer. Linked to existing Quotations.");
        }
        if (salesOrderRepo.existsByCustomerCode(customer.getCode())) {
            throw new RuntimeException("Cannot delete customer. Linked to existing Sales Orders.");
        }
        if (salesInvoiceRepo.existsByCustomerCode(customer.getCode())) {
            throw new RuntimeException("Cannot delete customer. Linked to existing Sales Invoices.");
        }

        repository.deleteById(id);
    }
}