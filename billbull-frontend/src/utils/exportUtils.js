import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReportFilename } from './filenameUtils';

// ── Export progress overlay ───────────────────────────────────────────────────
// Pure-DOM overlay: auto-shows when any export starts, hides when it finishes.
// No React dependency — works across all 29 pages automatically.
const OVERLAY_ID = '__bb_export_overlay__';

const OVERLAY_CSS = `
#${OVERLAY_ID}{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.6);
  display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
#${OVERLAY_ID} .bb-exp-card{background:#fff;border-radius:16px;padding:36px 44px;
  box-shadow:0 24px 64px rgba(0,0,0,.28);display:flex;flex-direction:column;
  align-items:center;gap:14px;min-width:280px;text-align:center}
#${OVERLAY_ID} .bb-exp-spinner{width:52px;height:52px;border-radius:50%;
  border:5px solid #F5C742;border-top-color:transparent;
  animation:bbSpin .75s linear infinite}
@keyframes bbSpin{to{transform:rotate(360deg)}}
#${OVERLAY_ID} .bb-exp-title{font:700 16px/1.3 system-ui,sans-serif;color:#1e293b;margin:0}
#${OVERLAY_ID} .bb-exp-badge{background:#FFF8E7;border:1.5px solid #FDE6A9;color:#92400e;
  font:600 11px/1 system-ui,sans-serif;padding:4px 12px;border-radius:99px;letter-spacing:.3px}
#${OVERLAY_ID} .bb-exp-sub{font:400 12px/1.5 system-ui,sans-serif;color:#64748b;margin:0}`;

const showExportOverlay = (label) => {
    if (typeof document === 'undefined') return;
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        const style = document.createElement('style');
        style.id = `${OVERLAY_ID}_style`;
        style.textContent = OVERLAY_CSS;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="bb-exp-card">
      <div class="bb-exp-spinner"></div>
      <p class="bb-exp-title">Preparing Export&hellip;</p>
      <span class="bb-exp-badge">${label}</span>
      <p class="bb-exp-sub">Please wait, this may take a moment.</p>
    </div>`;
    overlay.style.display = 'flex';
};

const hideExportOverlay = () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
};

// ── Brand colours ────────────────────────────────────────────────────────────
const AMBER = [245, 199, 66];   // #F5C742
const AMBER_DARK = [229, 180, 38];   // #E5B426
const AMBER_LIGHT = [255, 251, 240];  // #FFFBF0
const AMBER_ARGB = 'FFF5C742';
const AMBER_LIGHT_ARGB = 'FFFFF8E7';
const DARK_TEXT = [26, 18, 0];
const XLS_HEADER_DARK = 'FF0F172A';
const XLS_HEADER_TEXT = 'FFFFFFFF';
const XLS_TITLE_FILL = 'FFF8FAFC';
const XLS_TABLE_HEADER = 'FFEFF3F8';
const XLS_BORDER = 'FFD7DDE6';
const XLS_ZEBRA = 'FFFAFBFC';
const XLS_SECTION = 'FFE2E8F0';

// ── Helpers ───────────────────────────────────────────────────────────────────
const isImageColumn = (column) => column.type === 'image';

const getImageSize = (column) => ({
    width: column.imageWidth || 48,
    height: column.imageHeight || 48
});

const getImageExtension = (mimeType = '', url = '') => {
    const lowerUrl = String(url).toLowerCase();
    if (mimeType.includes('png') || lowerUrl.endsWith('.png')) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'jpeg';
    return null;
};

const getPdfImageFormat = (extension) => extension === 'png' ? 'PNG' : 'JPEG';

const readBlobAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

const loadImage = async (url) => {
    if (!url) return null;
    if (String(url).startsWith('data:image/')) {
        const extension = String(url).includes('image/png') ? 'png' : 'jpeg';
        return { dataUrl: url, extension, pdfFormat: getPdfImageFormat(extension) };
    }
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        const extension = getImageExtension(blob.type, url);
        if (!extension) return null;
        const dataUrl = await readBlobAsDataUrl(blob);
        return { dataUrl, extension, pdfFormat: getPdfImageFormat(extension) };
    } catch (error) {
        console.warn('Failed to load export image', url, error);
        return null;
    }
};

const loadExportImages = async (data, columns) => {
    const imageColumns = columns.filter(isImageColumn);
    const images = new Map();
    const cache = new Map();
    if (imageColumns.length === 0) return images;
    await Promise.all(data.flatMap((row, rowIndex) => imageColumns.map(async (column) => {
        const url = row[column.key];
        if (!url) return;
        if (!cache.has(url)) cache.set(url, loadImage(url));
        const image = await cache.get(url);
        if (image) images.set(`${rowIndex}:${column.key}`, image);
    })));
    return images;
};

// Convert a 1-based column index to an Excel letter (A, B, ..., Z, AA, ...)
const colLetter = (n) => {
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s || 'A';
};

// ── PDF export ────────────────────────────────────────────────────────────────
/**
 * Export JSON data to a branded BillBull PDF.
 * @param {Array}  data     - Array of row objects
 * @param {Array}  columns  - [{ header, key, type? }]
 * @param {string} title    - Report title shown in the header
 * @param {string} fileName - Base filename (no extension)
 * @param {object} [meta]   - Optional { dateFrom, dateTo, branch, companyProfile } shown as subtitle
 */
export const exportToPDF = async (data, columns, title = 'Report', fileName = 'Export', meta = {}) => {
    showExportOverlay('PDF Export');
    try {
        const doc = new jsPDF('l', 'pt', 'a4');
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const imageMap = await loadExportImages(data, columns);
        const generatedAt = new Date().toLocaleString();

        const cp = meta.companyProfile || {};
        const companyName = cp.companyName || cp.name || 'BillBull ERP';
        const branchLabel = meta.branch && meta.branch !== 'All' ? meta.branch : '';
        const orgLine = branchLabel ? `${companyName}  —  ${branchLabel}` : companyName;

        // ── Amber header bar ────────────────────────────────────────────────
        doc.setFillColor(...AMBER);
        doc.rect(0, 0, pageW, 34, 'F');

        // subtle bottom shadow strip
        doc.setFillColor(...AMBER_DARK);
        doc.rect(0, 32, pageW, 2, 'F');

        // Company / branch name — centred in the amber bar
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...DARK_TEXT);
        doc.text(orgLine, pageW / 2, 22, { align: 'center' });

        // ── Meta section (centred) ───────────────────────────────────────────
        const metaY = 50;
        const cx = pageW / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...DARK_TEXT);
        doc.text(title, cx, metaY, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        let metaLine = `Generated: ${generatedAt}`;
        if (meta.dateFrom || meta.dateTo) metaLine += `  |  Period: ${meta.dateFrom || '—'} to ${meta.dateTo || '—'}`;
        if (branchLabel) metaLine += `  |  Branch: ${branchLabel}`;
        doc.text(metaLine, cx, metaY + 14, { align: 'center' });
        doc.text(`Total Records: ${data.length}`, cx, metaY + 26, { align: 'center' });

        // amber separator line
        doc.setDrawColor(...AMBER_DARK);
        doc.setLineWidth(0.8);
        doc.line(22, metaY + 32, pageW - 22, metaY + 32);

        // ── Table ───────────────────────────────────────────────────────────
        const head = [columns.map(col => col.header)];
        const body = data.map(row =>
            columns.map(col => {
                if (isImageColumn(col)) return '';
                const val = row[col.key];
                return val !== null && val !== undefined ? String(val) : '';
            })
        );

        const columnStyles = {};
        columns.forEach((col, index) => {
            if (isImageColumn(col)) {
                const { width, height } = getImageSize(col);
                columnStyles[index] = {
                    cellWidth: Math.max(width + 10, 48),
                    minCellHeight: height + 10,
                    halign: 'center',
                    valign: 'middle'
                };
            } else if (col.pdfWidth) {
                columnStyles[index] = { cellWidth: col.pdfWidth };
            } else if (col.width && typeof col.width === 'number') {
                columnStyles[index] = { cellWidth: col.width * 4 };
            }
        });

        let finalY = metaY + 40;

        autoTable(doc, {
            startY: finalY,
            head,
            body,
            theme: 'grid',
            styles: {
                fontSize: 8.5,
                cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
                textColor: [51, 65, 85],
                font: 'helvetica',
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },
            headStyles: {
                fillColor: AMBER,
                textColor: DARK_TEXT,
                fontStyle: 'bold',
                fontSize: 8,
                lineColor: AMBER_DARK,
                lineWidth: 0.3,
            },
            alternateRowStyles: {
                fillColor: AMBER_LIGHT,
            },
            columnStyles,
            margin: { left: 22, right: 22, bottom: 28 },
            didParseCell: (hookData) => {
                const column = columns[hookData.column.index];
                if (hookData.section !== 'body' || !column || !isImageColumn(column)) return;
                const { height } = getImageSize(column);
                hookData.cell.text = [''];
                hookData.cell.styles.minCellHeight = height + 10;
            },
            didDrawCell: (hookData) => {
                const column = columns[hookData.column.index];
                if (hookData.section !== 'body' || !column || !isImageColumn(column)) return;
                const image = imageMap.get(`${hookData.row.index}:${column.key}`);
                if (!image) return;
                const { width, height } = getImageSize(column);
                const padding = 5;
                const maxWidth = hookData.cell.width - padding * 2;
                const maxHeight = hookData.cell.height - padding * 2;
                const scale = Math.min(maxWidth / width, maxHeight / height, 1);
                const drawWidth = width * scale;
                const drawHeight = height * scale;
                const x = hookData.cell.x + (hookData.cell.width - drawWidth) / 2;
                const y = hookData.cell.y + (hookData.cell.height - drawHeight) / 2;
                doc.addImage(image.dataUrl, image.pdfFormat, x, y, drawWidth, drawHeight);
            },
            // ── Per-page footer ─────────────────────────────────────────────
            didDrawPage: (hookData) => {
                const pg = hookData.pageNumber;
                const total = doc.internal.getNumberOfPages();
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                // amber footer line
                doc.setDrawColor(...AMBER_DARK);
                doc.setLineWidth(0.5);
                doc.line(22, pageH - 20, pageW - 22, pageH - 20);
                doc.text(
                    `Generated by ${companyName}  |  ${generatedAt}  |  Confidential`,
                    22, pageH - 10
                );
                doc.text(`Page ${pg} of ${total}`, pageW - 22, pageH - 10, { align: 'right' });
            },
        });

        doc.save(`${generateReportFilename(fileName)}.pdf`);
    } catch (error) {
        console.error('Failed to export to PDF', error);
        throw error;
    } finally {
        hideExportOverlay();
    }
};

// ── Excel export ──────────────────────────────────────────────────────────────
/**
 * Export JSON data to a branded BillBull Excel file (.xlsx).
 * @param {Array}  data     - Array of row objects
 * @param {Array}  columns  - [{ header, key, width?, type? }]
 * @param {string} fileName - Base filename (no extension)
 * @param {object} [meta]   - Optional { dateFrom, dateTo, branch, companyProfile }
 */
export const exportToExcel = async (data, columns, fileName = 'Export', meta = {}) => {
    showExportOverlay('Excel Export');
    try {
        const workbook = new ExcelJS.Workbook();
        const cp = meta.companyProfile || {};
        const companyName = cp.companyName || cp.name || 'BillBull ERP';
        const branchLabel = meta.branch && meta.branch !== 'All' ? meta.branch : '';
        const orgLine = branchLabel ? `${companyName}  —  ${branchLabel}` : companyName;

        workbook.creator = companyName;
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Report');
        sheet.views = [{ state: 'frozen', ySplit: 5 }];

        const numCols = columns.length;
        const lastCol = colLetter(numCols);

        // Set column widths (must be done before adding rows in ExcelJS)
        columns.forEach((col, i) => {
            sheet.getColumn(i + 1).width = col.width || 18;
        });

        // ── Row 1: Company / org header ─────────────────────────────────────
        const brandRow = sheet.getRow(1);
        brandRow.height = 30;
        sheet.mergeCells(`A1:${lastCol}1`);
        const brandCell = brandRow.getCell(1);
        brandCell.value = orgLine;
        brandCell.font = { bold: true, color: { argb: XLS_HEADER_TEXT }, size: 14, name: 'Calibri' };
        brandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_HEADER_DARK } };
        brandCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // ── Row 2: Report title ─────────────────────────────────────────────
        const titleRow = sheet.getRow(2);
        titleRow.height = 22;
        sheet.mergeCells(`A2:${lastCol}2`);
        const titleCell = titleRow.getCell(1);
        titleCell.value = fileName.replace(/_/g, ' ');
        titleCell.font = { bold: true, color: { argb: 'FF0F172A' }, size: 12, name: 'Calibri' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_TITLE_FILL } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // ── Row 3: Meta info ────────────────────────────────────────────────
        const metaRow = sheet.getRow(3);
        metaRow.height = 15;
        sheet.mergeCells(`A3:${lastCol}3`);
        let metaText = `Generated: ${new Date().toLocaleString()}  |  Records: ${data.length}`;
        if (meta.dateFrom || meta.dateTo) metaText += `  |  Period: ${meta.dateFrom || '—'} to ${meta.dateTo || '—'}`;
        if (branchLabel) metaText += `  |  Branch: ${branchLabel}`;
        const metaCell = metaRow.getCell(1);
        metaCell.value = metaText;
        metaCell.font = { color: { argb: 'FF6B7280' }, size: 9, name: 'Calibri' };
        metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_TITLE_FILL } };
        metaCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // ── Row 4: Spacer ───────────────────────────────────────────────────
        sheet.getRow(4).height = 6;

        // ── Row 5: Column headers ───────────────────────────────────────────
        const headerRow = sheet.getRow(5);
        headerRow.height = 20;
        columns.forEach((col, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = col.header;
            cell.font = { bold: true, color: { argb: 'FF334155' }, size: 10, name: 'Calibri' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_TABLE_HEADER } };
            cell.alignment = { vertical: 'middle', horizontal: isImageColumn(col) ? 'center' : 'left', wrapText: false };
            cell.border = {
                bottom: { style: 'thin', color: { argb: XLS_BORDER } },
                top: { style: 'thin', color: { argb: XLS_BORDER } },
                left: { style: 'thin', color: { argb: XLS_BORDER } },
                right: { style: 'thin', color: { argb: XLS_BORDER } },
            };
        });
        sheet.autoFilter = { from: 'A5', to: `${lastCol}5` };

        // ── Rows 6+: Data ───────────────────────────────────────────────────
        const DATA_START_ROW = 6;
        const imageColumns = columns.filter(isImageColumn);
        const imageMap = await loadExportImages(data, columns);
        const isCurrencyColumn = (col) => (
            col.type === 'currency'
            || /(amount|total|balance|cash|sales|paid|tax|discount|price|cost|variance|charge)/i.test(`${col.key} ${col.header}`)
        );
        const isDateColumn = (col) => col.type === 'date' || /(date|time|created|updated|opened|closed)/i.test(`${col.key} ${col.header}`);

        data.forEach((row, rowIndex) => {
            const sheetRow = sheet.getRow(DATA_START_ROW + rowIndex);
            sheetRow.alignment = { vertical: 'middle' };
            const isSectionRow = Boolean(row.Section);

            if (imageColumns.length > 0) {
                const maxImageHeight = Math.max(...imageColumns.map(col => getImageSize(col).height));
                sheetRow.height = Math.max(16, Math.ceil((maxImageHeight * 72) / 96) + 8);
            } else {
                sheetRow.height = 16;
            }

            columns.forEach((col, colIndex) => {
                const cell = sheetRow.getCell(colIndex + 1);
                if (isImageColumn(col)) {
                    cell.value = '';
                } else {
                    let cellValue = row[col.key];
                    if (cellValue === null || cellValue === undefined) cellValue = '';
                    cell.value = cellValue;

                    // Right-align numbers
                    if (typeof cellValue === 'number') {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        cell.numFmt = isCurrencyColumn(col) ? '#,##0.00' : (Number.isInteger(cellValue) ? '#,##0' : '#,##0.00');
                    } else if (cellValue instanceof Date) {
                        cell.numFmt = 'dd-mmm-yyyy hh:mm';
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    } else if (isDateColumn(col) && cellValue) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                }

                if (isSectionRow) {
                    cell.font = { ...(cell.font || {}), bold: true, color: { argb: 'FF0F172A' }, name: 'Calibri' };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_SECTION } };
                } else if (rowIndex % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_ZEBRA } };
                }

                cell.border = {
                    top: { style: 'thin', color: { argb: XLS_BORDER } },
                    bottom: { style: 'thin', color: { argb: XLS_BORDER } },
                    left: { style: 'thin', color: { argb: XLS_BORDER } },
                    right: { style: 'thin', color: { argb: XLS_BORDER } },
                };
                if (!cell.alignment) {
                    cell.alignment = { vertical: 'middle', horizontal: isImageColumn(col) ? 'center' : 'left', wrapText: true };
                }
            });
        });

        // ── Embed images ────────────────────────────────────────────────────
        imageColumns.forEach((column) => {
            const columnIndex = columns.findIndex(col => col.key === column.key);
            const { width, height } = getImageSize(column);
            data.forEach((_, rowIndex) => {
                const image = imageMap.get(`${rowIndex}:${column.key}`);
                if (!image) return;
                const imageId = workbook.addImage({ base64: image.dataUrl, extension: image.extension });
                sheet.addImage(imageId, {
                    tl: { col: columnIndex + 0.15, row: (DATA_START_ROW - 1) + rowIndex + 0.15 },
                    ext: { width, height },
                    editAs: 'oneCell'
                });
            });
        });

        // ── Save ────────────────────────────────────────────────────────────
        columns.forEach((col, colIndex) => {
            const values = [
                col.header,
                ...data.map(row => row[col.key])
            ].map(value => {
                if (value === null || value === undefined) return '';
                if (value instanceof Date) return value.toLocaleString();
                return String(value);
            });
            const maxLength = Math.max(...values.map(value => value.length), 10);
            sheet.getColumn(colIndex + 1).width = Math.min(Math.max(maxLength + 2, col.width || 12), 42);
        });
        sheet.pageSetup = {
            paperSize: 9,
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${generateReportFilename(fileName)}.xlsx`);
    } catch (error) {
        console.error('Failed to export to Excel', error);
        throw error;
    } finally {
        hideExportOverlay();
    }
};
