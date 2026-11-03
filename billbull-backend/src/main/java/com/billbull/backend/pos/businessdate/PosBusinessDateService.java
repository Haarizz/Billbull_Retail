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
    /** The one Business Day clock (see {@link BusinessDayClock}). Seeding and the
     *  "when was this advanced" stamp are Business Day facts, so they must read the
     *  configured Business Day timezone rather than the JVM default — a host in UTC
     *  seeding an Asia/Kolkata branch at 03:00 local would otherwise seed yesterday. */
    private final BusinessDayClock clock;

    public PosBusinessDateService(PosBusinessDateRepository repo, PosDayCloseRepository dayCloseRepository,
                                  BusinessDayClock clock) {
        this.repo = repo;
        this.dayCloseRepository = dayCloseRepository;
        this.clock = clock;
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
        bd.setCurrentBusinessDate(clock.now().toLocalDate());
        repo.save(bd);
        return bd.getCurrentBusinessDate();
    }

    /** Moves the branch's business date to the day after the Business Day that was just
     *  closed ({@code closedDate + 1}).
     *
     *  <p>It used to add one day per Day Close. That only worked while every calendar day,
     *  idle or not, was closed or explicitly skipped. Since the Skip Non-Trading Day workflow
     *  was retired, idle days get no Day Close, so the date fell one more day behind the
     *  calendar for every day the shop did not trade (BR-01 reached 22 Oct on 3 Nov).
     *
     *  <p>Never moves backwards. Day Close does not enforce chronological order, so a missed
     *  older day closed after a newer one leaves the date where it is. A null
     *  {@code closedDate} also leaves it unchanged. */
    @Transactional
    public void advanceBusinessDate(Long branchId, LocalDate closedDate, String actor) {
        if (closedDate == null) return;
        LocalDate next = closedDate.plusDays(1);
        PosBusinessDate bd = repo.findByBranchId(branchId).orElseGet(() -> {
            PosBusinessDate fresh = new PosBusinessDate();
            fresh.setBranchId(branchId);
            fresh.setCurrentBusinessDate(next);
            return fresh;
        });
        if (bd.getCurrentBusinessDate() == null || next.isAfter(bd.getCurrentBusinessDate())) {
            bd.setCurrentBusinessDate(next);
        }
        bd.setLastAdvancedAt(clock.now());
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
