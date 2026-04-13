package com.billbull.backend.financials.generalledger;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.CostCenter;

@RestController
@RequestMapping("/api/ledger")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
public class GeneralLedgerController {

    private final LedgerService ledgerService;

    @Autowired
    public GeneralLedgerController(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    // ---------------- ACCOUNTS ENDPOINTS ----------------

    @GetMapping("/accounts")
    public List<Account> getAccounts() {
        return ledgerService.getAllAccounts();
    }

    @GetMapping("/accounts/tree")
    public List<Map<String, Object>> getAccountTree() {
        return ledgerService.getAccountTree();
    }

    @PostMapping("/accounts")
    public Account createOrUpdateAccount(@RequestBody Account account) {
        return ledgerService.saveAccount(account);
    }

    @PostMapping("/accounts/{id}/archive")
    public Account archiveAccount(@PathVariable String id) {
        return ledgerService.archiveAccount(id);
    }

    @PostMapping("/accounts/{id}/unarchive")
    public Account unarchiveAccount(@PathVariable String id) {
        return ledgerService.unarchiveAccount(id);
    }

    // ---------------- COST CENTERS ENDPOINTS ----------------

    @GetMapping("/cost-centers")
    public List<CostCenter> getCostCenters() {
        return ledgerService.getAllCostCenters();
    }

    @PostMapping("/cost-centers")
    public CostCenter createOrUpdateCostCenter(@RequestBody CostCenter cc) {
        return ledgerService.saveCostCenter(cc);
    }

    @PostMapping("/cost-centers/{id}/archive")
    public CostCenter archiveCostCenter(@PathVariable String id) {
        return ledgerService.archiveCostCenter(id);
    }

    @PostMapping("/cost-centers/{id}/unarchive")
    public CostCenter unarchiveCostCenter(@PathVariable String id) {
        return ledgerService.unarchiveCostCenter(id);
    }

    // ---------------- TRANSACTIONS ENDPOINTS ----------------

    @GetMapping("/transactions")
    public List<LedgerEntry> getTransactions() {
        return ledgerService.getTransactionHistory();
    }

    @PostMapping("/transactions")
    public LedgerEntry recordTransaction(@RequestBody LedgerEntry entry) {
        return ledgerService.recordTransaction(entry);
    }

    // ---------------- OPENING BALANCES ----------------

    @GetMapping("/accounts/opening-balance-locks")
    public List<String> getOpeningBalanceLocks() {
        return ledgerService.getOpeningBalanceLockedAccountCodes();
    }

    @PostMapping("/accounts/opening-balance")
    public OpeningBalanceSaveResponse saveOpeningBalances(@RequestBody List<OpeningBalanceRequest> payload) {
        return ledgerService.saveOpeningBalances(payload);
    }
}
