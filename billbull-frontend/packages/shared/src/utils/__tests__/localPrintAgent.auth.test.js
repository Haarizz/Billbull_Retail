import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How the browser talks to the print agent once the agent requires pairing (0.6.0,
 * protocol 2), and how it degrades for an older agent. fetch is stubbed; module state
 * (the probed agent, the cooldown) is reset by re-importing the module per test.
 */
vi.mock('../../api/posPrintJobApi', () => ({
  createPrintJob: vi.fn(async () => null),
  dispatchPrintJob: vi.fn(async () => null),
  reportPrintJobResult: vi.fn(async () => null),
}));
vi.mock('../../api/posPrinterApi', () => ({ printPosPrinterEscPos: vi.fn() }));

const TOKEN_KEY = 'billbull.printAgent.token';
const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

let agent;
let calls;
const load = async () => {
  vi.resetModules();
  return import('../localPrintAgent');
};

// routes: { 'GET /health': () => response | throw }
const stubAgent = (routes) => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method || 'GET';
    calls.push({ url, method, path: pathname, headers: init.headers || {}, mode: init.mode, body: init.body });
    const route = routes[`${init.mode === 'no-cors' ? 'NOCORS ' : ''}${method} ${pathname}`];
    if (!route) throw new TypeError('Failed to fetch');
    return route(init);
  }));
};

const NEW_AGENT = { 'GET /health': () => json(200, { ok: true, version: '0.6.0', protocol: 2 }) };
const OLD_AGENT = { 'GET /health': () => json(200, { ok: true, service: 'billbull-pos-print-agent', version: '0.5.3' }) };
const USB = { connectionType: 'USB', systemPrinterName: 'POS-80C', id: 7 };

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a paired 0.6.0 agent', () => {
  it('sends the token on every agent call, and Content-Type only with a body', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_tok');
    stubAgent({
      ...NEW_AGENT,
      'GET /printers': () => json(200, { printers: [{ Name: 'POS-80C' }] }),
      'POST /print/escpos': () => json(200, { ok: true, sha256: 'x' }),
    });
    agent = await load();
    await agent.listPrintAgentPrinters();
    await agent.printEscPosThroughAgent({ printerName: 'POS-80C', dataBase64: 'G0A=', connectionType: 'USB' });
    const list = calls.find((c) => c.path === '/printers');
    const print = calls.find((c) => c.path === '/print/escpos');
    expect(list.headers).toEqual({ Authorization: 'Bearer bbpa_tok' });
    expect(print.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer bbpa_tok' });
  });

  it('pairing stores the token the agent issues; unpairing revokes and forgets it', async () => {
    stubAgent({
      ...NEW_AGENT,
      'POST /pair/start': () => json(200, { ok: true, pairingId: 'p1', expiresInSeconds: 120 }),
      'POST /pair/complete': () => json(200, { ok: true, token: 'bbpa_new', expiresAt: '2027-01-01T00:00:00Z' }),
      'GET /auth/status': () => json(200, { ok: true, paired: true, expiresAt: '2027-01-01T00:00:00Z' }),
      'POST /pair/revoke': () => json(200, { ok: true }),
    });
    agent = await load();
    expect((await agent.getPrintAgentStatus()).state).toBe('unpaired');
    const { pairingId } = await agent.startPrintAgentPairing({ label: 'T1' });
    await agent.completePrintAgentPairing({ pairingId, code: ' 123456 ' });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('bbpa_new');
    expect(JSON.parse(calls.find((c) => c.path === '/pair/complete').body)).toEqual({ pairingId: 'p1', code: '123456' });
    expect((await agent.getPrintAgentStatus()).state).toBe('paired');
    await agent.unpairPrintAgent();
    expect(calls.find((c) => c.path === '/pair/revoke').headers.Authorization).toBe('Bearer bbpa_new');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a wrong pairing code surfaces attempts remaining', async () => {
    stubAgent({
      ...NEW_AGENT,
      'POST /pair/complete': () => json(401, { ok: false, code: 'AGENT_PAIRING_CODE_INVALID', message: 'That code is not the one shown by the print agent.', attemptsRemaining: 3 }),
    });
    agent = await load();
    await expect(agent.completePrintAgentPairing({ pairingId: 'p1', code: '000000' }))
      .rejects.toMatchObject({ code: 'AGENT_PAIRING_CODE_INVALID', attemptsRemaining: 3 });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('an unauthorized request', () => {
  it('reports the agent message and code, forgets a rejected token, and does not fall back to text', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_old');
    const expired = { ok: false, code: 'AGENT_TOKEN_EXPIRED', message: 'The pairing with this print agent has expired. Pair it again in POS → Devices → Local Print Agent.' };
    stubAgent({
      ...NEW_AGENT,
      'POST /print/escpos': () => json(401, expired),
      'POST /print/receipt': () => json(401, expired),
    });
    agent = await load();
    await expect(agent.sendEscPosReceiptToConfiguredPrinter(USB, { dataBase64: 'G0A=', receiptText: 'Total 10' }))
      .rejects.toMatchObject({ name: 'PrintAgentError', code: 'AGENT_TOKEN_EXPIRED', status: 401, message: expired.message });
    expect(calls.filter((c) => c.path.startsWith('/print/')).map((c) => c.path)).toEqual(['/print/escpos']);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a refused command is reported, not silently reprinted as text', async () => {
    stubAgent({
      ...NEW_AGENT,
      'POST /print/escpos': () => json(403, { ok: false, code: 'AGENT_COMMAND_FORBIDDEN', category: 'DRAWER', message: 'Print job refused: ESC p at byte 2 opens a cash drawer. Nothing was sent to the printer.' }),
    });
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_tok');
    agent = await load();
    await expect(agent.sendEscPosReceiptToConfiguredPrinter(USB, { dataBase64: 'G0A=', receiptText: 'x' }))
      .rejects.toMatchObject({ code: 'AGENT_COMMAND_FORBIDDEN', category: 'DRAWER' });
    expect(calls.some((c) => c.path === '/print/receipt')).toBe(false);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('bbpa_tok'); // a refusal is not a bad token
  });

  it('a driver failure (500) still falls back to the text path', async () => {
    stubAgent({
      ...NEW_AGENT,
      'POST /print/escpos': () => json(500, { ok: false, code: 'AGENT_PRINT_FAILED', message: 'StartDocPrinter failed for POS-80C' }),
      'POST /print/receipt': () => json(200, { ok: true }),
    });
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_tok');
    agent = await load();
    const result = await agent.sendEscPosReceiptToConfiguredPrinter(USB, { dataBase64: 'G0A=', receiptText: 'x' });
    expect(result.fallbackUsed).toBe('text');
  });
});

describe('agent discovery', () => {
  it('an agent that refuses this origin is told apart from one that is not running', async () => {
    stubAgent({ 'NOCORS GET /health': () => ({ ok: false, status: 0, type: 'opaque' }) });
    agent = await load();
    await expect(agent.listPrintAgentPrinters()).rejects.toMatchObject({ code: 'AGENT_ORIGIN_NOT_ALLOWED' });
    agent.resetPrintAgentProbe();
    const status = await agent.getPrintAgentStatus();
    expect(status.state).toBe('untrusted-origin');
    expect(status.message).toContain(`--add-origin ${window.location.origin}`);
  });

  it('no agent at all is "unreachable"', async () => {
    stubAgent({});
    agent = await load();
    await expect(agent.listPrintAgentPrinters()).rejects.toMatchObject({ code: 'AGENT_UNREACHABLE' });
  });
});

describe('an agent older than 0.6.0', () => {
  it('is reported as outdated, cannot be paired, and is never sent a token', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_from_a_rolled_back_agent');
    stubAgent({ ...OLD_AGENT, 'POST /print/escpos': () => json(200, { ok: true }) });
    agent = await load();
    const status = await agent.getPrintAgentStatus();
    expect(status).toMatchObject({ state: 'outdated', version: '0.5.3' });
    await expect(agent.startPrintAgentPairing()).rejects.toMatchObject({ code: 'AGENT_OUTDATED' });
    await agent.printEscPosThroughAgent({ printerName: 'POS-80C', dataBase64: 'G0A=', connectionType: 'USB' });
    const print = calls.find((c) => c.path === '/print/escpos');
    expect(print.headers.Authorization).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('0.5.3'));
  });
});

describe('labels (ZPL)', () => {
  const ZEBRA = { connectionType: 'USB', systemPrinterName: 'ZD220', id: 9, deviceType: 'LABEL_PRINTER' };

  it('go to the agent\'s ZPL route, checked by its ZPL policy, with the token', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_tok');
    stubAgent({ ...NEW_AGENT, 'POST /print/zpl': () => json(200, { ok: true }) });
    agent = await load();
    await agent.printZplThroughAgent({ printerName: 'ZD220', dataBase64: btoa('^XA^XZ'), connectionType: 'USB', ipAddress: '10.0.0.9', title: 'Labels' });
    const call = calls.find((c) => c.path === '/print/zpl');
    expect(call.headers.Authorization).toBe('Bearer bbpa_tok');
    expect(JSON.parse(call.body)).toEqual({ printerName: 'ZD220', dataBase64: btoa('^XA^XZ'), connectionType: 'USB', title: 'Labels' });
    expect(calls.some((c) => c.path === '/print/escpos')).toBe(false);
  });

  it('use the old route on an agent older than 0.6.0, which has no ZPL route', async () => {
    stubAgent({ ...OLD_AGENT, 'POST /print/escpos': () => json(200, { ok: true }) });
    agent = await load();
    await agent.printZplThroughAgent({ printerName: 'ZD220', dataBase64: btoa('^XA^XZ'), connectionType: 'USB' });
    expect(calls.map((c) => c.path)).toContain('/print/escpos');
  });

  it('a refused label is reported with its category, and the test page never falls back to text', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'bbpa_tok');
    stubAgent({
      ...NEW_AGENT,
      'POST /print/zpl': () => json(403, { ok: false, code: 'AGENT_COMMAND_FORBIDDEN', category: 'POWER', message: 'Label job refused: ~JR at byte 0 restarts the printer. Nothing was sent to the printer.' }),
    });
    agent = await load();
    const err = await agent.testConfiguredPrinter(ZEBRA, { zplBase64: btoa('~JR'), escPosBase64: 'G0A=', testText: 'x' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'AGENT_COMMAND_FORBIDDEN', category: 'POWER', status: 403 });
    expect(calls.map((c) => c.path)).not.toContain('/test-print');
    expect(calls.map((c) => c.path)).not.toContain('/print/escpos');
  });

  it('a network label printer is tested through the backend relay as ZPL', async () => {
    stubAgent({});
    agent = await load();
    const { printPosPrinterEscPos: relay } = await import('../../api/posPrinterApi');
    relay.mockResolvedValue({ ok: true });
    await agent.testConfiguredPrinter({ ...ZEBRA, connectionType: 'NETWORK_IP', ipAddress: '10.0.0.9', portNumber: 9100 }, { zplBase64: 'Xl5YQQ==' });
    expect(relay).toHaveBeenCalledWith(9, 'Xl5YQQ==', { format: 'ZPL' });
    expect(calls).toHaveLength(0);
  });
});
