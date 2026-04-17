package com.billbull.backend.purchase.payment;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.invoice.InvoicePayment;
import com.billbull.backend.purchase.invoice.InvoiceStatus;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class PaymentVoucherService {

    @Autowired
    private PaymentVoucherRepository repository;

    @Autowired
    private PurchaseInvoiceRepository invoiceRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    public List<PaymentVoucher> getAllVouchers() {
        List<PaymentVoucher> vouchers = new ArrayList<>(repository.findAll());
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                vouchers,
                PaymentVoucher::getPaymentDate,
                PaymentVoucher::getVoucherNumber,
                PaymentVoucher::getId);
        return vouchers;
    }

    public Optional<PaymentVoucher> getVoucherById(Long id) {
        return repository.findById(id);
    }

    public BigDecimal getPostedAmountForInvoice(Long invoiceId) {
        return getPostedAmountForInvoice(invoiceId, null);
    }

    public BigDecimal getPostedAmountForInvoice(Long invoiceId, Long excludeVoucherId) {
        if (invoiceId == null) {
            return BigDecimal.ZERO;
        }

        BigDecimal postedAmount = excludeVoucherId == null
                ? repository.sumPostedAmountByInvoiceId(invoiceId)
                : repository.sumPostedAmountByInvoiceIdExcludingVoucher(invoiceId, excludeVoucherId);
        return postedAmount != null ? postedAmount : BigDecimal.ZERO;
    }

    @Transactional
    public PaymentVoucher createVoucher(PaymentVoucher voucher) {
        voucher.setStatus(PaymentStatus.PENDING_APPROVAL);
        voucher.setUnallocated(voucher.getAmount());

        PaymentVoucher saved = repository.save(voucher);
        saved.setVoucherNumber("PV-" + (10000 + saved.getId()));

        return repository.save(saved);
    }

    @Transactional
    public PaymentVoucher updateStatus(Long id, PaymentStatus status) {
        PaymentVoucher voucher = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Voucher not found with ID: " + id));

        // Prevent double posting
        if (voucher.getStatus() == PaymentStatus.POSTED && status == PaymentStatus.POSTED) {
            return voucher;
        }

        voucher.setStatus(status);

        // 🔥 LOGIC: If Voucher is POSTED (Approved), update the Purchase Invoice
        if (status == PaymentStatus.POSTED && voucher.getInvoiceId() != null) {
            applyPaymentToInvoice(voucher);
        }

        return repository.save(voucher);
    }

    private void applyPaymentToInvoice(PaymentVoucher voucher) {
        PurchaseInvoice invoice = invoiceRepository.findById(voucher.getInvoiceId())
                .orElseThrow(() -> new RuntimeException("Purchase Invoice not found"));

        if (invoice.getStatus() != InvoiceStatus.POSTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only POSTED purchase invoices can receive payments.");
        }

        if (voucher.getAmount() == null || voucher.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Payment voucher amount must be greater than zero.");
        }

        BigDecimal alreadyPaid = getPostedAmountForInvoice(invoice.getId(), voucher.getId());
        if (alreadyPaid.compareTo(BigDecimal.ZERO) <= 0) {
            alreadyPaid = sumInvoicePayments(invoice);
        }

        BigDecimal invoiceTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
        BigDecimal outstanding = invoiceTotal.subtract(alreadyPaid);

        if (outstanding.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This purchase invoice is already fully paid.");
        }

        if (voucher.getAmount().compareTo(outstanding) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Payment exceeds the invoice balance.");
        }

        // 1. Create a Payment Record inside the Invoice Module
        InvoicePayment payment = new InvoicePayment();
        payment.setPaidAmount(voucher.getAmount());
        payment.setPaymentDate(voucher.getPaymentDate());
        payment.setPaymentMode(voucher.getPaymentMode().name()); // Enum to String
        payment.setInvoice(invoice);

        invoice.getPayments().add(payment);

        // 2. Calculate Total Paid So Far
        BigDecimal totalPaid = alreadyPaid.add(voucher.getAmount());

        // 3. Update Invoice Payment Status (Using Invoice Module's Enum)
        updateInvoicePaymentStatus(invoice, totalPaid);

        // 4. Update Voucher Allocation
        voucher.setAllocated(voucher.getAmount());
        voucher.setUnallocated(BigDecimal.ZERO);

        invoiceRepository.save(invoice);

        // 🔵 AUTO-GENERATE JOURNAL ENTRY
        // Dr. Accounts Payable (amount)
        // Cr. Bank (amount)
        postingEngineService.createJournalFromPaymentVoucher(voucher, invoice.getVendorName());
    }

    private BigDecimal sumInvoicePayments(PurchaseInvoice invoice) {
        return invoice.getPayments().stream()
                .map(InvoicePayment::getPaidAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void updateInvoicePaymentStatus(PurchaseInvoice invoice, BigDecimal totalPaid) {
        BigDecimal invoiceTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;

        if (totalPaid == null || totalPaid.compareTo(BigDecimal.ZERO) <= 0) {
            invoice.setPaymentStatus(com.billbull.backend.purchase.invoice.PaymentStatus.UNPAID);
            return;
        }

        if (totalPaid.compareTo(invoiceTotal) >= 0) {
            invoice.setPaymentStatus(com.billbull.backend.purchase.invoice.PaymentStatus.PAID);
            return;
        }

        invoice.setPaymentStatus(com.billbull.backend.purchase.invoice.PaymentStatus.PARTIALLY_PAID);
    }

    public void deleteVoucher(Long id) {
        repository.deleteById(id);
    }
}
