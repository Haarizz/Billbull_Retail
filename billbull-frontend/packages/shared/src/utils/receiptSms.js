// Receipt by SMS. BillBull has no SMS gateway, so "Send" hands a ready-written message to the
// device's own SMS app through an RFC 5724 `sms:` link (Phone Link on Windows, the Messages app
// on a phone or tablet) and also copies it, so the cashier can paste it when no SMS app is set up.
// When the sale has a server invoice the message carries the same customer receipt page link the
// WhatsApp link flow sends (/d/<token>: summary + PDF).

/** "+971 50-111 2222" → "+971501112222"; "00971…" → "+971…"; a local number keeps its digits. */
export const smsNumber = (raw) => {
  const s = String(raw || '').trim();
  let digits = s.replace(/\D/g, '');
  const international = s.startsWith('+') || s.startsWith('00');
  if (s.startsWith('00')) digits = digits.slice(2);
  return international && digits ? `+${digits}` : digits;
};

/** Short, plain text: SMS has no formatting and every character counts. */
export const buildReceiptSmsBody = ({ companyName = '', documentNo = '', amountText = '', link = '' } = {}) => [
  companyName ? `${companyName}: thank you for your purchase.` : 'Thank you for your purchase.',
  [documentNo ? `Receipt ${documentNo}` : 'Receipt', amountText].filter(Boolean).join(' - '),
  link ? `View / download: ${link}` : '',
].filter(Boolean).join('\n');

export const smsUri = (phone, body) => `sms:${smsNumber(phone)}?body=${encodeURIComponent(body || '')}`;

/** Navigates to the sms: link without leaving the page (the browser/OS hands it to the SMS app). */
const defaultLaunch = (uri) => {
  const a = document.createElement('a');
  a.href = uri;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const defaultCopy = async (text) => {
  if (!navigator?.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
};

/**
 * Builds the message, opens the SMS app and copies the message.
 * A link that cannot be created never stops the SMS: the message then goes without it.
 *
 * @param {Function|null} createLink  async () => absolute receipt page URL, or null (no server invoice)
 * @returns {Promise<{ body: string, link: string, copied: boolean, linkError: Error|null }>}
 */
export async function openReceiptSms({
  phone, documentNo, amountText, companyName, createLink = null,
  launch = defaultLaunch, copy = defaultCopy,
}) {
  let link = '';
  let linkError = null;
  if (createLink) {
    try { link = (await createLink()) || ''; } catch (err) { linkError = err; }
  }
  const body = buildReceiptSmsBody({ companyName, documentNo, amountText, link });
  let copied = false;
  try { copied = Boolean(await copy(body)); } catch { copied = false; }
  launch(smsUri(phone, body));
  return { body, link, copied, linkError };
}
