package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The branch Business Date pointer after a Day Close: always the day after the closed date,
 * never "+1 per close" and never backwards.
 *
 * <p>Regression for BR-01: with Day Close skipping idle days, "+1 per close" left the pointer
 * on 22 Oct by 3 Nov, and every new session was dated 22 Oct.
 */
@ExtendWith(MockitoExtension.class)
class PosBusinessDateServiceTest {

    private static final Long BRANCH = 1L;

    @Mock private PosBusinessDateRepository repo;
    @Mock private PosDayCloseRepository dayCloseRepository;

    private PosBusinessDateService service;
    /** In-memory stand-in for the single pos_business_dates row of BRANCH. */
    private PosBusinessDate row;

    @BeforeEach
    void setUp() {
        service = new PosBusinessDateService(repo, dayCloseRepository, new BusinessDayClock("Asia/Dubai"));
        lenient().when(repo.findByBranchId(BRANCH)).thenAnswer(inv -> Optional.ofNullable(row));
        lenient().when(repo.save(any(PosBusinessDate.class))).thenAnswer(inv -> {
            row = inv.getArgument(0);
            return row;
        });
    }

    @Test
    void closingADayMovesTheDateToTheNextDay() {
        row = pointer(LocalDate.of(2026, 10, 15));

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 10, 15), "supervisor");

        assertEquals(LocalDate.of(2026, 10, 16), row.getCurrentBusinessDate());
        assertEquals("supervisor", row.getLastAdvancedBy());
        assertNotNull(row.getLastAdvancedAt());
    }

    @Test
    void idleDaysBetweenClosesDoNotLeaveTheDateBehind() {
        // Last close 15 Oct; 16–19 Oct idle (no sessions, no Day Close); next close 20 Oct.
        row = pointer(LocalDate.of(2026, 10, 16));

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 10, 20), "supervisor");

        // Old rule: 17 Oct. New rule: the day after the date actually closed.
        assertEquals(LocalDate.of(2026, 10, 21), row.getCurrentBusinessDate());
    }

    @Test
    void consecutiveClosesWithGapsTrackTheCalendar_BR01Replay() {
        // BR-01's real Day Close sequence, 15 Oct → 2 Nov, with idle gaps between most closes.
        // Under "+1 per close" this ended on 22 Oct; it must end on 3 Nov.
        row = pointer(LocalDate.of(2026, 10, 15));
        LocalDate[] closes = {
                LocalDate.of(2026, 10, 15), LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 22),
                LocalDate.of(2026, 10, 23), LocalDate.of(2026, 10, 26), LocalDate.of(2026, 10, 31),
                LocalDate.of(2026, 11, 2)};
        for (LocalDate closed : closes) {
            service.advanceBusinessDate(BRANCH, closed, "supervisor");
            assertEquals(closed.plusDays(1), row.getCurrentBusinessDate(), "after closing " + closed);
        }
        assertEquals(LocalDate.of(2026, 11, 3), row.getCurrentBusinessDate());
    }

    @Test
    void consecutiveDailyClosesAdvanceOneDayEach() {
        row = pointer(LocalDate.of(2026, 11, 1));

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 1), "s");
        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 2), "s");
        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 3), "s");

        assertEquals(LocalDate.of(2026, 11, 4), row.getCurrentBusinessDate());
    }

    @Test
    void aStaleDriftedPointerCatchesUpOnTheNextClose() {
        // The state BR-01 is in today: pointer 22 Oct, next close will be 3 Nov.
        row = pointer(LocalDate.of(2026, 10, 22));

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 3), "supervisor");

        assertEquals(LocalDate.of(2026, 11, 4), row.getCurrentBusinessDate());
    }

    @Test
    void closingAMissedOlderDayLaterNeverMovesTheDateBackwards() {
        // Day Close does not enforce chronological order: 3 Nov closed first, then a missed
        // 1 Nov. The date must stay on 4 Nov, not fall back to 2 Nov.
        row = pointer(LocalDate.of(2026, 11, 4));

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 1), "supervisor");

        assertEquals(LocalDate.of(2026, 11, 4), row.getCurrentBusinessDate());
    }

    @Test
    void firstEverCloseForABranchWithNoRowStartsFromTheClosedDate() {
        row = null;

        service.advanceBusinessDate(BRANCH, LocalDate.of(2026, 11, 2), "supervisor");

        assertNotNull(row);
        assertEquals(BRANCH, row.getBranchId());
        assertEquals(LocalDate.of(2026, 11, 3), row.getCurrentBusinessDate());
    }

    @Test
    void aNullClosedDateChangesNothing() {
        row = pointer(LocalDate.of(2026, 11, 3));

        service.advanceBusinessDate(BRANCH, null, "supervisor");

        assertEquals(LocalDate.of(2026, 11, 3), row.getCurrentBusinessDate());
        verify(repo, never()).save(any());
    }

    private static PosBusinessDate pointer(LocalDate date) {
        PosBusinessDate bd = new PosBusinessDate();
        bd.setBranchId(BRANCH);
        bd.setCurrentBusinessDate(date);
        return bd;
    }
}
