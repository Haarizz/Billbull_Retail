import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReportFilename } from './filenameUtils';

/**
 * Generic function to export JSON data to an Excel file (.xlsx)
 * @param {Array} data - Array of objects containing the row data.
 * @param {Array} columns - Array of objects defining columns: { header: 'Title', key: 'dataKey', width: 15 }
 * @param {string} fileName - Base filename without extension
 */
export const exportToExcel = async (data, columns, fileName = 'Export') => {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Billbull ERP';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Report');

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
        data.forEach((row) => {
            const mappedRow = {};
            columns.forEach(col => {
                let cellValue = row[col.key];

                // If it is a number and expected to be formatted nicely, ExcelJS handles JS numbers seamlessly.
                if (typeof cellValue === 'number') {
                    // Do nothing, just pass number so Excel registers it as a valid number
                } else if (cellValue === null || cellValue === undefined) {
                    cellValue = '';
                }

                mappedRow[col.key] = cellValue;
            });
            sheet.addRow(mappedRow);
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
 * @param {Array} columns - Array of objects defining columns: { header: 'Title', key: 'dataKey' }
 * @param {string} title - Title generated into the document header
 * @param {string} fileName - Base filename without extension
 */
export const exportToPDF = (data, columns, title = 'Report', fileName = 'Export') => {
    try {
        // Create an A4 landscape orient
        const doc = new jsPDF('l', 'pt', 'a4');

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
                const val = row[col.key];
                return val !== null && val !== undefined ? String(val) : '';
            });
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
            margin: { left: 40, right: 40 }
        });

        // Save PDF
        doc.save(`${generateReportFilename(fileName)}.pdf`);
    } catch (error) {
        console.error('Failed to export to PDF', error);
        throw error;
    }
};