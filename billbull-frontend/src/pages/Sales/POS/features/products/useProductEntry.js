// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// THE PRODUCT-ENTRY BOUNDARY. Everything between "a value arrived" (scan, keyboard
// Enter, grid tap, quick-product create) and "a cart line exists" lives here:
//
//     scanner / manual input / grid selection
//              |  handleUnifiedEntry          (parse, cache, resolve, route)
//              |  handleProductSelection      (Product Entry Mode decision)
//              |  Item Entry dialog           (OPEN_ENTRY_DIALOG mode only)
//              |  addToInvoice                (qty/price/tax, floor gate, merge rules)
//              v  cart boundary (useCart)
//
// CART OWNERSHIP IS UNCHANGED. useCart still owns the one authoritative currentInvoice.
// This hook never declares cart state; it writes through the three cart-boundary values
// it is handed (setCurrentInvoice, currentInvoiceRef, recalculateInvoice) exactly as the
// original inline code did - same `setCurrentInvoice(prev => recalculateInvoice(...))`
// shape, same object output, no new data model.
//
// WHAT IS DELIBERATELY *NOT* HERE, and why:
//
//   updateQuantity /     Cart-line edits on a line that already exists. They share the
//   updateDiscount /     price-floor gate with addToInvoice but they are not entry: no
//   updateItemPrice /    product resolution, no entry mode, no batch/serial pinning.
//   voidFromInvoice      They stay in POSSales against the same cart boundary.
//   pendingPriceOverride The approval queue is shared by ADD_ITEM, UPDATE_PRICE,
//   + supervisor PIN     UPDATE_DISCOUNT and CHECKOUT. Product entry only *enqueues*
//   state                (via requestApproval below); useSupervisorApproval owns the
//                        queue and the dequeue/dispatch, and calls the addToInvoice this
//                        hook returns for the ADD_ITEM resumption.
//   productCacheRef      Filled by the product-list loaders and the search resolver, and
//                        cleared by syncPosData - four writers outside entry. Stays in
//                        POSSales; passed in.
//   barcodeInput /       Scanner input state and the feedback toaster are read and written
//   searchQuery /        all over POSSales (focus mode, suggestions, customer create).
//   showFeedback         Entry only clears/emits; the setters are passed in.
//   Item Entry JSX       POSItemEntryContainer stays mounted in POSSales; only its state
//                        and callbacks moved.
//
// REFS. Three refs that existed only to break in-component closure cycles became
// internal to this hook and are gone from POSSales: addToInvoiceRef,
// handleProductSelectionRef and posSettingsRef. They are still required -
// handleUnifiedEntry is memoized with an empty dep array, so anything it reaches that is
// rebuilt per render must be reached through a ref - but the cycle is now local and
// documented here instead of spanning 1,700 lines of component body. applyScannedVoucherRef
// lost its POSSales declaration too: the voucher callback is now an ordinary input and the
// ref that late-binds it is maintained here. showFeedback needs no ref: POSSales owns it
// as a stable callback, so even the frozen closures here hold the one live toaster.
//
// Nothing was normalised while moving: the console diagnostics, the deliberate
// `qtyToAdd` no-op ternary, the empty dependency arrays and their eslint suppressions are
// all preserved as they were, because they are what current behaviour is made of.
import { useCallback, useMemo, useRef, useState } from 'react';

import { resolvePosEntry } from '../../../../../api/posApi';
import { ProductEntryMode } from '../../../../../components/pos/ItemEntry/constants';
import { resolveLineTaxRate } from '../../../../../utils/vatMath';
import { cachePosProduct, getPriceFloor, mapPosProductAggregateItem, toNumber } from '../../posUtils';

/**
 * @param {object}   args
 * @param {object}   args.posSettings            live POS settings (tax mode, entry mode, floor gate)
 * @param {number}   args.currentRenderCount     render counter, used by the existing diagnostics
 * @param {Function} args.setCurrentInvoice      cart boundary - useCart
 * @param {object}   args.currentInvoiceRef      cart boundary - useCart
 * @param {Function} args.recalculateInvoice     cart boundary - useCart
 * @param {Function} args.requestApproval        enqueue a supervisor-approval request and
 *                                               open the PIN dialog - useSupervisorApproval
 * @param {object}   args.productCacheRef        shared product cache (POSSales-owned)
 * @param {Function} args.setBarcodeInput        scanner input (POSSales-owned)
 * @param {Function} args.setSearchQuery         grid filter (POSSales-owned)
 * @param {Function} args.setSelectedCustomer    customer dependency
 * @param {Function} args.applyScannedVoucher    payment dependency - a scanned voucher is
 *                                               an allocation, never a cart line
 * @param {Function} args.showFeedback           POSSales' feedback toaster (stable)
 */
export function useProductEntry({
  posSettings,
  currentRenderCount,
  setCurrentInvoice,
  currentInvoiceRef,
  recalculateInvoice,
  requestApproval,
  productCacheRef,
  setBarcodeInput,
  setSearchQuery,
  setSelectedCustomer,
  applyScannedVoucher,
  showFeedback,
}) {
  // -- Late-binding refs (see the REFS note above) ----------------------------
  // addToInvoice is redefined fresh every render (it closes over posSettings,
  // e.g. taxInclusive). handleUnifiedEntry below is memoized with an empty
  // dep array so its own closure is frozen from the first render - calling
  // addToInvoice directly there would permanently use the mount-time tax
  // mode. Route through this ref, kept current every render, instead.
  const addToInvoiceRef = useRef(null);
  // Same frozen-closure problem, same fix: handleUnifiedEntry reads the live
  // POS settings, the Product Entry Mode controller and the voucher applier
  // through refs kept current on every render.
  const posSettingsRef = useRef(null);
  const handleProductSelectionRef = useRef(null);
  const applyScannedVoucherRef = useRef(null);
  posSettingsRef.current = posSettings;
  applyScannedVoucherRef.current = applyScannedVoucher;

  const [lastScannedItem, setLastScannedItem] = useState(null);


  // Returns { ok, reason }. Callers can surface `reason` when ok === false so
  // the cashier learns why an add was refused (one-batch-one-unit enforcement).
  const addToInvoice = (product, quantity = 1, pinnedBatchNumber = null, pinnedSerialNumber = null, pinnedExpiry = null, overrides = {}) => {
    window.__CURRENT_ADD_TO_INVOICE = addToInvoice; // track the latest reference
    console.log(`\n======================================================`);
    console.log(`[addToInvoice EXECUTION]`);
    console.log(`- Caller Context Render ID: ${currentRenderCount}`);
    console.log(`- Captured posSettings:`, posSettings);
    console.log(`- Captured taxInclusive:`, posSettings?.taxInclusive);
    console.log(`- addToInvoice Reference Match:`, window.__CURRENT_ADD_TO_INVOICE === addToInvoice ? 'LATEST' : 'STALE (from an older render!)');
    console.log(`======================================================\n`);
    // A serialized unit is always qty 1 and never merges (a serial is unique by
    // definition). A pinned batch is also a single scanned physical unit.
    const isPinned = !!pinnedBatchNumber || !!pinnedSerialNumber;
    // In this system a batch/serial-controlled product is stored one-physical-
    // unit-per-batch-number. A grid add without a scanned batch therefore can't
    // legitimately bump quantity (each extra unit needs its own distinct batch).
    // We add a single qty-1 line and refuse to merge/re-add; extra units must be
    // scanned. Non-controlled products keep the normal merge-by-id behaviour.
    const isBatchControlled = !isPinned && (Boolean(product.isBatch) || Boolean(product.isSerial));
    const defaultQtyToAdd = (pinnedSerialNumber || isBatchControlled) ? 1 : Math.max(1, Number(quantity) || 1);
    const qtyToAdd = overrides.isAbsoluteQuantity ? defaultQtyToAdd : defaultQtyToAdd; 
    const unitPrice = overrides.price !== undefined ? toNumber(overrides.price, 0) : toNumber(product.price, 0);
    const unitDiscount = overrides.discount !== undefined ? toNumber(overrides.discount, 0) : toNumber(product.defaultDiscount, 0);
    const unitDiscountType = overrides.discountType || 'percent'; // currently always percent in model but extensible
    const unitTaxRate = overrides.taxRate !== undefined ? overrides.taxRate : resolveLineTaxRate(product, posSettings?.branchDefaultVatRate, posSettings?.taxEnabled !== false);

    // Supervisor price-override gate — only active when the admin has turned it on
    // (Behavior tab > Price Override). Mirrors PosCheckoutController §2.4's floor check
    // exactly, including applying the line discount before comparing to the floor, so a
    // full-price item discounted below minimum at add-time is caught here too, not just
    // at checkout. `overrides.approved` marks the post-approval retry dispatched from
    // the approval dispatcher, so it isn't re-gated.
    if (!overrides.approved && posSettings?.requirePriceOverrideApproval) {
      const floor = getPriceFloor(product.minPrice, product.cost);
      const effectivePrice = unitPrice * (1 - unitDiscount / 100);
      if (floor != null && effectivePrice < floor) {
        requestApproval({
          priceOverride: {
            type: 'ADD_ITEM',
            product, quantity, batch: pinnedBatchNumber, serial: pinnedSerialNumber, expiry: pinnedExpiry,
            overrides, itemName: product.name, minPrice: floor, attemptedPrice: effectivePrice,
          },
        });
        return { ok: false, reason: 'supervisor-approval-required' };
      }
    }

    // Block re-adding a batch-controlled product from the grid (its line already
    // holds one physical unit; another unit means another batch → must be scanned).
    if (isBatchControlled) {
      const already = (currentInvoiceRef.current?.items || [])
        .some(item => item.productId === product.id || item.id === product.id);
      if (already) {
        return { ok: false, reason: `${product.name} is batch-tracked — scan a specific batch to add another unit.` };
      }
    }

    setCurrentInvoice(prev => {
      // A pinned line (scanned batch or serial) represents one specific physical
      // unit, so it always gets its own cart row (with a composite id) and never
      // stacks onto an existing line. Batch-controlled grid lines also never merge.
      const existingItem = (isPinned || isBatchControlled)
        ? null
        : prev.items.find(item => item.id === product.id);
      let newItems;

      if (existingItem) {
        newItems = prev.items.map(item => {
          if (item.id === product.id) {
            const mergedQuantity = overrides.isAbsoluteQuantity ? qtyToAdd : item.quantity + qtyToAdd;
            const mergedPrice = overrides.price !== undefined ? unitPrice : item.price;
            const mergedDiscount = overrides.discount !== undefined ? unitDiscount : item.discount;
            const mergedTaxRate = overrides.taxRate !== undefined ? unitTaxRate : item.taxRate;
            return {
              ...item,
              quantity: mergedQuantity,
              price: mergedPrice,
              discount: mergedDiscount,
              taxRate: mergedTaxRate,
              notes: overrides.notes !== undefined ? overrides.notes : item.notes,
              total: mergedQuantity * mergedPrice * (1 - mergedDiscount / 100)
            };
          }
          return item;
        });
      } else {
        // Add new item to the TOP of the list. Pinned lines use a composite id
        // so every existing item.id-keyed cart op (qty/discount/remove/void/
        // React key) keeps targeting exactly one row. productId carries the real
        // product id; the checkout payload reads item.code for the item code.
        const pinKey = pinnedSerialNumber ? `S:${pinnedSerialNumber}` : pinnedBatchNumber;
        newItems = [{
          id: isPinned ? `${product.id}::${pinKey}` : product.id,
          productId: product.id,
          name: product.name,
          // Arabic name: the Product master persists it as `localName` (Jackson
          // serializes it under that key); `nameAr` kept as a fallback alias.
          nameAr: product.localName || product.nameAr || '',
          barcode: product.barcode || product.code || product.id,
          code: product.code || '',
          image: product.image || null,
          price: unitPrice,
          minPrice: product.minPrice != null && product.minPrice !== '' ? toNumber(product.minPrice) : null,
          maxPrice: product.maxPrice != null && product.maxPrice !== '' ? toNumber(product.maxPrice) : null,
          retailPrice: product.retailPrice != null && product.retailPrice !== '' ? toNumber(product.retailPrice) : null,
          cost: product.cost != null && product.cost !== '' ? toNumber(product.cost) : null,
          quantity: qtyToAdd,
          discount: unitDiscount,
          taxRate: unitTaxRate,
          notes: overrides.notes || '',
          total: unitPrice * qtyToAdd * (1 - unitDiscount / 100),
          pinnedBatchNumber: pinnedBatchNumber || null,
          serialNumber: pinnedSerialNumber || null,
          expiryDate: pinnedExpiry || product.expiryDate || null,
          // Lock qty on batch/serial lines — each line is exactly one physical
          // unit. The cart UI disables +/- for lines flagged batchControlled.
          batchControlled: isPinned || isBatchControlled,
        }, ...prev.items];
      }

      return recalculateInvoice(newItems);
    });
    return { ok: true };
  };
  addToInvoiceRef.current = addToInvoice;

  /**
   * Helper wrapper around addToInvoice that accepts a rich initial payload.
   * Recommended for new Item Entry workflows to ensure single-transaction mutations.
   */
  const createInvoiceLine = useCallback((payload) => {
    if (!payload || !payload.product) {
      return { ok: false, reason: 'Missing product payload' };
    }
    
    return addToInvoiceRef.current(
      payload.product,
      payload.quantity || 1,
      payload.batch || null,
      payload.serial || null,
      payload.expiry || null,
      {
        price: payload.price,
        discount: payload.discount,
        discountType: payload.discountType,
        taxRate: payload.tax,
        notes: payload.notes,
        isAbsoluteQuantity: true // If passed through wrapper, assume it's the exact final line qty
      }
    );
  }, []);

  /**
   * Helper wrapper to mutate an existing invoice row.
   * Internally leverages addToInvoice's merge logic with overrides.
   */
  const updateInvoiceLine = useCallback((payload) => {
    if (!payload || !payload.invoiceLine) {
      return { ok: false, reason: 'Missing invoiceLine payload' };
    }
    
    // To cleanly target the existing line in addToInvoice, we pass the invoiceLine
    // structured identically to how the grid passes it (id/productId).
    const fakeProduct = {
      id: payload.invoiceLine.productId || payload.invoiceLine.id,
      name: payload.invoiceLine.name,
      code: payload.invoiceLine.code,
      barcode: payload.invoiceLine.barcode,
      isBatch: payload.invoiceLine.batchControlled,
      isSerial: payload.invoiceLine.serialNumber ? 1 : 0
    };

    return addToInvoiceRef.current(
      fakeProduct,
      payload.quantity,
      payload.invoiceLine.pinnedBatchNumber || null,
      payload.invoiceLine.serialNumber || null,
      payload.invoiceLine.expiryDate || null,
      {
        price: payload.price,
        discount: payload.discount,
        discountType: payload.discountType,
        taxRate: payload.tax,
        notes: payload.notes,
        isAbsoluteQuantity: true
      }
    );
  }, []);

  /**
   * Unified search/scan handler. One input both filters the grid (as you type)
   * and — on Enter / scanner submit — resolves the value to a single action:
   *   • exact barcode / code / SKU  → add product to cart
   *   • exact batch / serial number → add product, pinning that scanned unit
   *   • exact customer id/mobile/etc → set the customer
   *   • no exact match              → leave the text in the grid filter
   * Supports an "N*VALUE" / "NxVALUE" quantity prefix.
   */
  const handleUnifiedEntry = useCallback(async (raw, { fromGrid = false } = {}) => {
    console.log(`\n======================================================`);
    console.log(`[handleUnifiedEntry EXECUTION - BARCODE SCANNER PATH]`);
    console.log(`- Captured Render ID: ${currentRenderCount}`);
    console.log(`- Captured posSettings:`, posSettings);
    console.log(`- Captured taxInclusive:`, posSettings?.taxInclusive);
    console.log(`- Captured addToInvoice Reference Match:`, window.__CURRENT_ADD_TO_INVOICE === addToInvoice ? 'LATEST' : 'STALE (from an older render!)');
    console.log(`======================================================\n`);
    const trimmed = (raw || '').trim();
    if (!trimmed) return;

    // Parse quantity prefix: "3*VALUE" or "3xVALUE"
    let qty = 1;
    let value = trimmed;
    const prefixMatch = trimmed.match(/^(\d+)[*x](.+)$/i);
    if (prefixMatch) {
      qty = Math.max(1, parseInt(prefixMatch[1], 10));
      value = prefixMatch[2].trim();
    }

    const clearInputs = () => {
      setBarcodeInput('');
      if (fromGrid) setSearchQuery('');
    };

    // Fast path: a previously-seen product in the in-memory cache (no batch pin).
    // Batch/serial-controlled products skip the cache and always go through the
    // backend resolver so a scanned barcode can still pin the exact unit and the
    // one-batch-one-unit rule is enforced rather than silently merging quantity.
    const cached = productCacheRef.current.get(value.toLowerCase());
    if (cached && !cached.isBatch && !cached.isSerial) {
      if (cached.availableInPos === false) {
        showFeedback('error', 'This product is disabled for POS sales.');
        clearInputs();
        return;
      }
      const res = handleProductSelectionRef.current(cached, { quantity: qty });
      if (res && res.ok === false) {
        showFeedback('error', res.reason || 'Could not add this item.');
        clearInputs();
        return;
      }
      // OPEN_ENTRY_DIALOG took over — nothing is in the cart yet, so no
      // "added" toast and no last-scanned banner until the cashier confirms.
      if (res?.deferred) {
        clearInputs();
        return;
      }
      setLastScannedItem({ name: cached.name, nameAr: cached.nameAr || '', barcode: cached.barcode || cached.id, qty, total: cached.price * qty });
      showFeedback('success', qty > 1 ? `${cached.name} ×${qty} added` : `${cached.name} added`);
      clearInputs();
      return;
    }

    let result;
    try {
      result = await resolvePosEntry(value);
    } catch (error) {
      console.error('Failed to resolve POS entry', error);
      showFeedback('error', `Lookup failed: ${value}`);
      return;
    }

    // A batch/serial unit that exists but can't be sold (reserved / consumed /
    // sold). The backend already refuses to add it — surface its reason so the
    // cashier knows why, and never fall through to the grid-filter branch.
    if (result?.type === 'BLOCKED') {
      showFeedback('error', result.message || 'This unit is not available for sale.');
      setBarcodeInput('');
      return;
    }

    // A Credit Voucher is a payment instrument, never a cart line: it gets no quantity, no
    // stock movement, no VAT and no revenue. Applying it records a VOUCHER allocation on the
    // sale's Payment Manager — the same allocation the checkout panel would create — and the
    // backend redeems it under a row lock at settlement.
    if (result?.type === 'VOUCHER') {
      const outcome = applyScannedVoucherRef.current?.(result.voucher)
        || { ok: false, message: 'Voucher could not be applied.' };
      // Voucher failures always speak about the voucher. "No product found" for a voucher the
      // customer is holding tells the cashier nothing they can act on.
      showFeedback(outcome.ok ? 'success' : 'error', outcome.message);
      clearInputs();
      return;
    }

    if (result?.type === 'CUSTOMER' && result.customer) {
      const c = result.customer;
      setSelectedCustomer(String(c.id ?? c.code));
      showFeedback('customer', `Customer set: ${c.name || c.code}`);
      clearInputs();
      return;
    }

    if (result?.type === 'PRODUCT' && result.product) {
      const product = mapPosProductAggregateItem(result.product, value);
      cachePosProduct(productCacheRef.current, product);
      const pinnedBatchNumber = result.pinnedBatchNumber || null;
      const pinnedSerialNumber = result.pinnedSerialNumber || null;
      const pinnedExpiry = result.pinnedExpiry || null;
      const cartItems = currentInvoiceRef.current?.items || [];

      // A scanned serial is a single unique unit. The same serial can never be
      // sold twice on one bill, so block the duplicate outright (no qty bump).
      if (pinnedSerialNumber) {
        if (cartItems.some(i => i.serialNumber === pinnedSerialNumber)) {
          showFeedback('error', `Serial number ${pinnedSerialNumber} already exists in cart`);
          clearInputs();
          return;
        }
        const serialRes = handleProductSelectionRef.current(product, { quantity: 1, serial: pinnedSerialNumber });
        if (serialRes && serialRes.ok === false) {
          showFeedback('error', serialRes.reason || 'Could not add this item.');
          clearInputs();
          return;
        }
        if (serialRes?.deferred) {
          clearInputs();
          return;
        }
        setLastScannedItem({
          name: product.name, nameAr: product.nameAr || '',
          barcode: pinnedSerialNumber, qty: 1, total: product.price,
        });
        showFeedback('success', `${product.name} — serial ${pinnedSerialNumber}`);
        clearInputs();
        return;
      }

      // A pinned batch is one physical unit — force qty 1 for that line.
      const effectiveQty = pinnedBatchNumber ? 1 : qty;
      // Prevent the same physical batch unit from being added twice.
      if (pinnedBatchNumber && cartItems.some(i => i.pinnedBatchNumber === pinnedBatchNumber)) {
        showFeedback('error', `Batch ${pinnedBatchNumber} already exists in cart`);
        clearInputs();
        return;
      }
      // addToInvoice enforces one-batch-one-unit for batch/serial products added
      // without a pin (e.g. resolved by product code) — surface its refusal.
      const addRes = handleProductSelectionRef.current(product, {
        quantity: effectiveQty,
        batch: pinnedBatchNumber,
        expiry: pinnedExpiry,
      });
      if (addRes && addRes.ok === false) {
        showFeedback('error', addRes.reason || 'Could not add this item.');
        clearInputs();
        return;
      }
      if (addRes?.deferred) {
        clearInputs();
        return;
      }
      setLastScannedItem({
        name: product.name,
        nameAr: product.nameAr || '',
        barcode: pinnedBatchNumber || product.barcode || product.id,
        qty: effectiveQty,
        total: product.price * effectiveQty,
      });
      showFeedback('success', pinnedBatchNumber
        ? `${product.name} — batch ${pinnedBatchNumber}`
        : (effectiveQty > 1 ? `${product.name} ×${effectiveQty} added` : `${product.name} added`));
      clearInputs();
      return;
    }

    // No exact match. From the grid input we keep the text so the grid filters;
    // from a dedicated scan we surface a not-found message.
    if (fromGrid) {
      showFeedback('error', `No exact match — showing results for "${value}"`);
    } else {
      showFeedback('error', `No product found: ${value}`);
      setBarcodeInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back-compat alias: existing scan/keypad call sites add-to-cart.
  const handleBarcodeScan = handleUnifiedEntry;

  /* ─── Product Entry Mode: the single decision point ────────────────────────
   * Every way a product can enter the cart — grid/touch click, barcode scan,
   * keyboard Enter from the search box, scan suggestions, favourites/quick
   * products — routes through handleProductSelection. Nothing else may call
   * addToInvoice for a *new* selection, otherwise the configured mode gets
   * bypassed (which is exactly the bug this replaces). Templates receive
   * handleProductSelection/handleEditItem as props and stay presentational.
   * ─────────────────────────────────────────────────────────────────────── */
  const [isItemEntryOpen, setIsItemEntryOpen] = useState(false);
  const [selectedProductForEntry, setSelectedProductForEntry] = useState(null);
  const [itemEntryAction, setItemEntryAction] = useState('add'); // 'add' | 'edit'
  // Carries the scan-resolved unit (batch/serial/expiry) plus qty locking into
  // the dialog, and back out again when the cashier confirms.
  const [itemEntryContext, setItemEntryContext] = useState(null);

  const closeItemEntry = useCallback(() => {
    setIsItemEntryOpen(false);
    setSelectedProductForEntry(null);
    setItemEntryContext(null);
  }, []);

  /**
   * Resolves the configured Product Entry Mode and acts on it.
   * DIRECT_ADD        → adds straight to the cart (qty 1 unless a scan said otherwise)
   * OPEN_ENTRY_DIALOG → opens the Item Entry dialog; nothing is added until confirm
   *
   * Returns addToInvoice's `{ ok, reason }` in DIRECT_ADD mode so callers can
   * surface refusals, or `{ ok: true, deferred: true }` when the dialog took
   * over — `deferred` tells scan callers to skip their "added" feedback.
   *
   * DIRECT_ADD is the default everywhere (backend, POS Settings, here); there is
   * deliberately no OPEN_ENTRY_DIALOG fallback.
   */
  const handleProductSelection = useCallback((product, options = {}) => {
    if (!product) return { ok: false, reason: 'No product selected' };
    const { quantity = 1, batch = null, serial = null, expiry = null } = options;
    const entryMode = posSettingsRef.current?.productEntryMode || ProductEntryMode.DIRECT_ADD;

    if (entryMode !== ProductEntryMode.OPEN_ENTRY_DIALOG) {
      return addToInvoiceRef.current(product, quantity, batch, serial, expiry);
    }

    // A scan that already resolved a specific batch/serial still opens the
    // dialog — the unit is preselected and locked, price/discount stay editable.
    const isControlledUnit = Boolean(batch || serial || product.isBatch || product.isSerial);
    setItemEntryAction('add');
    setSelectedProductForEntry(product);
    setItemEntryContext({
      batch,
      serial,
      expiry,
      // One physical unit per batch/serial line — qty is fixed at 1.
      quantity: isControlledUnit ? 1 : quantity,
      lockQuantity: isControlledUnit,
    });
    setIsItemEntryOpen(true);
    return { ok: true, deferred: true };
  }, []);
  // handleUnifiedEntry is frozen at mount (empty dep array), so it reaches the
  // live handler through a ref — same reason addToInvoiceRef exists.
  handleProductSelectionRef.current = handleProductSelection;

  /** Opens the Item Entry dialog on an existing cart row. */
  const handleEditItem = useCallback((itemId) => {
    const item = currentInvoiceRef.current?.items?.find(i => i.id === itemId);
    if (!item) return;
    setItemEntryAction('edit');
    setSelectedProductForEntry(item);
    setItemEntryContext({ lockQuantity: Boolean(item.batchControlled) });
    setIsItemEntryOpen(true);
  }, []);

  const handleItemEntryConfirm = useCallback((payload) => {
    if (itemEntryAction === 'edit') {
      updateInvoiceLine(payload);
      closeItemEntry();
      return;
    }
    // Re-attach the scan-pinned unit so the confirmed line lands on the exact
    // batch/serial the cashier scanned.
    const res = createInvoiceLine({
      ...payload,
      batch: itemEntryContext?.batch || null,
      serial: itemEntryContext?.serial || null,
      expiry: itemEntryContext?.expiry || null,
    });
    if (res && res.ok === false) {
      // The price floor sent this to the supervisor-PIN gate. The pending
      // override already carries the whole line, so hand off and get out of the
      // way rather than stacking dialogs.
      if (res.reason === 'supervisor-approval-required') {
        closeItemEntry();
        return;
      }
      showFeedback('error', res.reason || 'Could not add this item.');
      return;
    }
    closeItemEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemEntryAction, itemEntryContext, createInvoiceLine, updateInvoiceLine, closeItemEntry]);

  // Stable object so POSItemEntryContainer's data-fetch effect doesn't re-run
  // (and reset the form) on every parent render.
  const itemEntryInitialValues = useMemo(
    () => ({ quantity: itemEntryContext?.quantity ?? 1 }),
    [itemEntryContext]
  );


  return {
    // Entry points. createInvoiceLine/updateInvoiceLine stay internal: they exist only to
    // serve the Item Entry dialog's confirm, and exposing them would give a caller a way
    // around the Product Entry Mode decision.
    addToInvoice,
    handleUnifiedEntry,
    handleBarcodeScan,
    handleProductSelection,
    handleEditItem,
    // Scan banner.
    lastScannedItem,
    setLastScannedItem,
    // Item Entry dialog.
    isItemEntryOpen,
    selectedProductForEntry,
    itemEntryAction,
    itemEntryContext,
    itemEntryInitialValues,
    closeItemEntry,
    handleItemEntryConfirm,
  };
}

export default useProductEntry;
