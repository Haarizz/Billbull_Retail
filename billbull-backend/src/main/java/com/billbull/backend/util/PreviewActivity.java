package com.billbull.backend.util;

import java.time.LocalDateTime;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * The shared contract behind the global search modal's empty-query preview: rank by what
 * has actually been transacted on, not by what happens to sort first alphabetically.
 *
 * <p>Each category ranks over its own transaction table — products over stock movements,
 * customers over sales invoices, vendors over LPOs, ledger accounts over journal lines,
 * employees over POS sessions — and every one of those joins is an indexed column that
 * already exists. The shape is always the same: count the rows inside {@link #since()},
 * most first, ties broken by the most recent of them.
 *
 * <p>Ranking is deliberately <em>not</em> branch-scoped or permission-scoped. It only
 * decides an order; the services then load the ranked entities through their existing
 * scoped reads, so a user still sees exactly the rows they were always allowed to see.
 */
public final class PreviewActivity {

    /**
     * How far back activity counts. Long enough that a slow month does not empty the
     * preview, short enough that last year's best-seller does not outrank this week's.
     */
    public static final int WINDOW_DAYS = 90;

    private PreviewActivity() {}

    /** The start of the activity window. */
    public static LocalDateTime since() {
        return LocalDateTime.now().minusDays(WINDOW_DAYS);
    }

    /**
     * How many ranked keys to ask the database for when the caller wants {@code size}
     * rows.
     *
     * <p>Wider than {@code size} on purpose: ranking runs unscoped, so some of the
     * top keys may belong to branches this user cannot see, and those have to be
     * droppable without leaving the preview short. Still a small, bounded read.
     */
    public static Pageable ranking(int size) {
        return PageRequest.of(0, Math.min(SearchLimit.clamp(size) * 5, SearchLimit.MAX_SIZE * 2));
    }
}
