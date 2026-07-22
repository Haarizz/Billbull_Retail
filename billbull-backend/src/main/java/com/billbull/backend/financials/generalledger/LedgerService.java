package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.UUID;

import com.billbull.backend.common.UuidV7;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountSelectionRules;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

@Service
public class LedgerService {

    @Autowired
    private AccountRepository accountRepo;
    @Autowired
    private CostCenterRepository costCenterRepo;
    @Autowired
    private LedgerEntryRepository entryRepo;
    @Autowired
    private BranchAccessService branchAccessService;
    @Autowired
    private BranchRepository branchRepository;

    private String normalizeBranchKey(String value) {
        return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private Set<String> resolveScopedBranchKeys() {
        BranchAccessService.ListScope scope = branchAccessService.currentExactScope();
        if (scope.allBranches()) {
            return Set.of();
        }

        Set<String> keys = new HashSet<>();
        branchRepository.findAllById(scope.branchIds()).stream()
                .sorted(Comparator.comparing(Branch::getId))
                .forEach(branch -> {
                    String nameKey = normalizeBranchKey(branch.getName());
                    String codeKey = normalizeBranchKey(branch.getCode());
                    if (nameKey != null && !nameKey.isBlank()) {
                        keys.add(nameKey);
                    }
                    if (codeKey != null && !codeKey.isBlank()) {
                        keys.add(codeKey);
                    }
                });
        return keys;
    }

    private boolean matchesScopedLegacyBranch(String branchLabel, Set<String> scopedBranchKeys) {
        String normalized = normalizeBranchKey(branchLabel);
        return normalized != null && scopedBranchKeys.contains(normalized);
    }

    private List<CostCenter> filterCostCentersByExactScope(List<CostCenter> costCenters) {
        BranchAccessService.ListScope scope = branchAccessService.currentExactScope();
        if (scope.allBranches()) {
            return costCenters;
        }
        Set<String> scopedBranchKeys = resolveScopedBranchKeys();
        return costCenters.stream()
                .filter(costCenter -> {
                    Branch branch = costCenter.getBranchEntity();
                    if (branch != null && branch.getId() != null) {
                        return scope.branchIds().contains(branch.getId());
                    }
                    return matchesScopedLegacyBranch(costCenter.getBranch(), scopedBranchKeys);
                })
                .toList();
    }

    // ================= ACCOUNTS =================
    // Chart of Accounts is a company-wide master (not branch-scoped): every
    // branch shares the same account tree. Branch filtering applies only to
    // transactional/reporting data (see getTransactionHistory below and
    // FinancialReportService), never to the COA masters themselves.

    public List<Account> getAllAccounts() {
        return accountRepo.findAll();
    }

    public List<Account> getBankAccounts() {
        return getAllAccounts().stream()
                .filter(AccountSelectionRules::isBankAccount)
                .sorted((left, right) -> safeCode(left).compareToIgnoreCase(safeCode(right)))
                .toList();
    }

    private String safeCode(Account account) {
        return account != null && account.getCode() != null ? account.getCode() : "";
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
        return filterCostCentersByExactScope(costCenterRepo.findAll());
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
            entry.setId(UuidV7.generate());

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
        return branchAccessService.filterExactBranchScopedByBranch(
                entryRepo.findAllByOrderByTransactionDateDesc(),
                LedgerEntry::getBranch);
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
    // The tree structure (which accounts exist, parent/child hierarchy) is the
    // company-wide COA master and is never branch-filtered — see getAllAccounts().
    // The balance shown per account IS branch-scoped: it is derived from posted
    // ledger entries for the currently active branch (same aggregation
    // FinancialReportService's Balance Sheet uses), not from Account.balanceAmount,
    // which is a single non-branch-scoped running total and would show identical
    // figures under every branch selection.

    public List<Map<String, Object>> getAccountTree() {
        List<Account> allAccounts = getAllAccounts();
        Map<String, BigDecimal[]> branchBalances = resolveBranchScopedBalances();

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
            tree.add(buildTreeNode(root, childrenMap, branchBalances));
        }
        return tree;
    }

    /**
     * Net Dr/Cr per account code (index 0 = debit total, 1 = credit total),
     * scoped to the currently active branch (or unfiltered under "All Branches").
     * Leaf accounts with no postings simply have no entry in the map and fall
     * back to zero, which is correct: a branch with no transactions on an
     * account must show zero, not the company-wide total.
     */
    private Map<String, BigDecimal[]> resolveBranchScopedBalances() {
        BranchAccessService.ListScope scope = branchAccessService.currentExactScope();
        Long branchId = scope.allBranches() || scope.branchIds().size() != 1
                ? null
                : scope.branchIds().iterator().next();

        List<LedgerEntryRepository.AccountAggregate> aggregates =
                entryRepo.aggregateByAccountCodeBefore(branchId, LocalDate.now().plusDays(1));

        Map<String, BigDecimal[]> balances = new java.util.HashMap<>();
        for (LedgerEntryRepository.AccountAggregate agg : aggregates) {
            balances.put(agg.getAccountCode(), new BigDecimal[] {
                    agg.getSumDebit() != null ? agg.getSumDebit() : BigDecimal.ZERO,
                    agg.getSumCredit() != null ? agg.getSumCredit() : BigDecimal.ZERO
            });
        }
        return balances;
    }

    private Map<String, Object> buildTreeNode(Account account, Map<String, List<Account>> childrenMap,
            Map<String, BigDecimal[]> branchBalances) {
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

        BigDecimal[] drCr = branchBalances.get(account.getCode());
        BigDecimal debit = drCr != null ? drCr[0] : BigDecimal.ZERO;
        BigDecimal credit = drCr != null ? drCr[1] : BigDecimal.ZERO;
        if (debit.compareTo(credit) >= 0) {
            node.put("balanceAmount", debit.subtract(credit));
            node.put("balanceType", "Dr");
        } else {
            node.put("balanceAmount", credit.subtract(debit));
            node.put("balanceType", "Cr");
        }
        node.put("status", account.getStatus());

        List<Account> children = childrenMap.getOrDefault(account.getCode(), Collections.emptyList());
        List<Map<String, Object>> childNodes = new ArrayList<>();
        for (Account child : children) {
            childNodes.add(buildTreeNode(child, childrenMap, branchBalances));
        }
        node.put("children", childNodes);

        return node;
    }
}
