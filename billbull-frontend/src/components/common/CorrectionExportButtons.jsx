import React from 'react';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';
import { exportToCSV } from '../../utils/csvExport';

/** Shared CSV/Excel/PDF export trio — reused by the Dashboard, History, and Approval Queue
 *  screens (Phase 5 §7) so export wiring isn't duplicated three times. Reuses the existing
 *  exportToPDF/exportToExcel utilities (exceljs/jspdf, already a project dependency); CSV needs
 *  no library at all. */
export default function CorrectionExportButtons({ data, columns, title = 'Report', fileName = 'export' }) {
  const disabled = !data || data.length === 0;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportToCSV(data, columns, fileName)}
        className="h-9 px-3 flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
        title="Export CSV"
      >
        <FileDown size={14} /> CSV
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportToExcel(data, columns, fileName)}
        className="h-9 px-3 flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
        title="Export Excel"
      >
        <FileSpreadsheet size={14} /> Excel
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportToPDF(data, columns, title, fileName)}
        className="h-9 px-3 flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
        title="Export PDF"
      >
        <FileText size={14} /> PDF
      </button>
    </div>
  );
}
