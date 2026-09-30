package com.billbull.backend.util;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * One place for the {@code size} contract shared by the typeahead search
 * endpoints ({@code GET /api/{module}/search?q=&size=}).
 *
 * <p>These endpoints back a small dropdown, not a paged grid, so they take a row
 * cap rather than a page number. The cap is always applied server-side: a client
 * asking for a million rows gets {@link #MAX_SIZE}, and a client asking for zero
 * or a negative count gets {@link #DEFAULT_SIZE}.
 */
public final class SearchLimit {

    /** Matches the existing customer search default (CustomerController). */
    public static final int DEFAULT_SIZE = 5;

    /** Hard server-side ceiling — a search dropdown never needs more. */
    public static final int MAX_SIZE = 50;

    private SearchLimit() {}

    /** Clamps a caller-supplied size into [1, {@link #MAX_SIZE}]. */
    public static int clamp(int size) {
        if (size <= 0) return DEFAULT_SIZE;
        return Math.min(size, MAX_SIZE);
    }

    /** The clamped size as a first-page {@link Pageable}, for repository row limits. */
    public static Pageable page(int size) {
        return PageRequest.of(0, clamp(size));
    }
}
