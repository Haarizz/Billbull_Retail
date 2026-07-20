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
    private com.billbull.backend.sales.advance.AdvanceApplicationService advanceApplicationService;

    @Autowired
    private SalesDocumentNumberingService numberingService;

    @Autowired
    private BranchAccessService branchAccessService;

    @Autowired
    private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    @Autowired
    private com.billbull.backend.notification.NotificationEventPublisher notifPublisher;

    @Autowired
    private com.billbull.backend.sales.invoice.history.SalesInvoiceHistoryService invoiceHistoryService;

    public List<Payment> getAllPayments() {
        List<Payment> payments = new ArrayList<>(
                ownershipAccessService.filterOwned(
                        branchAccessService.filterBranchScopedByBranch(paymentRepository.findAll(), Payment::getBranch),
                        Payment::getCreatedByUserId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        recomputeInvoiceBalances(payments);
        return payments;
    }

    public List<Payment> getAllByDateRange(java.time.LocalDate from, java.time.LocalDate to) {
        List<Payment> payments = new ArrayList<>(
                ownershipAccessService.filterOwned(
                        branchAccessService.filterBranchScopedByBranch(paymentRepository.findByPaymentDateBetween(from, to), Payment::getBranch),
                        Payment::getCreatedByUserId));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        recomputeInvoiceBalances(payments);
        return payments;
    }

    public Payment getPaymentById(Long id) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Payment not found with ID: " + id));
        ownershipAccessService.assertCanAccessRecord(payment.getCreatedByUserId(), "Payment");
        if (payment.getLinkedInvoice() != null && !payment.getLinkedInvoice().isBlank()) {
            recomputeInvoiceBalances(new ArrayList<>(paymentRepository.findByLinkedInvoice(payment.getLinkedInvoice())))
                    .stream().filter(p -> p.getId().equals(id)).findFirst()
                    .ifPresent(p -> payment.setInvoiceBalance(p.getInvoiceBalance()));
        }
        return payment;
    }

    public List<Payment> getPaymentsByCustomer(String customerCode) {
        List<Payment> payments = new ArrayList<>(paymentRepository.findByCustomerCode(customerCode));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        recomputeInvoiceBalances(payments);
        return payments;
    }

    public List<Payment> getPaymentsBySplitGroupId(String splitGroupId) {
        if (splitGroupId == null || splitGroupId.isBlank()) return java.util.Collections.emptyList();
        List<Payment> payments = new ArrayList<>(paymentRepository.findBySplitGroupId(splitGroupId));
        payments.sort(java.util.Comparator.comparing(Payment::getId));
        return payments;
    }

    public List<Payment> getAllWithSplitGroupId() {
        return paymentRepository.findBySplitGroupIdIsNotNull();
    }

    public List<Payment> getPaymentsByInvoice(String invoiceNumber) {
        List<Payment> payments = new ArrayList<>(paymentRepository.findByLinkedInvoice(invoiceNumber));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                payments,
                Payment::getPaymentDate,
                Payment::getPaymentNumber,
                Payment::getId);
        recomputeInvoiceBalances(payments);
        return payments;
    }

    /**
     * Recomputes invoiceBalance on each payment as the running remaining balance
     * after each payment, ordered oldest-first per invoice.
     * Oldest payment: remaining = invoiceAmount - thisPayment
     * Each subsequent payment: remaining = previousRemaining - thisPayment
     * This fixes stale/wrong invoiceBalance values stored in the DB.
     */
    private List<Payment> recomputeInvoiceBalances(List<Payment> payments) {
        // Group by linkedInvoice, process oldest-first (reverse of the desc-sorted list)
        java.util.Map<String, List<Payment>> byInvoice = new java.util.LinkedHashMap<>();
        for (Payment p : payments) {
            String inv = p.getLinkedInvoice();
            if (inv != null && !inv.isBlank()) {
                byInvoice.computeIfAbsent(inv, k -> new ArrayList<>()).add(p);
            }
        }
        for (Map.Entry<String, List<Payment>> entry : byInvoice.entrySet()) {
            List<Payment> group = entry.getValue();
            // group is desc-sorted (newest first).
            // Use the actual current invoice balance from DB as the terminal balance
            // after the most recent payment. This accounts for SO advance RVs that are
            // not Payment rows but are already reflected in invoice.balance.
            BigDecimal terminalBalance = salesInvoiceRepository.findByInvoiceNumber(entry.getKey())
                    .map(inv -> inv.getBalance() != null ? inv.getBalance() : BigDecimal.ZERO)
                    .orElse(BigDecimal.ZERO);

            // Assign invoiceBalance to each payment (= balance AFTER that payment).
            // P[0] is newest: its balance = terminalBalance.
            // P[1] is second-newest: its balance = terminalBalance + P[0].amount (what
            // P[0] reduced the balance from).
            // P[k]: balance = terminalBalance + sum(P[0..k-1].amount).
            BigDecimal cumulativeFromNewest = BigDecimal.ZERO;
            for (int i = 0; i < group.size(); i++) {
                Payment p = group.get(i);
                p.setInvoiceBalance(terminalBalance.add(cumulativeFromNewest).max(BigDecimal.ZERO));
                cumulativeFromNewest = cumulativeFromNewest.add(p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO);
            }
        }
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
            ownershipAccessService.assertCanAccessRecord(existingPayment.getCreatedByUserId(), "Payment");
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

        boolean isNew = (payment.getId() == null);
        Payment savedPayment = paymentRepository.save(payment);

        if (savedPayment.getPaymentType() == PaymentType.RECEIVED) {
            ReceiptVoucher receiptVoucher = upsertReceiptVoucher(savedPayment);
            if (receiptVoucher != null
                    && !Objects.equals(savedPayment.getReceiptVoucherRecordId(), receiptVoucher.getId())) {
                savedPayment.setReceiptVoucherRecordId(receiptVoucher.getId());
                savedPayment = paymentRepository.save(savedPayment);
            }
            
            if (isNew) {
                notifPublisher.paymentReceived(
                        savedPayment.getPaymentNumber(),
                        savedPayment.getCustomerName() != null ? savedPayment.getCustomerName() : "Customer",
                        String.format("AED %,.2f", savedPayment.getAmount() != null ? savedPayment.getAmount() : BigDecimal.ZERO),
                        savedPayment.getPaymentMode() != null ? savedPayment.getPaymentMode() : "CASH"
                );

                // Invoice history: hooked HERE rather than in SalesInvoiceService.recordPayment
                // because this is the single choke point every payment passes through —
                // including receipt vouchers raised directly against an invoice, which never
                // touch the invoice service. Reuses the same only-when-new guard as the
                // notification above so an edit doesn't re-log the payment.
                if (receiptVoucher != null && receiptVoucher.getSalesInvoiceId() != null) {
                    invoiceHistoryService.recordPaymentReceived(
                            receiptVoucher.getSalesInvoiceId(),
                            savedPayment.getBranch() != null ? savedPayment.getBranch().getId() : null,
                            receiptVoucher.getVoucherId(),
                            savedPayment.getAmount(),
                            savedPayment.getPaymentMode());
                }
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
        List<Payment> scopedPayments = ownershipAccessService.filterOwned(
                branchAccessService.filterExactBranchScopedByBranch(
                        paymentRepository.findAll(),
                        Payment::getBranch),
                Payment::getCreatedByUserId);

        double todayReceived = scopedPayments.stream()
                .filter(payment -> payment.getPaymentType() == PaymentType.RECEIVED)
                .filter(payment -> payment.getPaymentDate() != null && payment.getPaymentDate().isEqual(today))
                .map(Payment::getAmount)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        double monthReceived = scopedPayments.stream()
                .filter(payment -> payment.getPaymentType() == PaymentType.RECEIVED)
                .filter(payment -> payment.getPaymentDate() != null
                        && !payment.getPaymentDate().isBefore(monthStart)
                        && !payment.getPaymentDate().isAfter(monthEnd))
                .map(Payment::getAmount)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        double pendingAmount = scopedPayments.stream()
                .filter(payment -> payment.getStatus() == PaymentStatus.PENDING
                        || payment.getStatus() == PaymentStatus.PARTIAL)
                .map(payment -> {
                    BigDecimal invoiceBalance = payment.getInvoiceBalance() != null ? payment.getInvoiceBalance() : BigDecimal.ZERO;
                    BigDecimal amount = payment.getAmount() != null ? payment.getAmount() : BigDecimal.ZERO;
                    return invoiceBalance.subtract(amount);
                })
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        long totalTransactions = scopedPayments.size();

        stats.put("todayReceived", todayReceived);
        stats.put("thisMonthReceived", monthReceived);
        stats.put("pendingAmount", pendingAmount);
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
        receiptVoucher.setAmount(payment.getAmount() != null ? payment.getAmount() : BigDecimal.ZERO);
        receiptVoucher.setPaymentMode(payment.getPaymentMode());
        receiptVoucher.setBankAccount(payment.getBankName());
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

        boolean isGeneralReceipt = linkedInvoice == null && linkedOpeningInvoice == null;

        ReceiptVoucher saved;
        if (payment.getReceiptVoucherRecordId() != null) {
            saved = receiptVoucherService.updateReceipt(payment.getReceiptVoucherRecordId(), receiptVoucher, null);
        } else {
            saved = receiptVoucherService.createReceipt(receiptVoucher, null);
        }

        // A general "Customer Receipt" (no specific invoice picked) is stored as an
        // ADVANCE_RECEIVED ReceiptVoucher. Left alone it would only get swept up the
        // next time an invoice happens to be saved — settle it against the customer's
        // existing outstanding invoices right away so Customer Statement / Dashboard
        // reflect the payment immediately, same as AdvanceBackfillService does for
        // historical data. Any amount left over stays as the customer's open advance.
        if (isGeneralReceipt && saved != null && receiptVoucherService.isCompletedStatus(saved.getStatus())
                && saved.getCustomerCode() != null && !saved.getCustomerCode().isBlank()) {
            advanceApplicationService.applyAgainstOutstandingInvoices(saved.getCustomerCode(), saved.getId());
        }

        return saved;
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
            case FAILED -> "Failed";
            case COMPLETED, PARTIAL -> "Completed";
        };
    }
}
