package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.CostCenter;

@RestController
@RequestMapping("/api/ledger")
@CrossOrigin(origins = "*")
public class GeneralLedgerController {

    private final LedgerService ledgerService;
    private final ModulePermissionService modulePermissionService;
    private final PostingEngineService postingEngineService;
    private final BranchRepository branchRepository;

    @Autowired
    public GeneralLedgerController(LedgerService ledgerService,
            ModulePermissionService modulePermissionService,
            PostingEngineService postingEngineService,
            BranchRepository branchRepository) {
        this.ledgerService = ledgerService;
        this.modulePermissionService = modulePermissionService;
        this.postingEngineService = postingEngineService;
        this.branchRepository = branchRepository;
    }

    // ---------------- ACCOUNTS ENDPOINTS ----------------

    @GetMapping("/accounts")
    @PreAuthorize("isAuthenticated()")
    public List<Account> getAccounts() {
        modulePermissionService.requireCanView("finance.ledger");
        return ledgerService.getAllAccounts();
    }

    @GetMapping("/accounts/bank-accounts")
    @PreAuthorize("isAuthenticated()")
    public List<Account> getBankAccounts() {
        return ledgerService.getBankAccounts();
    }

    @GetMapping("/accounts/tree")
    @PreAuthorize("isAuthenticated()")
    public List<Map<String, Object>> getAccountTree() {
        modulePermissionService.requireCanView("finance.ledger");
        return ledgerService.getAccountTree();
    }

    @PostMapping("/accounts")
    @PreAuthorize("isAuthenticated()")
    public Account createOrUpdateAccount(@RequestBody Account account) {
        modulePermissionService.requireCanEdit("finance.ledger");
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
    @PreAuthorize("isAuthenticated()")
    public List<LedgerEntry> getTransactions() {
        modulePermissionService.requireCanView("finance.ledger");
        return ledgerService.getTransactionHistory();
    }

    @PostMapping("/transactions")
    @PreAuthorize("isAuthenticated()")
    public LedgerEntry recordTransaction(@RequestBody LedgerEntry entry) {
        modulePermissionService.requireCanCreate("finance.ledger");
        return ledgerService.recordTransaction(entry);
    }

    // ---------------- OPENING BALANCES ----------------

    @GetMapping("/accounts/opening-balance-locks")
    public List<String> getOpeningBalanceLocks() {
        return ledgerService.getOpeningBalanceLockedAccountCodes();
    }

    @PostMapping("/accounts/opening-balance")
    public OpeningBalanceSaveResponse saveOpeningBalances(
            @RequestBody List<OpeningBalanceRequest> payload,
            @RequestParam(required = false) String asOfDate) {
        // 1. Update Account.balanceAmount (existing behaviour — used for quick-balance display).
        OpeningBalanceSaveResponse result = ledgerService.saveOpeningBalances(payload);
        // 2. Also post a proper double-entry GL journal so the balances appear in
        //    Trial Balance, Balance Sheet, and all ledger reports (GAP-015 fix).
        LocalDate date = asOfDate != null ? LocalDate.parse(asOfDate) : LocalDate.now();
        postingEngineService.postOpeningBalances(payload, date);
        return result;
    }

    // ---------------- VAT SETTLEMENT (F-07) ----------------

    /** Request body for VAT return settlement. */
    public static class VatSettlementRequest {
        public BigDecimal outputVat;
        public BigDecimal inputVat;
        public String period;        // e.g. "2025-Q1"
        public String settlementDate; // ISO date string
        public Long branchId;
    }

    /**
     * POST /api/ledger/vat-settlement
     * Nets VAT Output (2102) and VAT Input (1130) into VAT Payable (2108).
     */
    @PostMapping("/vat-settlement")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<JournalEntry> postVatSettlement(@RequestBody VatSettlementRequest req) {
        modulePermissionService.requireCanEdit("finance.ledger");
        LocalDate date = req.settlementDate != null ? LocalDate.parse(req.settlementDate) : LocalDate.now();
        com.billbull.backend.settings.branch.Branch branch =
                req.branchId != null ? branchRepository.findById(req.branchId).orElse(null) : null;
        JournalEntry entry = postingEngineService.createJournalFromVatSettlement(
                req.outputVat, req.inputVat, req.period, date, branch);
        return entry != null ? ResponseEntity.ok(entry) : ResponseEntity.noContent().build();
    }

    /** Request body for VAT FTA payment. */
    public static class VatPaymentRequest {
        public BigDecimal amount;
        public String period;
        public String paymentDate;
        public Long branchId;
    }

    /**
     * POST /api/ledger/vat-payment
     * Pays the netted VAT Payable (2108) to FTA via Bank.
     */
    @PostMapping("/vat-payment")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<JournalEntry> postVatPayment(@RequestBody VatPaymentRequest req) {
        modulePermissionService.requireCanEdit("finance.ledger");
        LocalDate date = req.paymentDate != null ? LocalDate.parse(req.paymentDate) : LocalDate.now();
        com.billbull.backend.settings.branch.Branch branch =
                req.branchId != null ? branchRepository.findById(req.branchId).orElse(null) : null;
        JournalEntry entry = postingEngineService.createJournalFromVatPayment(
                req.amount, req.period, date, branch);
        return entry != null ? ResponseEntity.ok(entry) : ResponseEntity.noContent().build();
    }

    // ---------------- CONTRA VOUCHER (F-12) ----------------

    /** Request body for a contra voucher (cash ↔ bank transfer). */
    public static class ContraVoucherRequest {
        public String contraNumber;
        public BigDecimal amount;
        public boolean isDeposit;  // true = cash→bank, false = bank→cash
        public String date;
        public String narration;
        public Long branchId;
    }

    /**
     * POST /api/ledger/contra-voucher
     * Posts a cash↔bank transfer entry.
     */
    @PostMapping("/contra-voucher")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<JournalEntry> postContraVoucher(@RequestBody ContraVoucherRequest req) {
        modulePermissionService.requireCanEdit("finance.ledger");
        LocalDate date = req.date != null ? LocalDate.parse(req.date) : LocalDate.now();
        com.billbull.backend.settings.branch.Branch branch =
                req.branchId != null ? branchRepository.findById(req.branchId).orElse(null) : null;
        JournalEntry entry = postingEngineService.createJournalFromContraVoucher(
                req.contraNumber, req.amount, req.isDeposit, date, req.narration, branch);
        return entry != null ? ResponseEntity.ok(entry) : ResponseEntity.noContent().build();
    }

    // ---------------- EQUITY INJECTION (PDF §12) ----------------

    /** Request body for an equity injection / owner capital contribution. */
    public static class EquityInjectionRequest {
        public String ref;
        public BigDecimal amount;
        public String paymentMode; // "CASH" | "BANK"
        public String date;
        public String narration;
        public Long branchId;
    }

    /**
     * POST /api/ledger/equity-injection
     * Records owner equity injection: Dr Cash/Bank / Cr Share Capital (3001).
     */
    @PostMapping("/equity-injection")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<JournalEntry> postEquityInjection(@RequestBody EquityInjectionRequest req) {
        modulePermissionService.requireCanEdit("finance.ledger");
        LocalDate date = req.date != null ? LocalDate.parse(req.date) : LocalDate.now();
        com.billbull.backend.settings.branch.Branch branch =
                req.branchId != null ? branchRepository.findById(req.branchId).orElse(null) : null;
        JournalEntry entry = postingEngineService.createJournalFromEquityInjection(
                req.ref, date, req.narration, req.amount, req.paymentMode, branch);
        return entry != null ? ResponseEntity.ok(entry) : ResponseEntity.noContent().build();
    }
}
