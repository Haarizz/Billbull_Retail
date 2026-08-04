import React from 'react';
import { X, Lock } from 'lucide-react';
import EntryForm from './EntryForm';
import StockCard from './StockCard';
import CustomerPriceCard from './CustomerPriceCard';
import RecentSalesCard from './RecentSalesCard';
import {
  Dialog,
  DialogContent,
} from '../../ui/dialog';

const POSItemEntryModal = ({
    isOpen,
    onClose,
    onConfirm,
    product,
    mode,
    showContextPanel,
    contextState,
    price,
    quantity,
    discount,
    taxRate,
    netTotal,
    errors,
    onChangePrice,
    onChangeQuantity,
    onChangeDiscount,
    editablePrice,
    editableDiscount,
    lockQuantity,
    lockedBatch,
    lockedSerial,
    customerName,
    selectedPriceRef,
    onSelectPrice
}) => {
    if (!product) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[95vw] sm:max-w-[900px] p-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row max-h-[90vh] bg-white border-0 sm:rounded-2xl shadow-2xl [&>button]:hidden">

                {/* Left Column: Form & Product Header */}
                <div className="flex-1 flex flex-col bg-white border-r border-gray-100 md:min-h-0 md:overflow-hidden">

                    {/* Brand Amber Header */}
                    <div className="bg-primary text-white px-4 sm:px-6 py-4 sm:py-5 relative sm:rounded-tl-2xl shrink-0">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1.5 bg-white/20 hover:bg-white/30 rounded-full text-white/90 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                        <p className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1">Item Entry</p>
                        <h2 className="text-lg sm:text-xl font-black text-white leading-tight mb-0.5 pr-8">{product.name}</h2>
                        <p className="text-xs text-white/80 font-medium font-mono uppercase">
                            {product.code || 'SKU-UNKNOWN'} &bull; {product.uom || 'UNIT'}
                        </p>
                        {/* The scan already pinned one physical unit — show it so the
                            cashier can see exactly what they are confirming. */}
                        {(lockedSerial || lockedBatch) && (
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                                <Lock size={10} strokeWidth={3} />
                                {lockedSerial ? `Serial ${lockedSerial}` : `Batch ${lockedBatch}`}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 p-4 sm:p-6 md:overflow-y-auto">
                        <EntryForm 
                            price={price}
                            quantity={quantity}
                            discount={discount}
                            taxRate={taxRate}
                            netTotal={netTotal}
                            onChangePrice={onChangePrice}
                            onChangeQuantity={onChangeQuantity}
                            onChangeDiscount={onChangeDiscount}
                            isReadOnly={mode === 'view'}
                            errors={errors}
                            onCancel={onClose}
                            onConfirm={onConfirm}
                            mode={mode}
                            uom={product.uom || 'BAG'}
                            lockQuantity={lockQuantity}
                        />
                    </div>
                </div>
                
                {/* Right Column: Context Panel */}
                {showContextPanel && (
                    <div className="w-full md:w-[320px] lg:w-[420px] shrink-0 bg-white flex flex-col border-t border-gray-100 md:border-t-0 md:min-h-0 md:overflow-y-auto">
                        <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
                            <StockCard 
                                loading={contextState?.stock?.loading}
                                error={contextState?.stock?.error}
                                stockData={contextState?.stock?.data}
                                uom={product.uom || 'BAG'}
                            />
                            <CustomerPriceCard
                                loading={contextState?.priceHistory?.loading}
                                error={contextState?.priceHistory?.error}
                                customerPrices={contextState?.priceHistory?.data?.customerPrices || []}
                                customerName={customerName}
                                selectedIndex={selectedPriceRef?.source === 'customer' ? selectedPriceRef.index : -1}
                                onSelectPrice={(index, selectedPrice) => onSelectPrice('customer', index, selectedPrice)}
                            />
                            <RecentSalesCard
                                loading={contextState?.priceHistory?.loading}
                                error={contextState?.priceHistory?.error}
                                recentSales={contextState?.priceHistory?.data?.recentSales || []}
                                selectedIndex={selectedPriceRef?.source === 'recent' ? selectedPriceRef.index : -1}
                                onSelectPrice={(index, selectedPrice) => onSelectPrice('recent', index, selectedPrice)}
                            />
                        </div>
                        <div className="px-6 pb-4 mt-auto text-[10px] text-gray-400 font-medium">
                            # Tap any price row to load it into the field on the left.
                        </div>
                    </div>
                )}

            </DialogContent>
        </Dialog>
    );
};

export default POSItemEntryModal;
