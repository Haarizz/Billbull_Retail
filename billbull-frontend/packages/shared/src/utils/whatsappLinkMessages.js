// Messages for the "send a link on WhatsApp" flow (no Meta API). Pure functions, so the wording
// is unit-tested and the dialog preview always matches what is typed into WhatsApp.
//
// Input is the server summary from POST /api/document-links (live amounts/status), the public
// link, and the company name. WhatsApp renders *text* as bold.

// Mirrors backend PhoneNumberNormalizer so the dialog shows the exact number the chat opens with.
// "+"/"00" → international; >10 digits → already has a country code; otherwise strip trunk zeros
// and prepend the tenant's code. Re-exported by Retail's api/whatsappApi.js.
export const normalizeWhatsAppPhone = (raw, defaultCountryCode = '971') => {
    const trimmed = String(raw || '').trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    let result;
    if (trimmed.startsWith('+')) result = digits;
    else if (digits.startsWith('00')) result = digits.slice(2);
    else if (digits.length > 10) result = digits;
    else result = String(defaultCountryCode || '').replace(/\D/g, '') + digits.replace(/^0+/, '');
    return result.length >= 8 && result.length <= 15 ? result : '';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-27" → "27 Nov 2026" (no locale/timezone drift: parsed as plain parts). */
export const formatLinkDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

export const formatLinkMoney = (currency, value) =>
    `${currency || 'AED'} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const firstName = (name) => {
    const n = String(name || '').trim();
    if (!n || n.toLowerCase() === 'customer' || /walk[- ]?in/i.test(n)) return '';
    return n.split(/\s+/)[0];
};

const greeting = (name) => (firstName(name) ? `Hi ${firstName(name)},` : 'Hello,');
const signOff = (company) => (company ? `\n\n— ${company}` : '');
const hasBalance = (s) => s?.balance != null && Number(s.balance) > 0.004;

/** The message kinds offered for a document, first one is the default. */
export const linkMessageKinds = (summary) => {
    switch (summary?.documentType) {
        case 'SALES_INVOICE': {
            // A POS sale is linked with presentation RECEIPT; the server then labels it "Receipt".
            const kinds = [summary.label === 'Receipt' ? { key: 'receipt', label: 'Receipt' } : { key: 'invoice', label: 'Invoice' }];
            if (hasBalance(summary) && summary.status !== 'CANCELLED') kinds.push({ key: 'reminder', label: 'Payment reminder' });
            return kinds;
        }
        case 'SALES_ORDER':
            return [{ key: 'order', label: 'Sales order' }];
        default:
            return [{ key: 'quotation', label: 'Quotation' }];
    }
};

export const buildLinkMessage = (kind, { summary, link, companyName }) => {
    const s = summary || {};
    const company = String(companyName || '').trim();
    const money = (v) => formatLinkMoney(s.currency, v);
    const due = formatLinkDate(s.dueDate);
    const url = link || '';

    if (kind === 'reminder') {
        return [
            greeting(s.customerName),
            '',
            `This is a friendly reminder${company ? ` from ${company}` : ''} that *${money(s.balance)}* is due on invoice *${s.documentNo}*${due ? `, payable by *${due}*` : ''}.`,
            '',
            'See the details here 👇',
            url,
            '',
            "Please ignore this message if you've already paid. 🙏",
        ].join('\n') + signOff(company);
    }

    if (kind === 'order') {
        const lines = [
            greeting(s.customerName),
            '',
            `Thank you for your order${company ? ` with ${company}` : ''}! 🎉`,
            '',
            `📦 Order: *${s.documentNo}*`,
            `💳 Amount: *${money(s.total)}*`,
        ];
        if (Number(s.paid) > 0) lines.push(`✅ Advance paid: ${money(s.paid)}`);
        if (hasBalance(s) && Number(s.paid) > 0) lines.push(`⚠️ Balance due: *${money(s.balance)}*`);
        if (due) lines.push(`🚚 Expected delivery: ${due}`);
        lines.push('', 'View your order here 👇', url);
        return lines.join('\n') + signOff(company);
    }

    if (kind === 'quotation') {
        const lines = [
            greeting(s.customerName),
            '',
            `Thank you for your interest${company ? ` in ${company}` : ''}. Here is your quotation.`,
            '',
            `📄 Quotation: *${s.documentNo}*`,
            `💳 Amount: *${money(s.total)}*`,
        ];
        if (due) lines.push(`📅 Valid until: ${due}`);
        lines.push('', 'View the quotation here 👇', url);
        return lines.join('\n') + signOff(company);
    }

    // invoice / receipt (a POS sale): same facts, receipt wording
    const receipt = kind === 'receipt';
    const lines = [
        greeting(s.customerName),
        '',
        receipt
            ? `Thank you for shopping${company ? ` with ${company}` : ''}! 🛍️`
            : `Thank you for your business${company ? ` with ${company}` : ''}! 🙏`,
        '',
        `🧾 ${receipt ? 'Receipt' : 'Invoice'}: *${s.documentNo}*`,
    ];
    const date = formatLinkDate(s.date);
    if (date) lines.push(`📅 Date: ${date}`);
    lines.push(`💳 Amount: *${money(s.total)}*`);
    if (s.status === 'CANCELLED') {
        lines.push(`❌ This ${receipt ? 'sale' : 'invoice'} has been cancelled.`);
    } else if (hasBalance(s)) {
        lines.push(`⚠️ Balance due: *${money(s.balance)}*${due ? ` (by ${due})` : ''}`);
    } else if (Number(s.total) > 0) {
        lines.push('✅ Paid in full');
    }
    lines.push('', `View your ${receipt ? 'receipt' : 'invoice'} here 👇`, url);
    return lines.join('\n') + signOff(company);
};

/**
 * True when a link's host can only be reached from this machine or this network (localhost,
 * loopback, a private LAN address or a .local name): a customer's phone cannot open it. Links are
 * built from the address the app was opened on, so this happens on dev setups or when staff use
 * the server's internal IP instead of the tenant's public domain.
 */
export const isPrivateLinkHost = (url) => {
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || host === '::1') return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a === 0;
};

const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

// The BillBull POS desktop app (Electron) exposes window.billbullDesktop and refuses whatsapp://
// (tools/pos-desktop/src/navigationPolicy.js); it opens https links in the normal browser.
const isDesktopPosApp = () => typeof window !== 'undefined' && Boolean(window.billbullDesktop);

/**
 * Where "Open in WhatsApp" goes. phone = digits with country code ('' → WhatsApp asks for a chat).
 * mode 'app' → the desktop app (whatsapp://), 'web' → WhatsApp Web. Phones, and 'app' inside the
 * POS desktop app, use wa.me, which hands over to the installed WhatsApp.
 */
export const whatsAppOpenUrl = (mode, phone, text, mobile = isMobile(), desktopPosApp = isDesktopPosApp()) => {
    const t = encodeURIComponent(text || '');
    const p = String(phone || '').replace(/\D/g, '');
    if (mobile || (desktopPosApp && mode !== 'web')) return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
    if (mode === 'web') return `https://web.whatsapp.com/send?${p ? `phone=${p}&` : ''}text=${t}`;
    return `whatsapp://send?${p ? `phone=${p}&` : ''}text=${t}`;
};

// ── Meta API (approved template) preview ─────────────────────────────────────────────────
// What the "Send with PDF" dialog previews. The real wording comes from the approved template;
// this mirrors the suggested templates in docs/whatsapp-business-api-integration-2026-10-01.md.
export const buildWhatsAppMessage = ({ documentType, customerName, documentNo, amountText, dateText }) => {
    const name = customerName || 'Customer';
    const amount = amountText ? ` for ${amountText}` : '';
    switch (documentType) {
        case 'SALES_ORDER':
            return `Dear ${name}, thank you for your order. Please find attached sales order ${documentNo}${amount}${dateText ? `, expected delivery ${dateText}` : ''}.`;
        case 'SALES_INVOICE':
            return `Dear ${name}, please find attached invoice ${documentNo}${amount}${dateText ? `, due on ${dateText}` : ''}.`;
        case 'POS_RECEIPT':
            return `Dear ${name}, thank you for shopping with us. Please find attached your receipt ${documentNo}${amount}${dateText ? ` dated ${dateText}` : ''}.`;
        default:
            return `Dear ${name}, please find attached quotation ${documentNo}${amount}${dateText ? `, valid until ${dateText}` : ''}.`;
    }
};
