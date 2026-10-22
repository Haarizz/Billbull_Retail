// Extracted verbatim from POSSales.jsx (the Search Products modal).
// Behaviour is unchanged; only the location moved. All search state, the debounced search
// effect, its AbortController and branch resolution stay in useProductCatalog; product selection
// stays in useProductEntry (handleProductSelection); showFeedback and formatCurrency stay in
// POSSales. The parent keeps the `showProductSearch &&` mount condition. Every value below is
// passed down under its ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs, calls no hooks and imports no API.

import React from 'react';
import { AlertCircle, Package, Search, X } from 'lucide-react';

function ProductSearch({
  showProductSearch,
  setShowProductSearch,
  productSearchQuery,
  setProductSearchQuery,
  productSearchResults,
  productSearchLoading,
  handleProductSelection,
  showFeedback,
  formatCurrency,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowProductSearch(false)} />
      <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Search Products</span></div>
            <p className="text-sm text-gray-500 mt-1">Search by item code, barcode, or product name — matches anywhere in the name.</p>
          </div>
          <button onClick={() => setShowProductSearch(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
        </div>
        <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={productSearchQuery}
              onChange={e => setProductSearchQuery(e.target.value)}
              placeholder="Type an item code, barcode, or any part of a product name..."
              className="w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5C742] focus:bg-white"
            />
          </div>
        </div>
        <div className="overflow-auto flex-1 p-6">
          {!productSearchQuery.trim() && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <Search className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-sm font-medium text-gray-500">Start typing to search the product catalogue.</p>
            </div>
          )}
          {productSearchQuery.trim() && productSearchLoading && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-500">Searching...</p>
            </div>
          )}
          {productSearchQuery.trim() && !productSearchLoading && productSearchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
              <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
              <p className="text-sm font-medium text-gray-500">No products match "{productSearchQuery.trim()}".</p>
            </div>
          )}
          {!productSearchLoading && productSearchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {productSearchResults.map(product => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    const res = handleProductSelection(product, { quantity: 1 });
                    if (res && res.ok === false) {
                      showFeedback('error', res.reason || 'Could not add this item.');
                      return;
                    }
                    if (res?.deferred) return;
                    showFeedback('success', `${product.name} added`);
                  }}
                  className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-[#F5C742] hover:shadow-md transition-all text-left"
                >
                  <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                    {product.image
                      ? <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
                      : <Package className="w-5 h-5 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E293B] leading-tight truncate">{product.name}</p>
                    <p className="text-[11px] font-mono text-gray-400 truncate">{product.code}{product.barcode ? ` | ${product.barcode}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[#327F74]">{formatCurrency(product.price)}</p>
                    <p className={`text-[10px] font-bold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                      {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end shrink-0">
          <button onClick={() => setShowProductSearch(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ProductSearch;
