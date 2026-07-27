package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Owns Business Date lifecycle only: resolving the current business date, advancing it,
 * and checking whether a given date has already been closed. Deliberately has no
 * dependency on session data, POS settings, or operating-hours logic — composing those
 * into a richer view is {@link com.billbull.backend.pos.businessdate.PosDayStatusService}'s job.
 */
@Service
public class PosBusinessDateService {

    private final PosBusinessDateRepository repo;
    private final PosDayCloseRepository dayCloseRepository;

    public PosBusinessDateService(PosBusinessDateRepository repo, PosDayCloseRepository dayCloseRepository) {
        this.repo = repo;
        this.dayCloseRepository = dayCloseRepository;
    }

    /** Returns the branch's current business date, seeding a row at today's calendar
     *  date on first touch (a branch with no prior close has no date to advance from). */
    @Transactional
    public LocalDate getCurrentBusinessDate(Long branchId) {
        return repo.findByBranchId(branchId)
                .map(PosBusinessDate::getCurrentBusinessDate)
                .orElseGet(() -> seed(branchId));
    }

    private LocalDate seed(Long branchId) {
        PosBusinessDate bd = new PosBusinessDate();
        bd.setBranchId(branchId);
        bd.setCurrentBusinessDate(LocalDate.now());
        repo.save(bd);
        return bd.getCurrentBusinessDate();
    }

    /** Advances the branch's business date by exactly one day — never to
     *  {@code LocalDate.now()}. A Day Close run late (hours or days after the fact)
     *  must move the calendar forward one day at a time, not jump to "today", or a
     *  business date would be silently skipped from the GL/sales-day sequence. */
    @Transactional
    public void advanceBusinessDate(Long branchId, String actor) {
        PosBusinessDate bd = repo.findByBranchId(branchId).orElseGet(() -> {
            PosBusinessDate fresh = new PosBusinessDate();
            fresh.setBranchId(branchId);
            fresh.setCurrentBusinessDate(LocalDate.now());
            return fresh;
        });
        bd.setCurrentBusinessDate(bd.getCurrentBusinessDate().plusDays(1));
        bd.setLastAdvancedAt(LocalDateTime.now());
        bd.setLastAdvancedBy(actor);
        repo.save(bd);
    }

    /** Whether the given business date has already been closed for this branch —
     *  a thin pass-through to the existing authoritative check on PosDayClose. */
    @Transactional(readOnly = true)
    public boolean isDateClosed(Long branchId, LocalDate date) {
        return dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date);
    }
}
