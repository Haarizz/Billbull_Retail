package com.billbull.backend.purchase.payment;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.invoice.InvoicePayment;
import com.billbull.backend.purchase.invoice.InvoiceStatus;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
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
import org.hibernate.Hibernate;

@Service
public class PaymentVoucherService {

    @Autowired
    private PaymentVoucherRepository repository;

    @Autowired
    private PurchaseInvoiceRepository invoiceRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    @Autowired
    private BranchAccessService branchAccessService;

    @Autowired
    private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;

    @Autowired
    private com.billbull.backend.purchase.settings.PurchaseDocumentNumberingService documentNumberingService;

    @Autowired
    private com.billbull.backend.financials.cheque.PayChequeAllocationRepository chequeAllocationRepository;

    public List<PaymentVoucher> getAllVouchers() {
        List<PaymentVoucher> vouchers = new ArrayList<>(
                ownershipAccessService.filterOwned(
                        branchAccessService.filterBranchScopedByBranch(repository.findAll(), PaymentVoucher::getBranch),
                        PaymentVoucher::getCreatedByUserId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                vouchers,
                PaymentVoucher::getPaymentDate,
                PaymentVoucher::getVoucherNumber,
                PaymentVoucher::getId);
        return vouchers;
    }

    /**
     * True database-level paginated voucher list. Branch scope, status filter,
     * search and ordering are pushed into SQL so only one page is loaded.
     */
    public com.billbull.backend.util.PageResponse<PaymentVoucher> listPage(
            List<PaymentStatus> statuses, String search, int page, int size) {
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(1, Math.min(size, com.billbull.backend.util.PaginationUtil.MAX_PAGE_SIZE));
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(java.util.Locale.ROOT);

        BranchAccessService.ListScope scope = branchAccessService.currentListScope();
        ownershipAccessService.enableOwnerFilter(entityManager); // AND ownership onto the paged query
        boolean allStatuses = statuses == null || statuses.isEmpty();
        // Never pass an empty IN () list — supply a harmless sentinel when skipping.
        List<PaymentStatus> statusFilter = allStatuses ? List.of(PaymentStatus.PENDING_APPROVAL) : statuses;

        org.springframework.data.domain.Page<PaymentVoucher> pg = repository.searchPage(
                scope.allBranches(), scope.branchIds(), allStatuses, statusFilter, normalizedSearch,
                org.springframework.data.domain.PageRequest.of(normalizedPage, normalizedSize));

        return new com.billbull.backend.util.PageResponse<>(
                pg.getContent(), normalizedPage, normalizedSize, pg.getTotalElements(), pg.getTotalPages());
    }

    /**
     * Branch-scoped payment stats for the dashboard cards: total paid plus
     * per-mode totals across POSTED/CLEARED vouchers. Replaces the old
     * client-side reduction over the entire voucher list.
     */
    public java.util.Map<String, BigDecimal> statsByMode() {
        BranchAccessService.ListScope scope = branchAccessService.currentListScope();
        ownershipAccessService.enableOwnerFilter(entityManager); // AND ownership onto the scoped sum
        java.util.Map<String, BigDecimal> stats = new java.util.HashMap<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Object[] row : repository.sumPostedByModeScoped(scope.allBranches(), scope.branchIds())) {
            if (row[0] == null) continue;
            String mode = ((PaymentMode) row[0]).name();
            BigDecimal amount = row[1] != null ? new BigDecimal(row[1].toString()) : BigDecimal.ZERO;
            stats.merge(mode, amount, BigDecimal::add);
            total = total.add(amount);
        }
        stats.put("TOTAL", total);
        return stats;
    }

    public Optional<PaymentVoucher> getVoucherById(Long id) {
        Optional<PaymentVoucher> voucher = repository.findById(id);
        voucher.ifPresent(v -> ownershipAccessService.assertCanAccessRecord(v.getCreatedByUserId(), "Payment Voucher"));
        return voucher;
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
        return createVoucher(voucher, null);
    }

    /**
     * @param branchOverride the branch the voucher belongs to when the caller already knows it
     *        from the source document. An LPO advance belongs to the branch that raised the LPO,
     *        not to whichever branch the person recording it happens to be viewing, and the two
     *        differ for any user who can see more than one branch. Null keeps the existing
     *        behaviour (the current user's branch), which is what every screen-driven creation
     *        wants and what the single-argument overload above still does.
     */
    @Transactional
    public PaymentVoucher createVoucher(PaymentVoucher voucher, Branch branchOverride) {
        voucher.setBranch(branchOverride != null
                ? branchOverride
                : branchAccessService.getRequiredCurrentUserBranch());
        voucher.setStatus(PaymentStatus.PENDING_APPROVAL);
        voucher.setUnallocated(voucher.getAmount());
        voucher.setVoucherNumber(documentNumberingService.resolveNumberForCreate(
                com.billbull.backend.purchase.settings.PurchaseDocumentType.PAYMENT_VOUCHER,
                voucher.getVoucherNumber()));

        PaymentVoucher result = repository.save(voucher);
        Hibernate.initialize(result.getBranch());
        return result;
    }

    @Transactional
    public PaymentVoucher updateStatus(Long id, PaymentStatus status) {
        PaymentVoucher voucher = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Voucher not found with ID: " + id));
        ownershipAccessService.assertCanAccessRecord(voucher.getCreatedByUserId(), "Payment Voucher");

        // Prevent double posting
        if (voucher.getStatus() == PaymentStatus.POSTED && status == PaymentStatus.POSTED) {
            return voucher;
        }

        // A cheque payment is only allotted here. The money moves when its cheque is issued and
        // paid in Financials → Pay Cheques, which is the only path from CHEQUE_PENDING to POSTED.
        if (voucher.getStatus() == PaymentStatus.CHEQUE_PENDING) {
            if (status == PaymentStatus.CHEQUE_PENDING) return voucher;
            if (status != PaymentStatus.REJECTED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This cheque payment is posted when its cheque is issued in Financials → Pay Cheques.");
            }
            if (!chequeAllocationRepository.findBySourceTypeAndSourceIdInAndActiveTrue(
                    com.billbull.backend.financials.cheque.PayChequeSourceType.PAYMENT_VOUCHER,
                    java.util.List.of(voucher.getId())).isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This payment is on a cheque. Cancel the cheque in Pay Cheques first.");
            }
        }
        if (status == PaymentStatus.POSTED && voucher.getPaymentMode() == PaymentMode.CHEQUE) {
            reserveChequePayment(voucher);
            PaymentVoucher reserved = repository.save(voucher);
            Hibernate.initialize(reserved.getBranch());
            return reserved;
        }

        voucher.setStatus(status);

        if (status == PaymentStatus.POSTED) {
            if (voucher.getInvoiceId() != null) {
                applyPaymentToInvoice(voucher);
            }
            postingEngineService.createJournalFromPaymentVoucher(voucher, voucher.getVendorName());
        }

        PaymentVoucher result = repository.save(voucher);
        Hibernate.initialize(result.getBranch());
        return result;
    }

    public BigDecimal getReservedChequeAmountForInvoice(Long invoiceId, Long excludeVoucherId) {
        if (invoiceId == null) return BigDecimal.ZERO;
        BigDecimal reserved = repository.sumReservedChequeAmountByInvoiceId(invoiceId, excludeVoucherId);
        return reserved != null ? reserved : BigDecimal.ZERO;
    }

    /**
     * Approving a CHEQUE-mode voucher reserves its invoice instead of paying it: same checks as a
     * real payment, counting other unissued cheque allotments as taken, but no invoice payment
     * row and no journal. {@link #issueChequePayment} completes it.
     */
    private void reserveChequePayment(PaymentVoucher voucher) {
        if (voucher.getAmount() == null || voucher.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Payment voucher amount must be greater than zero.");
        }
        if (voucher.getInvoiceId() != null) {
            PurchaseInvoice invoice = invoiceRepository.findById(voucher.getInvoiceId())
                    .orElseThrow(() -> new RuntimeException("Purchase Invoice not found"));
            if (invoice.getStatus() != InvoiceStatus.POSTED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Only POSTED purchase invoices can receive payments.");
            }
            BigDecimal paid = getPostedAmountForInvoice(invoice.getId(), voucher.getId());
            if (paid.compareTo(BigDecimal.ZERO) <= 0) paid = sumInvoicePayments(invoice);
            BigDecimal reserved = getReservedChequeAmountForInvoice(invoice.getId(), voucher.getId());
            BigDecimal total = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
            BigDecimal available = total.subtract(paid).subtract(reserved);
            if (voucher.getAmount().compareTo(available) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, available.signum() <= 0
                        ? "This purchase invoice is already fully paid or allotted to a cheque."
                        : "Payment exceeds the invoice balance not yet allotted to a cheque (" + available + ").");
            }
        }
        voucher.setStatus(PaymentStatus.CHEQUE_PENDING);
    }

    /**
     * Called by Pay Cheques when the cheque carrying this voucher is issued: the payment is now
     * real, dated the issue date, and applied to its invoice. The journal (Dr AP / Cr 2150) is
     * posted by the caller for the whole cheque, so none is posted here.
     */
    @Transactional
    public PaymentVoucher issueChequePayment(Long voucherId, java.time.LocalDate issueDate) {
        PaymentVoucher voucher = repository.findById(voucherId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment voucher not found"));
        if (voucher.getStatus() != PaymentStatus.CHEQUE_PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    voucher.getVoucherNumber() + " is not waiting for a cheque.");
        }
        voucher.setPaymentDate(issueDate);
        if (voucher.getInvoiceId() != null) {
            applyPaymentToInvoice(voucher);
        } else {
            voucher.setAllocated(voucher.getAmount());
            voucher.setUnallocated(BigDecimal.ZERO);
        }
        voucher.setStatus(PaymentStatus.POSTED);
        return repository.save(voucher);
    }

    /** Undoes {@link #issueChequePayment} when an issued cheque is cancelled. */
    @Transactional
    public PaymentVoucher reverseChequePayment(Long voucherId) {
        PaymentVoucher voucher = repository.findById(voucherId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment voucher not found"));
        if (voucher.getStatus() != PaymentStatus.POSTED || voucher.getPaymentMode() != PaymentMode.CHEQUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    voucher.getVoucherNumber() + " is not an issued cheque payment.");
        }
        if (voucher.getInvoiceId() != null) {
            invoiceRepository.findById(voucher.getInvoiceId()).ifPresent(invoice -> {
                invoice.getPayments().removeIf(p -> voucher.getId().equals(p.getPaymentVoucherId()));
                updateInvoicePaymentStatus(invoice, getPostedAmountForInvoice(invoice.getId(), voucher.getId()));
                invoiceRepository.save(invoice);
            });
        }
        voucher.setAllocated(BigDecimal.ZERO);
        voucher.setUnallocated(voucher.getAmount());
        voucher.setStatus(PaymentStatus.CHEQUE_PENDING);
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
        payment.setPaymentVoucherId(voucher.getId());

        invoice.getPayments().add(payment);

        // 2. Calculate Total Paid So Far
        BigDecimal totalPaid = alreadyPaid.add(voucher.getAmount());

        // 3. Update Invoice Payment Status (Using Invoice Module's Enum)
        updateInvoicePaymentStatus(invoice, totalPaid);

        // 4. Update Voucher Allocation
        voucher.setAllocated(voucher.getAmount());
        voucher.setUnallocated(BigDecimal.ZERO);

        invoiceRepository.save(invoice);
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
