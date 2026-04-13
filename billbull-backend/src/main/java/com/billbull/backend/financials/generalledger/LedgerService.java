package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;

@Service
public class LedgerService {

    @Autowired
    private AccountRepository accountRepo;
    @Autowired
    private CostCenterRepository costCenterRepo;
    @Autowired
    private LedgerEntryRepository entryRepo;

    // ================= ACCOUNTS =================

    public List<Account> getAllAccounts() {
        return accountRepo.findAll();
    }

    public Account saveAccount(Account account) {
        if (account.getId() == null || account.getId().isEmpty()) {
            account.setId(UUID.randomUUID().toString());
        }
        return accountRepo.save(account);
    }

    public Account archiveAccount(String id) {
        Account acc = accountRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Account not found: " + id));
        acc.setStatus("archived");
        return accountRepo.save(acc);
    }

    public Account unarchiveAccount(String id) {
        Account acc = accountRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Account not found: " + id));
        acc.setStatus("active");
        return accountRepo.save(acc);
    }

    // ================= COST CENTERS =================

    public List<CostCenter> getAllCostCenters() {
        return costCenterRepo.findAll();
    }

    public CostCenter saveCostCenter(CostCenter cc) {
        if (cc.getId() == null || cc.getId().isEmpty()) {
            cc.setId(UUID.randomUUID().toString());
            if (cc.getSpent() == null)
                cc.setSpent(BigDecimal.ZERO);
        }
        return costCenterRepo.save(cc);
    }

    public CostCenter archiveCostCenter(String id) {
        CostCenter cc = costCenterRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Cost Center not found: " + id));
        cc.setStatus("archived");
        return costCenterRepo.save(cc);
    }

    public CostCenter unarchiveCostCenter(String id) {
        CostCenter cc = costCenterRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Cost Center not found: " + id));
        cc.setStatus("active");
        return costCenterRepo.save(cc);
    }

    // ================= TRANSACTIONS (ERP LOGIC) =================

    @Transactional
    public LedgerEntry recordTransaction(LedgerEntry entry) {
        // 1. Validate Account
        Account acc = accountRepo.findByCode(entry.getAccountCode());
        if (acc == null)
            throw new RuntimeException("Account code not found: " + entry.getAccountCode());
        if ("archived".equalsIgnoreCase(acc.getStatus())) {
            throw new RuntimeException("Cannot record transaction on archived account.");
        }

        // 2. Prepare Entry Data
        if (entry.getId() == null)
            entry.setId(UUID.randomUUID().toString());

        // Determine Transaction Amount and Side
        BigDecimal txnAmount;
        boolean isDebitTxn;

        if (entry.getDebitAmount() != null && entry.getDebitAmount().compareTo(BigDecimal.ZERO) > 0) {
            txnAmount = entry.getDebitAmount();
            isDebitTxn = true;
        } else {
            txnAmount = entry.getCreditAmount();
            isDebitTxn = false;
        }

        // 3. Update Account Balance
        BigDecimal currentBal = acc.getBalanceAmount() != null ? acc.getBalanceAmount() : BigDecimal.ZERO;
        String currentType = acc.getBalanceType() != null ? acc.getBalanceType() : "Dr";

        BigDecimal netDr = (currentType.equals("Dr") ? currentBal : BigDecimal.ZERO)
                .add(isDebitTxn ? txnAmount : BigDecimal.ZERO);

        BigDecimal netCr = (currentType.equals("Cr") ? currentBal : BigDecimal.ZERO)
                .add(!isDebitTxn ? txnAmount : BigDecimal.ZERO);

        if (netDr.compareTo(netCr) >= 0) {
            acc.setBalanceAmount(netDr.subtract(netCr));
            acc.setBalanceType("Dr");
        } else {
            acc.setBalanceAmount(netCr.subtract(netDr));
            acc.setBalanceType("Cr");
        }

        accountRepo.save(acc); // Save updated balance

        // 4. Update Cost Center Spending
        if (isDebitTxn && acc.getCostCenterCode() != null && !acc.getCostCenterCode().equals("-")) {
            CostCenter cc = costCenterRepo.findByCode(acc.getCostCenterCode());
            if (cc != null) {
                BigDecimal currentSpent = cc.getSpent() != null ? cc.getSpent() : BigDecimal.ZERO;
                cc.setSpent(currentSpent.add(txnAmount));
                costCenterRepo.save(cc);
            }
        }

        // 5. Finalize and Save Entry
        entry.setRunningBalance(acc.getBalanceAmount());
        entry.setBalanceType(acc.getBalanceType());
        entry.setAccountName(acc.getName());

        return entryRepo.save(entry);
    }

    public List<LedgerEntry> getTransactionHistory() {
        return entryRepo.findAllByOrderByTransactionDateDesc();
    }

    // ================= OPENING BALANCES =================

    public List<String> getOpeningBalanceLockedAccountCodes() {
        return entryRepo.findDistinctAccountCodes();
    }

    @Transactional
    public OpeningBalanceSaveResponse saveOpeningBalances(List<OpeningBalanceRequest> requests) {
        List<OpeningBalanceRequest> safeRequests = requests != null ? requests : Collections.emptyList();

        Set<String> lockedCodes = new HashSet<>(entryRepo.findDistinctAccountCodes());
        Set<String> encounteredLocked = new LinkedHashSet<>();
        int updated = 0;

        for (OpeningBalanceRequest req : safeRequests) {
            if (req == null || req.getAccountCode() == null || req.getAccountCode().trim().isEmpty()) {
                continue;
            }

            String code = req.getAccountCode().trim();
            if (lockedCodes.contains(code)) {
                encounteredLocked.add(code);
                continue;
            }

            if (req.getAmount() == null || req.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Account acc = accountRepo.findByCode(code);
            if (acc == null) {
                continue;
            }
            if (Boolean.TRUE.equals(acc.getIsGroup())) {
                continue;
            }

            String bt = req.getBalanceType();
            bt = bt != null ? bt.trim() : "";
            bt = bt.equalsIgnoreCase("Cr") ? "Cr" : "Dr";

            acc.setBalanceAmount(req.getAmount().abs());
            acc.setBalanceType(bt);
            accountRepo.save(acc);
            updated++;
        }

        return new OpeningBalanceSaveResponse(updated, new ArrayList<>(encounteredLocked));
    }

    // ================= COA TREE =================

    public List<Map<String, Object>> getAccountTree() {
        List<Account> allAccounts = accountRepo.findAll();

        Map<String, List<Account>> childrenMap = new LinkedHashMap<>();
        List<Account> roots = new ArrayList<>();

        for (Account acc : allAccounts) {
            if (acc.getParentCode() == null || acc.getParentCode().isEmpty()) {
                roots.add(acc);
            } else {
                childrenMap.computeIfAbsent(acc.getParentCode(), k -> new ArrayList<>()).add(acc);
            }
        }

        List<Map<String, Object>> tree = new ArrayList<>();
        for (Account root : roots) {
            tree.add(buildTreeNode(root, childrenMap));
        }
        return tree;
    }

    private Map<String, Object> buildTreeNode(Account account, Map<String, List<Account>> childrenMap) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", account.getId());
        node.put("code", account.getCode());
        node.put("name", account.getName());
        node.put("accountGroup", account.getAccountGroup());
        node.put("accountType", account.getAccountType());
        node.put("subGroup", account.getSubGroup());
        node.put("parentCode", account.getParentCode());
        node.put("level", account.getLevel());
        node.put("isGroup", account.getIsGroup());
        node.put("normalBalance", account.getNormalBalance());
        node.put("balanceAmount", account.getBalanceAmount());
        node.put("balanceType", account.getBalanceType());
        node.put("status", account.getStatus());

        List<Account> children = childrenMap.getOrDefault(account.getCode(), Collections.emptyList());
        List<Map<String, Object>> childNodes = new ArrayList<>();
        for (Account child : children) {
            childNodes.add(buildTreeNode(child, childrenMap));
        }
        node.put("children", childNodes);

        return node;
    }
}
