package com.billbull.backend.financials.statement;

import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class StatementService {

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private PurchaseInvoiceRepository purchaseInvoiceRepository;

    @Autowired
    private PaymentVoucherRepository paymentVoucherRepository;

    public StatementResponse getCustomerStatement(String customerCode, LocalDate startDate, LocalDate endDate) {
        StatementResponse resp = new StatementResponse();
        resp.setAccountCode(customerCode);

        // 1. Calculate Opening Balance
        Double invBefore = salesInvoiceRepository.calculateOpeningBalance(customerCode, startDate);
        Double payBefore = paymentRepository.calculateOpeningBalance(customerCode, startDate);

        BigDecimal dInvBefore = invBefore != null ? BigDecimal.valueOf(invBefore) : BigDecimal.ZERO;
        BigDecimal dPayBefore = payBefore != null ? BigDecimal.valueOf(payBefore) : BigDecimal.ZERO;

        BigDecimal openingBalance = dInvBefore.subtract(dPayBefore);
        resp.setOpeningBalance(openingBalance);

        // 2. Fetch Entries
        List<StatementEntryDTO> invoices = salesInvoiceRepository.findStatementEntries(customerCode, startDate,
                endDate);
        List<StatementEntryDTO> payments = paymentRepository.findStatementEntries(customerCode, startDate, endDate);

        List<StatementEntryDTO> combined = new ArrayList<>();
        combined.addAll(invoices);
        combined.addAll(payments);

        // 3. Sort Chronologically
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate)
                .thenComparing(StatementEntryDTO::getTransactionDateTime)
                .thenComparing(e -> e.getDocumentNo() == null ? "" : e.getDocumentNo()));

        // 4. Calculate Running Balances
        BigDecimal runningBalance = openingBalance;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (StatementEntryDTO entry : combined) {
            BigDecimal debit = entry.getDebit() != null ? entry.getDebit() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCredit() != null ? entry.getCredit() : BigDecimal.ZERO;

            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // AR formula: Balance = Previous + Debit - Credit
            runningBalance = runningBalance.add(debit).subtract(credit);
            entry.setRunningBalance(runningBalance);
        }

        resp.setEntries(combined);
        resp.setTotalDebit(totalDebit);
        resp.setTotalCredit(totalCredit);
        resp.setClosingBalance(runningBalance);

        return resp;
    }

    public StatementResponse getVendorStatement(String vendorName, LocalDate startDate, LocalDate endDate) {
        StatementResponse resp = new StatementResponse();
        resp.setAccountName(vendorName);

        // 1. Calculate Opening Balance
        BigDecimal invBefore = purchaseInvoiceRepository.calculateOpeningBalance(vendorName, startDate);
        BigDecimal payBefore = paymentVoucherRepository.calculateOpeningBalance(vendorName, startDate);

        if (invBefore == null)
            invBefore = BigDecimal.ZERO;
        if (payBefore == null)
            payBefore = BigDecimal.ZERO;

        // AP formula: Balance = Credits (Invoices) - Debits (Payments)
        BigDecimal openingBalance = invBefore.subtract(payBefore);
        resp.setOpeningBalance(openingBalance);

        // 2. Fetch Entries
        List<StatementEntryDTO> invoices = purchaseInvoiceRepository.findStatementEntries(vendorName, startDate,
                endDate);
        List<StatementEntryDTO> payments = paymentVoucherRepository.findStatementEntries(vendorName, startDate,
                endDate);

        List<StatementEntryDTO> combined = new ArrayList<>();
        combined.addAll(invoices);
        combined.addAll(payments);

        // 3. Sort Chronologically
        combined.sort(Comparator
                .comparing(StatementEntryDTO::getTransactionDate)
                .thenComparing(StatementEntryDTO::getTransactionDateTime)
                .thenComparing(e -> e.getDocumentNo() == null ? "" : e.getDocumentNo()));

        // 4. Calculate Running Balances
        BigDecimal runningBalance = openingBalance;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (StatementEntryDTO entry : combined) {
            BigDecimal debit = entry.getDebit() != null ? entry.getDebit() : BigDecimal.ZERO;
            BigDecimal credit = entry.getCredit() != null ? entry.getCredit() : BigDecimal.ZERO;

            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);

            // AP formula: Balance = Previous + Credit - Debit
            runningBalance = runningBalance.add(credit).subtract(debit);
            entry.setRunningBalance(runningBalance);
        }

        resp.setEntries(combined);
        resp.setTotalDebit(totalDebit);
        resp.setTotalCredit(totalCredit);
        resp.setClosingBalance(runningBalance);

        return resp;
    }
}
