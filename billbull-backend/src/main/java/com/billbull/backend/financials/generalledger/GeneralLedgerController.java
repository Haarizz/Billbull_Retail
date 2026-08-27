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

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(GeneralLedgerController.class);

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

    /**
     * GET /api/ledger/accounts/next-code?parentCode=6000&accountGroup=Expenses
     * Server-side allocation of the next free account code (see AccountCodeGenerator).
     */
    @GetMapping("/accounts/next-code")
    @PreAuthorize("isAuthenticated()")
    public Map<String, String> getNextAccountCode(
            @RequestParam(required = false) String parentCode,
            @RequestParam(required = false) String accountGroup) {
        modulePermissionService.requireCanView("finance.ledger");
        return Map.of("code", ledgerService.nextAccountCode(parentCode, accountGroup));
    }

    @PostMapping("/accounts")
    @PreAuthorize("isAuthenticated()")
    public Account createOrUpdateAccount(@RequestBody Account account) {
        modulePermissionService.requireCanEdit("finance.ledger");

        boolean isNew = account.getId() == null || account.getId().isBlank();
        BigDecimal opening = account.getBalanceAmount();
        String openingType = account.getBalanceType();

        Account saved = ledgerService.saveAccount(account);

        // An opening balance typed on the create form used to be written only to
        // Account.balanceAmount, which no GL-derived view reads — the COA tree, Trial
        // Balance and Balance Sheet all aggregate posted ledger entries, so the new
        // account showed 0.00. Post the matching opening-balance journal (same contra
        // account as the bulk opening-balance screen) so the figure actually appears.
        if (isNew && opening != null && opening.abs().compareTo(new BigDecimal("0.005")) >= 0
                && !Boolean.TRUE.equals(saved.getIsGroup())) {
            try {
                postingEngineService.postAccountOpeningBalance(
                        saved.getCode(), opening, openingType, LocalDate.now(),
                        ledgerService.currentScopedBranchOrNull());
            } catch (RuntimeException ex) {
                // The account itself is already committed. Failing the request here would
                // report "failed to save" for an account that exists, so surface the reason
                // in the log and let the caller keep the created account.
                log.warn("[Ledger] Account {} was created but its opening balance {} {} could not be posted: {}",
                        saved.getCode(), opening, openingType, ex.getMessage());
            }
        }

        return saved;
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
        // Idempotent variant: a repeated submit carrying the same clientRequestId returns the
        // entry recorded by the first one instead of posting a duplicate.
        return ledgerService.recordTransactionIdempotent(entry);
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
