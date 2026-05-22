import React from 'react';
import { Box, Search, ChevronUp, ChevronDown, SlidersHorizontal, Menu, PackageCheck } from 'lucide-react';
import { getImageUrl } from '../utils/urlUtils';

export const ItemDescriptionHeader = React.memo(({
    itemCount,
    expandedRowsCount,
    onToggleAll
}) => {
    return (
        <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[11px] font-semibold text-slate-600">Item / Description</span>
            <button
                onClick={(e) => { e.preventDefault(); onToggleAll(); }}
                className="flex items-center gap-1.5 bg-[#FFF9C4] text-[#B8860B] px-2.5 py-0.5 rounded-full text-[10px] font-extrabold hover:bg-[#FFF59D] transition-all border border-[#F0E68C] shadow-sm hover:shadow active:scale-95"
            >
                <Menu size={10} strokeWidth={3} />
                {expandedRowsCount > 0 ? "Hide All" : "Show All"}
                <span className="bg-[#FFD700] text-slate-800 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] shadow-sm">{itemCount}</span>
            </button>
        </div>
    );
});

export const ItemDescriptionCell = React.memo(({
    item,
    isExpanded,
    onToggleExpand,
    onItemChange,
    onFocusCode,
    onOpenProductSelection,
    onCheckStock,
    onOpenSettings,
    showBarcode = true,
    showTaxDiscount = true,
    showSettings = true,
    isReadOnly = false,
    module = 'sales',
    page = 'quotations',
    component = 'item_table'
}) => {
    const isCompact = page === 'salesInvoice';
    const isQuotation = page === 'quotations';
    const isSalesOrder = page === 'sales_orders' || page === 'salesOrders';
    const isProforma = page === 'proforma_invoice';
    const roundedMargin = Number.isFinite(Number(item?.margin))
        ? Number(item.margin).toFixed(2)
        : null;
    // Discount color logic
    const getDiscountColor = (disc) => {
        const d = parseFloat(disc) || 0;
        if (d === 0) return 'text-slate-400';
        if (d <= 10) return 'text-amber-500 font-bold';
        return 'text-red-500 font-bold';
    };

    return (
        <div className={`flex ${isCompact ? 'gap-2.5 py-0.5' : 'gap-3 py-1'} items-start relative`}>
            {/* Product Image / Icon Box */}
            <div className={`${isCompact ? 'w-[34px] h-[34px]' : 'w-[38px] h-[38px]'} rounded-lg border border-slate-200 shadow-sm shrink-0 overflow-hidden bg-[#F8F9FA] flex items-center justify-center mt-0.5 group/img relative`}>
                {item.image ? (
                    <img
                        src={getImageUrl(item.image)}
                        alt={item.desc || item.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-110"
                        title={item.desc || item.name}
                    />
                ) : (
                    item.code ? <Box size={18} className="text-slate-300" /> : <div className="text-[9px] text-slate-300 uppercase font-black">bill</div>
                )}
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0 flex flex-col gap-1 w-full">
                {/* Top Row: Code and Barcode */}
                <div className="flex items-center gap-2 w-full no-wrap overflow-hidden">
                    {/* Code Box */}
                    <div
                        className={`border border-slate-300/60 rounded bg-white px-2 flex items-center ${isCompact ? 'h-[22px]' : 'h-[24px]'} min-w-[90px] max-w-[130px] shadow-sm ${item.code ? 'cursor-pointer hover:border-yellow-400 transition-colors' : ''}`}
                        onClick={() => { if (item.code) onFocusCode(); }}
                    >
                        {item.code ? (
                            <span className={`text-[11px] ${isCompact ? 'font-medium' : ((isQuotation || isSalesOrder || isProforma) ? 'font-semibold' : 'font-black')} text-slate-800 w-full truncate tracking-tight`}>{item.code}</span>
                        ) : (
                            <input
                                className={`w-full text-[11px] ${isCompact ? 'font-normal' : ((isQuotation || isSalesOrder || isProforma) ? 'font-normal' : 'font-bold')} text-slate-800 bg-transparent outline-none placeholder:text-slate-400 focus:ring-0`}
                                placeholder="Item Code"
                                value={item.code || ''}
                                onChange={(e) => onItemChange && onItemChange(item.id, 'code', e.target.value)}
                                onFocus={onFocusCode}
                                readOnly={isReadOnly}
                            />
                        )}
                    </div>

                    {/* Barcode literal */}
                    {showBarcode && (
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            <span className="font-mono text-[9px] tracking-[1.5px] font-bold text-slate-300">||||</span>
                            <span className="text-[10px] text-slate-400 font-semibold italic tracking-tight">{item.barcode || 'no barcode'}</span>
                            {!isReadOnly && onOpenProductSelection && (
                                <Search
                                    size={14}
                                    className="text-slate-400 cursor-pointer hover:text-yellow-600 hover:scale-110 ml-1 transition-all"
                                    onClick={() => onOpenProductSelection(item)}
                                />
                            )}
                        </div>
                    )}

                    {/* Enterprise: Stock Indicator Badge */}
                    {item.code && item.availableQty !== undefined && (
                        <div className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shadow-sm ${item.availableQty > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            Avail: {item.availableQty}
                        </div>
                    )}
                </div>

                {/* Middle Row: Description Box and Expander */}
                <div className="flex items-center gap-1.5 mt-0.5 w-full">
                    <div className={`border border-slate-300/60 rounded px-2 flex items-center ${isCompact ? 'h-[24px]' : 'h-[26px]'} w-full max-w-[320px] shadow-sm transition-all focus-within:border-yellow-400 focus-within:ring-1 focus-within:ring-yellow-100 bg-white`}>
                        <input
                            className={`w-full text-[11px] ${isCompact ? 'font-normal' : ((isQuotation || isSalesOrder || isProforma) ? 'font-normal' : 'font-bold')} text-slate-800 bg-transparent outline-none placeholder:text-slate-400 focus:ring-0 ${item.isProductSelected ? 'text-slate-600' : ''}`}
                            placeholder="Description"
                            value={item.desc || item.name || ''}
                            onChange={(e) => onItemChange && onItemChange(item.id, 'desc', e.target.value)}
                            onFocus={onFocusCode}
                            onClick={onFocusCode}
                            readOnly={isReadOnly || item.isProductSelected}
                        />
                    </div>
                    <button
                        onClick={(e) => { e.preventDefault(); onToggleExpand(item.id); }}
                        className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-yellow-400 hover:text-slate-900 transition-all shadow-sm active:scale-90 shrink-0"
                    >
                        {isExpanded ? <ChevronUp size={11} strokeWidth={3} /> : <ChevronDown size={11} strokeWidth={3} />}
                    </button>
                </div>

                {/* Short Description (italic) — detailed description lives in the yellow PRODUCT DESCRIPTION box only */}
                {item.shortDesc && (
                    <div className="text-[10px] text-slate-500 italic leading-tight truncate max-w-[320px] mt-0.5" title={item.shortDesc}>
                        {item.shortDesc}
                    </div>
                )}

                {/* Bottom Row: Metadata (Tax, Disc, FOC, Margin) & Actions */}
                {(showTaxDiscount || showSettings) && (
                    <div className="flex items-center justify-between w-full max-w-[360px] mt-0.5">
                        {showTaxDiscount && (
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                                    Tax {Number(item.tax ?? 0)}% <span className="text-slate-400">({(item.taxAmt || 0).toFixed(2)})</span>
                                </span>
                                <span className={`text-[10px] font-medium whitespace-nowrap ${getDiscountColor(item.disc)}`}>
                                    Disc {Number(item.disc ?? 0)}%
                                </span>
                                {item.foc > 0 && (
                                    <span className="text-[10px] text-emerald-600 font-black whitespace-nowrap bg-emerald-50 px-1 rounded border border-emerald-100">
                                        FOC: {item.foc} {item.focUnit || item.unit}
                                    </span>
                                )}
                                {roundedMargin !== null && (
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${Number(item.margin) < 10 ? 'text-red-400' : 'text-slate-400'}`}>
                                        Margin: {roundedMargin}%
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-1 ml-auto shrink-0">
                            {showSettings && item.code && onCheckStock && (
                                <button
                                    onClick={(e) => { e.preventDefault(); onCheckStock(item); }}
                                    className="p-1 rounded bg-slate-50 text-emerald-500 hover:text-white hover:bg-emerald-500 transition-all shadow-sm border border-emerald-100"
                                    title="Check Stock"
                                >
                                    <PackageCheck size={14} />
                                </button>
                            )}
                            {showSettings && onOpenSettings && (
                                <button
                                    onClick={(e) => { e.preventDefault(); onOpenSettings(item); }}
                                    className="p-1 rounded bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-yellow-400 transition-all shadow-sm border border-slate-200"
                                    title={isReadOnly ? 'View Item Details' : 'Item Settings'}
                                >
                                    <SlidersHorizontal size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
