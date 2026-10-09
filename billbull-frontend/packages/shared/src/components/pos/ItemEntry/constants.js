export const ProductEntryMode = Object.freeze({
    DIRECT_ADD: 'DIRECT_ADD',
    OPEN_ENTRY_DIALOG: 'OPEN_ENTRY_DIALOG'
});

/**
 * The Item Entry dialog only exists in the compact (Trade POS) template — TradePOSTouchScreen
 * is the layout built around it, and it is the only one that routes double-click-to-edit into
 * the same dialog. The Classic and Cart Focus layouts have their own inline qty/price/discount
 * controls, so opening a modal on every product tap there is a regression, not a feature.
 *
 * Product Entry Mode is therefore honoured ONLY on this template; every other layout is
 * DIRECT_ADD regardless of what the setting says. POS Settings > Behavior labels it as such.
 */
export const ENTRY_DIALOG_TEMPLATE = 'compact';

export const templateSupportsEntryDialog = (posTemplate) => posTemplate === ENTRY_DIALOG_TEMPLATE;
