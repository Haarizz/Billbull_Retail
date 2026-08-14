/**
 * Customer & Sales → Sales Return.
 *
 * Default export is the register page, which hosts the shared SalesReturnScreen in its
 * "New Sales Return" tab. Existing imports of `pages/Sales/SalesReturn` keep working
 * unchanged — the page moved into this folder so it can sit alongside the shared workflow
 * it now delegates to, rather than owning a second copy of it.
 */
export { default } from './SalesReturnPage';
export { default as SalesReturnScreen } from './SalesReturnScreen';
export { ENTRY_POINT } from './constants';
export { useSalesReturn } from './useSalesReturn';
