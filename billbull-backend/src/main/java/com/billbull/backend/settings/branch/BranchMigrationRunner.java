package com.billbull.backend.settings.branch;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
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

    public BranchMigrationRunner(
            BranchRepository branchRepository,
            UserRepository userRepository,
            WarehouseRepository warehouseRepository,
            SalesInvoiceRepository salesInvoiceRepository) {
        this.branchRepository = branchRepository;
        this.userRepository = userRepository;
        this.warehouseRepository = warehouseRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Branch> branches = branchRepository.findAll();
        if (branches.isEmpty()) {
            return;
        }

        Map<String, Branch> branchLookup = buildBranchLookup(branches);
        migrateUsers(branchLookup);
        migrateWarehouses(branchLookup);
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
