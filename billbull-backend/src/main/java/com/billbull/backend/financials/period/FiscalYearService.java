package com.billbull.backend.financials.period;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class FiscalYearService {

    private final FiscalYearRepository fiscalYearRepository;
    private final AccountingPeriodRepository periodRepository;

    public FiscalYearService(FiscalYearRepository fiscalYearRepository,
                             AccountingPeriodRepository periodRepository) {
        this.fiscalYearRepository = fiscalYearRepository;
        this.periodRepository     = periodRepository;
    }

    public List<FiscalYear> getAll() {
        return fiscalYearRepository.findAllByOrderByStartDateDesc();
    }

    public Optional<FiscalYear> findById(Long id) {
        return fiscalYearRepository.findById(id);
    }

    public Optional<FiscalYear> findByCode(String code) {
        return fiscalYearRepository.findByCode(code);
    }

    /** The fiscal year whose range covers the given date, or empty. */
    public Optional<FiscalYear> findCovering(LocalDate date) {
        if (date == null) return Optional.empty();
        List<FiscalYear> hits = fiscalYearRepository.findCovering(date);
        return hits.isEmpty() ? Optional.empty() : Optional.of(hits.get(0));
    }

    @Transactional
    public FiscalYear create(FiscalYear fy) {
        if (fiscalYearRepository.existsByCode(fy.getCode())) {
            throw new IllegalArgumentException("Fiscal year '" + fy.getCode() + "' already exists.");
        }
        fy.setStatus(FiscalYear.STATUS_OPEN);
        FiscalYear saved = fiscalYearRepository.save(fy);
        // Link any already-existing periods that fall inside the new fiscal year
        linkPeriodsToFiscalYear(saved);
        return saved;
    }

    /**
     * Transitions an Open fiscal year to Closing (blocks new postings except
     * authorized adjustment JVs). Periods remain as-is during the Closing window.
     */
    @Transactional
    public FiscalYear beginClose(Long id, String initiatedBy) {
        FiscalYear fy = getOrThrow(id);
        if (!FiscalYear.STATUS_OPEN.equals(fy.getStatus())) {
            throw new IllegalStateException("Fiscal year " + fy.getCode() + " is not Open (current: " + fy.getStatus() + ").");
        }
        fy.setStatus(FiscalYear.STATUS_CLOSING);
        log.info("[FiscalYear] {} transitioned to Closing by {}", fy.getCode(), initiatedBy);
        return fiscalYearRepository.save(fy);
    }

    /**
     * Finalises a Closing fiscal year → Closed.
     * Closes all child periods that are still Open, then marks the fiscal year Closed.
     * The year-end retained-earnings roll-up journal is intentionally posted by the
     * caller (PostingEngineService.createJournalFromYearEnd) to keep this method
     * free of posting-engine dependencies.
     */
    @Transactional
    public FiscalYear finaliseClose(Long id, String closedBy) {
        FiscalYear fy = getOrThrow(id);
        if (!FiscalYear.STATUS_CLOSING.equals(fy.getStatus())) {
            throw new IllegalStateException("Fiscal year " + fy.getCode() + " must be in Closing state before finalising (current: " + fy.getStatus() + ").");
        }
        // Close any child periods that are still Open
        periodRepository.findByFiscalYearIdAndStatus(fy.getId(), AccountingPeriod.STATUS_OPEN)
                .forEach(p -> {
                    p.setStatus(AccountingPeriod.STATUS_CLOSED);
                    p.setClosedBy(closedBy);
                    p.setClosedAt(LocalDateTime.now());
                    periodRepository.save(p);
                });

        fy.setStatus(FiscalYear.STATUS_CLOSED);
        fy.setClosedBy(closedBy);
        fy.setClosedAt(LocalDateTime.now());
        log.info("[FiscalYear] {} finalised/Closed by {}", fy.getCode(), closedBy);
        return fiscalYearRepository.save(fy);
    }

    /** Assigns child periods whose date-range falls inside this fiscal year. */
    private void linkPeriodsToFiscalYear(FiscalYear fy) {
        List<AccountingPeriod> unlinked = periodRepository.findByFiscalYearIdIsNull();
        int linked = 0;
        for (AccountingPeriod p : unlinked) {
            if (!p.getStartDate().isBefore(fy.getStartDate())
                    && !p.getEndDate().isAfter(fy.getEndDate())) {
                p.setFiscalYearId(fy.getId());
                periodRepository.save(p);
                linked++;
            }
        }
        if (linked > 0) {
            log.info("[FiscalYear] Linked {} period(s) to {}", linked, fy.getCode());
        }
    }

    private FiscalYear getOrThrow(Long id) {
        return fiscalYearRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Fiscal year not found: " + id));
    }
}
