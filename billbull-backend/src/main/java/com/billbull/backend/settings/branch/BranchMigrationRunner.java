package com.billbull.backend.settings.branch;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

@Component
public class BranchMigrationRunner implements ApplicationRunner {

    private final BranchRepository branchRepository;
    private final UserRepository userRepository;
    private final WarehouseRepository warehouseRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final CustomerRepository customerRepository;
    private final EmployeeRepository employeeRepository;
    private final CostCenterRepository costCenterRepository;

    @PersistenceContext
    private EntityManager em;

    public BranchMigrationRunner(
            BranchRepository branchRepository,
            UserRepository userRepository,
            WarehouseRepository warehouseRepository,
            SalesInvoiceRepository salesInvoiceRepository,
            CustomerRepository customerRepository,
            EmployeeRepository employeeRepository,
            CostCenterRepository costCenterRepository) {
        this.branchRepository = branchRepository;
        this.userRepository = userRepository;
        this.warehouseRepository = warehouseRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.customerRepository = customerRepository;
        this.employeeRepository = employeeRepository;
        this.costCenterRepository = costCenterRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Branch> branches = branchRepository.findAll();
        if (branches.isEmpty()) {
            return;
        }

        promoteHeadquartersIfMissing(branches);

        Map<String, Branch> branchLookup = buildBranchLookup(branches);
        Branch hqFallback = branchRepository.findByIsHeadquartersTrue().orElse(
                branches.stream().filter(Branch::isDefault).findFirst().orElse(branches.get(0)));

        migrateUsers(branchLookup);
        migrateWarehouses(branchLookup);
        migrateCustomers(branchLookup, hqFallback);
        migrateEmployees(branchLookup, hqFallback);
        migrateCostCenters(branchLookup, hqFallback);
        backfillTransactionBranches(hqFallback);
    }

    /**
     * Bulk-assigns HQ to every transaction row whose new {@code branch_id} FK is null.
     * Group A entities (Quotation/SalesInvoice/DeliveryNote/Grn/PurchaseInvoice) already
     * carry a {@code branchId} Long that was written by callers — those rows skip this pass.
     * Group B entities (SalesOrder, SalesReturn, ProformaInvoice, sales/payments,
     * Lpo, purchase/payment_vouchers, JournalEntry, Expense, ReceiptVoucher,
     * ReconciliationSession) have never had a branch field and land on HQ.
     */
    private void backfillTransactionBranches(Branch hqFallback) {
        if (hqFallback == null) {
            return;
        }
        String[] tables = {
                // Group A — only legacy rows where branchId was never set
                "sales_quotations", "sales_invoices", "delivery_notes",
                "grns", "purchase_invoices",
                // Group B — every existing row
                "sales_orders", "sales_returns", "proforma_invoices", "sales_payments",
                "lpos", "payment_vouchers",
                "journal_entries", "expenses",
                "sales_receipt_vouchers", "reconciliation_sessions",
                "ledger_entries"
        };
        for (String table : tables) {
            try {
                em.createNativeQuery(
                        "UPDATE " + table + " SET branch_id = ?1 WHERE branch_id IS NULL")
                        .setParameter(1, hqFallback.getId())
                        .executeUpdate();
            } catch (Exception ex) {
                // Table may not exist yet (fresh DB, feature not used). Don't block startup.
                System.err.println("[BranchMigrationRunner] Skipped " + table + ": " + ex.getMessage());
            }
        }
    }

    private void migrateCustomers(Map<String, Branch> branchLookup, Branch hqFallback) {
        List<Customer> rows = customerRepository.findAll().stream()
                .filter(c -> c.getBranchEntity() == null)
                .toList();
        if (rows.isEmpty()) return;
        for (Customer c : rows) {
            Branch matched = resolveBranchByLabel(c.getBranch(), branchLookup);
            c.setBranchEntity(matched != null ? matched : hqFallback);
        }
        customerRepository.saveAll(rows);
    }

    private void migrateEmployees(Map<String, Branch> branchLookup, Branch hqFallback) {
        List<Employee> rows = employeeRepository.findAll().stream()
                .filter(e -> e.getBranchEntity() == null)
                .toList();
        if (rows.isEmpty()) return;
        for (Employee e : rows) {
            Branch matched = resolveBranchByLabel(e.getBranch(), branchLookup);
            e.setBranchEntity(matched != null ? matched : hqFallback);
        }
        employeeRepository.saveAll(rows);
    }

    private void migrateCostCenters(Map<String, Branch> branchLookup, Branch hqFallback) {
        List<CostCenter> rows = costCenterRepository.findAll().stream()
                .filter(cc -> cc.getBranchEntity() == null)
                .toList();
        if (rows.isEmpty()) return;
        for (CostCenter cc : rows) {
            Branch matched = resolveBranchByLabel(cc.getBranch(), branchLookup);
            cc.setBranchEntity(matched != null ? matched : hqFallback);
        }
        costCenterRepository.saveAll(rows);
    }

    private void promoteHeadquartersIfMissing(List<Branch> branches) {
        boolean hasHq = branches.stream().anyMatch(Branch::isHeadquarters);
        if (hasHq) {
            return;
        }

        Branch candidate = branches.stream()
                .filter(Branch::isDefault)
                .findFirst()
                .orElseGet(() -> branches.stream()
                        .min(java.util.Comparator.comparing(Branch::getId))
                        .orElse(null));

        if (candidate == null) {
            return;
        }

        candidate.setHeadquarters(true);
        if (candidate.getType() == null) {
            candidate.setType(BranchType.HEADQUARTERS);
        }
        branchRepository.save(candidate);
    }

    private void migrateUsers(Map<String, Branch> branchLookup) {
        List<User> unresolvedUsers = userRepository.findByBranchIsNull();
        if (unresolvedUsers.isEmpty()) {
            return;
        }

        for (User user : unresolvedUsers) {
            Branch matched = resolveBranchByLabel(
                    user.getLinkedEmployee() != null ? user.getLinkedEmployee().getBranch() : null,
                    branchLookup);
            if (matched != null) {
                user.setBranch(matched);
            }
        }

        userRepository.saveAll(unresolvedUsers);
    }

    private void migrateWarehouses(Map<String, Branch> branchLookup) {
        List<Warehouse> unresolvedWarehouses = warehouseRepository.findByBranchIsNull();
        if (unresolvedWarehouses.isEmpty()) {
            return;
        }

        Map<Long, Branch> defaultWarehouseMatches = new HashMap<>();
        for (Branch branch : branchRepository.findAll()) {
            if (branch.getDefaultWarehouse() != null) {
                defaultWarehouseMatches.put(branch.getDefaultWarehouse().getId(), branch);
            }
        }

        Map<Long, Set<Long>> warehouseToSalesBranchIds = new HashMap<>();
        for (SalesInvoice invoice : salesInvoiceRepository.findAll()) {
            Branch matchedBranch = resolveBranchByLabel(invoice.getBranch(), branchLookup);
            if (matchedBranch == null || invoice.getItems() == null) {
                continue;
            }

            for (SalesInvoiceItem item : invoice.getItems()) {
                if (item.getWarehouseId() == null) {
                    continue;
                }
                warehouseToSalesBranchIds
                        .computeIfAbsent(item.getWarehouseId(), ignored -> new LinkedHashSet<>())
                        .add(matchedBranch.getId());
            }
        }

        Map<String, Branch> userBranchByUsername = new HashMap<>();
        for (User user : userRepository.findAll()) {
            if (user.getBranch() != null) {
                userBranchByUsername.put(normalize(user.getUsername()), user.getBranch());
            }
        }

        for (Warehouse warehouse : unresolvedWarehouses) {
            Branch matched = defaultWarehouseMatches.get(warehouse.getId());
            if (matched == null) {
                matched = resolveWarehouseFromSalesEvidence(warehouse, warehouseToSalesBranchIds);
            }
            if (matched == null) {
                matched = resolveWarehouseFromUserEvidence(warehouse, userBranchByUsername);
            }
            if (matched != null) {
                warehouse.setBranch(matched);
            }
        }

        warehouseRepository.saveAll(unresolvedWarehouses);
    }

    private Branch resolveWarehouseFromSalesEvidence(
            Warehouse warehouse,
            Map<Long, Set<Long>> warehouseToSalesBranchIds) {
        Set<Long> branchIds = warehouseToSalesBranchIds.getOrDefault(warehouse.getId(), Set.of());
        if (branchIds.size() != 1) {
            return null;
        }
        Long branchId = branchIds.iterator().next();
        return branchRepository.findById(branchId).orElse(null);
    }

    private Branch resolveWarehouseFromUserEvidence(
            Warehouse warehouse,
            Map<String, Branch> userBranchByUsername) {
        List<Branch> evidence = new ArrayList<>();

        if (warehouse.getCreatedBy() != null) {
            Branch branch = userBranchByUsername.get(normalize(warehouse.getCreatedBy()));
            if (branch != null) {
                evidence.add(branch);
            }
        }

        if (warehouse.getUpdatedBy() != null) {
            Branch branch = userBranchByUsername.get(normalize(warehouse.getUpdatedBy()));
            if (branch != null) {
                evidence.add(branch);
            }
        }

        Set<Long> uniqueBranchIds = evidence.stream()
                .map(Branch::getId)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        if (uniqueBranchIds.size() != 1) {
            return null;
        }

        return evidence.get(0);
    }

    private Map<String, Branch> buildBranchLookup(List<Branch> branches) {
        Map<String, Branch> lookup = new LinkedHashMap<>();
        for (Branch branch : branches) {
            if (branch.getName() != null && !branch.getName().isBlank()) {
                lookup.putIfAbsent(normalize(branch.getName()), branch);
            }
            if (branch.getCode() != null && !branch.getCode().isBlank()) {
                lookup.putIfAbsent(normalize(branch.getCode()), branch);
            }
        }
        return lookup;
    }

    private Branch resolveBranchByLabel(String label, Map<String, Branch> branchLookup) {
        if (label == null || label.isBlank()) {
            return null;
        }
        return branchLookup.get(normalize(label));
    }

    private String normalize(String value) {
        return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
    }
}
