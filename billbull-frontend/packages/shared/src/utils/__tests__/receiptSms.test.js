import { describe, expect, it, vi } from 'vitest';
import { buildReceiptSmsBody, openReceiptSms, smsNumber, smsUri } from '../receiptSms';

describe('receiptSms', () => {
  it('normalises numbers for the sms: link', () => {
    expect(smsNumber('+971 50-111 2222')).toBe('+971501112222');
    expect(smsNumber('00971501112222')).toBe('+971501112222');
    expect(smsNumber('050 111 2222')).toBe('0501112222');
    expect(smsNumber('')).toBe('');
  });

  it('writes a short plain-text message, with the link only when there is one', () => {
    expect(buildReceiptSmsBody({ companyName: 'Hilite', documentNo: 'INV-1', amountText: 'AED 10.00', link: 'https://x/d/t' }))
      .toBe('Hilite: thank you for your purchase.\nReceipt INV-1 - AED 10.00\nView / download: https://x/d/t');
    expect(buildReceiptSmsBody({ amountText: 'AED 10.00' })).toBe('Thank you for your purchase.\nReceipt - AED 10.00');
  });

  it('encodes the body into an RFC 5724 sms: URI', () => {
    expect(smsUri('+971 50 111 2222', 'a b\nc')).toBe('sms:+971501112222?body=a%20b%0Ac');
  });

  it('opens the SMS app with the link, and copies the message', async () => {
    const launch = vi.fn();
    const copy = vi.fn(async () => true);
    const out = await openReceiptSms({
      phone: '0501112222', documentNo: 'INV-1', amountText: 'AED 10.00', companyName: '',
      createLink: async () => 'https://x/d/t', launch, copy,
    });
    expect(out.link).toBe('https://x/d/t');
    expect(out.copied).toBe(true);
    expect(copy).toHaveBeenCalledWith(out.body);
    expect(launch).toHaveBeenCalledWith(smsUri('0501112222', out.body));
  });

  it('a link that cannot be created never stops the SMS', async () => {
    const launch = vi.fn();
    const out = await openReceiptSms({
      phone: '0501112222', documentNo: 'INV-1', amountText: 'AED 10.00',
      createLink: async () => { throw new Error('offline'); }, launch, copy: async () => { throw new Error('denied'); },
    });
    expect(out.link).toBe('');
    expect(out.copied).toBe(false);
    expect(out.linkError?.message).toBe('offline');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(out.body).not.toContain('View / download');
  });
});
