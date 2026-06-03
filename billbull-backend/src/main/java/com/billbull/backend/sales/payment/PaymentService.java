package com.billbull.backend.sales.payment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class PaymentService {

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private OpeningInvoiceRepository openingInvoiceRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private ReceiptVoucherService receiptVoucherService;

    @Autowired
    private SalesDocumentNumberingService numberingService;

    @Autowired
    private BranchAccessService branchAccessService;

    public List<Payment> getAllPayments() {
        List<Payment> payments = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(paymentRepository.findAll(), Payment::getBranch));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public List<Payment> getAllByDateRange(java.time.LocalDate from, java.time.LocalDate to) {
        List<Payment> payments = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(paymentRepository.findByPaymentDateBetween(from, to), Payment::getBranch));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public Payment getPaymentById(Long id) {
        return paymentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Payment not found with ID: " + id));
    }

    public List<Payment> getPaymentsByCustomer(String customerCode) {
        List<Payment> payments = new ArrayList<>(paymentRepository.findByCustomerCode(customerCode));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public List<Payment> getPaymentsByInvoice(String invoiceNumber) {
        List<Payment> payments = new ArrayList<>(paymentRepository.findByLinkedInvoice(invoiceNumber));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public String generatePaymentNumber() {
        return numberingService.preview(SalesDocumentType.SALES_PAYMENT);
    }

    @Transactional
    public Payment savePayment(Payment payment) {
        Payment existingPayment = null;
        if (payment.getId() != null) {
            existingPayment = paymentRepository.findById(payment.getId()).orElse(null);
            if (payment.getReceiptVoucherRecordId() == null && existingPayment != null) {
                payment.setReceiptVoucherRecordId(existingPayment.getReceiptVoucherRecordId());
            }
        }

        // Branch guard + stamp/lock (PDF §3.4).
        if (existingPayment != null) {
            Long existingBranchId = existingPayment.getBranch() != null ? existingPayment.getBranch().getId() : null;
            branchAccessService.assertTransactionBranchAccessible(existingBranchId, "Payment");
            payment.setBranch(existingPayment.getBranch());
        } else {
            payment.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        }

        if (payment.getId() == null) {
            payment.setPaymentNumber(numberingService.resolveNumberForCreate(
                    SalesDocumentType.SALES_PAYMENT,
                    payment.getPaymentNumber()));
        } else if (existingPayment != null) {
            payment.setPaymentNumber(numberingService.resolveNumberForUpdate(
                    SalesDocumentType.SALES_PAYMENT,
                    existingPayment.getPaymentNumber(),
                    payment.getPaymentNumber()));
        }

        if (payment.getId() == null && payment.getCreatedDate() == null) {
            payment.setCreatedDate(LocalDate.now());
        }

        Payment savedPayment = paymentRepository.save(payment);

        if (savedPayment.getPaymentType() == PaymentType.RECEIVED) {
            ReceiptVoucher receiptVoucher = upsertReceiptVoucher(savedPayment);
            if (receiptVoucher != null
                    && !Objects.equals(savedPayment.getReceiptVoucherRecordId(), receiptVoucher.getId())) {
                savedPayment.setReceiptVoucherRecordId(receiptVoucher.getId());
                savedPayment = paymentRepository.save(savedPayment);
            }
        }

        return savedPayment;
    }

    @Transactional
    public void deletePayment(Long id) {
        Payment payment = getPaymentById(id);
        if (payment.getReceiptVoucherRecordId() != null) {
            receiptVoucherService.deleteReceipt(payment.getReceiptVoucherRecordId());
        }
        paymentRepository.delete(payment);
    }

    public Map<String, Object> getPaymentStats() {
        Map<String, Object> stats = new HashMap<>();

        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.atEndOfMonth();

        Double todayReceived = paymentRepository.getTotalReceivedForDate(today);
        Double monthReceived = paymentRepository.getTotalReceivedBetweenDates(monthStart, monthEnd);
        Double pendingAmount = paymentRepository.getTotalPendingAmount();
        long totalTransactions = paymentRepository.count();

        stats.put("todayReceived", todayReceived != null ? todayReceived : 0.0);
        stats.put("thisMonthReceived", monthReceived != null ? monthReceived : 0.0);
        stats.put("pendingAmount", pendingAmount != null ? pendingAmount : 0.0);
        stats.put("totalTransactions", totalTransactions);

        return stats;
    }

    @Transactional
    public Payment updateStatus(Long id, PaymentStatus status) {
        Payment payment = getPaymentById(id);
        payment.setStatus(status);

        Payment savedPayment = paymentRepository.save(payment);

        if (savedPayment.getPaymentType() == PaymentType.RECEIVED) {
            ReceiptVoucher receiptVoucher = upsertReceiptVoucher(savedPayment);
            if (receiptVoucher != null
                    && !Objects.equals(savedPayment.getReceiptVoucherRecordId(), receiptVoucher.getId())) {
                savedPayment.setReceiptVoucherRecordId(receiptVoucher.getId());
                savedPayment = paymentRepository.save(savedPayment);
            }
        }

        return savedPayment;
    }

    private ReceiptVoucher upsertReceiptVoucher(Payment payment) {
        if (payment.getStatus() == PaymentStatus.CANCELLED && payment.getReceiptVoucherRecordId() == null) {
            return null;
        }

        SalesInvoice linkedInvoice = null;
        OpeningInvoice linkedOpeningInvoice = null;
        if (payment.getLinkedInvoice() != null && !payment.getLinkedInvoice().isBlank()) {
            String linkedInvoiceNumber = payment.getLinkedInvoice().trim();
            linkedInvoice = salesInvoiceRepository.findByInvoiceNumber(linkedInvoiceNumber)
                    .filter(invoice -> payment.getCustomerCode() == null
                            || payment.getCustomerCode().isBlank()
                            || Objects.equals(invoice.getCustomerCode(), payment.getCustomerCode()))
                    .orElse(null);
            if (linkedInvoice == null) {
                linkedOpeningInvoice = findOpeningInvoice(payment)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                "Customer invoice/opening balance bill not found: " + linkedInvoiceNumber));
            }
        }

        ReceiptVoucher receiptVoucher = new ReceiptVoucher();
        receiptVoucher.setDate(payment.getPaymentDate() != null ? payment.getPaymentDate() : LocalDate.now());
        receiptVoucher.setAmount(BigDecimal.valueOf(payment.getAmount() != null ? payment.getAmount() : 0.0));
        receiptVoucher.setPaymentMode(payment.getPaymentMode());
        receiptVoucher.setReference(payment.getReferenceNumber());
        receiptVoucher.setNotes(payment.getNotes());
        receiptVoucher.setMemberName(
                payment.getCustomerName() != null && !payment.getCustomerName().isBlank()
                        ? payment.getCustomerName()
                        : payment.getCustomerCode());
        receiptVoucher.setCustomerCode(payment.getCustomerCode());
        receiptVoucher.setStatus(mapReceiptStatus(payment.getStatus()));
        receiptVoucher.setPurpose(
                linkedInvoice != null || linkedOpeningInvoice != null
                        ? ReceiptPurpose.AGAINST_INVOICE
                        : ReceiptPurpose.ADVANCE_RECEIVED);
        receiptVoucher.setSalesInvoiceId(linkedInvoice != null ? linkedInvoice.getId() : null);
        receiptVoucher.setOpeningInvoiceId(linkedOpeningInvoice != null ? linkedOpeningInvoice.getId() : null);

        if (payment.getReceiptVoucherRecordId() != null) {
            return receiptVoucherService.updateReceipt(payment.getReceiptVoucherRecordId(), receiptVoucher, null);
        }

        return receiptVoucherService.createReceipt(receiptVoucher, null);
    }

    private Optional<OpeningInvoice> findOpeningInvoice(Payment payment) {
        String customerCode = payment.getCustomerCode();
        String invoiceNumber = payment.getLinkedInvoice();
        if (customerCode == null || customerCode.isBlank() || invoiceNumber == null || invoiceNumber.isBlank()) {
            return Optional.empty();
        }

        String normalizedInvoiceNumber = invoiceNumber.trim();
        List<OpeningInvoice> openingInvoices = openingInvoiceRepository.findByCustomer_Code(customerCode);
        Optional<OpeningInvoice> matchedInvoice = openingInvoices.stream()
                .filter(invoice -> invoice.getNumber() != null
                        && invoice.getNumber().trim().equalsIgnoreCase(normalizedInvoiceNumber))
                .findFirst();
        if (matchedInvoice.isPresent() || !openingInvoices.isEmpty()) {
            return matchedInvoice;
        }

        return customerRepository.findByCode(customerCode)
                .filter(customer -> customer.getBalance() != null
                        && customer.getBalance().compareTo(BigDecimal.ZERO) > 0)
                .map(customer -> {
                    OpeningInvoice invoice = new OpeningInvoice();
                    invoice.setCustomer(customer);
                    invoice.setNumber(normalizedInvoiceNumber);
                    invoice.setAmount(customer.getBalance());
                    invoice.setOutstanding(customer.getBalance());
                    invoice.setOpeningBalanceAmount(customer.getBalance());
                    invoice.setRemarks("Opening balance");
                    return openingInvoiceRepository.save(invoice);
                });
    }

    private String mapReceiptStatus(PaymentStatus paymentStatus) {
        if (paymentStatus == null) {
            return "Completed";
        }

        return switch (paymentStatus) {
            case PENDING -> "Pending";
            case CANCELLED -> "Cancelled";
            case COMPLETED, PARTIAL -> "Completed";
        };
    }
}
