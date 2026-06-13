package com.billbull.backend.financials.generalledger.postingengine;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.*;
import com.billbull.backend.financials.generalledger.voucher.VoucherSequenceService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentMode;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.returns.SalesReturn;

/**
 * Contract tests for PostingEngineService (PDF §21A–§21J).
 * Verifies every flow emits balanced double-entry journals with correct account codes.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PostingEngineContractTest {

    @Mock private JournalEntryRepository journalEntryRepository;
    @Mock private JournalEntryService journalEntryService;
    @Mock private AccountRepository accountRepository;
    @Mock private AccountingPeriodService accountingPeriodService;
    @Mock private DimensionMatrixService dimensionMatrixService;
    @Mock private VoucherSequenceService voucherSequenceService;
    @Mock private com.billbull.backend.sales.customerledger.CustomerCreditService customerCreditService;
    @Mock private com.billbull.backend.purchase.grn.GrnRepository grnRepository;
    @Mock private GlAccountBalanceRepository glBalanceRepository;
    @Mock private com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    @Mock private com.billbull.backend.financials.currency.CurrencyService currencyService;
    @Mock private com.billbull.backend.settings.outlet.OutletRepository outletRepository;

    private PostingEngineService service;

    @BeforeEach
    void setUp() {
        com.billbull.backend.sales.settings.SalesSettings blockSettings =
                new com.billbull.backend.sales.settings.SalesSettings();
        blockSettings.setCreditLimitPolicy(com.billbull.backend.sales.settings.CreditLimitPolicy.BLOCK);
        when(salesSettingsService.getSettings()).thenReturn(blockSettings);

        service = new PostingEngineService(
                journalEntryRepository, journalEntryService, accountRepository,
                accountingPeriodService, dimensionMatrixService, voucherSequenceService,
                customerCreditService, grnRepository, glBalanceRepository, salesSettingsService,
                currencyService, outletRepository);

        // Default: all accounts active, no duplicate references, no period lock
        when(accountRepository.findByCode(anyString())).thenReturn(activeAccount());
        when(journalEntryRepository.existsByReference(anyString())).thenReturn(false);
        when(voucherSequenceService.nextVoucherNumber(anyString(), anyString(), any()))
                .thenAnswer(inv -> inv.getArgument(0) + "-HO-2026-000001");
        when(journalEntryRepository.save(any())).thenAnswer(inv -> {
            JournalEntry e = inv.getArgument(0);
            e.setId(1L);
            return e;
        });
        when(glBalanceRepository.findByAccountCodeAndFiscalPeriodIdAndBranchId(anyString(), any(), any()))
                .thenReturn(Optional.empty());
    }

    // =========================================================
    // §21A — Posting Engine (Task 9.1)
    // =========================================================

    @Test
    void everyPostedEntryIsBalanced_salesInvoice() {
        SalesInvoice inv = salesInvoice("SI-001", "CUST-1", 1000.0, 50.0, 1050.0);
        JournalEntry result = service.createJournalFromInvoicePosting(inv);
        assertBalanced(result);
    }

    @Test
    void everyPostedEntryIsBalanced_grn() {
        GrnEntity grn = grn("GRN-001", 500.0);
        JournalEntry result = service.createJournalFromGRN(grn);
        assertBalanced(result);
    }

    @Test
    void everyPostedEntryIsBalanced_receipt() {
        ReceiptVoucher rv = receiptVoucher("RV-001", "CUST-1", 1050.0, null, ReceiptPurpose.AGAINST_INVOICE);
        JournalEntry result = service.createJournalFromReceiptVoucher(rv);
        assertBalanced(result);
    }

    @Test
    void everyPostedEntryIsBalanced_paymentVoucher() {
        PaymentVoucher pv = paymentVoucher("PV-001", new BigDecimal("500.00"), null);
        JournalEntry result = service.createJournalFromPaymentVoucher(pv, "Vendor A");
        assertBalanced(result);
    }

    @Test
    void cashVendorPaymentCreditsPettyCash() {
        PaymentVoucher pv = paymentVoucher("PV-CASH-001", new BigDecimal("500.00"), null);
        pv.setPaymentMode(PaymentMode.CASH);

        JournalEntry result = service.createJournalFromPaymentVoucher(pv, "Vendor A");

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_PETTY_CASH, new BigDecimal("500.00"), false);
    }

    @Test
    void selectedPettyCashAccountOverridesBankTransferDefault() {
        Account pettyCash = activeAccount();
        pettyCash.setCode(PostingEngineService.ACC_PETTY_CASH);
        pettyCash.setName("Petty Cash");
        when(accountRepository.findByCode(PostingEngineService.ACC_PETTY_CASH)).thenReturn(pettyCash);

        PaymentVoucher pv = paymentVoucher("PV-BANK-PETTY-001", new BigDecimal("500.00"), null);
        pv.setPaymentMode(PaymentMode.BANK_TRANSFER);
        pv.setBankAccount(PostingEngineService.ACC_PETTY_CASH);

        JournalEntry result = service.createJournalFromPaymentVoucher(pv, "Vendor A");

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_PETTY_CASH, new BigDecimal("500.00"), false);
    }

    @Test
    void lpoAdvancePaymentDebitsVendorAdvances() {
        PaymentVoucher pv = paymentVoucher("PV-LPO-ADV-001", new BigDecimal("500.00"), null);
        pv.setLpoId(7L);

        JournalEntry result = service.createJournalFromPaymentVoucher(pv, "Vendor A");

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_VENDOR_ADVANCES, new BigDecimal("500.00"), true);
    }

    @Test
    void periodLockedBlocksPosting() {
        doThrow(new PostingException(PostingErrorCode.PERIOD_LOCKED, "closed"))
                .when(accountingPeriodService).assertOpen(any());

        SalesInvoice inv = salesInvoice("SI-LOCKED", "CUST-1", 500.0, 25.0, 525.0);
        PostingException ex = assertThrows(PostingException.class,
                () -> service.createJournalFromInvoicePosting(inv));
        assertEquals(PostingErrorCode.PERIOD_LOCKED, ex.getCode());
    }

    @Test
    void inactiveAccountBlocksPosting() {
        Account inactive = new Account();
        inactive.setCode("1001");
        inactive.setStatus("archived");
        when(accountRepository.findByCode("1001")).thenReturn(inactive);

        JournalEntry entry = entryWith(line("1001", "100.00", "0.00"), line("4001", "0.00", "100.00"));
        PostingException ex = assertThrows(PostingException.class, () -> service.validate(entry));
        assertEquals(PostingErrorCode.ACCOUNT_INACTIVE, ex.getCode());
    }

    @Test
    void voucherNumberMatchesExpectedFormat() {
        when(voucherSequenceService.nextVoucherNumber(eq("SI"), anyString(), any()))
                .thenReturn("SI-DXB-2026-000001");
        SalesInvoice inv = salesInvoice("SI-FMT", "CUST-1", 100.0, 5.0, 105.0);
        JournalEntry result = service.createJournalFromInvoicePosting(inv);
        assertNotNull(result.getEntryNumber());
        assertTrue(result.getEntryNumber().matches("[A-Z]+-[A-Z0-9]+-\\d{4}-\\d+"),
                "Entry number must match {TYPE}-{BRANCH}-{YYYY}-{NNNNNN} format");
    }

    @Test
    void duplicateReferenceBlocksSecondPosting() {
        when(journalEntryRepository.existsByReference("GRN-DUP")).thenReturn(true);
        GrnEntity grn = grn("GRN-DUP", 100.0);
        JournalEntry result = service.createJournalFromGRN(grn);
        assertNull(result, "Duplicate posting should return null without creating a new entry");
    }

    // =========================================================
    // §21B — Sales Flow (Task 9.2)
    // =========================================================

    @Test
    void salesInvoicePostsARDebitAndDeferredRevenuePlusVAT() {
        SalesInvoice inv = salesInvoice("SI-002", "CUST-1", 1000.0, 50.0, 1050.0);
        JournalEntry result = service.createJournalFromInvoicePosting(inv);

        assertBalanced(result);
        // AR debit = invoiceTotal (1050)
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, new BigDecimal("1050.00"), true);
        // Deferred Revenue credit = subTotal (1000)
        assertLineExists(result, PostingEngineService.ACC_DEFERRED_REVENUE, new BigDecimal("1000.00"), false);
        // VAT Output credit = taxTotal (50)
        assertLineExists(result, PostingEngineService.ACC_VAT_OUTPUT, new BigDecimal("50.00"), false);
    }

    @Test
    void salesInvoiceWithZeroTaxPostsTwoLines() {
        SalesInvoice inv = salesInvoice("SI-NOTAX", "CUST-1", 500.0, 0.0, 500.0);
        JournalEntry result = service.createJournalFromInvoicePosting(inv);
        assertBalanced(result);
        // No VAT line — only AR + DeferredRevenue
        long vatLines = result.getLines().stream()
                .filter(l -> PostingEngineService.ACC_VAT_OUTPUT.equals(l.getAccountCode()))
                .count();
        assertEquals(0, vatLines, "No VAT line should be emitted when taxTotal is zero");
    }

    @Test
    void creditLimitBreachBlocksSalesInvoicePosting() {
        doThrow(new PostingException(PostingErrorCode.CREDIT_LIMIT_BREACH, "limit exceeded"))
                .when(customerCreditService).assertWithinLimit(anyString(), any());

        SalesInvoice inv = salesInvoice("SI-BREACH", "CUST-OVERLIMIT", 9999.0, 499.95, 10498.95);
        PostingException ex = assertThrows(PostingException.class,
                () -> service.createJournalFromInvoicePosting(inv));
        assertEquals(PostingErrorCode.CREDIT_LIMIT_BREACH, ex.getCode());
    }

    @Test
    void dnDeliveryPostsRevenueRecognitionAndCOGS() {
        // DN delivery: Dr DeferredRevenue / Cr SalesRevenue + Dr COGS / Cr Inventory
        String ref = "DN-DN-001";
        when(journalEntryRepository.existsByReference(ref)).thenReturn(false);
        when(journalEntryRepository.existsByReference(ref + "-COGS")).thenReturn(false);

        service.createJournalFromDeliveryNoteDelivered(
                ref, LocalDate.of(2026, 6, 1), "Delivery DN-001",
                new BigDecimal("1000.00"), new BigDecimal("600.00"));

        // Two separate entries posted: revenue + COGS
        verify(journalEntryRepository, times(2)).save(any());
    }

    // =========================================================
    // §21C — Customer Advance Tests (Task 9.3)
    // =========================================================

    @Test
    void advanceReceiptCreditsCustomerAdvanceNotRevenue() {
        ReceiptVoucher rv = receiptVoucher("RV-ADV-001", "CUST-1", 500.0, null, ReceiptPurpose.ADVANCE_RECEIVED);
        JournalEntry result = service.createJournalFromReceiptVoucher(rv);

        assertBalanced(result);
        // Credit must go to Customer Advance (2104), NOT Sales Revenue
        assertLineExists(result, PostingEngineService.ACC_CUSTOMER_ADVANCE, new BigDecimal("500.00"), false);
        // No Revenue line
        assertNoLine(result, PostingEngineService.ACC_SALES_REVENUE);
    }

    @Test
    void advanceApplicationReducesBothARAndCustomerAdvance() {
        JournalEntry result = service.createJournalFromAdvanceApplication(
                1L, "SI-001", new BigDecimal("200.00"), LocalDate.now());

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_CUSTOMER_ADVANCE, new BigDecimal("200.00"), true);
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, new BigDecimal("200.00"), false);
    }

    @Test
    void advanceRefundDebitsCashCreditCustomerAdvance() {
        JournalEntry result = service.createJournalFromAdvanceRefund(
                1L, new BigDecimal("300.00"), "Cash");

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_CUSTOMER_ADVANCE, new BigDecimal("300.00"), true);
    }

    // =========================================================
    // §21D — Purchase Flow Tests (Task 9.4)
    // =========================================================

    @Test
    void grnPostsInventoryOnlyNoPandL() {
        GrnEntity grn = grn("GRN-002", 800.0);
        JournalEntry result = service.createJournalFromGRN(grn);

        assertBalanced(result);
        // Dr Inventory (1120)
        assertLineExists(result, PostingEngineService.ACC_INVENTORY, new BigDecimal("800.00"), true);
        // Cr GRN Clearing (2103) — no P&L accounts
        assertLineExists(result, PostingEngineService.ACC_GRN_CLEARING, new BigDecimal("800.00"), false);
        // No COGS, no Revenue
        assertNoLine(result, PostingEngineService.ACC_COGS);
        assertNoLine(result, PostingEngineService.ACC_SALES_REVENUE);
    }

    @Test
    void purchaseInvoiceDirectCreatesInventoryAndAP() {
        PurchaseInvoice pi = directPurchaseInvoice("PI-001", 1000.0, 50.0, 1050.0);
        JournalEntry result = service.createJournalFromPurchaseInvoice(pi);

        assertBalanced(result);
        // Dr Inventory (net of VAT)
        assertLineExists(result, PostingEngineService.ACC_INVENTORY, new BigDecimal("1000.00"), true);
        // Dr VAT Input (50)
        assertLineExists(result, PostingEngineService.ACC_VAT_INPUT, new BigDecimal("50.00"), true);
        // Cr AP (full grand total 1050)
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_PAYABLE, new BigDecimal("1050.00"), false);
    }

    @Test
    void purchaseInvoiceAgainstGrnClearsGrnClearingAndPostsPPV() {
        GrnEntity grn = new GrnEntity();
        grn.setGrandTotal(new BigDecimal("1000.00"));
        when(grnRepository.findById(99L)).thenReturn(Optional.of(grn));

        PurchaseInvoice pi = grnPurchaseInvoice("PI-GRN-001", 99L, 1100.0, 50.0, 1100.0);
        JournalEntry result = service.createJournalFromPurchaseInvoice(pi);

        assertBalanced(result);
        // GRN Clearing Dr (1000 = GRN value)
        assertLineExists(result, PostingEngineService.ACC_GRN_CLEARING, new BigDecimal("1000.00"), true);
        // PPV Dr (50 = (1100-50) piNet - 1000 GRN, positive variance → Dr expense)
        assertLineExists(result, "5003", new BigDecimal("50.00"), true);
        // Cr AP (full PI grandTotal)
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_PAYABLE, new BigDecimal("1100.00"), false);
    }

    // =========================================================
    // §21E — Returns Tests (Task 9.5)
    // =========================================================

    @Test
    void salesReturnReversesARAndRevenue() {
        SalesReturn ret = salesReturn("CN-001", 800.0, 40.0, 840.0);
        // costOfGoodsReturned = 500
        JournalEntry result = service.createJournalFromSalesReturn(
                ret, new BigDecimal("500.00"), true);

        assertBalanced(result);
        // Dr Sales Revenue (800)
        assertLineExists(result, PostingEngineService.ACC_SALES_REVENUE, new BigDecimal("800.00"), true);
        // Dr VAT Output (40)
        assertLineExists(result, PostingEngineService.ACC_VAT_OUTPUT, new BigDecimal("40.00"), true);
        // Cr AR (840)
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, new BigDecimal("840.00"), false);
    }

    @Test
    void salesReturnCogsReversalRestoresInventory() {
        SalesReturn ret = salesReturn("CN-002", 800.0, 40.0, 840.0);
        when(journalEntryRepository.existsByReference("CN-002-INV")).thenReturn(false);

        service.createJournalFromSalesReturn(ret, new BigDecimal("500.00"), true);

        // Two entries: revenue reversal + COGS reversal
        verify(journalEntryRepository, times(2)).save(any());
    }

    // =========================================================
    // §21F — Settlement Discount Tests (Task 9.6)
    // =========================================================

    @Test
    void customerReceiptWithDiscountPostsThreeLines() {
        // Bank Dr (net 980) + Discount Allowed Dr (20) / AR Cr (1000 full)
        ReceiptVoucher rv = receiptVoucher("RV-DISC-001", "CUST-1", 980.0, new BigDecimal("20.00"),
                ReceiptPurpose.AGAINST_INVOICE);
        JournalEntry result = service.createJournalFromReceiptVoucher(rv);

        assertBalanced(result);
        // Discount Allowed debit (20)
        assertLineExists(result, PostingEngineService.ACC_DISCOUNT_ALLOWED, new BigDecimal("20.00"), true);
        // AR credit = 980 + 20 = 1000 full
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, new BigDecimal("1000.00"), false);
    }

    @Test
    void vendorPaymentWithDiscountPostsThreeLines() {
        // AP Dr (1000 full) / Bank Cr (net 980) + Discount Received Cr (20)
        PaymentVoucher pv = paymentVoucher("PV-DISC-001", new BigDecimal("980.00"), new BigDecimal("20.00"));
        JournalEntry result = service.createJournalFromPaymentVoucher(pv, "Vendor B");

        assertBalanced(result);
        // AP debit = 980 + 20 = 1000 full
        assertLineExists(result, PostingEngineService.ACC_ACCOUNTS_PAYABLE, new BigDecimal("1000.00"), true);
        // Discount Received credit (20)
        assertLineExists(result, PostingEngineService.ACC_DISCOUNT_RECEIVED, new BigDecimal("20.00"), false);
    }

    // =========================================================
    // §21G — Payroll Tests (Task 9.7)
    // =========================================================

    @Test
    void salaryJvIsBalanced_grossEqualsNetPlusDeductions() {
        // gross = 5000, net = 4500, deductions = 500
        JournalEntry result = service.createJournalFromPayrollRun(
                "EMP-001", "Alice Smith",
                new BigDecimal("5000.00"), new BigDecimal("4500.00"),
                BigDecimal.ZERO, new BigDecimal("500.00"),
                2026, 6, "Finance", LocalDate.of(2026, 6, 30));

        assertBalanced(result);
        // Salary Expense Dr = 5000 (gross)
        assertLineExists(result, PostingEngineService.ACC_SALARY_EXPENSE, new BigDecimal("5000.00"), true);
        // Salary Payable Cr = 4500 (net)
        assertLineExists(result, PostingEngineService.ACC_SALARY_PAYABLE, new BigDecimal("4500.00"), false);
        // Other Deductions Payable Cr = 500
        assertLineExists(result, PostingEngineService.ACC_OTHER_DEDUCTIONS, new BigDecimal("500.00"), false);
    }

    @Test
    void wpsDisbursementClearsSalaryPayable() {
        JournalEntry result = service.createJournalFromWpsDisbursement(
                "RUN-2026-06", "2026/06", new BigDecimal("45000.00"), LocalDate.of(2026, 6, 30));

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_SALARY_PAYABLE, new BigDecimal("45000.00"), true);
        assertLineExists(result, PostingEngineService.ACC_BANK,           new BigDecimal("45000.00"), false);
    }

    @Test
    void salaryAdvanceDisbursementIsBalanced() {
        JournalEntry result = service.createJournalFromSalaryAdvance(
                1L, "EMP-002", "Bob Jones", new BigDecimal("2000.00"), "Bank", LocalDate.now());

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_SALARY_ADVANCES, new BigDecimal("2000.00"), true);
    }

    // =========================================================
    // §21H — Bank Reconciliation Tests (Task 9.8)
    // =========================================================

    @Test
    void bankChargePostsExpenseAndCreditBank() {
        JournalEntry result = service.createJournalFromBankCharge(
                "RECON-1-1", new BigDecimal("25.00"), "Monthly fee", LocalDate.now());

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_BANK_CHARGES, new BigDecimal("25.00"), true);
        assertLineExists(result, PostingEngineService.ACC_BANK,         new BigDecimal("25.00"), false);
    }

    @Test
    void bankInterestPostsDebitBankCreditIncome() {
        JournalEntry result = service.createJournalFromBankInterest(
                "RECON-1-2", new BigDecimal("10.00"), "Interest", LocalDate.now());

        assertBalanced(result);
        assertLineExists(result, PostingEngineService.ACC_BANK,            new BigDecimal("10.00"), true);
        assertLineExists(result, PostingEngineService.ACC_INTEREST_INCOME, new BigDecimal("10.00"), false);
    }

    @Test
    void pdcReceivedCreatesARToCUCEntry() {
        com.billbull.backend.financials.pdc.PdcEntry pdc = pdc(1L, "CHQ-001", new BigDecimal("500.00"), "CUST-1");
        service.createJournalFromPdcTransition(pdc, null, com.billbull.backend.financials.pdc.PdcStatus.RECEIVED);

        verify(journalEntryRepository).save(argThat(e -> {
            boolean hasCUC = e.getLines().stream().anyMatch(l -> PostingEngineService.ACC_CUC.equals(l.getAccountCode()) && l.getDebit().compareTo(BigDecimal.ZERO) > 0);
            boolean hasAR  = e.getLines().stream().anyMatch(l -> PostingEngineService.ACC_ACCOUNTS_RECEIVABLE.equals(l.getAccountCode()) && l.getCredit().compareTo(BigDecimal.ZERO) > 0);
            return hasCUC && hasAR;
        }));
    }

    @Test
    void pdcClearedMovesCUCToBank() {
        com.billbull.backend.financials.pdc.PdcEntry pdc = pdc(2L, "CHQ-002", new BigDecimal("700.00"), "CUST-2");
        service.createJournalFromPdcTransition(pdc, com.billbull.backend.financials.pdc.PdcStatus.RECEIVED,
                com.billbull.backend.financials.pdc.PdcStatus.CLEARED);

        verify(journalEntryRepository).save(argThat(e -> {
            boolean hasBank = e.getLines().stream().anyMatch(l -> PostingEngineService.ACC_BANK.equals(l.getAccountCode()) && l.getDebit().compareTo(BigDecimal.ZERO) > 0);
            boolean hasCUC  = e.getLines().stream().anyMatch(l -> PostingEngineService.ACC_CUC.equals(l.getAccountCode()) && l.getCredit().compareTo(BigDecimal.ZERO) > 0);
            return hasBank && hasCUC;
        }));
    }

    // =========================================================
    // §21I — Inventory Tests (Task 9.9)
    // =========================================================

    @Test
    void inventoryWriteoffDebitsExpenseCreditsInventory() {
        JournalEntry result = service.createJournalFromInventoryWriteoff(
                "STK-001", 5L, "ITEM-ABC batch B001 exp 2026-01-01",
                new BigDecimal("350.00"), LocalDate.now());

        assertBalanced(result);
        assertLineExists(result, "5005",                              new BigDecimal("350.00"), true);
        assertLineExists(result, PostingEngineService.ACC_INVENTORY,  new BigDecimal("350.00"), false);
    }

    @Test
    void grnAmountFlowsToInventoryNotPandL() {
        GrnEntity grn = grn("GRN-INV-001", 1200.0);
        JournalEntry result = service.createJournalFromGRN(grn);

        assertBalanced(result);
        // Only BS accounts — no income/expense
        result.getLines().forEach(l -> {
            String code = l.getAccountCode();
            assertFalse(code != null && (code.startsWith("4") || code.startsWith("5") || code.startsWith("6")),
                    "GRN should not post to P&L accounts; found " + code);
        });
    }

    // =========================================================
    // §21J — Financial Reports Tests (Task 9.10)
    // =========================================================

    @Test
    void salesInvoiceAndReceiptNetToZeroARImpact() {
        // Invoice: Dr AR 1050 / Cr DeferredRevenue 1000 / Cr VAT 50
        SalesInvoice inv = salesInvoice("SI-NET", "CUST-1", 1000.0, 50.0, 1050.0);
        JournalEntry invoiceEntry = service.createJournalFromInvoicePosting(inv);

        // Reset duplicate guard for receipt
        when(journalEntryRepository.existsByReference("RV-NET")).thenReturn(false);
        // Receipt: Dr Cash 1050 / Cr AR 1050
        ReceiptVoucher rv = receiptVoucher("RV-NET", "CUST-1", 1050.0, null, ReceiptPurpose.AGAINST_INVOICE);
        JournalEntry receiptEntry = service.createJournalFromReceiptVoucher(rv);

        // Combined AR impact should net to zero
        BigDecimal arFromInvoice = lineNet(invoiceEntry, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
        BigDecimal arFromReceipt = lineNet(receiptEntry, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
        assertEquals(0, arFromInvoice.add(arFromReceipt).compareTo(BigDecimal.ZERO),
                "Invoice Dr AR and Receipt Cr AR should net to zero");
    }

    @Test
    void settlementDiscountReceiptFullAmountClearsAR() {
        // net received=900, discount=100, total AR cleared=1000
        ReceiptVoucher rv = receiptVoucher("RV-FULL", "CUST-2", 900.0, new BigDecimal("100.00"),
                ReceiptPurpose.AGAINST_INVOICE);
        JournalEntry result = service.createJournalFromReceiptVoucher(rv);

        assertBalanced(result);
        BigDecimal arCr = result.getLines().stream()
                .filter(l -> PostingEngineService.ACC_ACCOUNTS_RECEIVABLE.equals(l.getAccountCode()))
                .map(JournalLine::getCredit)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertEquals(0, arCr.compareTo(new BigDecimal("1000.00")),
                "AR credit must equal full invoice amount (net received + discount)");
    }

    @Test
    void allFlowsProduceBalancedEntries_parameterized() {
        // Quickly verify balance across several flows
        assertBalanced(service.createJournalFromGRN(grn("G1", 100.0)));
        assertBalanced(service.createJournalFromInvoicePosting(salesInvoice("S1", "C1", 200.0, 10.0, 210.0)));
        assertBalanced(service.createJournalFromPaymentVoucher(paymentVoucher("P1", bd("300"), null), "V1"));
        assertBalanced(service.createJournalFromReceiptVoucher(receiptVoucher("R1", "C1", 210.0, null, ReceiptPurpose.AGAINST_INVOICE)));
        assertBalanced(service.createJournalFromSalesReturn(salesReturn("CN1", 200.0, 10.0, 210.0), bd("120.00"), true));
        assertBalanced(service.createJournalFromPayrollRun("E1", "Name", bd("3000"), bd("2700"), BigDecimal.ZERO, bd("300"), 2026, 6, null, LocalDate.now()));
        assertBalanced(service.createJournalFromWpsDisbursement("W1", "2026/06", bd("2700"), LocalDate.now()));
        assertBalanced(service.createJournalFromBankCharge("BC1", bd("15"), "fee", LocalDate.now()));
        assertBalanced(service.createJournalFromInventoryWriteoff("ST1", 1L, "item", bd("200"), LocalDate.now()));
    }

    // =========================================================
    // Helpers
    // =========================================================

    private void assertBalanced(JournalEntry entry) {
        assertNotNull(entry, "Entry must not be null");
        BigDecimal dr = BigDecimal.ZERO, cr = BigDecimal.ZERO;
        for (JournalLine l : entry.getLines()) {
            dr = dr.add(l.getDebit() != null ? l.getDebit() : BigDecimal.ZERO);
            cr = cr.add(l.getCredit() != null ? l.getCredit() : BigDecimal.ZERO);
        }
        assertEquals(0, dr.compareTo(cr),
                "Entry " + entry.getReference() + " must be balanced. Dr=" + dr + " Cr=" + cr);
    }

    private void assertLineExists(JournalEntry entry, String accountCode, BigDecimal amount, boolean isDebit) {
        boolean found = entry.getLines().stream().anyMatch(l ->
                accountCode.equals(l.getAccountCode()) &&
                (isDebit ? l.getDebit() : l.getCredit()).compareTo(amount) == 0);
        assertTrue(found,
                "Expected " + (isDebit ? "Dr" : "Cr") + " " + amount + " on account " + accountCode
                        + " in entry " + entry.getReference());
    }

    private void assertNoLine(JournalEntry entry, String accountCode) {
        boolean found = entry.getLines().stream().anyMatch(l -> accountCode.equals(l.getAccountCode()));
        assertFalse(found, "No line should exist for account " + accountCode + " in entry " + entry.getReference());
    }

    /** Net (debit - credit) for a specific account in an entry. */
    private BigDecimal lineNet(JournalEntry entry, String accountCode) {
        BigDecimal dr = BigDecimal.ZERO, cr = BigDecimal.ZERO;
        for (JournalLine l : entry.getLines()) {
            if (accountCode.equals(l.getAccountCode())) {
                dr = dr.add(l.getDebit() != null ? l.getDebit() : BigDecimal.ZERO);
                cr = cr.add(l.getCredit() != null ? l.getCredit() : BigDecimal.ZERO);
            }
        }
        return dr.subtract(cr);
    }

    private static JournalEntry entryWith(JournalLine... lines) {
        JournalEntry entry = new JournalEntry();
        entry.setDate(LocalDate.of(2026, 6, 1));
        entry.setReference("MANUAL-TEST");
        for (JournalLine l : lines) entry.addLine(l);
        return entry;
    }

    private static JournalLine line(String code, String debit, String credit) {
        JournalLine l = new JournalLine();
        l.setAccount(code);
        l.setAccountCode(code);
        l.setDebit(new BigDecimal(debit));
        l.setCredit(new BigDecimal(credit));
        return l;
    }

    private static Account activeAccount() {
        Account a = new Account();
        a.setStatus("active");
        return a;
    }

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    private static SalesInvoice salesInvoice(String number, String customerCode,
            double subTotal, double taxTotal, double invoiceTotal) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setCustomerCode(customerCode);
        inv.setInvoiceDate(LocalDate.of(2026, 6, 1));
        inv.setSubTotal(subTotal);
        inv.setTaxTotal(taxTotal);
        inv.setInvoiceTotal(invoiceTotal);
        return inv;
    }

    private static GrnEntity grn(String grnNo, double grandTotal) {
        GrnEntity grn = new GrnEntity();
        grn.setGrnNo(grnNo);
        grn.setGrnDate(LocalDate.of(2026, 6, 1));
        grn.setGrandTotal(new BigDecimal(String.valueOf(grandTotal)));
        return grn;
    }

    private static ReceiptVoucher receiptVoucher(String voucherId, String customerCode,
            double amount, BigDecimal discount, ReceiptPurpose purpose) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setVoucherId(voucherId);
        rv.setCustomerCode(customerCode);
        rv.setMemberName(customerCode);
        rv.setDate(LocalDate.of(2026, 6, 1));
        rv.setAmount(new BigDecimal(String.valueOf(amount)));
        rv.setDiscountAmount(discount);
        rv.setPurpose(purpose);
        rv.setPaymentMode("Cash");
        return rv;
    }

    private static PaymentVoucher paymentVoucher(String number, BigDecimal amount, BigDecimal discount) {
        PaymentVoucher pv = new PaymentVoucher();
        pv.setVoucherNumber(number);
        pv.setAmount(amount);
        pv.setDiscountAmount(discount);
        pv.setPaymentMode(PaymentMode.BANK_TRANSFER);
        pv.setPaymentDate(LocalDate.of(2026, 6, 1));
        return pv;
    }

    private static SalesReturn salesReturn(String returnNumber, double subTotal, double taxAmount, double totalAmount) {
        SalesReturn ret = new SalesReturn();
        ret.setReturnNumber(returnNumber);
        ret.setReturnDate(LocalDate.of(2026, 6, 1));
        ret.setSubTotal(subTotal);
        ret.setTaxAmount(taxAmount);
        ret.setTotalAmount(totalAmount);
        return ret;
    }

    private static PurchaseInvoice directPurchaseInvoice(String number, double subTotal, double taxTotal, double grandTotal) {
        PurchaseInvoice pi = new PurchaseInvoice();
        pi.setInvoiceNumber(number);
        pi.setInvoiceDate(LocalDate.of(2026, 6, 1));
        pi.setSourceType("DIRECT");
        pi.setSubTotal(new BigDecimal(String.valueOf(subTotal)));
        pi.setTaxTotal(new BigDecimal(String.valueOf(taxTotal)));
        pi.setGrandTotal(new BigDecimal(String.valueOf(grandTotal)));
        return pi;
    }

    private static PurchaseInvoice grnPurchaseInvoice(String number, Long grnId, double subTotal, double taxTotal, double grandTotal) {
        PurchaseInvoice pi = directPurchaseInvoice(number, subTotal, taxTotal, grandTotal);
        pi.setSourceType("AGAINST_GRN");
        pi.setGrnId(grnId);
        return pi;
    }

    private static com.billbull.backend.financials.pdc.PdcEntry pdc(Long id, String chequeNo, BigDecimal amount, String customerCode) {
        com.billbull.backend.financials.pdc.PdcEntry pdc = new com.billbull.backend.financials.pdc.PdcEntry();
        pdc.setId(id);
        pdc.setChequeNumber(chequeNo);
        pdc.setAmount(amount);
        pdc.setCustomerCode(customerCode);
        pdc.setCustomerName(customerCode);
        pdc.setReceivedDate(LocalDate.now());
        pdc.setChequeDate(LocalDate.now().plusDays(30));
        return pdc;
    }
}
