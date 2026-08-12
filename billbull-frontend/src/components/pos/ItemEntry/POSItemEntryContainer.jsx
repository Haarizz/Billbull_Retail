import React, { useState, useEffect, useRef } from 'react';
import { getStockAvailability } from '../../../api/stockAvailabilityApi';
import { getItemPriceHistory } from '../../../api/salesInvoiceApi';
import { resolveLineTaxRate } from '../../../utils/vatMath';
import POSItemEntryModal from './POSItemEntryModal';

const EMPTY_OBJ = {};

/**
 * POSItemEntryContainer
 * 
 * Orchestrates API calls (Stock and Price History) when the product entry dialog opens.
 * Prepares preview values and form state, passing them down to the presentation-only Modal.
 */
const POSItemEntryContainer = ({
    isOpen,
    onClose,
    onConfirm,
    product, // Used in Add Mode
    invoiceLine, // Used in Edit Mode
    initialValues = EMPTY_OBJ,
    mode = 'add', // 'add', 'edit', 'view'
    customerId,
    customerCode,
    customerName,
    warehouseId,
    zoneId,
    locatorId,
    binId,
    editablePrice = true,
    editableDiscount = true,
    // A barcode scan can resolve one specific physical unit. That unit is shown
    // in the dialog and cannot be changed here; quantity is pinned to 1 because
    // a batch/serial line is exactly one unit. Price/discount stay editable.
    lockQuantity = false,
    lockedBatch = null,
    lockedSerial = null,
    showContextPanel = true,
    showStock = true,
    showPriceHistory = true,
    showRecentSales = true,
    posSettings = {}
}) => {
    // --- Data State ---
    const [stockData, setStockData] = useState(null);
    const [isStockLoading, setIsStockLoading] = useState(false);
    const [stockError, setStockError] = useState(null);

    const [priceHistoryData, setPriceHistoryData] = useState(null);
    const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);
    const [priceHistoryError, setPriceHistoryError] = useState(null);
    // Tracks exactly which price-history row the user clicked, so only that
    // row highlights — not every row that happens to share the same price.
    const [selectedPriceRef, setSelectedPriceRef] = useState({ source: null, index: null });

    // --- Form State ---
    const [localPrice, setLocalPrice] = useState(0);
    const [localQty, setLocalQty] = useState(1);
    const [localDisc, setLocalDisc] = useState(0);
    // Whether localDisc is a percentage or a currency amount off the line.
    // Downstream (cart line, totals, backend) always stores a percentage, so an
    // amount entry is converted at confirm time.
    const [discountMode, setDiscountMode] = useState('percent');
    const [errors, setErrors] = useState({});

    const abortControllers = useRef({ stock: null, price: null });

    // Resolve the active entity based on mode
    const activeEntity = mode === 'edit' ? invoiceLine : product;

    useEffect(() => {
        if (isOpen && activeEntity) {
            if (mode === 'edit') {
                setLocalQty(activeEntity.quantity ?? 1);
                setLocalPrice(activeEntity.price ?? 0);
                setLocalDisc(activeEntity.discount ?? 0);
            } else {
                setLocalQty(initialValues?.quantity ?? 1);
                setLocalPrice(initialValues?.price ?? (activeEntity.price || 0));
                setLocalDisc(initialValues?.discount ?? (activeEntity.defaultDiscount || activeEntity.maxDiscount || 0));
            }
            setDiscountMode('percent');
            setErrors({});
        }
    }, [isOpen, activeEntity, mode, initialValues]);

    useEffect(() => {
        setSelectedPriceRef({ source: null, index: null });

        if (!isOpen || !activeEntity?.code) {
            setStockData(null);
            setPriceHistoryData(null);
            setStockError(null);
            setPriceHistoryError(null);
            return;
        }

        // Cancel any in-flight requests
        if (abortControllers.current.stock) abortControllers.current.stock.abort();
        if (abortControllers.current.price) abortControllers.current.price.abort();

        abortControllers.current.stock = new AbortController();
        abortControllers.current.price = new AbortController();

        // 1. Fetch Stock
        if (showStock) {
            setIsStockLoading(true);
            setStockError(null);
            const stockScope = { warehouseId, zoneId, locatorId, binId };
            
            getStockAvailability(activeEntity.code, stockScope, abortControllers.current.stock.signal)
                .then(data => {
                    setStockData(data || { locations: [], incomingLpos: [] });
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error('Error fetching stock for item entry:', err);
                        setStockError('Failed to load stock data.');
                    }
                })
                .finally(() => setIsStockLoading(false));
        }

        // 2. Fetch Price History
        if ((showPriceHistory || showRecentSales) && activeEntity.code) {
            setIsPriceHistoryLoading(true);
            setPriceHistoryError(null);
            
            getItemPriceHistory(activeEntity.code, customerCode, abortControllers.current.price.signal)
                .then(data => {
                    setPriceHistoryData(data);
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error('Error fetching price history for item entry:', err);
                        setPriceHistoryError('Failed to load price history.');
                    }
                })
                .finally(() => setIsPriceHistoryLoading(false));
        }

        return () => {
            if (abortControllers.current.stock) abortControllers.current.stock.abort();
            if (abortControllers.current.price) abortControllers.current.price.abort();
        };
    }, [isOpen, activeEntity, customerCode, warehouseId, zoneId, locatorId, binId, showStock, showPriceHistory, showRecentSales]);

    // --- Calculations ---
    const parsedQty = parseFloat(localQty) || 0;
    const parsedPrice = parseFloat(localPrice) || 0;
    const parsedDisc = parseFloat(localDisc) || 0;

    const taxRate = resolveLineTaxRate(activeEntity, posSettings.branchDefaultVatRate, posSettings.taxEnabled !== false);
    // Matches addToInvoice's own per-line math (POSSales.jsx: unitPrice * qty *
    // (1 - discount/100)) so this preview never disagrees with the amount that
    // actually lands on the cart row once confirmed. VAT itself is computed and
    // shown only at the invoice level (see TradeSummary), not per line.
    const grossTotal = parsedPrice * parsedQty;
    // An amount discount is expressed as the equivalent percentage of the line's
    // gross so every downstream consumer keeps working off a single percent field.
    const discountPercent = discountMode === 'amount'
        ? (grossTotal > 0 ? (parsedDisc / grossTotal) * 100 : 0)
        : parsedDisc;
    const netTotal = grossTotal * (1 - discountPercent / 100);

    const handleDiscountModeChange = (nextMode) => {
        if (nextMode === discountMode) return;
        // Carry the entered discount across the toggle instead of silently
        // reinterpreting "10%" as "10 AED" (or vice versa).
        if (grossTotal > 0 && parsedDisc > 0) {
            setLocalDisc(nextMode === 'amount'
                ? Number(((parsedDisc / 100) * grossTotal).toFixed(2))
                : Number(((parsedDisc / grossTotal) * 100).toFixed(4)));
        }
        setDiscountMode(nextMode);
    };

    const handleConfirm = () => {
        const newErrors = {};
        if (parsedQty <= 0) newErrors.quantity = 'Quantity must be greater than 0';
        if (parsedPrice < 0) newErrors.price = 'Price cannot be negative';
        if (parsedDisc < 0) newErrors.discount = 'Discount cannot be negative';
        else if (discountMode === 'amount' && parsedDisc > grossTotal) newErrors.discount = 'Discount cannot exceed the line total';
        else if (discountMode === 'percent' && parsedDisc > 100) newErrors.discount = 'Discount must be between 0 and 100';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Return a mode-aware payload
        const payload = {
            quantity: parsedQty,
            price: parsedPrice,
            discount: discountPercent,
        };

        if (mode === 'add') {
            payload.product = activeEntity;
        } else if (mode === 'edit') {
            payload.invoiceLine = activeEntity;
        }

        onConfirm(payload);
    };

    const handleSelectPrice = (source, index, selectedPrice) => {
        if (mode === 'view') return;
        setSelectedPriceRef({ source, index });
        setLocalPrice(selectedPrice);
    };

    // Manual edits to the price field no longer correspond to whichever
    // history row was last clicked, so clear that row's highlight.
    const handlePriceInputChange = (value) => {
        setSelectedPriceRef({ source: null, index: null });
        setLocalPrice(value);
    };

    // Construct the context state to pass to the dumb modal
    const contextState = {
        stock: {
            data: stockData,
            loading: isStockLoading,
            error: stockError,
            isVisible: showStock
        },
        priceHistory: {
            data: priceHistoryData,
            loading: isPriceHistoryLoading,
            error: priceHistoryError,
            isVisible: showPriceHistory || showRecentSales
        }
    };

    return (
        <POSItemEntryModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={handleConfirm}
            product={activeEntity}
            mode={mode}
            editablePrice={editablePrice}
            editableDiscount={editableDiscount}
            lockQuantity={lockQuantity}
            lockedBatch={lockedBatch || (mode === 'edit' ? activeEntity.pinnedBatchNumber : null)}
            lockedSerial={lockedSerial || (mode === 'edit' ? activeEntity.serialNumber : null)}
            showContextPanel={showContextPanel}
            contextState={contextState}
            customerName={customerName}
            selectedPriceRef={selectedPriceRef}
            onSelectPrice={handleSelectPrice}
            // Form State
            price={localPrice}
            quantity={localQty}
            discount={localDisc}
            taxRate={taxRate}
            netTotal={netTotal}
            errors={errors}
            onChangePrice={handlePriceInputChange}
            onChangeQuantity={setLocalQty}
            onChangeDiscount={setLocalDisc}
            discountMode={discountMode}
            onChangeDiscountMode={handleDiscountModeChange}
        />
    );
};

export default POSItemEntryContainer;
