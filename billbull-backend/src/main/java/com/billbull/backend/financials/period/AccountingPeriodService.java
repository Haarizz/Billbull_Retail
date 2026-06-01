package com.billbull.backend.financials.period;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import com.billbull.backend.financials.generalledger.postingengine.PostingErrorCode;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;

@Service
@Slf4j
public class AccountingPeriodService {

    private final AccountingPeriodRepository repository;

    public AccountingPeriodService(AccountingPeriodRepository repository) {
        this.repository = repository;
    }

    public List<AccountingPeriod> getAllPeriods() {
        return repository.findAllByOrderByStartDateDesc();
    }

    public List<AccountingPeriod> getOpenPeriods() {
        return repository.findByStatusOrderByStartDateDesc("Open");
    }

    @Transactional
    public AccountingPeriod createPeriod(AccountingPeriod period) {
        period.setStatus("Open");
        return repository.save(period);
    }

    @Transactional
    public AccountingPeriod closePeriod(Long id, String closedBy) {
        AccountingPeriod period = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Accounting period not found: " + id));

        if ("Closed".equals(period.getStatus())) {
            throw new RuntimeException("Period is already closed.");
        }

        period.setStatus("Closed");
        period.setClosedBy(closedBy != null ? closedBy : "System");
        period.setClosedAt(LocalDateTime.now());
        return repository.save(period);
    }

    @Transactional
    public AccountingPeriod reopenPeriod(Long id) {
        AccountingPeriod period = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Accounting period not found: " + id));
        period.setStatus("Open");
        period.setClosedBy(null);
        period.setClosedAt(null);
        return repository.save(period);
    }

    /**
     * Returns true if the given date falls within a closed accounting period.
     * Called by JournalVoucherService before posting to prevent backdated entries.
     */
    public boolean isDateInClosedPeriod(LocalDate date) {
        if (date == null) return false;
        return repository.existsClosedPeriodContainingDate(date);
    }

    /**
     * The accounting period whose range covers {@code date}, or {@code null} if
     * none is defined. Used for diagnostics and by {@link #assertOpen}.
     */
    public AccountingPeriod findCoveringPeriod(LocalDate date) {
        if (date == null) return null;
        List<AccountingPeriod> covering = repository.findCoveringPeriods(date);
        return covering.isEmpty() ? null : covering.get(0);
    }

    /**
     * Posting gateway guard (PDF §1): rejects a posting date that falls inside a
     * Closed period with {@link PostingErrorCode#PERIOD_LOCKED}.
     *
     * <p>If no period is defined for the date, the posting is allowed with a
     * warning rather than rejected — periods are seeded only for a rolling
     * window, and blocking undefined dates would break legitimate back/forward
     * dating. Tighten here if a "must have an Open period" policy is adopted.
     */
    public void assertOpen(LocalDate date) {
        if (date == null) return;
        AccountingPeriod covering = findCoveringPeriod(date);
        if (covering == null) {
            log.warn("[Period] No accounting period defined for {} — allowing posting (no lock to enforce).", date);
            return;
        }
        if ("Closed".equalsIgnoreCase(covering.getStatus())) {
            throw new PostingException(PostingErrorCode.PERIOD_LOCKED,
                    "Cannot post: date " + date + " falls in closed period '" + covering.getPeriodName() + "'.");
        }
    }
}
