import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReportFilename } from './filenameUtils';

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

        if (!cache.has(url)) {
            cache.set(url, loadImage(url));
        }

        const image = await cache.get(url);
        if (image) {
            images.set(`${rowIndex}:${column.key}`, image);
        }
    })));

    return images;
};

/**
 * Generic function to export JSON data to an Excel file (.xlsx)
 * @param {Array} data - Array of objects containing the row data.
 * @param {Array} columns - Array of objects defining columns: { header: 'Title', key: 'dataKey', width: 15, type?: 'image' }
 * @param {string} fileName - Base filename without extension
 */
export const exportToExcel = async (data, columns, fileName = 'Export') => {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Billbull ERP';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Report');
        const imageColumns = columns.filter(isImageColumn);
        const imageMap = await loadExportImages(data, columns);

        // Map definitions to ExcelJS columns format
        sheet.columns = columns.map(col => ({
            header: col.header,
            key: col.key,
            width: col.width || 15
        }));

        // Style the header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF374151' } // Dark gray background
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Add Data
        data.forEach((row, rowIndex) => {
            const mappedRow = {};
            columns.forEach(col => {
                let cellValue = isImageColumn(col) ? '' : row[col.key];

                // If it is a number and expected to be formatted nicely, ExcelJS handles JS numbers seamlessly.
                if (typeof cellValue === 'number') {
                    // Do nothing, just pass number so Excel registers it as a valid number
                } else if (cellValue === null || cellValue === undefined) {
                    cellValue = '';
                }

                mappedRow[col.key] = cellValue;
            });
            const sheetRow = sheet.addRow(mappedRow);
            sheetRow.alignment = { vertical: 'middle' };

            if (imageColumns.length > 0) {
                const maxImageHeight = Math.max(...imageColumns.map(col => getImageSize(col).height));
                sheetRow.height = Math.max(sheetRow.height || 15, Math.ceil((maxImageHeight * 72) / 96) + 8);
            }
        });

        imageColumns.forEach((column) => {
            const columnIndex = columns.findIndex(col => col.key === column.key);
            const { width, height } = getImageSize(column);

            data.forEach((_, rowIndex) => {
                const image = imageMap.get(`${rowIndex}:${column.key}`);
                if (!image) return;

                const imageId = workbook.addImage({
                    base64: image.dataUrl,
                    extension: image.extension
                });

                sheet.addImage(imageId, {
                    tl: { col: columnIndex + 0.15, row: rowIndex + 1.15 },
                    ext: { width, height },
                    editAs: 'oneCell'
                });
            });
        });

        // Write to buffer and save via browser FileSaver
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${generateReportFilename(fileName)}.xlsx`);

    } catch (error) {
        console.error('Failed to export to Excel', error);
        throw error;
    }
};

/**
 * Generic function to export JSON data to a PDF file (.pdf)
 * @param {Array} data - Array of objects containing the row data.
 * @param {Array} columns - Array of objects defining columns: { header: 'Title', key: 'dataKey', type?: 'image' }
 * @param {string} title - Title generated into the document header
 * @param {string} fileName - Base filename without extension
 */
export const exportToPDF = async (data, columns, title = 'Report', fileName = 'Export') => {
    try {
        // Create an A4 landscape orient
        const doc = new jsPDF('l', 'pt', 'a4');
        const imageMap = await loadExportImages(data, columns);

        // Document Details (Header)
        doc.setFontSize(18);
        doc.setTextColor(17, 24, 39); // #111827
        doc.text(title, 40, 40);

        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128); // #6b7280
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 40, 56);
        doc.text(`Total Rows: ${data.length}`, 40, 70);

        // Prep headers
        const head = [columns.map(col => col.header)];

        // Prep data rows mapping correctly
        const body = data.map(row => {
            return columns.map(col => {
                if (isImageColumn(col)) return '';
                const val = row[col.key];
                return val !== null && val !== undefined ? String(val) : '';
            });
        });

        const columnStyles = {};
        columns.forEach((col, index) => {
            if (!isImageColumn(col)) return;
            const { width, height } = getImageSize(col);
            columnStyles[index] = {
                cellWidth: Math.max(width + 10, 48),
                minCellHeight: height + 10,
                halign: 'center',
                valign: 'middle'
            };
        });

        // Generate the table
        autoTable(doc, {
            startY: 90,
            head: head,
            body: body,
            theme: 'grid',
            styles: {
                fontSize: 9,
                cellPadding: 4,
                textColor: [55, 65, 81], // #374151
                font: 'helvetica'
            },
            headStyles: {
                fillColor: [243, 244, 246], // #f3f4f6 light gray header
                textColor: [17, 24, 39], // dark bold text
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: [229, 231, 235]
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250] // light contrast
            },
            columnStyles,
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
                const maxWidth = hookData.cell.width - (padding * 2);
                const maxHeight = hookData.cell.height - (padding * 2);
                const scale = Math.min(maxWidth / width, maxHeight / height, 1);
                const drawWidth = width * scale;
                const drawHeight = height * scale;
                const x = hookData.cell.x + (hookData.cell.width - drawWidth) / 2;
                const y = hookData.cell.y + (hookData.cell.height - drawHeight) / 2;

                doc.addImage(image.dataUrl, image.pdfFormat, x, y, drawWidth, drawHeight);
            },
            margin: { left: 40, right: 40 }
        });

        // Save PDF
        doc.save(`${generateReportFilename(fileName)}.pdf`);
    } catch (error) {
        console.error('Failed to export to PDF', error);
        throw error;
    }
};
