package com.billbull.backend.financials.cheque;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.cheque.PayChequeDtos.AllocationView;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeBookRequest;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeBookView;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeRequest;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeView;
import com.billbull.backend.financials.cheque.PayChequeDtos.EventView;
import com.billbull.backend.financials.cheque.PayChequeDtos.PendingSource;
import com.billbull.backend.financials.cheque.PayChequeDtos.SourceRef;
import com.billbull.backend.financials.cheque.PayChequeDtos.TransitionRequest;
import com.billbull.backend.financials.expense.Expense;
import com.billbull.backend.financials.expense.ExpenseRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.payment.PaymentMode;
import com.billbull.backend.purchase.payment.PaymentStatus;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherService;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService.ChequeIssueLine;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Outgoing cheques for vendor/purchase and expense payments.
 *
 * <p><b>Where a cheque's amount comes from.</b> A cheque is never typed in freehand: it carries
 * one or more allocations, each pointing at a payment that has already been booked — a CHEQUE-mode
 * payment voucher created from Vendors &amp; Purchases (Pay Invoices), or a Cheque-mode expense
 * marked Paid. A vendor's "cheque due" is the sum of those payments not yet on a live cheque, so
 * allotting AED 2,500 of a 5,000 balance by cheque in Pay Invoices shows exactly 2,500 here.
 *
 * <p><b>No GL posting.</b> The source payment already posted Dr AP (or Dr Expense) / Cr Bank, so
 * every status change below is bookkeeping on the instrument only. Cancelling a cheque releases
 * its allocations; the underlying payment stays booked and returns to the payee's cheque due for
 * a replacement cheque.
 */
@Service
public class PayChequeService {

    private static final Set<PayChequeStatus> OPEN_STATUSES = EnumSet.of(
            PayChequeStatus.DRAFT, PayChequeStatus.APPROVED, PayChequeStatus.PRINTED, PayChequeStatus.ISSUED);
    private static final Set<PayChequeStatus> CANCELLABLE = OPEN_STATUSES;
    /** A sentinel for "IN :branchIds" when the scope covers every branch; never an empty list. */
    private static final Set<Long> NO_BRANCHES = Set.of(-1L);
    private static final Pattern TRAILING_DIGITS = Pattern.compile("^(.*?)(\\d+)$");

    private final PayChequeRepository chequeRepository;
    private final ChequeBookRepository bookRepository;
    private final PayChequeAllocationRepository allocationRepository;
    private final PayChequeEventRepository eventRepository;
    private final PaymentVoucherRepository paymentVoucherRepository;
    private final ExpenseRepository expenseRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final AccountRepository accountRepository;
    private final BranchAccessService branchAccessService;
    private final PaymentVoucherService paymentVoucherService;
    private final PostingEngineService postingEngineService;
    private final JournalEntryRepository journalEntryRepository;

    public PayChequeService(PayChequeRepository chequeRepository,
                            ChequeBookRepository bookRepository,
                            PayChequeAllocationRepository allocationRepository,
                            PayChequeEventRepository eventRepository,
                            PaymentVoucherRepository paymentVoucherRepository,
                            ExpenseRepository expenseRepository,
                            PurchaseInvoiceRepository purchaseInvoiceRepository,
                            AccountRepository accountRepository,
                            BranchAccessService branchAccessService,
                            PaymentVoucherService paymentVoucherService,
                            PostingEngineService postingEngineService,
                            JournalEntryRepository journalEntryRepository) {
        this.paymentVoucherService = paymentVoucherService;
        this.postingEngineService = postingEngineService;
        this.journalEntryRepository = journalEntryRepository;
        this.chequeRepository = chequeRepository;
        this.bookRepository = bookRepository;
        this.allocationRepository = allocationRepository;
        this.eventRepository = eventRepository;
        this.paymentVoucherRepository = paymentVoucherRepository;
        this.expenseRepository = expenseRepository;
        this.purchaseInvoiceRepository = purchaseInvoiceRepository;
        this.accountRepository = accountRepository;
        this.branchAccessService = branchAccessService;
    }

    // =====================================================================
    // Cheque books
    // =====================================================================

    @Transactional(readOnly = true)
    public List<ChequeBookView> listBooks() {
        Map<Long, Long> openCounts = openCountsByBook();
        return bookRepository.findAllActive().stream()
                .map(b -> toBookView(b, openCounts.getOrDefault(b.getId(), 0L)))
                .toList();
    }

    @Transactional
    public ChequeBookView saveBook(Long id, ChequeBookRequest req) {
        ChequeBook book = id == null ? new ChequeBook()
                : bookRepository.findById(id).filter(ChequeBook::isActive)
                        .orElseThrow(() -> notFound("Cheque book " + id));
        if (isBlank(req.bankName())) throw badRequest("Bank name is required.");
        if (isBlank(req.glAccountId())) throw badRequest("Select the bank ledger account this cheque book draws on.");
        String next = trimToNull(req.nextChequeNumber());
        if (next == null || !TRAILING_DIGITS.matcher(next).matches()) {
            throw badRequest("Next cheque number must end in digits, e.g. 000147.");
        }

        Account gl = accountRepository.findById(req.glAccountId())
                .orElseThrow(() -> badRequest("Bank ledger account not found."));
        book.setGlAccountId(gl.getId());
        book.setGlAccountCode(gl.getCode());
        book.setGlAccountName(gl.getName());
        book.setBankName(req.bankName().trim());
        book.setBankBranch(trimToNull(req.bankBranch()));
        book.setAccountName(trimToNull(req.accountName()));
        book.setAccountNumber(trimToNull(req.accountNumber()));
        book.setIban(trimToNull(req.iban()));
        book.setCurrency(isBlank(req.currency()) ? "AED" : req.currency().trim().toUpperCase(Locale.ROOT));
        book.setNextChequeNumber(next);
        book.setTemplateId(req.templateId());
        ChequeBook saved = bookRepository.save(book);
        return toBookView(saved, openCountsByBook().getOrDefault(saved.getId(), 0L));
    }

    @Transactional
    public void deleteBook(Long id) {
        ChequeBook book = bookRepository.findById(id).orElseThrow(() -> notFound("Cheque book " + id));
        if (openCountsByBook().getOrDefault(id, 0L) > 0) {
            throw badRequest("This cheque book still has open cheques. Finish or cancel them first.");
        }
        book.setActive(false);
        bookRepository.save(book);
    }

    // =====================================================================
    // Pending payments (the cheque due)
    // =====================================================================

    @Transactional(readOnly = true)
    public List<PendingSource> listPending(PayChequeType type) {
        BranchAccessService.ListScope scope = branchAccessService.currentListScope();
        boolean all = scope.allBranches();
        Set<Long> ids = branchIds(scope);
        Map<String, String> bankLabels = new HashMap<>();
        if (type == PayChequeType.EXPENSE) {
            return allocationRepository.findPendingChequeExpenses(all, ids).stream()
                    .map(e -> toPending(e, bankLabels))
                    .toList();
        }
        List<PaymentVoucher> vouchers = allocationRepository.findPendingChequeVouchers(all, ids);
        Map<Long, String> invoiceNumbers = invoiceNumbers(vouchers);
        return vouchers.stream()
                .map(v -> toPending(v, invoiceNumbers, bankLabels))
                .toList();
    }

    // =====================================================================
    // Cheques
    // =====================================================================

    @Transactional(readOnly = true)
    public List<ChequeView> listCheques() {
        BranchAccessService.ListScope scope = branchAccessService.currentListScope();
        List<PayCheque> cheques = chequeRepository.findAllScoped(scope.allBranches(), branchIds(scope));
        if (cheques.isEmpty()) return List.of();
        Map<Long, List<PayChequeAllocation>> allocations = allocationRepository
                .findByPayChequeIdIn(cheques.stream().map(PayCheque::getId).toList()).stream()
                .collect(Collectors.groupingBy(PayChequeAllocation::getPayChequeId));
        Map<Long, Long> openCounts = openCountsByBook();
        return cheques.stream()
                .map(c -> toView(c, allocations.getOrDefault(c.getId(), List.of()), null, openCounts))
                .toList();
    }

    @Transactional(readOnly = true)
    public ChequeView getCheque(Long id) {
        return detail(load(id));
    }

    @Transactional
    public ChequeView create(ChequeRequest req) {
        if (req.paymentType() == null) throw badRequest("Payment type is required.");
        PayCheque cheque = new PayCheque();
        cheque.setPaymentType(req.paymentType());
        cheque.setStatus(PayChequeStatus.DRAFT);
        applyRequest(cheque, req);
        List<PayChequeAllocation> allocations = resolveSources(cheque, req);
        PayCheque saved = chequeRepository.save(cheque);
        saveAllocations(saved, allocations);
        logEvent(saved.getId(), "Cheque Created", "Draft for " + saved.getPayeeName());
        return detail(saved);
    }

    @Transactional
    public ChequeView update(Long id, ChequeRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "edit", PayChequeStatus.DRAFT);
        if (req.paymentType() != null && req.paymentType() != cheque.getPaymentType()) {
            throw badRequest("The payment type of a cheque cannot be changed. Cancel it and create a new one.");
        }
        // Release the draft's own allocations first so re-selecting the same payments does not
        // trip the one-live-cheque-per-payment index.
        List<PayChequeAllocation> previous = allocationRepository.findByPayChequeIdAndActiveTrue(id);
        allocationRepository.deleteAll(previous);
        allocationRepository.flush();
        applyRequest(cheque, req);
        List<PayChequeAllocation> allocations = resolveSources(cheque, req);
        PayCheque saved = chequeRepository.save(cheque);
        saveAllocations(saved, allocations);
        logEvent(id, "Edited", null);
        return detail(saved);
    }

    @Transactional
    public ChequeView approve(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "approve", PayChequeStatus.DRAFT);
        // The payments may have changed since the draft was saved (e.g. a voucher rejected).
        revalidateSources(cheque);
        cheque.setStatus(PayChequeStatus.APPROVED);
        cheque.setApprovedBy(currentUser());
        cheque.setApprovedAt(LocalDateTime.now());
        logEvent(id, "Approved", note(req));
        return detail(chequeRepository.save(cheque));
    }

    /** Records a print. The first print moves APPROVED → PRINTED; later ones are logged reprints. */
    @Transactional
    public ChequeView recordPrint(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "print", PayChequeStatus.APPROVED, PayChequeStatus.PRINTED);
        boolean reprint = cheque.getStatus() == PayChequeStatus.PRINTED;
        cheque.setStatus(PayChequeStatus.PRINTED);
        cheque.setPrintCount(cheque.getPrintCount() + 1);
        if (!reprint) {
            cheque.setPrintedBy(currentUser());
            cheque.setPrintedAt(LocalDateTime.now());
        }
        logEvent(id, reprint ? "Reprinted" : "Printed", note(req));
        return detail(chequeRepository.save(cheque));
    }

    @Transactional
    public ChequeView issue(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "issue", PayChequeStatus.PRINTED);
        LocalDate issueDate = req != null && req.date() != null ? req.date() : LocalDate.now();
        // The vendor is paid now: the vouchers become real payments against their invoices
        // (dated the issue date, so the vendor statement shows them here) and AP moves to 2150.
        List<ChequeIssueLine> lines = new ArrayList<>();
        for (PaymentVoucher v : deferredVouchers(id)) {
            paymentVoucherService.issueChequePayment(v.getId(), issueDate);
            lines.add(new ChequeIssueLine(voucherNumber(v), v.getAmount(), isVendorAdvance(v)));
        }
        if (!lines.isEmpty()) {
            postingEngineService.createJournalFromChequeIssue(id, cheque.getChequeNumber(), cheque.getPayeeName(),
                    issueDate, lines, cheque.getBranch());
        }
        cheque.setStatus(PayChequeStatus.ISSUED);
        cheque.setIssuedBy(currentUser());
        cheque.setIssuedAt(LocalDateTime.now());
        String issued = note(req) != null ? note(req) : "Handed over to " + cheque.getPayeeName();
        logEvent(id, "Issued", lines.isEmpty() ? issued
                : joinNote(issued, "Posted Dr Accounts Payable / Cr 2150 AP – Post-Dated Cheques"));
        return detail(chequeRepository.save(cheque));
    }

    @Transactional
    public ChequeView markPaid(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "mark as paid", PayChequeStatus.ISSUED);
        LocalDate paidDate = req != null && req.date() != null ? req.date() : LocalDate.now();
        BigDecimal ledgerAmount = allocationRepository.findByPayChequeIdAndActiveTrue(id).stream()
                .filter(PayChequeAllocation::isPostsGl)
                .map(PayChequeAllocation::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (ledgerAmount.signum() > 0) {
            ChequeBook book = cheque.getChequeBook();
            postingEngineService.createJournalFromChequePaid(id, cheque.getChequeNumber(), cheque.getPayeeName(),
                    paidDate, ledgerAmount, book.getGlAccountCode(), book.getGlAccountName(), cheque.getBranch());
        }
        cheque.setStatus(PayChequeStatus.PAID);
        cheque.setPaidBy(currentUser());
        cheque.setPaidDate(paidDate);
        logEvent(id, "Marked as Paid", joinNote("Paid on " + paidDate, ledgerAmount.signum() > 0
                ? joinNote("Posted Dr 2150 / Cr " + cheque.getChequeBook().getGlAccountCode() + " bank", note(req))
                : note(req)));
        return detail(chequeRepository.save(cheque));
    }

    @Transactional
    public ChequeView reconcile(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        requireStatus(cheque, "reconcile", PayChequeStatus.PAID);
        LocalDate clearedDate = req != null && req.date() != null ? req.date() : LocalDate.now();
        if (cheque.getPaidDate() != null && clearedDate.isBefore(cheque.getPaidDate())) {
            throw badRequest("The cleared date cannot be before the paid date (" + cheque.getPaidDate() + ").");
        }
        // Mark the bank line of the Paid journal as reconciled, as Bank Reconciliation would.
        String bankCode = cheque.getChequeBook().getGlAccountCode();
        journalEntryRepository.findByReference("CHQ-PAID-" + id).ifPresent(entry -> entry.getLines().stream()
                .filter(l -> bankCode != null && bankCode.equals(l.getAccountCode()))
                .forEach(l -> l.setReconciled(true)));
        cheque.setStatus(PayChequeStatus.RECONCILED);
        cheque.setReconciledBy(currentUser());
        cheque.setReconciledDate(clearedDate);
        logEvent(id, "Reconciled", joinNote("Cleared on " + clearedDate, note(req)));
        return detail(chequeRepository.save(cheque));
    }

    @Transactional
    public ChequeView cancel(Long id, TransitionRequest req) {
        PayCheque cheque = load(id);
        if (!CANCELLABLE.contains(cheque.getStatus())) {
            throw badRequest("A " + label(cheque.getStatus()) + " cheque cannot be cancelled.");
        }
        String reason = note(req);
        boolean leftTheOffice = cheque.getStatus() == PayChequeStatus.PRINTED
                || cheque.getStatus() == PayChequeStatus.ISSUED;
        if (leftTheOffice && reason == null) {
            throw badRequest("Give a reason for cancelling a printed or issued cheque.");
        }
        String glNote = null;
        if (cheque.getStatus() == PayChequeStatus.ISSUED) {
            // Undo the Issued posting: the vendor is owed again and the vouchers wait for a new cheque.
            List<ChequeIssueLine> lines = new ArrayList<>();
            for (PaymentVoucher v : deferredVouchers(id)) {
                paymentVoucherService.reverseChequePayment(v.getId());
                lines.add(new ChequeIssueLine(voucherNumber(v), v.getAmount(), isVendorAdvance(v)));
            }
            if (!lines.isEmpty()) {
                postingEngineService.reverseJournalFromChequeIssue(id, cheque.getChequeNumber(),
                        cheque.getPayeeName(), LocalDate.now(), lines, cheque.getBranch());
                glNote = "Reversed Dr 2150 / Cr Accounts Payable";
            }
        }
        cheque.setStatus(PayChequeStatus.CANCELLED);
        cheque.setCancelledBy(currentUser());
        cheque.setCancelledAt(LocalDateTime.now());
        cheque.setCancelReason(reason);
        List<PayChequeAllocation> live = allocationRepository.findByPayChequeIdAndActiveTrue(id);
        live.forEach(a -> a.setActive(false));
        allocationRepository.saveAll(live);
        logEvent(id, "Cancelled", joinNote(joinNote(reason, glNote), "Payments released back to the cheque due."));
        return detail(chequeRepository.save(cheque));
    }

    // =====================================================================
    // Request handling
    // =====================================================================

    private void applyRequest(PayCheque cheque, ChequeRequest req) {
        if (req.chequeBookId() == null) throw badRequest("Select the bank account (cheque book).");
        if (req.chequeDate() == null) throw badRequest("Cheque date is required.");
        if (isBlank(req.payeeName())) throw badRequest("Payee name is required.");
        if (req.sources() == null || req.sources().isEmpty()) {
            throw badRequest("Select at least one payment to put on the cheque.");
        }

        ChequeBook book = bookRepository.findByIdForUpdate(req.chequeBookId())
                .filter(ChequeBook::isActive)
                .orElseThrow(() -> badRequest("Cheque book not found."));
        boolean bookChanged = cheque.getChequeBook() == null
                || !Objects.equals(cheque.getChequeBook().getId(), book.getId());
        String number = trimToNull(req.chequeNumber());
        if (number == null) {
            number = bookChanged ? book.getNextChequeNumber() : cheque.getChequeNumber();
        }
        if (bookChanged || !Objects.equals(number, cheque.getChequeNumber())) {
            if (chequeRepository.existsLiveNumber(book.getId(), number, cheque.getId())) {
                throw badRequest("Cheque number " + number + " is already used in " + book.getBankName() + ".");
            }
            advanceBook(book, number);
        }

        cheque.setChequeBook(book);
        cheque.setChequeNumber(number);
        cheque.setChequeDate(req.chequeDate());
        cheque.setPayeeName(req.payeeName().trim());
        cheque.setMemo(trimToNull(req.memo()));
    }

    /** Loads and validates the requested payments, and stamps the cheque's amount, vendor and branch. */
    private List<PayChequeAllocation> resolveSources(PayCheque cheque, ChequeRequest req) {
        PayChequeSourceType expected = cheque.getPaymentType() == PayChequeType.VENDOR
                ? PayChequeSourceType.PAYMENT_VOUCHER : PayChequeSourceType.EXPENSE;
        Set<Long> ids = new HashSet<>();
        for (SourceRef ref : req.sources()) {
            if (ref == null || ref.sourceId() == null) throw badRequest("Invalid payment reference.");
            if (ref.sourceType() != null && ref.sourceType() != expected) {
                throw badRequest(cheque.getPaymentType() == PayChequeType.VENDOR
                        ? "A vendor cheque can only pay vendor payment vouchers."
                        : "An expense cheque can only pay expense entries.");
            }
            ids.add(ref.sourceId());
        }
        List<PayChequeAllocation> allocations = expected == PayChequeSourceType.PAYMENT_VOUCHER
                ? voucherAllocations(cheque, ids)
                : expenseAllocations(cheque, ids);

        Set<Long> taken = allocationRepository.findBySourceTypeAndSourceIdInAndActiveTrue(expected, ids).stream()
                .filter(a -> !Objects.equals(a.getPayChequeId(), cheque.getId()))
                .map(PayChequeAllocation::getSourceId)
                .collect(Collectors.toSet());
        for (PayChequeAllocation a : allocations) {
            if (taken.contains(a.getSourceId())) {
                throw badRequest(a.getSourceNumber() + " is already on another cheque.");
            }
        }
        cheque.setAmount(allocations.stream().map(PayChequeAllocation::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        if (cheque.getAmount().signum() <= 0) throw badRequest("Cheque amount must be greater than zero.");
        return allocations;
    }

    private List<PayChequeAllocation> voucherAllocations(PayCheque cheque, Set<Long> ids) {
        List<PaymentVoucher> vouchers = paymentVoucherRepository.findAllById(ids);
        if (vouchers.size() != ids.size()) throw badRequest("One or more payment vouchers were not found.");
        assertBranchesAccessible(vouchers, PaymentVoucher::getBranch);
        Map<Long, String> invoiceNumbers = invoiceNumbers(vouchers);
        String payeeKey = null;
        List<PayChequeAllocation> out = new ArrayList<>();
        for (PaymentVoucher v : vouchers) {
            String number = voucherNumber(v);
            assertVoucherPayable(v);
            String key = vendorKey(v.getVendorId(), v.getVendorName());
            if (payeeKey == null) {
                payeeKey = key;
                cheque.setVendorId(meaningfulVendorId(v.getVendorId()));
                cheque.setBranch(v.getBranch());
            } else if (!payeeKey.equals(key)) {
                throw badRequest("All payments on one cheque must be for the same vendor.");
            }
            assertSameBank(cheque.getChequeBook(), number, bankCodeFromText(v.getBankAccount()));
            PayChequeAllocation a = allocation(PayChequeSourceType.PAYMENT_VOUCHER, v.getId(), number,
                    invoiceNumbers.getOrDefault(v.getId(), v.getReferenceNumber()), v.getAmount());
            a.setPostsGl(v.getStatus() == PaymentStatus.CHEQUE_PENDING);
            out.add(a);
        }
        return out;
    }

    private List<PayChequeAllocation> expenseAllocations(PayCheque cheque, Set<Long> ids) {
        List<Expense> expenses = expenseRepository.findAllById(ids);
        if (expenses.size() != ids.size()) throw badRequest("One or more expenses were not found.");
        assertBranchesAccessible(expenses, Expense::getBranch);
        String payeeKey = null;
        List<PayChequeAllocation> out = new ArrayList<>();
        for (Expense e : expenses) {
            String number = expenseNumber(e);
            assertExpensePayable(e);
            String key = expenseKey(e.getVendor());
            if (payeeKey == null) {
                payeeKey = key;
                cheque.setVendorId(null);
                cheque.setBranch(e.getBranch());
            } else if (!payeeKey.equals(key)) {
                throw badRequest("All expenses on one cheque must be for the same payee.");
            }
            assertSameBank(cheque.getChequeBook(), number, bankCodeFromAccountId(e.getPaymentAccountId()));
            PayChequeAllocation a = allocation(PayChequeSourceType.EXPENSE, e.getId(), number,
                    expenseReference(e), expenseAmount(e));
            a.setPostsGl(expensePostsGlOnCheque(e));
            out.add(a);
        }
        return out;
    }

    private void revalidateSources(PayCheque cheque) {
        List<PayChequeAllocation> live = allocationRepository.findByPayChequeIdAndActiveTrue(cheque.getId());
        if (live.isEmpty()) throw badRequest("This cheque has no payments on it.");
        Set<Long> ids = live.stream().map(PayChequeAllocation::getSourceId).collect(Collectors.toSet());
        if (cheque.getPaymentType() == PayChequeType.VENDOR) {
            List<PaymentVoucher> vouchers = paymentVoucherRepository.findAllById(ids);
            if (vouchers.size() != ids.size()) throw badRequest("A payment voucher on this cheque no longer exists.");
            vouchers.forEach(this::assertVoucherPayable);
        } else {
            List<Expense> expenses = expenseRepository.findAllById(ids);
            if (expenses.size() != ids.size()) throw badRequest("An expense on this cheque no longer exists.");
            expenses.forEach(this::assertExpensePayable);
        }
    }

    /** The cheque's live vendor vouchers whose ledger movement belongs to the cheque. */
    private List<PaymentVoucher> deferredVouchers(Long chequeId) {
        Set<Long> ids = allocationRepository.findByPayChequeIdAndActiveTrue(chequeId).stream()
                .filter(a -> a.isPostsGl() && a.getSourceType() == PayChequeSourceType.PAYMENT_VOUCHER)
                .map(PayChequeAllocation::getSourceId)
                .collect(Collectors.toSet());
        return ids.isEmpty() ? List.of() : paymentVoucherRepository.findAllById(ids);
    }

    /** An LPO advance (no invoice) debits Vendor Advances, matching createJournalFromPaymentVoucher. */
    private static boolean isVendorAdvance(PaymentVoucher v) {
        return v.getLpoId() != null && v.getInvoiceId() == null;
    }

    /** A Cheque-mode expense posted under V120 credited 2150; older ones credited the bank directly. */
    private boolean expensePostsGlOnCheque(Expense e) {
        return postingEngineService.journalCreditsAccount(expenseNumber(e), PostingEngineService.ACC_AP_PDC);
    }

    private void assertVoucherPayable(PaymentVoucher v) {
        if (v.getPaymentMode() != PaymentMode.CHEQUE) {
            throw badRequest(voucherNumber(v) + " is not a cheque payment.");
        }
        if (v.getStatus() != PaymentStatus.CHEQUE_PENDING && v.getStatus() != PaymentStatus.POSTED) {
            throw badRequest(voucherNumber(v) + " is " + label(v.getStatus())
                    + "; only approved cheque payments can go on a cheque.");
        }
    }

    private void assertExpensePayable(Expense e) {
        if (!"cheque".equalsIgnoreCase(trimToEmpty(e.getPaymentMode()))) {
            throw badRequest(expenseNumber(e) + " is not paid by cheque.");
        }
        if (!"paid".equalsIgnoreCase(trimToEmpty(e.getStatus()))) {
            throw badRequest(expenseNumber(e) + " is not marked Paid yet.");
        }
    }

    /** The payment credited one bank ledger; the cheque must be drawn on that same account. */
    private void assertSameBank(ChequeBook book, String sourceNumber, String sourceBankCode) {
        if (book == null || isBlank(book.getGlAccountCode()) || isBlank(sourceBankCode)) return;
        if (!book.getGlAccountCode().equalsIgnoreCase(sourceBankCode)) {
            throw badRequest(sourceNumber + " was paid from ledger " + sourceBankCode + ", but "
                    + book.getBankName() + " draws on " + book.getGlAccountCode()
                    + ". Choose the matching bank account.");
        }
    }

    private <T> void assertBranchesAccessible(List<T> rows, Function<T, Branch> branchOf) {
        for (T row : rows) {
            Branch b = branchOf.apply(row);
            if (b != null) branchAccessService.assertTransactionBranchAccessible(b.getId(), "Payment");
        }
    }

    private void saveAllocations(PayCheque cheque, List<PayChequeAllocation> allocations) {
        allocations.forEach(a -> a.setPayChequeId(cheque.getId()));
        allocationRepository.saveAll(allocations);
    }

    private static PayChequeAllocation allocation(PayChequeSourceType type, Long id, String number,
                                                  String reference, BigDecimal amount) {
        PayChequeAllocation a = new PayChequeAllocation();
        a.setSourceType(type);
        a.setSourceId(id);
        a.setSourceNumber(number);
        a.setReference(truncate(reference, 255));
        a.setAmount(amount != null ? amount : BigDecimal.ZERO);
        a.setActive(true);
        return a;
    }

    // =====================================================================
    // Cheque numbering
    // =====================================================================

    /** Moves the book's next number past {@code used} when {@code used} is at or beyond it. */
    static void advanceBook(ChequeBook book, String used) {
        Matcher usedM = TRAILING_DIGITS.matcher(used);
        Matcher nextM = TRAILING_DIGITS.matcher(book.getNextChequeNumber() == null ? "" : book.getNextChequeNumber());
        if (!usedM.matches()) return; // free-form number typed by hand: leave the book alone
        if (nextM.matches() && nextM.group(1).equals(usedM.group(1))
                && new BigInteger(usedM.group(2)).compareTo(new BigInteger(nextM.group(2))) < 0) {
            return; // an earlier leaf (e.g. re-using a cancelled draft's number)
        }
        book.setNextChequeNumber(incrementNumber(used));
    }

    /** "000147" → "000148", "CHQ-0099" → "CHQ-0100"; width is kept, never shortened. */
    static String incrementNumber(String number) {
        Matcher m = TRAILING_DIGITS.matcher(number);
        if (!m.matches()) return number;
        String digits = m.group(2);
        String next = new BigInteger(digits).add(BigInteger.ONE).toString();
        if (next.length() < digits.length()) {
            next = "0".repeat(digits.length() - next.length()) + next;
        }
        return m.group(1) + next;
    }

    // =====================================================================
    // Mapping
    // =====================================================================

    private ChequeView detail(PayCheque cheque) {
        List<PayChequeAllocation> allocations = allocationRepository.findByPayChequeIdIn(List.of(cheque.getId()));
        List<EventView> events = eventRepository.findByPayChequeIdOrderByCreatedAtAscIdAsc(cheque.getId()).stream()
                .map(e -> new EventView(e.getAction(), e.getNote(), e.getUsername(), e.getCreatedAt()))
                .toList();
        return toView(cheque, allocations, events, openCountsByBook());
    }

    private ChequeView toView(PayCheque c, List<PayChequeAllocation> allocations, List<EventView> events,
                              Map<Long, Long> openCounts) {
        ChequeBook book = c.getChequeBook();
        Branch branch = c.getBranch();
        return new ChequeView(
                c.getId(), c.getChequeNumber(),
                book != null ? toBookView(book, openCounts.getOrDefault(book.getId(), 0L)) : null,
                branch != null ? branch.getId() : null,
                branch != null ? branch.getName() : null,
                c.getPaymentType(), c.getPayeeName(), c.getVendorId(), c.getChequeDate(), c.getAmount(),
                c.getMemo(), c.getStatus(), c.getCreatedBy(), c.getCreatedAt(),
                c.getApprovedBy(), c.getApprovedAt(), c.getPrintedBy(), c.getPrintedAt(), c.getPrintCount(),
                c.getIssuedBy(), c.getIssuedAt(), c.getPaidBy(), c.getPaidDate(),
                c.getReconciledBy(), c.getReconciledDate(),
                c.getCancelledBy(), c.getCancelledAt(), c.getCancelReason(),
                allocations.stream()
                        .map(a -> new AllocationView(a.getId(), a.getSourceType(), a.getSourceId(),
                                a.getSourceNumber(), a.getReference(), a.getAmount(), a.isActive(), a.isPostsGl()))
                        .toList(),
                events);
    }

    private static ChequeBookView toBookView(ChequeBook b, long openCheques) {
        return new ChequeBookView(b.getId(), b.getGlAccountId(), b.getGlAccountCode(), b.getGlAccountName(),
                b.getBankName(), b.getBankBranch(), b.getAccountName(), b.getAccountNumber(), b.getIban(),
                b.getCurrency(), b.getNextChequeNumber(), b.getTemplateId(), openCheques);
    }

    private PendingSource toPending(PaymentVoucher v, Map<Long, String> invoiceNumbers, Map<String, String> bankLabels) {
        String bankCode = bankCodeFromText(v.getBankAccount());
        return new PendingSource(
                PayChequeSourceType.PAYMENT_VOUCHER, v.getId(), voucherNumber(v),
                vendorKey(v.getVendorId(), v.getVendorName()), v.getVendorName(),
                meaningfulVendorId(v.getVendorId()),
                v.getPaymentDate(), v.getChequeDate(), v.getAmount(),
                invoiceNumbers.getOrDefault(v.getId(), v.getReferenceNumber()),
                bankCode, bankLabel(bankCode, v.getBankAccount(), bankLabels),
                v.getBranch() != null ? v.getBranch().getName() : null,
                v.getNotes(),
                v.getStatus() == PaymentStatus.CHEQUE_PENDING);
    }

    private PendingSource toPending(Expense e, Map<String, String> bankLabels) {
        String bankCode = bankCodeFromAccountId(e.getPaymentAccountId());
        return new PendingSource(
                PayChequeSourceType.EXPENSE, e.getId(), expenseNumber(e),
                expenseKey(e.getVendor()), trimToEmpty(e.getVendor()), null,
                e.getDate(), e.getDate(), expenseAmount(e), expenseReference(e),
                bankCode, bankLabel(bankCode, null, bankLabels),
                e.getBranch() != null ? e.getBranch().getName() : null,
                e.getNotes(),
                expensePostsGlOnCheque(e));
    }

    private Map<Long, String> invoiceNumbers(List<PaymentVoucher> vouchers) {
        Set<Long> invoiceIds = vouchers.stream().map(PaymentVoucher::getInvoiceId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (invoiceIds.isEmpty()) return Map.of();
        Map<Long, String> byInvoice = purchaseInvoiceRepository.findAllById(invoiceIds).stream()
                .filter(i -> i.getInvoiceNumber() != null)
                .collect(Collectors.toMap(PurchaseInvoice::getId, PurchaseInvoice::getInvoiceNumber, (a, b) -> a));
        Map<Long, String> out = new HashMap<>();
        for (PaymentVoucher v : vouchers) {
            String number = v.getInvoiceId() != null ? byInvoice.get(v.getInvoiceId()) : null;
            if (number == null && v.getInvoiceId() == null && v.getNotes() != null
                    && v.getNotes().startsWith("Opening Balance")) {
                number = "Opening Balance";
            }
            if (number != null) out.put(v.getId(), number);
        }
        return out;
    }

    /** Pay Invoices stores the bank as "1010" or "1010 — Bank Account (Main)"; resolve it to a ledger code. */
    private String bankCodeFromText(String text) {
        if (isBlank(text)) return null;
        String value = text.trim();
        String firstToken = value.split("\\s+", 2)[0].replaceAll("[^0-9A-Za-z]", "");
        Account account = firstToken.isBlank() ? null : accountRepository.findByCode(firstToken);
        if (account == null) account = accountRepository.findByName(value);
        return account != null ? account.getCode() : null;
    }

    private String bankCodeFromAccountId(String accountId) {
        if (isBlank(accountId)) return null;
        return accountRepository.findById(accountId).map(Account::getCode).orElse(null);
    }

    private String bankLabel(String code, String fallback, Map<String, String> cache) {
        if (code == null) return trimToNull(fallback);
        return cache.computeIfAbsent(code, c -> {
            Account a = accountRepository.findByCode(c);
            return a != null ? c + " — " + a.getName() : c;
        });
    }

    private Map<Long, Long> openCountsByBook() {
        Map<Long, Long> out = new LinkedHashMap<>();
        for (Object[] row : chequeRepository.countByBookAndStatusIn(OPEN_STATUSES)) {
            if (row[0] != null) out.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return out;
    }

    private PayCheque load(Long id) {
        PayCheque cheque = chequeRepository.findByIdWithBook(id)
                .filter(PayCheque::isActive)
                .orElseThrow(() -> notFound("Cheque " + id));
        if (cheque.getBranch() != null) {
            branchAccessService.assertTransactionBranchAccessible(cheque.getBranch().getId(), "Cheque");
        }
        return cheque;
    }

    private void requireStatus(PayCheque cheque, String action, PayChequeStatus... allowed) {
        for (PayChequeStatus s : allowed) {
            if (cheque.getStatus() == s) return;
        }
        throw badRequest("Cannot " + action + " a cheque that is " + label(cheque.getStatus()) + ".");
    }

    private void logEvent(Long chequeId, String action, String note) {
        PayChequeEvent event = new PayChequeEvent();
        event.setPayChequeId(chequeId);
        event.setAction(action);
        event.setNote(truncate(note, 500));
        event.setUsername(currentUser());
        event.setCreatedAt(LocalDateTime.now());
        eventRepository.save(event);
    }

    // =====================================================================
    // Small helpers
    // =====================================================================

    static String vendorKey(String vendorId, String vendorName) {
        String id = meaningfulVendorId(vendorId);
        return id != null ? "V:" + id.toLowerCase(Locale.ROOT) : "N:" + trimToEmpty(vendorName).toLowerCase(Locale.ROOT);
    }

    static String expenseKey(String vendor) {
        return "E:" + trimToEmpty(vendor).toLowerCase(Locale.ROOT);
    }

    /** Pay Invoices falls back to "VND-EXT" when a voucher has no vendor code; that is not an identity. */
    private static String meaningfulVendorId(String vendorId) {
        String id = trimToNull(vendorId);
        return id == null || "VND-EXT".equalsIgnoreCase(id) ? null : id;
    }

    private static String voucherNumber(PaymentVoucher v) {
        return v.getVoucherNumber() != null ? v.getVoucherNumber() : "PV-" + v.getId();
    }

    private static String expenseNumber(Expense e) {
        return "EXP-" + e.getId();
    }

    private static BigDecimal expenseAmount(Expense e) {
        if (e.getTotal() != null) return e.getTotal();
        return e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
    }

    private static String expenseReference(Expense e) {
        String category = trimToNull(e.getCategory());
        String notes = trimToNull(e.getNotes());
        if (category != null && notes != null) return category + " — " + notes;
        return category != null ? category : notes;
    }

    private static Set<Long> branchIds(BranchAccessService.ListScope scope) {
        Collection<Long> ids = scope.branchIds();
        return ids == null || ids.isEmpty() ? NO_BRANCHES : new HashSet<>(ids);
    }

    private static String note(TransitionRequest req) {
        return req == null ? null : trimToNull(req.note());
    }

    private static String joinNote(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a + " · " + b;
    }

    private static String label(Enum<?> status) {
        return status == null ? "unknown" : status.name().replace('_', ' ').toLowerCase(Locale.ROOT);
    }

    private static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getName() != null ? auth.getName() : "system";
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String trimToNull(String s) {
        return isBlank(s) ? null : s.trim();
    }

    private static String trimToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException notFound(String what) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, what + " not found.");
    }
}
