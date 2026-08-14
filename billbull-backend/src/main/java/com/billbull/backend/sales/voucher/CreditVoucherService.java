package com.billbull.backend.sales.voucher;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.Branch;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * The Credit Voucher lifecycle: issue, validate, redeem, cancel.
 *
 * <p>A voucher is store credit — a liability the business owes a customer — created when a Sales
 * Return is settled as {@code CREDIT_VOUCHER}. It is emphatically not a coupon: a coupon discounts
 * a sale, a voucher pays for one, and conflating them would understate both revenue and the
 * outstanding liability.
 *
 * <h3>Two invariants this class exists to protect</h3>
 * <ul>
 *   <li><b>One voucher per return.</b> Issuance is keyed on the source return number, which is
 *       unique in the database. A retried confirmation returns the voucher already issued rather
 *       than minting a second one.</li>
 *   <li><b>A voucher cannot be overspent.</b> Redemption takes a pessimistic write lock on the
 *       voucher row before reading its balance, so two terminals cannot both see the same balance
 *       and both spend it.</li>
 * </ul>
 *
 * <p>Every balance change writes a {@link CreditVoucherTransaction}. The balance on the voucher is
 * a materialised running total; the ledger is the record of how it got there.
 */
@Service
@Slf4j
public class CreditVoucherService {

    public static final String REF_TYPE_SALES_RETURN = "SALES_RETURN";
    public static final String REF_TYPE_SALES_INVOICE = "SALES_INVOICE";
    public static final String REF_TYPE_MANUAL = "MANUAL";

    @Autowired
    private CreditVoucherRepository voucherRepository;

    @Autowired
    private CreditVoucherTransactionRepository transactionRepository;

    @Autowired
    private CreditVoucherCodeGenerator codeGenerator;

    @Autowired
    private CreditVoucherPolicy policy;

    @Autowired
    private CreditVoucherExpiryResolver expiryResolver;

    @Autowired
    private PostingEngineService postingEngine;

    @Autowired
    private AuditLogService auditLogService;

    // =====================================================================
    // Issue
    // =====================================================================

    /**
     * Issues a voucher for a Sales Return, or returns the one already issued for it.
     *
     * <p>Runs inside the caller's transaction so the voucher, its ISSUED ledger entry, the GL
     * posting and the return's own approval all commit together. A failure here rolls the whole
     * approval back — the alternative is a return marked "refunded by voucher" pointing at a
     * voucher that does not exist.
     *
     * @param returnId       id of the approved Sales Return
     * @param returnNumber   its document number; the idempotency key
     * @param invoiceNumber  the original invoice, carried onto the voucher for traceability
     * @param amount         face value
     */
    @Transactional
    public CreditVoucher issueForSalesReturn(Long returnId,
                                             String returnNumber,
                                             String invoiceNumber,
                                             BigDecimal amount,
                                             String customerCode,
                                             String customerName,
                                             String customerMobile,
                                             Branch branch) {

        if (returnNumber == null || returnNumber.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A credit voucher cannot be issued without a Sales Return reference.");
        }
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A credit voucher cannot be issued for a non-positive amount (" + amount + ").");
        }
        if (policy.getMinimumAmount() != null
                && policy.getMinimumAmount().compareTo(BigDecimal.ZERO) > 0
                && amount.compareTo(policy.getMinimumAmount()) < 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "A credit voucher requires a minimum of " + policy.getMinimumAmount()
                            + "; this return is " + amount + ". Choose another refund method.");
        }

        // Idempotency: one return, one voucher. A retry lands here and gets the original back.
        Optional<CreditVoucher> existing = voucherRepository.findBySourceReturnNumber(returnNumber);
        if (existing.isPresent()) {
            log.info("[CreditVoucher] {} already has voucher {}; returning it rather than issuing another.",
                    returnNumber, existing.get().getVoucherNumber());
            return existing.get();
        }

        LocalDate issueDate = LocalDate.now();

        CreditVoucher voucher = new CreditVoucher();
        voucher.setVoucherNumber(codeGenerator.generateVoucherNumber());
        voucher.setVoucherCode(codeGenerator.generateVoucherCode());
        voucher.setBarcodeValue(codeGenerator.buildBarcodeValue(voucher.getVoucherCode()));

        voucher.setCustomerCode(customerCode);
        voucher.setCustomerName(customerName);
        voucher.setCustomerMobile(customerMobile);
        voucher.setBranch(branch);

        voucher.setOriginalAmount(amount);
        voucher.setUsedAmount(BigDecimal.ZERO);
        voucher.setRemainingAmount(amount);

        voucher.setIssueDate(issueDate);
        // §15 — the branch's configured policy (automatic window or fixed date), resolved and
        // validated here. Nothing about expiry is accepted from the caller.
        voucher.setExpiryDate(expiryResolver.resolveExpiryDate(branch, issueDate));
        voucher.setStatus(CreditVoucherStatus.ACTIVE);

        voucher.setSourceReturnId(returnId);
        voucher.setSourceReturnNumber(returnNumber);
        voucher.setSourceInvoiceNumber(invoiceNumber);

        CreditVoucher saved = voucherRepository.save(voucher);

        recordTransaction(saved, CreditVoucherTransactionType.ISSUED, amount,
                BigDecimal.ZERO, amount,
                REF_TYPE_SALES_RETURN, returnNumber, returnId,
                branch != null ? branch.getId() : null, null, null, issueDate,
                "Issued by Sales Return " + returnNumber);

        // Dr Accounts Receivable / Cr Credit Vouchers Issued — clears the credit the return left
        // on AR and recognises the store-credit liability in its place.
        postingEngine.createJournalFromCreditVoucherIssue(
                saved.getId(), saved.getVoucherNumber(), amount, issueDate, branch);

        auditLogService.logDomainEvent("CREDIT_VOUCHER", saved.getVoucherNumber(), "VOUCHER_ISSUED",
                String.format("Voucher %s issued for %s from return %s (invoice %s), customer %s, expires %s.",
                        saved.getVoucherNumber(), amount, returnNumber, invoiceNumber,
                        customerName != null ? customerName : "walk-in", saved.getExpiryDate()));

        log.info("[CreditVoucher] Issued {} ({}), amount {}, expires {}, from return {}.",
                saved.getVoucherNumber(), saved.getVoucherCode(), amount, saved.getExpiryDate(), returnNumber);

        return saved;
    }

    // =====================================================================
    // Validate
    // =====================================================================

    /**
     * Resolves a scanned or typed token to a voucher, without changing anything.
     *
     * <p>Deliberately returns the same "not found" message for an unknown code and a malformed
     * one, so the endpoint cannot be used to probe which codes exist.
     */
    @Transactional(readOnly = true)
    public CreditVoucher findByToken(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter or scan a voucher code.");
        }
        String raw = token.trim();
        String normalised = CreditVoucherCodeGenerator.normalise(raw);

        // Try the token as given (grouped code), then normalised (barcode payload / no separators).
        return voucherRepository.findByCodeOrBarcode(raw)
                .or(() -> voucherRepository.findByCodeOrBarcode(normalised))
                .or(() -> voucherRepository.findByVoucherNumber(raw))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No voucher found for that code."));
    }

    /** Full detail for the POS lookup panel, including why it may not be redeemable. */
    @Transactional(readOnly = true)
    public CreditVoucherResponse validate(String token) {
        return CreditVoucherResponse.from(findByToken(token));
    }

    /**
     * Every eligibility rule, in the order a cashier would meet them.
     *
     * <p>Expiry is evaluated against the current date rather than the stored status, so a voucher
     * that lapsed since the last sweep is still correctly refused (§30).
     */
    private void assertRedeemable(CreditVoucher voucher, Long redeemingBranchId) {
        if (voucher.getStatus() == CreditVoucherStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Voucher " + voucher.getVoucherNumber() + " has been cancelled and cannot be used.");
        }
        if (voucher.isExpiredOn(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Voucher " + voucher.getVoucherNumber() + " expired on " + voucher.getExpiryDate() + ".");
        }
        if (voucher.getRemainingAmount() == null
                || voucher.getRemainingAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Voucher " + voucher.getVoucherNumber() + " has no remaining balance.");
        }
        if (voucher.getStatus() != null && !voucher.getStatus().isRedeemable()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Voucher " + voucher.getVoucherNumber() + " is "
                            + voucher.getStatus().name().toLowerCase().replace('_', ' ') + ".");
        }
        if (policy.isBranchRestricted()
                && voucher.getBranch() != null
                && redeemingBranchId != null
                && !voucher.getBranch().getId().equals(redeemingBranchId)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Voucher " + voucher.getVoucherNumber() + " can only be redeemed at "
                            + voucher.getBranch().getName() + ".");
        }
    }

    // =====================================================================
    // Redeem
    // =====================================================================

    /**
     * Draws {@code requestedAmount} off a voucher against a sale.
     *
     * <p>Takes a write lock on the voucher row <em>before</em> reading its balance. That ordering
     * is the whole defence against double-spending: two terminals redeeming the same voucher
     * serialise here, and the second sees the already-decremented balance.
     *
     * <p>Rejects an over-redemption rather than silently capping it. The caller is expected to have
     * asked for at most {@code min(saleBalance, voucherBalance)}; if it asked for more, the cashier
     * has stale information and must be told, not quietly given less than the receipt will claim.
     *
     * @return the redemption ledger entry
     */
    @Transactional
    public CreditVoucherTransaction redeem(Long voucherId,
                                           BigDecimal requestedAmount,
                                           String invoiceNumber,
                                           Long invoiceId,
                                           Long branchId,
                                           String terminalId,
                                           Long posSessionId,
                                           LocalDate businessDate,
                                           Branch branchEntity) {

        if (requestedAmount == null || requestedAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Voucher redemption amount must be greater than zero.");
        }

        CreditVoucher voucher = voucherRepository.findByIdForUpdate(voucherId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Voucher not found: " + voucherId));

        // Re-check eligibility under the lock — the state read during the earlier lookup is stale.
        assertRedeemable(voucher, branchId);

        // Idempotency: a retried checkout for the same invoice must not draw the voucher twice.
        if (invoiceNumber != null && !invoiceNumber.isBlank()) {
            List<CreditVoucherTransaction> already = transactionRepository
                    .findByReferenceTypeAndReferenceNumberAndTransactionType(
                            REF_TYPE_SALES_INVOICE, invoiceNumber, CreditVoucherTransactionType.REDEEMED)
                    .stream()
                    .filter(t -> t.getVoucher() != null && voucherId.equals(t.getVoucher().getId()))
                    .toList();
            if (!already.isEmpty()) {
                log.info("[CreditVoucher] {} already redeemed against invoice {}; returning the existing entry.",
                        voucher.getVoucherNumber(), invoiceNumber);
                return already.get(0);
            }
        }

        BigDecimal balanceBefore = voucher.getRemainingAmount();
        if (requestedAmount.compareTo(balanceBefore) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Voucher " + voucher.getVoucherNumber() + " has only " + balanceBefore
                            + " remaining, but " + requestedAmount + " was requested. "
                            + "The balance may have changed since it was checked — re-scan the voucher.");
        }

        voucher.redeem(requestedAmount);
        CreditVoucher saved = voucherRepository.save(voucher);

        CreditVoucherTransaction txn = recordTransaction(saved, CreditVoucherTransactionType.REDEEMED,
                requestedAmount, balanceBefore, saved.getRemainingAmount(),
                REF_TYPE_SALES_INVOICE, invoiceNumber, invoiceId,
                branchId, terminalId, posSessionId,
                businessDate != null ? businessDate : LocalDate.now(),
                "Redeemed against sale " + invoiceNumber);

        // Dr Credit Vouchers Issued / Cr Accounts Receivable — draws down the liability created
        // at issue to settle the AR this sale raised.
        postingEngine.createJournalFromCreditVoucherRedemption(
                saved.getId(), saved.getVoucherNumber(), invoiceNumber, requestedAmount,
                businessDate != null ? businessDate : LocalDate.now(), branchEntity);

        auditLogService.logDomainEvent("CREDIT_VOUCHER", saved.getVoucherNumber(), "VOUCHER_REDEEMED",
                String.format("Redeemed %s against %s. Balance %s -> %s. Status %s. Terminal %s, session %s.",
                        requestedAmount, invoiceNumber, balanceBefore, saved.getRemainingAmount(),
                        saved.getStatus(), terminalId, posSessionId));

        log.info("[CreditVoucher] {} redeemed {} on {} — balance {} -> {} ({}).",
                saved.getVoucherNumber(), requestedAmount, invoiceNumber,
                balanceBefore, saved.getRemainingAmount(), saved.getStatus());

        return txn;
    }

    // =====================================================================
    // Cancel
    // =====================================================================

    /**
     * Withdraws a voucher, releasing any unredeemed balance.
     *
     * <p>The row is kept and its history preserved — a voucher is a financial instrument and is
     * never physically deleted (§29). Already-redeemed value is untouched; only the remainder is
     * released.
     */
    @Transactional
    public CreditVoucher cancel(Long voucherId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason is required to cancel a voucher.");
        }

        CreditVoucher voucher = voucherRepository.findByIdForUpdate(voucherId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Voucher not found: " + voucherId));

        if (voucher.getStatus() == CreditVoucherStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Voucher " + voucher.getVoucherNumber() + " is already cancelled.");
        }
        if (voucher.getStatus() == CreditVoucherStatus.FULLY_REDEEMED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Voucher " + voucher.getVoucherNumber() + " has been fully redeemed and cannot be cancelled.");
        }

        BigDecimal releasedBalance = voucher.getRemainingAmount();

        voucher.setStatus(CreditVoucherStatus.CANCELLED);
        voucher.setCancelledReason(reason);
        voucher.setCancelledBy(currentUser());
        voucher.setCancelledAt(java.time.LocalDateTime.now());
        voucher.setRemainingAmount(BigDecimal.ZERO);
        CreditVoucher saved = voucherRepository.save(voucher);

        recordTransaction(saved, CreditVoucherTransactionType.CANCELLED, releasedBalance,
                releasedBalance, BigDecimal.ZERO,
                REF_TYPE_MANUAL, saved.getVoucherNumber(), saved.getId(),
                saved.getBranch() != null ? saved.getBranch().getId() : null,
                null, null, LocalDate.now(), reason);

        postingEngine.createJournalFromCreditVoucherCancellation(
                saved.getId(), saved.getVoucherNumber(), releasedBalance, LocalDate.now(), saved.getBranch());

        auditLogService.logDomainEvent("CREDIT_VOUCHER", saved.getVoucherNumber(), "VOUCHER_CANCELLED",
                String.format("Cancelled by %s. Released balance %s. Reason: %s",
                        currentUser(), releasedBalance, reason));

        return saved;
    }

    // =====================================================================
    // Reads
    // =====================================================================

    @Transactional(readOnly = true)
    public List<CreditVoucherTransaction> getHistory(Long voucherId) {
        return transactionRepository.findByVoucher_IdOrderByIdAsc(voucherId);
    }

    @Transactional(readOnly = true)
    public Optional<CreditVoucher> findBySalesReturnNumber(String returnNumber) {
        return returnNumber == null ? Optional.empty()
                : voucherRepository.findBySourceReturnNumber(returnNumber);
    }

    /**
     * Brings lapsed vouchers' status into line with their expiry date.
     *
     * <p>Purely cosmetic for reporting — {@link #assertRedeemable} already refuses an expired
     * voucher whether or not this has run, so redemption correctness never depends on it.
     */
    @Transactional
    public int sweepExpiredStatuses() {
        List<CreditVoucher> lapsed = voucherRepository.findLapsedNeedingStatusSweep(LocalDate.now());
        for (CreditVoucher v : lapsed) {
            v.setStatus(CreditVoucherStatus.EXPIRED);
        }
        if (!lapsed.isEmpty()) {
            voucherRepository.saveAll(lapsed);
            log.info("[CreditVoucher] Marked {} lapsed voucher(s) EXPIRED.", lapsed.size());
        }
        return lapsed.size();
    }

    // =====================================================================

    private CreditVoucherTransaction recordTransaction(CreditVoucher voucher,
                                                       CreditVoucherTransactionType type,
                                                       BigDecimal amount,
                                                       BigDecimal balanceBefore,
                                                       BigDecimal balanceAfter,
                                                       String referenceType,
                                                       String referenceNumber,
                                                       Long referenceId,
                                                       Long branchId,
                                                       String terminalId,
                                                       Long posSessionId,
                                                       LocalDate businessDate,
                                                       String notes) {
        CreditVoucherTransaction txn = new CreditVoucherTransaction();
        txn.setVoucher(voucher);
        txn.setTransactionType(type);
        txn.setAmount(amount);
        txn.setBalanceBefore(balanceBefore);
        txn.setBalanceAfter(balanceAfter);
        txn.setReferenceType(referenceType);
        txn.setReferenceNumber(referenceNumber);
        txn.setReferenceId(referenceId);
        txn.setPerformedBy(currentUser());
        txn.setBranchId(branchId);
        txn.setPosTerminalId(terminalId);
        txn.setPosSessionId(posSessionId);
        txn.setBusinessDate(businessDate);
        txn.setNotes(notes);
        return transactionRepository.save(txn);
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
