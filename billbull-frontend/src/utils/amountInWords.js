// Shared "amount in words" formatting for printed documents and vouchers.
//
// Kept in its own module so voucher previews (FinancialVoucherDesigner) and the
// purchase/sales document renderer share one implementation — several print
// paths need the same string and they must not drift.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertHundreds = (n) => {
    if (n === 0) return '';
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
};

export const numberToWords = (num) => {
    if (!Number.isFinite(num) || num < 0) return 'Zero';
    if (num === 0) return 'Zero';
    const parts = [];
    const n = Math.floor(num);
    if (n >= 1000000) { parts.push(convertHundreds(Math.floor(n / 1000000)) + ' Million'); }
    if (n % 1000000 >= 1000) { parts.push(convertHundreds(Math.floor((n % 1000000) / 1000)) + ' Thousand'); }
    if (n % 1000 > 0) { parts.push(convertHundreds(n % 1000)); }
    return parts.join(' ');
};

export const CURRENCY_UNITS = {
    AED: { main: 'Dirhams', sub: 'Fils' }, USD: { main: 'Dollars', sub: 'Cents' },
    EUR: { main: 'Euros', sub: 'Cents' }, GBP: { main: 'Pounds', sub: 'Pence' },
    INR: { main: 'Rupees', sub: 'Paise' }, SAR: { main: 'Riyals', sub: 'Halalas' },
    QAR: { main: 'Riyals', sub: 'Dirhams' }, KWD: { main: 'Dinars', sub: 'Fils' },
    BHD: { main: 'Dinars', sub: 'Fils' }, OMR: { main: 'Rials', sub: 'Baisa' },
    JOD: { main: 'Dinars', sub: 'Fils' }, EGP: { main: 'Pounds', sub: 'Piastres' },
    AUD: { main: 'Dollars', sub: 'Cents' }, CAD: { main: 'Dollars', sub: 'Cents' },
    SGD: { main: 'Dollars', sub: 'Cents' }, HKD: { main: 'Dollars', sub: 'Cents' },
    MYR: { main: 'Ringgit', sub: 'Sen' }, PKR: { main: 'Rupees', sub: 'Paisa' },
    NPR: { main: 'Rupees', sub: 'Paisa' }, LKR: { main: 'Rupees', sub: 'Cents' },
    BDT: { main: 'Taka', sub: 'Poisha' }, NGN: { main: 'Naira', sub: 'Kobo' },
    KES: { main: 'Shillings', sub: 'Cents' }, ZAR: { main: 'Rand', sub: 'Cents' },
    CHF: { main: 'Francs', sub: 'Rappen' }, TRY: { main: 'Lira', sub: 'Kurus' },
    CNY: { main: 'Yuan', sub: 'Jiao' }, JPY: { main: 'Yen', sub: 'Sen' },
    PHP: { main: 'Pesos', sub: 'Centavos' }, THB: { main: 'Baht', sub: 'Satang' },
    MXN: { main: 'Pesos', sub: 'Centavos' }, BRL: { main: 'Reais', sub: 'Centavos' },
    RUB: { main: 'Rubles', sub: 'Kopeks' }, NOK: { main: 'Kroner', sub: 'Ore' },
    SEK: { main: 'Kronor', sub: 'Ore' }, DKK: { main: 'Kroner', sub: 'Ore' },
};

/**
 * "Five Thousand Dirhams Only" / "Ten Dirhams and Fifty Fils Only".
 * Unknown currency codes fall back to the raw code as the major unit name.
 */
export const formatAmountInWords = (value, currency) => {
    const amount = Number(value) || 0;
    const whole = Math.floor(amount);
    const sub = Math.round((amount - whole) * 100);
    const units = CURRENCY_UNITS[String(currency || '').toUpperCase()] || { main: String(currency || 'Units'), sub: 'Cents' };
    const mainWords = numberToWords(whole) || 'Zero';
    return sub > 0
        ? `${mainWords} ${units.main} and ${numberToWords(sub)} ${units.sub} Only`
        : `${mainWords} ${units.main} Only`;
};
