package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.pos.session.PosSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Single source of truth for "which trading date is the next Day Close due for" —
 * the Day Close domain's own definition of a day, kept deliberately separate from
 * the Business Date subsystem ({@code PosBusinessDateService}), which continues to
 * answer "what day is the POS operating on" for session-opening validation and
 * {@code PosDayStatusService} unchanged.
 *
 * <p>Session-driven, not calendar-driven: the pending date is the trading date
 * ({@link com.billbull.backend.pos.session.PosSession#getTradingDate()} — the real
 * calendar day a session actually opened on, immutable, set once at creation) of the
 * earliest POS session strictly after the branch's last closed date — never a fixed
 * calendar walk, and never the {@code sessionDate} accounting bucket every other
 * consumer (cash movements/GL, X-Report numbering, advance receipts) still uses. A
 * calendar date with zero POS sessions is simply invisible to this resolver: it is
 * never returned as pending and never requires operator action (replaces the old
 * Skip Date workflow).
 *
 * <p>Every Day Close component — this resolver, {@code closeDay()},
 * {@code resolveSessionRange()}, Day Close Summary, dynamic Z-Report session
 * grouping — must use {@code tradingDate} exclusively, so the resolver's answer and
 * the actual close operation never disagree.
 */
@Service
public class PosPendingDayCloseResolver {

    private final PosDayCloseRepository dayCloseRepository;
    private final PosSessionRepository sessionRepository;

    public PosPendingDayCloseResolver(PosDayCloseRepository dayCloseRepository,
                                       PosSessionRepository sessionRepository) {
        this.dayCloseRepository = dayCloseRepository;
        this.sessionRepository = sessionRepository;
    }

    /**
     * Resolves the next trading date requiring a Day Close for this branch, or
     * {@code Optional.empty()} if there is none — i.e. no session exists after the
     * last closed date, so there is nothing pending and no action is required.
     */
    @Transactional(readOnly = true)
    public Optional<LocalDate> resolvePendingBusinessDate(Long branchId) {
        Optional<LocalDate> lastClosed = dayCloseRepository.findMaxCloseDateByBranchId(branchId);
        return lastClosed.isPresent()
                ? sessionRepository.findEarliestTradingDateAfter(branchId, lastClosed.get())
                : sessionRepository.findEarliestTradingDate(branchId);
    }
}
