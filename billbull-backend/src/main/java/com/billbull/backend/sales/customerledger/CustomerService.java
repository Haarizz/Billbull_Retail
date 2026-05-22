package com.billbull.backend.sales.customerledger;

import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class CustomerService {

    @Autowired
    private CustomerRepository repository;

    @Autowired(required = false)
    private ReceiptVoucherRepository receiptVoucherRepository;

    @Autowired
    private com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;

    @Autowired
    private com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;

    @Autowired
    private com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepo;

    @Autowired(required = false)
    private SalesDocumentNumberingService numberingService;

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
    @Transactional
    public CustomerDTO getCustomerDtoById(Long id) {
        Customer customer = getCustomerById(id);
        ensureOpeningInvoiceForBalance(customer);
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

    @Transactional
    public List<OpeningInvoice> getOpeningInvoicesByCustomerCode(String customerCode) {
        Customer customer = repository.findByCode(customerCode)
                .orElseThrow(() -> new RuntimeException("Customer not found with code " + customerCode));

        ensureOpeningInvoiceForBalance(customer);

        List<OpeningInvoice> invoices = new ArrayList<>(customer.getOpeningInvoices());
        if (receiptVoucherRepository != null) {
            syncOutstandingFromReceipts(invoices);
        }
        return invoices;
    }

    private void syncOutstandingFromReceipts(List<OpeningInvoice> invoices) {
        for (OpeningInvoice invoice : invoices) {
            if (invoice.getId() == null) continue;
            BigDecimal seed = resolveOriginalOpeningBalance(invoice);
            BigDecimal totalPaid = receiptVoucherRepository.findByOpeningInvoiceId(invoice.getId())
                    .stream()
                    .filter(r -> r.getAmount() != null && isCompletedReceiptStatus(r.getStatus()))
                    .map(r -> r.getAmount())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal outstanding = seed.subtract(totalPaid).max(BigDecimal.ZERO);
            if (!Objects.equals(invoice.getOutstanding(), outstanding)) {
                invoice.setOutstanding(outstanding);
            }
        }
    }

    private BigDecimal resolveOriginalOpeningBalance(OpeningInvoice invoice) {
        BigDecimal ob = invoice.getOpeningBalanceAmount();
        if (ob != null && ob.compareTo(BigDecimal.ZERO) > 0) return ob;
        BigDecimal amt = invoice.getAmount();
        return amt != null ? amt : BigDecimal.ZERO;
    }

    private boolean isCompletedReceiptStatus(String status) {
        return status != null && (status.equalsIgnoreCase("Completed") || status.equalsIgnoreCase("COMPLETED"));
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
        if (dto.getId() == null && numberingService != null) {
            customer.setCode(numberingService.resolveNumberForCreate(SalesDocumentType.CUSTOMER, customer.getCode()));
        } else if (customer.getCode() == null || customer.getCode().isBlank()) {
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

        boolean hadOpeningInvoices = !customer.getOpeningInvoices().isEmpty();
        boolean hasSubmittedOpeningInvoices = dto.getOpeningInvoices() != null && !dto.getOpeningInvoices().isEmpty();

        // -------------------------
        // OPENING BALANCE
        // QA-002/QA-011: use current outstanding, and preserve direct migrated
        // customer balances by materializing them as opening invoices.
        // -------------------------
        BigDecimal openingBalance = BigDecimal.ZERO;

        if (hasSubmittedOpeningInvoices) {
            openingBalance = dto.getOpeningInvoices().stream()
                    .map(this::resolveCurrentOpeningOutstanding)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } else if (!hadOpeningInvoices && dto.getBalance() != null && dto.getBalance().compareTo(BigDecimal.ZERO) > 0) {
            openingBalance = dto.getBalance();
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
            if (hasSubmittedOpeningInvoices) {
                for (OpeningInvoice inv : dto.getOpeningInvoices()) {
                    initializeOpeningBalanceAmount(inv);
                    inv.setCustomer(customer);
                    customer.getOpeningInvoices().add(inv);
                }
            } else if (!hadOpeningInvoices && openingBalance.compareTo(BigDecimal.ZERO) > 0) {
                customer.getOpeningInvoices().add(createOpeningInvoiceFromBalance(customer, openingBalance));
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

    private void initializeOpeningBalanceAmount(OpeningInvoice invoice) {
        BigDecimal outstanding = resolveCurrentOpeningOutstanding(invoice);
        BigDecimal openingBalanceAmount = invoice.getOpeningBalanceAmount();
        if (openingBalanceAmount != null
                && openingBalanceAmount.compareTo(BigDecimal.ZERO) > 0
                && (outstanding.compareTo(BigDecimal.ZERO) <= 0
                        || openingBalanceAmount.compareTo(outstanding) <= 0)) {
            return;
        }

        invoice.setOpeningBalanceAmount(resolveOpeningBalanceSeed(invoice));
    }

    private BigDecimal resolveCurrentOpeningOutstanding(OpeningInvoice invoice) {
        BigDecimal outstanding = invoice.getOutstanding();
        if (outstanding != null) {
            return outstanding.compareTo(BigDecimal.ZERO) > 0 ? outstanding : BigDecimal.ZERO;
        }

        BigDecimal amount = invoice.getAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    private BigDecimal resolveOpeningBalanceSeed(OpeningInvoice invoice) {
        BigDecimal outstanding = invoice.getOutstanding();
        if (outstanding != null && outstanding.compareTo(BigDecimal.ZERO) > 0) {
            return outstanding;
        }

        BigDecimal amount = invoice.getAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    private OpeningInvoice createOpeningInvoiceFromBalance(Customer customer, BigDecimal balance) {
        OpeningInvoice invoice = new OpeningInvoice();
        invoice.setCustomer(customer);
        invoice.setNumber("OB-" + customer.getCode());
        invoice.setAmount(balance);
        invoice.setOutstanding(balance);
        invoice.setOpeningBalanceAmount(balance);
        invoice.setRemarks("Opening balance");
        return invoice;
    }

    private void ensureOpeningInvoiceForBalance(Customer customer) {
        if (!customer.getOpeningInvoices().isEmpty()
                || customer.getBalance() == null
                || customer.getBalance().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        customer.getOpeningInvoices().add(createOpeningInvoiceFromBalance(customer, customer.getBalance()));
        repository.save(customer);
    }
}
