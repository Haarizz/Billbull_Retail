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

    public List<Payment> getAllPayments() {
        List<Payment> payments = new ArrayList<>(paymentRepository.findAll());
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
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public List<Payment> getPaymentsByInvoice(String invoiceNumber) {
        List<Payment> payments = new ArrayList<>(paymentRepository.findByLinkedInvoice(invoiceNumber));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        return payments;
    }

    public String generatePaymentNumber() {
        String prefix = "PAY-" + java.time.Year.now().getValue() + "-";
        Optional<Payment> lastPayment = paymentRepository.findTopByOrderByPaymentNumberDesc();

        int lastNumber = 0;
        if (lastPayment.isPresent()) {
            String lastNum = lastPayment.get().getPaymentNumber();
            if (lastNum != null && lastNum.startsWith("PAY-")) {
                try {
                    String[] parts = lastNum.split("-");
                    if (parts.length >= 3) {
                        lastNumber = Integer.parseInt(parts[2]);
                    }
                } catch (NumberFormatException e) {
                    lastNumber = 0;
                }
            }
        }
        return prefix + String.format("%04d", lastNumber + 1);
    }

    @Transactional
    public Payment savePayment(Payment payment) {
        if (payment.getId() != null && payment.getReceiptVoucherRecordId() == null) {
            paymentRepository.findById(payment.getId())
                    .map(Payment::getReceiptVoucherRecordId)
                    .ifPresent(payment::setReceiptVoucherRecordId);
        }

        if (payment.getId() == null && (payment.getPaymentNumber() == null || payment.getPaymentNumber().isEmpty())) {
            payment.setPaymentNumber(generatePaymentNumber());
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
