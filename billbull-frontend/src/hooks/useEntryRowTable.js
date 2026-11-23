import { useCallback, useLayoutEffect, useRef } from 'react';
import { ENTRY_HEAD_HEIGHT_VAR, isBlankEntryRow } from '../utils/entryRowOrder';

// Companion to utils/entryRowOrder for line-item tables whose blank search row
// is pinned at the top. Returns a callback ref for the table's scroll container.
//
// 1. Keeps ENTRY_HEAD_HEIGHT_VAR on the container equal to the <thead> height, so
//    the sticky search row sits exactly under the sticky header.
// 2. When a line gets a product (fast entry fills the blank row, or the catalog
//    appends lines), scrolls the container so the newest such line is visible
//    just below the search row. Loading a document replaces every row id, so it
//    does not scroll.
// 3. Caps the box at header + search row + VISIBLE_ROWS lines, plus a strip of
//    the next line so it is obvious the list scrolls. Lines differ in height per
//    page (and grow with batches/descriptions), so the real rows are measured.
//    With fewer lines the box keeps its own CSS height.

// Full lines shown under the search row before the box starts scrolling.
const VISIBLE_ROWS = 3;
// How much of the first hidden line shows below the last full one.
const NEXT_ROW_PEEK_PX = 28;

const fitToVisibleRows = (container, visibleRows) => {
    const lines = [...container.querySelectorAll('tr[data-entry-row-id]')]
        .filter((tr) => tr.style.position !== 'sticky');
    if (!visibleRows || lines.length <= visibleRows) {
        container.style.maxHeight = '';
        container.style.minHeight = '';
        return;
    }
    // bottom of the last fully visible line, in the box's scroll coordinates;
    // a description row that follows it belongs to it.
    let last = lines[visibleRows - 1];
    while (last.nextElementSibling && !last.nextElementSibling.hasAttribute('data-entry-row-id')) {
        last = last.nextElementSibling;
    }
    // Add up layout heights (CSS px) rather than screen rects: the app can run
    // under CSS zoom, where rects are scaled but max-height is not, and the cap
    // then crept up a few px on every added line.
    let bottom = container.querySelector('thead')?.offsetHeight || 0;
    for (let tr = last.parentElement.firstElementChild; tr; tr = tr.nextElementSibling) {
        bottom += tr.offsetHeight;
        if (tr === last) break;
    }
    const cap = Math.round(bottom + NEXT_ROW_PEEK_PX);
    container.style.maxHeight = `${cap}px`;
    container.style.minHeight = '0px'; // a CSS min-height must not override the cap
};

const useEntryRowTable = (items, isBlank = isBlankEntryRow) => {
    const containerRef = useRef(null);
    const observerRef = useRef(null);
    const prevRef = useRef(null);

    const setContainer = useCallback((el) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        containerRef.current = el;
        if (!el) return;
        const measure = () => {
            const head = el.querySelector('thead');
            el.style.setProperty(ENTRY_HEAD_HEIGHT_VAR, `${head ? head.offsetHeight : 0}px`);
            // rows grow/shrink (description opened, batches chosen, window resized)
            fitToVisibleRows(el, VISIBLE_ROWS);
        };
        measure();
        const table = el.querySelector('table');
        if (table && typeof ResizeObserver !== 'undefined') {
            // the table's size does not depend on the box's max-height, so no loop
            observerRef.current = new ResizeObserver(measure);
            observerRef.current.observe(table);
            const head = table.querySelector('thead');
            if (head) observerRef.current.observe(head);
        }
    }, []);

    useLayoutEffect(() => {
        const container = containerRef.current;
        let pinned = 0; // header + sticky blank rows cover the top of the box
        if (container) {
            container.querySelectorAll('thead, tr[data-entry-row-id]').forEach((el) => {
                if (el.tagName === 'THEAD' || el.style.position === 'sticky') pinned += el.offsetHeight;
            });
            // focus()/scrollIntoView on a line's inputs then stop below the pinned rows
            container.style.scrollPaddingTop = `${pinned}px`;
            fitToVisibleRows(container, VISIBLE_ROWS);
        }

        const list = Array.isArray(items) ? items : [];
        const ids = new Set(list.map((it) => String(it?.id)));
        const filledIds = list.filter((it) => !isBlank(it)).map((it) => String(it?.id));
        const prev = prevRef.current;
        prevRef.current = { ids, filled: new Set(filledIds) };
        if (!prev) return;

        const edited = [...ids].some((id) => prev.ids.has(id));
        const newlyFilled = filledIds.filter((id) => !prev.filled.has(id));
        if (!edited || newlyFilled.length === 0) return;

        if (!container) return;
        const targetId = newlyFilled[newlyFilled.length - 1];
        const row = [...container.querySelectorAll('tr[data-entry-row-id]')]
            .find((tr) => tr.getAttribute('data-entry-row-id') === targetId);
        if (!row) return;

        const box = container.getBoundingClientRect();
        const rect = row.getBoundingClientRect();
        // rects are in zoomed screen px, scrollTop/offsetHeight in CSS px
        const zoom = container.offsetHeight ? box.height / container.offsetHeight : 1;
        if (rect.bottom > box.bottom) {
            container.scrollTop += (rect.bottom - box.bottom) / zoom + 4;
        } else if (rect.top < box.top + pinned * zoom) {
            container.scrollTop -= (box.top + pinned * zoom - rect.top) / zoom;
        }
    }, [items, isBlank]);

    return setContainer;
};

export default useEntryRowTable;
