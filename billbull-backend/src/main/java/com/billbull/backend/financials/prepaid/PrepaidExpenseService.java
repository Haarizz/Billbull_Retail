package com.billbull.backend.financials.prepaid;

import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * Manages prepaid expense register and posts monthly straight-line amortization.
 * PDF §14: Dr Expense Account / Cr Prepaid Expenses (1320).
 */
@Service
@Slf4j
public class PrepaidExpenseService {

    private final PrepaidExpenseRepository repository;
    private final PostingEngineService postingEngineService;
    private final JournalEntryRepository journalEntryRepository;

    public PrepaidExpenseService(PrepaidExpenseRepository repository,
                                 PostingEngineService postingEngineService,
                                 JournalEntryRepository journalEntryRepository) {
        this.repository = repository;
        this.postingEngineService = postingEngineService;
        this.journalEntryRepository = journalEntryRepository;
    }

    public List<PrepaidExpense> findAll() {
        return repository.findAll();
    }

    @Transactional
    public PrepaidExpense save(PrepaidExpense pe) {
        if (pe.getExpenseAccountCode() == null) pe.setExpenseAccountCode("5403");
        return repository.save(pe);
    }

    /**
     * Run amortization for a given month-end date.
     * Posts Dr Expense / Cr Prepaid Expenses per active prepaid item.
     * Reference: "PRPD-{code}-{YYYY-MM}" — idempotent.
     */
    @Transactional
    public int runMonthlyAmortization(LocalDate runDate) {
        List<PrepaidExpense> items = repository.findActiveForAmortization(runDate);
        int posted = 0;
        for (PrepaidExpense pe : items) {
            String ref = "PRPD-" + pe.getPrepaidCode() + "-" + runDate.getYear() + "-"
                    + String.format("%02d", runDate.getMonthValue());
            if (journalEntryRepository.existsByReference(ref)) {
                log.debug("[PrepaidExpense] Already posted ref={}", ref);
                continue;
            }

            BigDecimal monthly = pe.getMonthlyAmortization();
            BigDecimal remaining = pe.getRemainingAmount();
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                pe.setStatus(PrepaidExpense.PrepaidStatus.FULLY_AMORTIZED);
                repository.save(pe);
                continue;
            }

            // Final period: amortize exactly what's left to avoid rounding residual
            BigDecimal amount = monthly.min(remaining).setScale(2, RoundingMode.HALF_UP);

            JournalEntry journal = postingEngineService.createJournalFromPrepaidAmortization(
                    ref, runDate, pe.getDescription(), amount,
                    pe.getExpenseAccountCode(), pe.getCostCenter(), pe.getBranch());

            if (journal != null) {
                pe.setAmortizedAmount(pe.getAmortizedAmount().add(amount));
                if (pe.getRemainingAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    pe.setStatus(PrepaidExpense.PrepaidStatus.FULLY_AMORTIZED);
                }
                repository.save(pe);
                posted++;
            }
        }
        log.info("[PrepaidExpense] Amortization run {} — posted {} journal(s).", runDate, posted);
        return posted;
    }
}
