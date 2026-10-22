package com.billbull.backend.financials.cheque;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Request and response shapes for the Pay Cheques API (open-in-view is off, so no entities go out). */
public final class PayChequeDtos {

    private PayChequeDtos() {}

    public record ChequeBookRequest(
            String glAccountId,
            String bankName,
            String bankBranch,
            String accountName,
            String accountNumber,
            String iban,
            String currency,
            String nextChequeNumber,
            Long templateId) {}

    public record ChequeBookView(
            Long id,
            String glAccountId,
            String glAccountCode,
            String glAccountName,
            String bankName,
            String bankBranch,
            String accountName,
            String accountNumber,
            String iban,
            String currency,
            String nextChequeNumber,
            Long templateId,
            long openCheques) {}

    /** A payment waiting to be put on a cheque. {@code payeeKey} groups rows by vendor / payee. */
    public record PendingSource(
            PayChequeSourceType sourceType,
            Long sourceId,
            String sourceNumber,
            String payeeKey,
            String payeeName,
            String vendorId,
            LocalDate date,
            LocalDate chequeDate,
            BigDecimal amount,
            String reference,
            String bankCode,
            String bankLabel,
            String branchName,
            String notes,
            /** False when the payment already credited the bank when it was booked (pre-V120). */
            boolean postsGl) {}

    public record SourceRef(PayChequeSourceType sourceType, Long sourceId) {}

    public record ChequeRequest(
            PayChequeType paymentType,
            Long chequeBookId,
            String chequeNumber,
            LocalDate chequeDate,
            String payeeName,
            String memo,
            List<SourceRef> sources) {}

    /** Body for status actions. {@code date} is the paid / cleared date; {@code note} the reason or remark. */
    public record TransitionRequest(LocalDate date, String note) {}

    public record AllocationView(
            Long id,
            PayChequeSourceType sourceType,
            Long sourceId,
            String sourceNumber,
            String reference,
            BigDecimal amount,
            boolean active,
            boolean postsGl) {}

    public record EventView(String action, String note, String username, LocalDateTime at) {}

    public record ChequeView(
            Long id,
            String chequeNumber,
            ChequeBookView chequeBook,
            Long branchId,
            String branchName,
            PayChequeType paymentType,
            String payeeName,
            String vendorId,
            LocalDate chequeDate,
            BigDecimal amount,
            String memo,
            PayChequeStatus status,
            String createdBy,
            LocalDateTime createdAt,
            String approvedBy,
            LocalDateTime approvedAt,
            String printedBy,
            LocalDateTime printedAt,
            int printCount,
            String issuedBy,
            LocalDateTime issuedAt,
            String paidBy,
            LocalDate paidDate,
            String reconciledBy,
            LocalDate reconciledDate,
            String cancelledBy,
            LocalDateTime cancelledAt,
            String cancelReason,
            List<AllocationView> allocations,
            List<EventView> events) {}
}
