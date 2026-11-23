// Display order for document line-item tables with an inline product-search row
// (Sales Invoice, Quotation, Sales Order, Proforma, Delivery Note, LPO, GRN,
// Purchase Invoice).
//
// Only the on-screen order changes; the items array — and so the saved, printed
// and emailed line order — is untouched. Blank search rows stay pinned at the top
// so the user always types in the same place; filled lines follow in entry
// order numbered 1, 2, 3...; a blank row shows the number the next line will get.
//
// Pair with hooks/useEntryRowTable: put its ref on the table's scroll container
// and spread entryRowAttrs(row) on each row's <tr>. The blank row then sticks
// just under the (sticky) header while the list scrolls, and a newly added line
// is scrolled into view.

export const isBlankEntryRow = (item) => !item?.code && !item?.name && !item?.desc;
// Per-page variants matching each page's own "show the search input" test.
export const isBlankByCodeDesc = (item) => !item?.code && !item?.desc;   // Quotation, SO, Proforma, DN
export const isBlankByCodeName = (item) => !item?.code && !item?.name;   // LPO, GRN, Purchase Invoice

export const orderRowsForEntryDisplay = (items, isBlank = isBlankEntryRow) => {
    const list = Array.isArray(items) ? items : [];
    const filled = [];
    const blank = [];
    list.forEach((item, sourceIndex) => {
        (isBlank(item) ? blank : filled).push({ item, sourceIndex });
    });
    // `blank` marks the pinned search row: only the first one sticks, so stray
    // extra empty rows scroll with the list instead of piling up on top.
    return [
        ...blank.map((row, i) => ({ ...row, blank: i === 0, rowNo: filled.length + i + 1 })),
        ...filled.map((row, i) => ({ ...row, blank: false, rowNo: i + 1 })),
    ];
};

// Where a product picked in the product browser goes: into the row the user was
// typing in (targetId), else into the open search row, else a new line at the
// end. Without this the pick was appended past the search row, leaving an empty
// row behind on every add.
export const placeEntryLine = (items, newItem, isBlank = isBlankEntryRow, targetId = null) => {
    const list = Array.isArray(items) ? items : [];
    let index = targetId != null ? list.findIndex((it) => it?.id === targetId) : -1;
    if (index < 0) index = list.findIndex(isBlank);
    if (index < 0) return [...list, newItem];
    return list.map((it, i) => (i === index ? newItem : it));
};

// Tab on the last field adds a search row only when none is open; otherwise it
// returns the open one so the caller just focuses it.
export const findOpenEntryRow = (items, isBlank = isBlankEntryRow) =>
    (Array.isArray(items) ? items : []).find(isBlank) || null;

// Header height is measured by useEntryRowTable into this CSS variable.
export const ENTRY_HEAD_HEIGHT_VAR = '--bb-entry-head-h';

const STICKY_BLANK_ROW_STYLE = {
    position: 'sticky',
    top: `var(${ENTRY_HEAD_HEIGHT_VAR}, 0px)`,
    zIndex: 9, // under the header (z-10), over the scrolling lines
    background: '#fff',
    boxShadow: '0 1px 0 #e2e8f0, 0 6px 8px -6px rgba(15, 23, 42, 0.18)',
};

export const entryRowAttrs = ({ item, blank }) => ({
    'data-entry-row-id': String(item?.id ?? ''),
    style: blank ? STICKY_BLANK_ROW_STYLE : undefined,
});
