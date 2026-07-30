/**
 * Minimal CSV export — the existing utils/exportUtils.js only covers Excel/PDF (via exceljs/
 * jspdf). CSV needs no library at all (Blob + anchor download is a standard browser API), so
 * this stays a tiny, dependency-free addition rather than pulling in a CSV package.
 *
 * @param {Array<Object>} data - row objects keyed by each column's `key`
 * @param {Array<{header:string,key:string}>} columns
 * @param {string} fileName - without extension
 */
export function exportToCSV(data, columns, fileName = "export") {
  const escape = (value) => {
    if (value == null) return "";
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = columns.map((c) => escape(c.header)).join(",");
  const rows = data.map((row) => columns.map((c) => escape(row[c.key])).join(","));
  const csv = [header, ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
