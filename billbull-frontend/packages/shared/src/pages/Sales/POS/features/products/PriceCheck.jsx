// Extracted verbatim from POSSales.jsx (the Price Check modal).
// Behaviour is unchanged; only the location moved. The three Price Check states and their setters
// stay in POSSales; currentTerminal/currentSession stay in usePosSession and handleProductSelection
// stays in useProductEntry. The parent keeps the `showPriceCheck &&` mount condition. Every value
// below is passed down under its ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs and calls no hooks. It keeps the region's two
// direct product lookups (resolvePosEntry, getProductsList) exactly as they were.

import React from 'react';
import { AlertCircle, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { resolvePosEntry } from '../../../../../api/posApi';
import { getProductsList } from '../../../../../api/productsApi';
import AsyncSearchableDropdown from '../../../../../components/AsyncSearchableDropdown';
import { DirhamSymbol } from '../../POSCurrency';
import { toNumber, mapPosProductListItem, mapPosProductAggregateItem } from '../../posUtils';

function PriceCheck({
  showPriceCheck,
  setShowPriceCheck,
  priceCheckQuery,
  setPriceCheckQuery,
  priceCheckResult,
  setPriceCheckResult,
  currentTerminal,
  currentSession,
  handleProductSelection,
}) {
  const foundProduct = priceCheckResult && priceCheckResult !== 'searching' && priceCheckResult !== 'notfound' ? priceCheckResult : null;
  const vatRate = foundProduct ? toNumber(foundProduct.salesTax, 5) : 5;
  const basePrice = foundProduct ? toNumber(foundProduct.price, 0) : 0;
  const discountPct = foundProduct ? toNumber(foundProduct.defaultDiscount, 0) : 0;
  const discountedPrice = basePrice * (1 - discountPct / 100);
  const finalPrice = discountedPrice * (1 + vatRate / 100);
  const doSearch = async () => {
    const q = priceCheckQuery.trim();
    if (!q) { setPriceCheckResult('notfound'); return; }
    setPriceCheckResult('searching');
    try {
      // Try unified resolver first (handles barcode, batch, product code)
      const resolved = await resolvePosEntry(q);
      if (resolved?.type === 'PRODUCT' && resolved.product) {
        setPriceCheckResult(mapPosProductAggregateItem(resolved.product, q));
        return;
      }
      // Fallback: name/keyword search via product list
      const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
      const searchData = await getProductsList(0, 1, q, undefined, null, null, null, true, posBranchId);
      if (Array.isArray(searchData?.content) && searchData.content.length > 0) {
        setPriceCheckResult(mapPosProductListItem(searchData.content[0]));
        return;
      }
      setPriceCheckResult('notfound');
    } catch { setPriceCheckResult('notfound'); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowPriceCheck(false)} />
      <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Price Check</span></div>
            <p className="text-sm text-gray-500 mt-1">Scan or search an item to check price, stock, barcode, and product details.</p>
          </div>
          <button onClick={() => setShowPriceCheck(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
        </div>
        {/* Search */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex gap-3 shrink-0">
          <div className="relative flex-1">
            <AsyncSearchableDropdown
              value={null}
              inputValue={priceCheckQuery}
              onInputChange={setPriceCheckQuery}
              placeholder="Scan barcode or type item name / code..."
              fetchOptions={async (query) => {
                if (!query) return [];
                try {
                  const resolved = await resolvePosEntry(query);
                  if (resolved?.type === 'PRODUCT' && resolved.product) {
                    return [mapPosProductAggregateItem(resolved.product, query)];
                  }
                  const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
                  const searchData = await getProductsList(0, 10, query, undefined, null, null, null, true, posBranchId);
                  if (Array.isArray(searchData?.content)) {
                    return searchData.content.map(p => mapPosProductListItem(p));
                  }
                } catch { return []; }
                return [];
              }}
              renderOption={(opt, active) => (
                <div className="flex items-center gap-3 p-2">
                  {opt.image ? (
                    <img src={opt.image.startsWith('data:') || opt.image.startsWith('http') ? opt.image : `data:image/jpeg;base64,${opt.image}`} alt="" className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0"><Search className="h-5 w-5 text-gray-400" /></div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="font-bold text-sm text-gray-900 leading-tight truncate">{opt.name}</p>
                    <p className="text-xs text-gray-500 leading-tight truncate">{opt.code} {opt.barcode ? `| ${opt.barcode}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-[#327F74] text-sm">{opt.price} AED</p>
                    <p className="text-[10px] text-gray-500">Stock: {opt.stock}</p>
                  </div>
                </div>
              )}
              onSelect={(opt) => {
                if (opt) {
                  setPriceCheckQuery(opt.name || opt.code || '');
                  setPriceCheckResult(opt);
                }
              }}
              className="w-full text-base"
              debounceMs={300}
            />
          </div>
          <button onClick={doSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0"><Search className="h-4 w-4" />Search</button>
          <button onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); }} className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shrink-0">Clear</button>
        </div>
        <div className="overflow-auto flex-1 p-6">
          {priceCheckResult === null && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <Search className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-sm font-medium text-gray-500">Scan a barcode or type an item name to check price and availability.</p>
            </div>
          )}
          {priceCheckResult === 'searching' && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-500">Searching...</p>
            </div>
          )}
          {priceCheckResult === 'notfound' && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
              <p className="text-sm font-medium text-gray-500">No item found for the scanned barcode or search keyword.</p>
            </div>
          )}
          {foundProduct && (
            <div className="space-y-4">
              <div className="bg-white border border-[#327F74]/20 rounded-2xl p-5 flex flex-col md:flex-row gap-6 shadow-sm">
                {/* Left: Image & Details */}
                <div className="flex flex-col sm:flex-row flex-1 gap-5">
                  <div className="w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                    {foundProduct.image
                      ? <img src={foundProduct.image} className="w-full h-full object-cover" alt={foundProduct.name} />
                      : <ShoppingCart className="w-8 h-8 text-gray-300" />}
                  </div>
                  <div className="flex-1 flex flex-col justify-center space-y-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#1E293B] leading-tight">{foundProduct.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{foundProduct.departmentName || 'General Department'}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
                      <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Item Code</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.code}</span></div>
                      <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Barcode</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.barcode}</span></div>
                    </div>
                  </div>
                </div>

                {/* Right: Pricing & Stock */}
                <div className="md:w-64 shrink-0 bg-gray-50 rounded-xl p-4 flex flex-col justify-center border border-gray-100 relative">
                  <div className="absolute -top-3 right-4">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm border ${foundProduct.stock > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {foundProduct.stock > 0 ? `${foundProduct.stock} in Stock` : 'Out of Stock'}
                    </span>
                  </div>

                  <div className="text-center mt-3 mb-4">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Selling Price</p>
                    <div className="text-3xl font-black text-[#327F74] flex items-center justify-center gap-1">
                      <DirhamSymbol /> {finalPrice.toFixed(2)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5 font-medium">VAT {vatRate}% Included</p>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-gray-200">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-gray-500">Base Price:</span>
                      <span className="text-[#1E293B]"><DirhamSymbol /> {basePrice.toFixed(2)}</span>
                    </div>
                    {discountPct > 0 && (
                      <div className="flex justify-between text-[11px] text-orange-600 font-bold">
                        <span>Discount ({discountPct}%):</span>
                        <span>−<DirhamSymbol /> {(basePrice - discountedPrice).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bg-gray-50 border-t border-gray-200 px-3 sm:px-6 py-4 flex flex-wrap justify-end gap-3 shrink-0">
          <button onClick={() => setShowPriceCheck(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
          {foundProduct && (
            <button onClick={() => { handleProductSelection(foundProduct); setShowPriceCheck(false); setPriceCheckQuery(''); setPriceCheckResult(null); }}
              className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors">
              <Plus className="h-4 w-4" />Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PriceCheck;
