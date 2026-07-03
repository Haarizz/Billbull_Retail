package com.billbull.backend.financials.statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.sales.advance.AdvanceApplication;
import com.billbull.backend.sales.advance.AdvanceApplicationRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Covers the Customer Statement running-balance formula for a mix of sales
 * invoices, plain receipts, and advance applications — the exact combination
 * the "outstanding balance not reduced by receipts/advances" bug report
 * called out. Balance = Previous + Debit(invoice) - Credit(receipt/applied
 * advance); an unapplied advance is shown but excluded until applied.
 */
@ExtendWith(MockitoExtension.class)
class StatementServiceTest {

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private ReceiptVoucherRepository receiptVoucherRepository;
    @Mock private AdvanceApplicationRepository advanceApplicationRepository;
    @Mock private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Mock private PaymentVoucherRepository paymentVoucherRepository;
    @Mock private OpeningInvoiceRepository openingInvoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private VendorRepository vendorRepository;

    private StatementService service;

    private static final String CUSTOMER = "CUST-1";
    private static final LocalDate START = LocalDate.of(2026, 1, 1);
    private static final LocalDate END = LocalDate.of(2026, 12, 31);

    @BeforeEach
    void setUp() {
        service = new StatementService();
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "receiptVoucherRepository", receiptVoucherRepository);
        ReflectionTestUtils.setField(service, "advanceApplicationRepository", advanceApplicationRepository);
        ReflectionTestUtils.setField(service, "purchaseInvoiceRepository", purchaseInvoiceRepository);
        ReflectionTestUtils.setField(service, "paymentVoucherRepository", paymentVoucherRepository);
        ReflectionTestUtils.setField(service, "openingInvoiceRepository", openingInvoiceRepository);
        ReflectionTestUtils.setField(service, "customerRepository", customerRepository);
        ReflectionTestUtils.setField(service, "vendorRepository", vendorRepository);

        // No opening-balance carry-forward in any scenario below.
        when(salesInvoiceRepository.calculateOpeningBalance(eq(CUSTOMER), any())).thenReturn(0.0);
        when(receiptVoucherRepository.sumCompletedAmountBeforeDate(eq(CUSTOMER), any())).thenReturn(BigDecimal.ZERO);
        when(openingInvoiceRepository.findByCustomer_Code(CUSTOMER)).thenReturn(List.of());
        when(customerRepository.findByCode(CUSTOMER)).thenReturn(java.util.Optional.empty());
        org.mockito.Mockito.lenient().when(salesInvoiceRepository.findByInvoiceNumberIn(any())).thenReturn(List.of());
    }

    private StatementEntryDTO invoiceEntry(LocalDate date, String docNo, BigDecimal amount) {
        return new StatementEntryDTO(date, date.atStartOfDay(), docNo, "INVOICE", amount, BigDecimal.ZERO);
    }

    private ReceiptVoucher receipt(Long id, String voucherId, ReceiptPurpose purpose, Long salesInvoiceId) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setId(id);
        rv.setVoucherId(voucherId);
        rv.setCustomerCode(CUSTOMER);
        rv.setPurpose(purpose);
        rv.setSalesInvoiceId(salesInvoiceId);
        return rv;
    }

    private StatementEntryDTO receiptEntry(LocalDate date, String voucherId, BigDecimal amount) {
        return new StatementEntryDTO(date, date.atStartOfDay(), voucherId, "PAYMENT_RECEIVED", BigDecimal.ZERO,
                amount);
    }

    // ---- Credit sale increases balance ----

    @Test
    void creditSaleIncreasesRunningBalance() {
        when(salesInvoiceRepository.findStatementEntries(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(invoiceEntry(LocalDate.of(2026, 1, 5), "INV-1", new BigDecimal("1000.00"))));
        when(receiptVoucherRepository.findStatementEntriesByCustomerCode(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of());
        when(receiptVoucherRepository.findByCustomerCodeAndPurpose(eq(CUSTOMER), any())).thenReturn(List.of());

        StatementResponse resp = service.getCustomerStatement(CUSTOMER, START, END);

        assertEquals(0, new BigDecimal("1000.00").compareTo(resp.getClosingBalance()));
    }

    // ---- Receipt decreases balance ----

    @Test
    void receiptAgainstInvoiceDecreasesRunningBalance() {
        when(salesInvoiceRepository.findStatementEntries(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(invoiceEntry(LocalDate.of(2026, 1, 5), "INV-1", new BigDecimal("1000.00"))));

        ReceiptVoucher rv = receipt(10L, "RV-10", ReceiptPurpose.AGAINST_INVOICE, 1L);
        when(receiptVoucherRepository.findStatementEntriesByCustomerCode(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(receiptEntry(LocalDate.of(2026, 1, 10), "RV-10", new BigDecimal("400.00"))));
        when(receiptVoucherRepository.findByVoucherIdIn(any())).thenReturn(List.of(rv));
        when(receiptVoucherRepository.findByCustomerCodeAndPurpose(eq(CUSTOMER), any())).thenReturn(List.of());

        StatementResponse resp = service.getCustomerStatement(CUSTOMER, START, END);

        // 1000 invoiced - 400 received = 600 outstanding
        assertEquals(0, new BigDecimal("600.00").compareTo(resp.getClosingBalance()));
    }

    // ---- Advance received (unapplied) does not reduce balance; applying it does ----

    @Test
    void unappliedAdvanceDoesNotReduceBalanceButAppliedAdvanceDoes() {
        when(salesInvoiceRepository.findStatementEntries(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(invoiceEntry(LocalDate.of(2026, 1, 5), "INV-1", new BigDecimal("1000.00"))));

        // General advance received, not yet linked to any invoice.
        ReceiptVoucher advanceRv = receipt(20L, "RV-20", ReceiptPurpose.ADVANCE_RECEIVED, null);
        when(receiptVoucherRepository.findStatementEntriesByCustomerCode(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(receiptEntry(LocalDate.of(2026, 1, 8), "RV-20", new BigDecimal("300.00"))));
        when(receiptVoucherRepository.findByVoucherIdIn(any())).thenReturn(List.of(advanceRv));

        // The advance is later applied in full against INV-1.
        when(receiptVoucherRepository.findByCustomerCodeAndPurpose(eq(CUSTOMER), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(advanceRv));
        AdvanceApplication app = new AdvanceApplication();
        app.setAdvanceReceiptId(20L);
        app.setInvoiceNumber("INV-1");
        app.setAppliedAmount(new BigDecimal("300.00"));
        app.setAppliedDate(LocalDate.of(2026, 1, 12));
        app.setStatus("APPLIED");
        when(advanceApplicationRepository.findByAdvanceReceiptId(20L)).thenReturn(List.of(app));

        StatementResponse resp = service.getCustomerStatement(CUSTOMER, START, END);

        // 1000 invoiced - 300 applied advance = 700 outstanding.
        // (The unapplied-advance receipt line itself is excluded from the running
        // balance; only the ADVANCE_APPLICATION entry actually reduces AR.)
        assertEquals(0, new BigDecimal("700.00").compareTo(resp.getClosingBalance()));
    }

    // ---- Advance greater than outstanding leaves remaining as customer advance ----

    @Test
    void advanceGreaterThanOutstandingOnlyReducesBalanceByAppliedPortion() {
        when(salesInvoiceRepository.findStatementEntries(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(invoiceEntry(LocalDate.of(2026, 1, 5), "INV-1", new BigDecimal("500.00"))));

        ReceiptVoucher advanceRv = receipt(30L, "RV-30", ReceiptPurpose.ADVANCE_RECEIVED, null);
        when(receiptVoucherRepository.findStatementEntriesByCustomerCode(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(receiptEntry(LocalDate.of(2026, 1, 8), "RV-30", new BigDecimal("1000.00"))));
        when(receiptVoucherRepository.findByVoucherIdIn(any())).thenReturn(List.of(advanceRv));

        when(receiptVoucherRepository.findByCustomerCodeAndPurpose(eq(CUSTOMER), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(advanceRv));
        // Only 500 of the 1000 advance gets applied (the rest remains a customer-advance liability).
        AdvanceApplication app = new AdvanceApplication();
        app.setAdvanceReceiptId(30L);
        app.setInvoiceNumber("INV-1");
        app.setAppliedAmount(new BigDecimal("500.00"));
        app.setAppliedDate(LocalDate.of(2026, 1, 12));
        app.setStatus("APPLIED");
        when(advanceApplicationRepository.findByAdvanceReceiptId(30L)).thenReturn(List.of(app));

        StatementResponse resp = service.getCustomerStatement(CUSTOMER, START, END);

        // Invoice fully settled by the applied 500; the remaining 500 stays an
        // unapplied advance (excluded from AR), so the AR balance nets to zero,
        // not negative.
        assertEquals(0, BigDecimal.ZERO.compareTo(resp.getClosingBalance()));
    }

    // ---- Mixed scenario: invoice + receipt + advance + advance-application, chronological running balance ----

    @Test
    void runningBalanceIsCorrectAcrossMixOfInvoicesReceiptsAndAdvances() {
        // Jan 5: Invoice #1 for 1000 (credit sale)
        // Jan 10: Receipt of 300 against Invoice #1 (customer receipt)
        // Jan 15: Invoice #2 for 500 (credit sale)
        // Jan 20: General advance received of 800 (unapplied at first)
        // Jan 25: 500 of that advance applied to Invoice #2 (fully settling it)
        //
        // Expected running balance after each event:
        //   Jan 5:  0 + 1000            = 1000
        //   Jan 10: 1000 - 300          = 700
        //   Jan 15: 700 + 500           = 1200
        //   Jan 20: unapplied advance, excluded -> stays 1200
        //   Jan 25: 1200 - 500 (applied)= 700
        LocalDate d1 = LocalDate.of(2026, 1, 5);
        LocalDate d2 = LocalDate.of(2026, 1, 10);
        LocalDate d3 = LocalDate.of(2026, 1, 15);
        LocalDate d4 = LocalDate.of(2026, 1, 20);
        LocalDate d5 = LocalDate.of(2026, 1, 25);

        when(salesInvoiceRepository.findStatementEntries(eq(CUSTOMER), eq(START), eq(END))).thenReturn(List.of(
                invoiceEntry(d1, "INV-1", new BigDecimal("1000.00")),
                invoiceEntry(d3, "INV-2", new BigDecimal("500.00"))));

        ReceiptVoucher receiptRv = receipt(40L, "RV-40", ReceiptPurpose.AGAINST_INVOICE, 1L);
        ReceiptVoucher advanceRv = receipt(41L, "RV-41", ReceiptPurpose.ADVANCE_RECEIVED, null);
        when(receiptVoucherRepository.findStatementEntriesByCustomerCode(eq(CUSTOMER), eq(START), eq(END)))
                .thenReturn(List.of(
                        receiptEntry(d2, "RV-40", new BigDecimal("300.00")),
                        receiptEntry(d4, "RV-41", new BigDecimal("800.00"))));
        when(receiptVoucherRepository.findByVoucherIdIn(any())).thenReturn(List.of(receiptRv, advanceRv));

        when(receiptVoucherRepository.findByCustomerCodeAndPurpose(eq(CUSTOMER), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(advanceRv));
        AdvanceApplication app = new AdvanceApplication();
        app.setAdvanceReceiptId(41L);
        app.setInvoiceNumber("INV-2");
        app.setAppliedAmount(new BigDecimal("500.00"));
        app.setAppliedDate(d5);
        app.setStatus("APPLIED");
        when(advanceApplicationRepository.findByAdvanceReceiptId(41L)).thenReturn(List.of(app));

        StatementResponse resp = service.getCustomerStatement(CUSTOMER, START, END);

        assertEquals(0, new BigDecimal("700.00").compareTo(resp.getClosingBalance()));

        // Spot-check the running balance progresses correctly at each dated entry.
        List<StatementEntryDTO> entries = resp.getEntries();
        assertEquals(0, new BigDecimal("1000.00").compareTo(findByDoc(entries, "INV-1").getRunningBalance()));
        assertEquals(0, new BigDecimal("700.00").compareTo(findByDoc(entries, "RV-40").getRunningBalance()));
        assertEquals(0, new BigDecimal("1200.00").compareTo(findByDoc(entries, "INV-2").getRunningBalance()));
        // Unapplied-advance line itself must not move the balance off 1200.
        assertEquals(0, new BigDecimal("1200.00").compareTo(findByDoc(entries, "RV-41").getRunningBalance()));
    }

    private StatementEntryDTO findByDoc(List<StatementEntryDTO> entries, String docNo) {
        return entries.stream().filter(e -> docNo.equals(e.getDocumentNo())).findFirst()
                .orElseThrow(() -> new AssertionError("No entry found for " + docNo));
    }
}
