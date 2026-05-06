const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a date string or Date object into DD-MMM-YYYY format (e.g., 01-Jan-2026)
 * @param {string|Date} dateSource 
 * @returns {string}
 */
export const formatDateForFilename = (dateSource) => {
    if (!dateSource) return 'N-A';
    const date = new Date(dateSource);
    if (isNaN(date.getTime())) return 'N-A';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
};

/**
 * Sanitizes a string for use in a filename by removing spaces and special characters.
 * @param {string} str 
 * @returns {string}
 */
export const sanitizeForFilename = (str) => {
    if (!str) return 'Unknown';
    // Remove spaces and keep alphanumeric characters, underscores, and dashes
    return str.replace(/\s+/g, '').replace(/[^a-z0-9_-]/gi, '');
};

/**
 * Generates a structured SOA filename
 * Format: SOA_Name_Code_FromDate-to-ToDate_Currency_Gen-Date
 */
export const generateSOAFilename = (partyName, partyCode, fromDate, toDate, currency) => {
    const sanitizedName = sanitizeForFilename(partyName);
    const formattedFrom = formatDateForFilename(fromDate);
    const formattedTo = formatDateForFilename(toDate);
    const formattedGen = formatDateForFilename(new Date());
    
    const cleanCode = partyCode && partyCode !== 'N/A' && partyCode !== 'Unknown' ? partyCode.replace(/\s+/g, '') : '';
    const codePart = cleanCode ? `_${cleanCode}` : '';
    
    return `SOA_${sanitizedName}${codePart}_${formattedFrom}-to-${formattedTo}_${currency}_Gen-${formattedGen}`;
};

/**
 * Generates a structured document filename (Invoice, Quotation, etc.)
 * Format: DocType_DocNo_Name_Date_Currency_Gen-Date
 */
export const generateDocFilename = (docType, docNo, partyName, date, currency) => {
    const sanitizedType = sanitizeForFilename(docType);
    const sanitizedName = sanitizeForFilename(partyName);
    const formattedDate = formatDateForFilename(date);
    const formattedGen = formatDateForFilename(new Date());
    
    const cleanDocNo = docNo ? docNo.replace(/\s+/g, '') : 'NODOC';
    
    return `${sanitizedType}_${cleanDocNo}_${sanitizedName}_${formattedDate}_${currency}_Gen-${formattedGen}`;
};

/**
 * Generates a structured report filename for list exports
 * Format: ReportName_Gen-Date
 */
export const generateReportFilename = (reportName) => {
    const sanitizedName = sanitizeForFilename(reportName);
    const formattedGen = formatDateForFilename(new Date());
    return `${sanitizedName}_Gen-${formattedGen}`;
};
