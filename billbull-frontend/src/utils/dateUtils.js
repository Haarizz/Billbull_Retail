// Canonical display format for dates across reports and transaction lists.
// All list/report cells render dates as dd/MMM/yyyy (e.g. 21/May/2026) via
// formatDisplayDate. Backend data is typically 'YYYY-MM-DD' (LocalDate) or an
// ISO datetime — both work.

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Format a date value as dd/MMM/yyyy.
 * Accepts: Date instance, ISO date string ('YYYY-MM-DD'),
 * ISO datetime, or any string that Date can parse.
 * Returns the fallback when the input is empty/invalid.
 */
export const formatDisplayDate = (value, fallback = '-') => {
    if (value === null || value === undefined || value === '') return fallback;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return fallback;
        const d = String(value.getDate()).padStart(2, '0');
        return `${d}/${MONTHS[value.getMonth()]}/${value.getFullYear()}`;
    }

    const str = String(value).trim();
    if (!str) return fallback;

    // Fast path for backend LocalDate 'YYYY-MM-DD' (and ISO datetimes that
    // start with it). Avoids the Date(...) timezone day-shift that produces
    // off-by-one dates in negative-UTC zones.
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const [, y, mm, dd] = m;
        const monthIdx = parseInt(mm, 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
            return `${dd}/${MONTHS[monthIdx]}/${y}`;
        }
    }

    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) return fallback;
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${d}/${MONTHS[parsed.getMonth()]}/${parsed.getFullYear()}`;
};

/**
 * Convenience for inputs that may be undefined — same as formatDisplayDate
 * but the default fallback is an empty string (useful in concatenation).
 */
export const formatDisplayDateOrEmpty = (value) => formatDisplayDate(value, '');
