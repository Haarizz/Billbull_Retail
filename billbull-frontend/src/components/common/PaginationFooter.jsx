import React from 'react';

const PaginationFooter = ({ page = 0, totalPages = 0, totalElements = 0, size = 30, loading = false, onPageChange }) => {
  if (!totalElements) return null;

  const from = page * size + 1;
  const to = Math.min((page + 1) * size, totalElements);
  const canPrev = page > 0 && !loading;
  const canNext = page < totalPages - 1 && !loading;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 bg-white text-xs text-slate-500">
      <span>
        Showing <span className="font-bold text-slate-700">{from}-{to}</span> of <span className="font-bold text-slate-700">{totalElements}</span>
      </span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!canPrev} onClick={() => onPageChange?.(page - 1)} className="px-3 py-1.5 rounded border border-slate-200 bg-white font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
          Previous
        </button>
        <span className="min-w-[84px] text-center font-bold text-slate-700">
          Page {totalPages ? page + 1 : 0} / {totalPages}
        </span>
        <button type="button" disabled={!canNext} onClick={() => onPageChange?.(page + 1)} className="px-3 py-1.5 rounded border border-slate-200 bg-white font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
          Next
        </button>
      </div>
    </div>
  );
};

export default PaginationFooter;
