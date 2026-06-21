package com.billbull.backend.sales.customerledger;

import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.BranchRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

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

    @Autowired
    private BranchRepository branchRepository;

    @Autowired
    private OpeningInvoiceRepository openingInvoiceRepository;

    @Autowired
    private EntityManager entityManager;

    // =========================
    // GET ALL CUSTOMERS
    // QA-028: force-initialise savedAddresses while the JPA session is open.
    // BBQA52-024: optional branchName filter — customers with no allocations
    // are visible everywhere (backwards compat for legacy/unallocated records).
    // =========================
    @Transactional(readOnly = true)
    public List<Customer> getAllCustomers() {
        return getAllCustomers(null);
    }

    @Transactional(readOnly = true)
    public List<Customer> getAllCustomers(String branchName) {
        boolean filterByBranch = branchName != null && !branchName.isBlank();
        // ARCHFIX §4.2: bulk-fetch the needed collection(s) in a single query each instead of
        // force-initialising per customer (the old 1+N / 1+2N lazy-load loop). savedAddresses is
        // always needed for the response; branchAllocations only when filtering. They are fetched
        // in SEPARATE queries on purpose — joining both bags at once Cartesian-explodes the rows.
        List<Customer> customers = repository.findAllWithSavedAddresses();

        // Bulk-fetch accurate outstanding balances without N+1 queries.
        // Use per-invoice balance field (maintained on each payment) + opening invoice outstanding.
        Map<String, BigDecimal> invoiceOutstanding = new HashMap<>();
        for (Object[] row : salesInvoiceRepo.sumOutstandingBalanceByCustomerCode()) {
            if (row[0] != null) {
                invoiceOutstanding.put((String) row[0], new BigDecimal(row[1].toString()));
            }
        }
        Map<String, BigDecimal> openingOutstanding = new HashMap<>();
        for (Object[] row : openingInvoiceRepository.sumOutstandingByCustomerCode()) {
            if (row[0] != null) {
                openingOutstanding.put((String) row[0], new BigDecimal(row[1].toString()));
            }
        }
        // Also bulk-fetch invoice totals for totalSales display (unchanged)
        Map<String, BigDecimal> invoiceTotals = new HashMap<>();
        for (Object[] row : salesInvoiceRepo.sumInvoiceTotalByCustomerCode()) {
            if (row[0] != null) {
                invoiceTotals.put((String) row[0], new BigDecimal(row[1].toString()));
            }
        }
        for (Customer c : customers) {
            BigDecimal openingBalance = c.getBalance() != null ? c.getBalance() : BigDecimal.ZERO;
            BigDecimal invoiced = invoiceTotals.getOrDefault(c.getCode(), BigDecimal.ZERO);
            BigDecimal invOutstanding = invoiceOutstanding.getOrDefault(c.getCode(), BigDecimal.ZERO);
            BigDecimal opnOutstanding = openingOutstanding.getOrDefault(c.getCode(), BigDecimal.ZERO);
            c.setCurrentBalance(invOutstanding.add(opnOutstanding));
            c.setTotalSales(openingBalance.add(invoiced));
        }

        if (!filterByBranch) {
            return customers;
        }
        final String branch = branchName.trim();
        // Resolve branch visibility from a dedicated single-query fetch of branchAllocations (+ branch)
        // rather than lazy-initialising per customer. A customer is visible when it has NO allocations
        // (legacy/unallocated = visible everywhere) or one allocation matches the branch — identical
        // semantics to the previous per-customer check.
        java.util.Set<Long> visibleIds = new java.util.HashSet<>();
        for (Customer c : repository.findAllWithBranchAllocations()) {
            boolean visible = c.getBranchAllocations().isEmpty()
                    || c.getBranchAllocations().stream()
                        .anyMatch(a -> a.getBranch() != null && branch.equalsIgnoreCase(a.getBranch().getName()));
            if (visible) {
                visibleIds.add(c.getId());
            }
        }
        return customers.stream()
                .filter(c -> visibleIds.contains(c.getId()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Customer> search(String q) {
        if (q == null || q.isBlank()) return List.of();
        return repository.findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(q, q);
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
        // Force-initialize lazy collections while session is still open.
        dto.setSavedAddresses(new ArrayList<>(customer.getSavedAddresses()));
        dto.setOpeningInvoices(new ArrayList<>(customer.getOpeningInvoices()));
        dto.setContactPersons(new ArrayList<>(customer.getContactPersons()));
        dto.setDocuments(new ArrayList<>(customer.getDocuments()));
        // BBQA52-023: load branch allocations
        customer.getBranchAllocations().size();
        List<String> allocBranches = customer.getBranchAllocations().stream()
                .map(a -> a.getBranch().getName())
                .collect(Collectors.toList());
        dto.setAllocatedBranches(allocBranches);
        // Populate branch name from branchEntity FK if set; fall back to legacy string
        if (customer.getBranchEntity() != null) {
            dto.setBranch(customer.getBranchEntity().getName());
        }
        return dto;
    }

    // =========================
    // QA-028: ADD SINGLE SHIPPING ADDRESS
    // Append-only: keeps existing addresses, preserves the existing default
    // unless the new address is flagged isDefault (in which case the previous
    // default is demoted).
    // =========================
    @Transactional
    public List<SavedAddress> addSavedAddress(Long customerId, SavedAddress address) {
        Customer customer = repository.findById(customerId)
                .orElseThrow(() -> new RuntimeException("Customer not found with id " + customerId));

        if (address.isDefault()) {
            for (SavedAddress existing : customer.getSavedAddresses()) {
                existing.setDefault(false);
            }
        } else if (customer.getSavedAddresses().isEmpty()) {
            address.setDefault(true);
        }

        address.setId(null);
        address.setCustomer(customer);
        customer.getSavedAddresses().add(address);

        Customer saved = repository.save(customer);
        return new ArrayList<>(saved.getSavedAddresses());
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
        // DUPLICATE MOBILE CHECK
        // -------------------------
        if (dto.getMobile() != null && !dto.getMobile().isBlank()) {
            boolean duplicate = dto.getId() == null
                    ? repository.existsByMobile(dto.getMobile())
                    : repository.existsByMobileAndIdNot(dto.getMobile(), dto.getId());
            if (duplicate) {
                throw new IllegalArgumentException(
                        "A customer with this phone number already exists.");
            }
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

        List<SavedAddress> oldAddresses = new ArrayList<>(customer.getSavedAddresses());
        List<OpeningInvoice> oldInvoices = new ArrayList<>(customer.getOpeningInvoices());
        List<ContactPerson> oldContacts = new ArrayList<>(customer.getContactPersons());
        List<CustomerDocument> oldDocuments = new ArrayList<>(customer.getDocuments());

        // Saved Addresses
        if (dto.getSavedAddresses() != null) {
            customer.getSavedAddresses().clear();
            // Enforce at most one default address
            boolean foundDefault = false;
            for (SavedAddress dtoAddr : dto.getSavedAddresses()) {
                SavedAddress addr = new SavedAddress();
                if (dtoAddr.getId() != null) {
                    addr = oldAddresses.stream()
                            .filter(e -> dtoAddr.getId().equals(e.getId()))
                            .findFirst()
                            .orElse(new SavedAddress());
                }
                BeanUtils.copyProperties(dtoAddr, addr, "id", "customer");

                if (addr.isDefault() && !foundDefault) {
                    foundDefault = true;
                } else {
                    addr.setDefault(false);
                }
                addr.setCustomer(customer);
                customer.getSavedAddresses().add(addr);
            }
            // Sync denormalised field so the customer list response always has it
            String defaultAddr = customer.getSavedAddresses().stream()
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
                for (OpeningInvoice dtoInv : dto.getOpeningInvoices()) {
                    OpeningInvoice inv = new OpeningInvoice();
                    if (dtoInv.getId() != null) {
                        inv = oldInvoices.stream()
                                .filter(e -> dtoInv.getId().equals(e.getId()))
                                .findFirst()
                                .orElse(new OpeningInvoice());
                    }
                    BeanUtils.copyProperties(dtoInv, inv, "id", "customer");

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
            for (ContactPerson dtoCp : dto.getContactPersons()) {
                ContactPerson cp = new ContactPerson();
                if (dtoCp.getId() != null) {
                    cp = oldContacts.stream()
                            .filter(e -> dtoCp.getId().equals(e.getId()))
                            .findFirst()
                            .orElse(new ContactPerson());
                }
                BeanUtils.copyProperties(dtoCp, cp, "id", "customer");

                cp.setCustomer(customer);
                customer.getContactPersons().add(cp);
            }
        }

        // Documents
        if (dto.getDocuments() != null) {
            customer.getDocuments().clear();
            for (CustomerDocument dtoDoc : dto.getDocuments()) {
                CustomerDocument doc = new CustomerDocument();
                if (dtoDoc.getId() != null) {
                    doc = oldDocuments.stream()
                            .filter(e -> dtoDoc.getId().equals(e.getId()))
                            .findFirst()
                            .orElse(new CustomerDocument());
                }
                BeanUtils.copyProperties(dtoDoc, doc, "id", "customer");

                doc.setCustomer(customer);
                customer.getDocuments().add(doc);
            }
        }

        // -------------------------
        // BBQA52-023: Branch Allocations
        // -------------------------
        if (dto.getBranch() != null || dto.getAllocatedBranches() != null) {
            customer.getBranchAllocations().size(); // force-init before clear
            customer.getBranchAllocations().clear();
            entityManager.flush(); // flush DELETEs before INSERTs to avoid unique-key violation
            Set<String> names = new LinkedHashSet<>();
            if (dto.getBranch() != null && !dto.getBranch().isBlank()) names.add(dto.getBranch());
            if (dto.getAllocatedBranches() != null) names.addAll(dto.getAllocatedBranches());
            final String defaultBranch = dto.getBranch();
            for (String name : names) {
                branchRepository.findByNameIgnoreCase(name).ifPresent(b -> {
                    CustomerBranchAllocation alloc = new CustomerBranchAllocation();
                    alloc.setCustomer(customer);
                    alloc.setBranch(b);
                    alloc.setDefault(name.equals(defaultBranch));
                    customer.getBranchAllocations().add(alloc);
                    if (name.equals(defaultBranch)) {
                        customer.setBranchEntity(b);
                        customer.setBranch(name);
                    }
                });
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
