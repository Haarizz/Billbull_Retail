package com.billbull.backend.financials.period;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
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
}
