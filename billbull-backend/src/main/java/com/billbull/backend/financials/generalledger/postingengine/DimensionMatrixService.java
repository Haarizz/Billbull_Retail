package com.billbull.backend.financials.generalledger.postingengine;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalLine;

/**
 * Validates the analytical dimensions (branch / outlet / cost center) carried by
 * journal lines against the rules in PDF §4.
 *
 * <p><b>Warn-only mode (Phase 1).</b> Existing system postings do not yet set a
 * branch on every line, and the Outlet dimension does not exist until Phase 2.
 * Hard rejection now would break live posting, so violations are <em>logged</em>
 * rather than thrown. The hooks ({@link #validate}) are wired into the posting
 * gateway so flipping to enforcement later is a one-line change to
 * {@link #ENFORCE}.
 *
 * <p>As a side effect, {@link #validate} backfills a line's branch from the
 * entry header when the line itself has none — incrementally populating the new
 * {@code journal_lines.branch_id} column on every fresh posting.
 */
@Service
@Slf4j
public class DimensionMatrixService {

    /** Flip to {@code true} once all flows pass branch/outlet to enforce hard rejection. */
    private static final boolean ENFORCE = false;

    private final AccountRepository accountRepository;

    public DimensionMatrixService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    /**
     * Checks every line's dimensions. In warn-only mode logs a warning per
     * violation; in enforce mode throws {@link PostingException} with
     * {@link PostingErrorCode#MISSING_DIMENSION} on the first violation.
     */
    public void validate(JournalEntry entry) {
        if (entry == null || entry.getLines() == null) {
            return;
        }

        for (JournalLine line : entry.getLines()) {
            // Backfill branch from header so the new line-level column is populated.
            if (line.getBranch() == null && entry.getBranch() != null) {
                line.setBranch(entry.getBranch());
            }

            boolean hasBranch = line.getBranch() != null || entry.getBranch() != null;
            if (!hasBranch) {
                flag(entry, line, "branch");
            }

            Account account = line.getAccountCode() == null ? null
                    : accountRepository.findByCode(line.getAccountCode());
            if (account != null) {
                if (Boolean.TRUE.equals(account.getCostCenterRequired()) && isBlank(line.getCostCenter())) {
                    flag(entry, line, "cost center");
                }
                if (Boolean.TRUE.equals(account.getOutletRequired())) {
                    // Outlet dimension lands in Phase 2 — warn-only regardless of ENFORCE.
                    log.warn("[DimensionMatrix] Entry {} line account {} requires an outlet dimension "
                            + "(not yet captured — Phase 2).", entry.getReference(), line.getAccountCode());
                }
            }
        }
    }

    private void flag(JournalEntry entry, JournalLine line, String dimension) {
        String msg = "Missing mandatory " + dimension + " on account " + line.getAccountCode()
                + " (entry ref=" + entry.getReference() + ")";
        if (ENFORCE) {
            throw new PostingException(PostingErrorCode.MISSING_DIMENSION, msg);
        }
        log.warn("[DimensionMatrix] {}", msg);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
