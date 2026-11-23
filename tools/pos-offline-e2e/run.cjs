// M3 Standalone POS offline MVP — end-to-end acceptance run in the REAL Electron shell
// (tools/pos-desktop), real IndexedDB / service worker, real backend on a disposable clone.
//
// "Internet disconnected" = the same-origin server the till loads from (tools/pos-parity/server.cjs
// on :8090, standing in for the tenant's nginx) is stopped, so the till can reach neither its shell
// nor the API. The backend itself keeps running behind it.
//
// Printing: requests to the local print agent (127.0.0.1/localhost:19777) are answered by this
// harness through CDP Fetch and their ESC/POS payloads captured; the real agent is never driven.
//
// ONLY for a disposable billbull_m3_* database. Usage (from the repo root):
//   set PGPASSWORD, POS_DB, POS_PASSWORD, POS_OUT (outside the repo), POS_PROFILE (outside the repo)
//   node tools/pos-offline-e2e/run.cjs
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { helpers, sleep } = require('../pos-parity/cdp.cjs');

const env = (k, d) => process.env[k] ?? d;
const DB = env('POS_DB');
if (!/^billbull_m3_/.test(DB || '')) throw new Error('POS_DB must be a disposable billbull_m3_* clone');
const OUT = env('POS_OUT');
const PROFILE = env('POS_PROFILE');
const USER = env('POS_USER', 'admin');
const PASSWORD = env('POS_PASSWORD');
const BARCODE = env('POS_BARCODE', '0000000100908');
const SALESPERSON = env('POS_SALESPERSON', 'EMP1257');
const BACKEND = env('POS_BACKEND', 'http://127.0.0.1:8081');
const PORT = Number(env('POS_PORT', '8090'));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CDP_PORT = Number(env('POS_CDP_PORT', '9555'));
const REPO = path.resolve(__dirname, '../..');
const ELECTRON = path.join(REPO, 'tools/pos-desktop/node_modules/electron/dist/electron.exe');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
fs.mkdirSync(OUT, { recursive: true });

const evidence = { startedAt: new Date().toISOString(), db: DB, steps: [] };
const step = (name, data) => { evidence.steps.push({ name, at: new Date().toISOString(), ...data }); console.log(`✔ ${name}`, data ? JSON.stringify(data).slice(0, 400) : ''); save(); };
const save = () => fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
const sql = (q) => {
  try {
    return execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', DB, '-At', '-F', '|', '-c', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `SQL ERROR: ${String(e.stderr || e.message).trim().split('\n')[0]}`;
  }
};

// ── the same-origin server (= "the internet") ─────────────────────────────────────────────
let server = null;
async function serverUp() {
  server = spawn(process.execPath, [path.join(REPO, 'tools/pos-parity/server.cjs'), path.join(REPO, 'billbull-frontend'), String(PORT), BACKEND], { stdio: 'ignore', detached: !!process.env.POS_KEEP });
  if (process.env.POS_KEEP) server.unref();
  for (let i = 0; i < 50; i++) { try { await fetch(`${ORIGIN}/pos/`); return; } catch { await sleep(200); } }
  throw new Error('server did not start');
}
async function serverDown() {
  if (server) { server.kill(); server = null; }
  for (let i = 0; i < 50; i++) { try { await fetch(`${ORIGIN}/pos/`); await sleep(200); } catch { return; } }
  throw new Error('server did not stop');
}

// ── Electron ──────────────────────────────────────────────────────────────────────────────
let app = null;
async function launchElectron() {
  fs.mkdirSync(PROFILE, { recursive: true });
  const settings = path.join(PROFILE, 'settings.json');
  if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ serverOrigin: ORIGIN, fullscreen: false, zoomFactor: 1 }));
  const childEnv = { ...process.env, BILLBULL_POS_USER_DATA: PROFILE };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  app = spawn(ELECTRON, [path.join(REPO, 'tools/pos-desktop'), `--remote-debugging-port=${CDP_PORT}`], { env: childEnv, stdio: 'ignore', detached: !!process.env.POS_KEEP });
  if (process.env.POS_KEEP) app.unref();
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && (t.url.startsWith(ORIGIN) || t.url.startsWith('file:')));
    } catch { /* starting */ }
    if (!target) await sleep(300);
  }
  if (!target) throw new Error('Electron window not found');
  const client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await installAgentFake(client);
  const h = helpers(client, { shotsDir: OUT });
  return { client, h, target };
}
async function killElectron() {
  if (!app) return;
  const pid = app.pid;
  try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  app = null;
  await sleep(2500);
}
function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const client = {
      send(method, params = {}) { id += 1; const m = id; ws.send(JSON.stringify({ id: m, method, params })); return new Promise((res, rej) => pending.set(m, { res, rej, method })); },
      on(fn) { listeners.push(fn); },
    };
    ws.onopen = () => resolve(client);
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`)); else p.res(msg.result); }
      else if (msg.method) listeners.forEach((fn) => fn(msg));
    };
  });
}

// ── print agent stand-in (CDP Fetch); records every ESC/POS job ─────────────────────────────
const printJobs = [];
async function installAgentFake(client) {
  await client.send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:19777/*' }, { urlPattern: 'http://localhost:19777/*' }] });
  client.on(async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') return;
    const p = msg.params;
    const u = new URL(p.request.url);
    const cors = [
      { name: 'Access-Control-Allow-Origin', value: ORIGIN }, { name: 'Access-Control-Allow-Headers', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }, { name: 'Content-Type', value: 'application/json' },
    ];
    let body = { ok: true };
    if (u.pathname === '/health') body = { ok: true, version: '0.5.0-harness' };
    if (u.pathname === '/printers') body = { printers: [{ name: 'BillBull-M3-Harness', isDefault: true }] };
    if (u.pathname === '/print/escpos' && p.request.postData) {
      const req = JSON.parse(p.request.postData);
      const bytes = Buffer.from(req.dataBase64 || req.data || '', 'base64');
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const text = bytes.toString('latin1').replace(/[\x00-\x09\x0b-\x1f]/g, '');
      printJobs.push({ at: new Date().toISOString(), printer: req.printerName || req.printer, bytes: bytes.length, sha256, text });
      fs.writeFileSync(path.join(OUT, `print-${printJobs.length}.txt`), text);
      body = { ok: true, sha256, printer: req.printerName || 'BillBull-M3-Harness' };
    }
    await client.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(() => {});
  });
}

// ── till UI steps (flow as in tools/pos-checkout-recovery) ─────────────────────────────────
const setInput = (selectorExpr, value) => `(() => { const el = ${selectorExpr}; if (!el) return false; el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
const bodyHas = (re) => `${re}.test(document.body.innerText)`;

async function signInOnline(h) {
  await h.waitFor(`/Use username & password instead/.test(document.body.innerText) || !!document.querySelector('input[name=username]') || /Start Session|Continue Selling|Banknotes/.test(document.body.innerText)`, { timeout: 40000, label: 'login' });
  if (await h.evaluate(bodyHas('/Start Session|Continue Selling|Banknotes/'))) return;
  for (let i = 0; i < 8 && !(await h.evaluate(`!!document.querySelector('input[name=username]')`)); i++) {
    await sleep(1000); // the login card animates in; a click during it can miss
    await h.evaluate(`[...document.querySelectorAll('button,a')].find((b) => /Use username & password instead/.test(b.innerText))?.click()`);
  }
  await h.waitFor(`!!document.querySelector('input[name=username]')`);
  await h.fill('input[name=username]', USER);
  await h.fill('input[name=password]', PASSWORD);
  await h.evaluate(`document.querySelector('form').requestSubmit()`);
  await h.waitFor(bodyHas('/Choose a branch|Start Session|Continue Session|Continue Selling|Banknotes|CHECKOUT/i'), { timeout: 40000, label: 'branch or till' });
  if (await h.evaluate(bodyHas('/Choose a branch/i'))) { await h.clickText('/\\(BR-01\\)/'); await sleep(2500); }
}

async function enterSellingScreen(h) {
  for (let i = 0; i < 6; i++) {
    const t = await h.text();
    if (/Banknotes & coins|CHECKOUT/.test(t)) return;
    if (t.includes('Transfer Session Here')) { await h.clickText('Transfer Session Here'); await sleep(3500); continue; }
    if (t.includes('Continue Selling')) { await h.clickText('Continue Selling'); await sleep(3000); continue; }
    if (t.includes('Continue Session')) { await h.clickText('Continue Session'); await sleep(3000); continue; }
    if (t.includes('Start Session')) {
      await h.clickText('Start Session');
      await h.waitFor(`!!document.querySelector('[role=dialog]')`);
      await h.evaluate(setInput(`document.querySelector('[role=dialog] input[type=number]:not([disabled])')`, '5'));
      await sleep(300);
      await h.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Start Session'); b && b.click(); })()`);
      await sleep(4000);
      continue;
    }
    await sleep(2000);
  }
  await h.waitFor(bodyHas('/Banknotes & coins|CHECKOUT/'), { timeout: 30000, label: 'selling screen' });
}

async function sellOneCash(h, { label }) {
  await h.typeKeys(BARCODE);
  await sleep(2500);
  await h.shot(`${label}-cart`);
  if (!(await h.clickText('/^CHECKOUT/i'))) await h.clickText('Banknotes & coins');
  await sleep(2500);
  if (await h.evaluate(bodyHas('/Select Salesperson/'))) {
    await h.typeKeys(SALESPERSON);
    await sleep(2500);
    if (await h.evaluate(bodyHas('/Select Salesperson/'))) await h.clickText('Verify');
    await sleep(1500);
    await h.clickText('Continue').catch(() => {});
    await sleep(2500);
    if (!(await h.clickText('/^CHECKOUT/i'))) await h.clickText('Banknotes & coins');
    await sleep(2500);
  }
  await h.waitFor(bodyHas('/Settle Payment/'), { timeout: 15000, label: 'payment screen' });
  if (!(await h.evaluate(bodyHas('/CASH RECEIVED/i')))) { await h.typeKeys('c', { enter: false }); await sleep(1200); }
  await h.clickText('/^Exact/');
  await sleep(600);
  await h.clickText('/^Confirm/');
  await sleep(1200);
  await h.shot(`${label}-payment`);
  await h.clickText('/^Settle Payment/');
}

const offlineState = (h) => h.evaluate(`(async () => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('billbull-pos-offline'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await open();
  const all = (store) => new Promise((res) => { const t = db.transaction(store); const q = t.objectStore(store).getAll(); q.onsuccess = () => res(q.result); });
  const outbox = await all('outbox');
  const meta = await all('meta');
  db.close();
  const m = Object.fromEntries(meta.map((x) => [x.k, x.v]));
  return {
    outbox: outbox.map((r) => ({ rid: r.rid, seq: r.seq, ref: r.record.ref, totalMinor: r.record.totalMinor, syncState: r.syncState, invoiceNumber: r.invoiceNumber || null, printState: r.printState, sha256: r.sha256, sigLen: r.sig.length })),
    counter: m.counter || null,
    lease: m.lease ? { leaseId: m.lease.leaseId, exp: m.lease.claims.exp, seqStart: m.lease.claims.seqStart, seqEnd: m.lease.claims.seqEnd, maxValue: m.lease.claims.maxValue } : null,
    deviceKeyId: m.device?.keyId || null,
    privateKeyExtractable: m.device?.privateKey ? m.device.privateKey.extractable : null,
    storage: navigator.storage ? { persisted: await navigator.storage.persisted(), estimate: await navigator.storage.estimate() } : null,
  };
})()`);

const panelText = async (h) => {
  await h.evaluate(`document.querySelector('[data-testid=offline-status-button]')?.click()`);
  await sleep(600);
  const t = await h.evaluate(`document.querySelector('[data-testid=offline-panel]')?.innerText || ''`);
  return t;
};
const closePanel = (h) => h.evaluate(`document.querySelector('[data-testid=offline-panel]')?.click()`);

// ── the run ───────────────────────────────────────────────────────────────────────────────
let current = null;
(async () => {
  const counts = () => {
    const [inv, pay] = [sql(`select count(*) from sales_invoices`), sql(`select count(*) from sales_payments`)];
    return { invoices: Number(inv), payments: Number(pay) };
  };
  try {
    // 1. Online preparation
    await serverUp();
    let { h } = await launchElectron(); current = h;
    await signInOnline(h);
    await enterSellingScreen(h);
    const terminalId = await h.evaluate(`Object.entries(localStorage).find(([k]) => k.startsWith('billbull:pos:terminal_id:'))?.[1]`);
    if (!sql(`select id from pos_printers where terminal_id='${terminalId}' and device_type='RECEIPT_PRINTER' and is_active`)) {
      const cols = sql(`select string_agg(column_name, ',') from information_schema.columns where table_name='pos_printers' and column_name not in ('id','terminal_id','device_code','device_name')`);
      sql(`insert into pos_printers (${cols}, terminal_id, device_code, device_name) select ${cols}, '${terminalId}', 'M3-HARNESS-${terminalId}', 'M3 harness receipt' from pos_printers where id = (select id from pos_printers where device_type='RECEIPT_PRINTER' and connection_type='USB' and is_active order by id desc limit 1)`);
      await h.evaluate('location.reload()');
      await sleep(5000);
      await enterSellingScreen(h);
    }
    await h.evaluate(`document.querySelector('[data-testid=offline-status-button]').click()`);
    await sleep(800);
    if (await h.evaluate(`!!document.querySelector('[data-testid=offline-enroll]')`)) {
      await h.evaluate(`document.querySelector('[data-testid=offline-enroll]').click()`);
    }
    await h.waitFor(`/Valid until/.test(document.querySelector('[data-testid=offline-lease]')?.innerText || '')`, { timeout: 90000, label: 'offline lease' });
    await h.shot('01-prepared');
    await closePanel(h);
    const prep = await offlineState(h);
    const lease = sql(`select id, status, terminal_id, session_id, operator_username, seq_start, seq_end, max_value_minor, not_after, grace_until from pos_offline_leases where terminal_id='${terminalId}' order by issued_at desc limit 1`);
    step('1 online preparation', { terminalId, lease, idb: prep, key: sql(`select id, status, terminal_id from pos_offline_terminal_keys where terminal_id='${terminalId}'`) });
    evidence.onlineRequests = [...new Set(await h.evaluate('(window.__bbOfflineRequestLog || []).map((e) => e.method + " " + e.path + " -> " + e.outcome)'))];
    const before = counts();

    // 2. Internet disconnected; 3. Standalone POS starts with it disconnected
    await killElectron();
    await serverDown();
    let reach = 'reachable';
    try { await fetch(`${ORIGIN}/pos/`); } catch (e) { reach = `unreachable (${e.cause?.code || e.message})`; }
    ({ h } = await launchElectron()); current = h;
    await h.waitFor(`!!document.querySelector('[data-testid=offline-entry-continue]') || /Banknotes|CHECKOUT/.test(document.body.innerText)`, { timeout: 40000, label: 'offline start' });
    await h.shot('02-offline-start');
    const startUrl = await h.evaluate('location.href');
    const swControlled = await h.evaluate('!!navigator.serviceWorker.controller');
    if (await h.evaluate(`!!document.querySelector('[data-testid=offline-entry-continue]')`)) {
      await h.evaluate(`document.querySelector('[data-testid=offline-entry-continue]').click()`);
    }
    await enterSellingScreen(h);
    await h.shot('03-offline-till');
    step('2-3 disconnected and started offline', { server: reach, startUrl, swControlled, connectivity: await h.evaluate(`document.querySelector('[data-testid=offline-status-button]')?.dataset.connectivity`) });

    // 4-7. Scan, cash sale, IndexedDB commit, offline receipt
    await sellOneCash(h, { label: '04-offline' });
    await h.waitFor(`/SAVED OFFLINE — PENDING SYNC/.test(document.body.innerText)`, { timeout: 20000, label: 'offline success' });
    await sleep(3000);
    await h.shot('05-offline-saved');
    const afterSale = await offlineState(h);
    // The sale this run made: the one outbox record that was not there after preparation. A reused
    // profile keeps earlier runs' (already synced) records, so "the last row" is not this sale.
    const knownRids = new Set(prep.outbox.map((r) => r.rid));
    const newRecords = afterSale.outbox.filter((r) => !knownRids.has(r.rid));
    const successText = (await h.text()).match(/Saved offline[^\n]*\n?[^\n]*/i)?.[0];
    if (newRecords.length !== 1) throw new Error(`expected exactly one new outbox record, found ${newRecords.length}`);
    const sale = newRecords[0];
    if (!successText || !successText.includes(sale.ref)) throw new Error(`success screen (${successText}) does not show the new record ${sale.ref}`);
    step('4-7 offline sale committed', { sale: { rid: sale.rid, ref: sale.ref, seq: sale.seq, syncState: sale.syncState }, idb: afterSale, successText, printJobs: printJobs.map((p) => ({ bytes: p.bytes, sha256: p.sha256, marked: /OFFLINE . PENDING SYNCHRONIZATION/.test(p.text), excerpt: p.text.slice(0, 300) })), dbUnchanged: JSON.stringify(counts()) === JSON.stringify(before) });

    // 8-9. Electron restarted while offline; pending sale recovered
    await killElectron();
    ({ h } = await launchElectron()); current = h;
    await h.waitFor(`!!document.querySelector('[data-testid=offline-entry-continue]') || /Banknotes|CHECKOUT/.test(document.body.innerText)`, { timeout: 40000, label: 'offline restart' });
    if (await h.evaluate(`!!document.querySelector('[data-testid=offline-entry-continue]')`)) await h.evaluate(`document.querySelector('[data-testid=offline-entry-continue]').click()`);
    await enterSellingScreen(h);
    const recovered = await offlineState(h);
    const panel1 = await panelText(h);
    await h.shot('06-restart-recovered');
    await closePanel(h);
    const recoveredSale = recovered.outbox.find((r) => r.rid === sale.rid);
    if (!recoveredSale || recoveredSale.syncState !== 'PENDING') throw new Error(`sale ${sale.ref} not recovered as PENDING after restart: ${JSON.stringify(recoveredSale)}`);
    step('8-9 restarted offline, sale recovered', { sale: recoveredSale, idb: recovered.outbox, panel: panel1 });

    // 10-11. Internet restored; synchronised
    await serverUp();
    await h.waitFor(`!!document.querySelector('#till-lock-title') || document.querySelector('[data-testid=offline-status-button]')?.dataset.connectivity === 'online'`, { timeout: 60000, label: 'back online' });
    await h.waitFor(`!!document.querySelector('#till-lock-title')`, { timeout: 60000, label: 'sign-in prompt' });
    await h.shot('07-online-sign-in');
    await h.evaluate(setInput(`document.querySelector('[role=dialog] input[type=password]')`, PASSWORD));
    await h.evaluate(`document.querySelector('[role=dialog] form').requestSubmit()`);
    await h.waitFor(`(async () => { const r = await new Promise((res) => { const q = indexedDB.open('billbull-pos-offline'); q.onsuccess = () => res(q.result); }); const rows = await new Promise((res) => { const g = r.transaction('outbox').objectStore('outbox').getAll(); g.onsuccess = () => res(g.result); }); r.close(); return rows.length > 0 && rows.every((x) => x.syncState === 'SYNCED'); })()`, { timeout: 90000, label: 'synced' });
    const synced = await offlineState(h);
    const panel2 = await panelText(h);
    await h.shot('08-synced');
    await closePanel(h);
    const rec = synced.outbox.find((r) => r.rid === sale.rid);
    if (!rec?.invoiceNumber) throw new Error(`sale ${sale.ref} has no invoice number after sync: ${JSON.stringify(rec)}`);
    step('10-11 synchronised', { idb: synced.outbox, panel: panel2, server: sql(`select id, state, local_seq, invoice_number, reason_code, received_by from pos_offline_sales where id='${rec.rid}'`) });

    // 12-15. Exactly one invoice / payment, stock, journal and ledger
    const inv = sql(`select id, invoice_number, status, invoice_total, amount_paid, pos_session_id, pos_terminal_id, pos_checkout_key from sales_invoices where invoice_number='${rec.invoiceNumber}'`);
    const invId = inv.split('|')[0];
    const dn = sql(`select id, dn_number, status from delivery_notes where sales_invoice_id=${invId}`);
    const journalRefs = `('FS-${rec.invoiceNumber}') or je.reference in (select 'RV-' || receipt_voucher_record_id from sales_payments where linked_invoice='${rec.invoiceNumber}')`;
    evidence.financial = {
      invoice: inv,
      invoicesWithKey: sql(`select count(*) from sales_invoices where pos_checkout_key='off-${rec.rid}'`),
      payments: sql(`select id, payment_number, amount, payment_mode, status, pos_session_id from sales_payments where linked_invoice='${rec.invoiceNumber}'`),
      deliveryNote: dn,
      stockMovements: sql(`select source_type, reference_no, product_id, quantity, warehouse_id, negative_override from stock_movements where reference_no='${dn.split('|')[1]}'`),
      journalLines: sql(`select je.entry_number, je.reference, jl.account_code, jl.account, jl.debit, jl.credit from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id where je.reference in ${journalRefs} order by je.id, jl.id`),
      ledgerEntries: sql(`select voucher_no, account_code, debit_amount, credit_amount from ledger_entries where voucher_no in (select je.entry_number from journal_entries je where je.reference in ${journalRefs}) order by id`),
      attempt: sql(`select state, invoice_number, payment_legs_expected, payment_legs_recorded, session_recorded_at is not null from pos_checkout_attempts where checkout_key='off-${rec.rid}'`),
      countsBefore: before, countsAfter: counts(),
    };
    step('12-15 financial and inventory', evidence.financial);

    // 16. Repeated synchronisation creates no duplicates
    const resend = await h.evaluate(`(async () => {
      const db = await new Promise((res) => { const q = indexedDB.open('billbull-pos-offline'); q.onsuccess = () => res(q.result); });
      const rows = await new Promise((res) => { const g = db.transaction('outbox').objectStore('outbox').getAll(); g.onsuccess = () => res(g.result); });
      db.close();
      const out = [];
      for (let i = 0; i < 3; i++) {
        const r = await fetch('/api/pos/offline/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionStorage.getItem('token'), 'X-Branch-Id': String(rows[0].record.br) }, body: JSON.stringify({ records: rows.map((x) => ({ record: x.record, sig: x.sig })) }) });
        out.push({ status: r.status, body: await r.json() });
      }
      return out;
    })()`);
    step('16 repeated sync', { resend: resend.map((r) => r.body.results), countsAfter: counts(), invoicesWithKey: sql(`select count(*) from sales_invoices where pos_checkout_key='off-${rec.rid}'`) });

    evidence.result = 'PASS';
  } catch (err) {
    evidence.result = 'FAIL';
    evidence.error = String(err && err.stack || err);
    try { await current.shot('FAIL'); evidence.failUrl = await current.evaluate('location.href'); evidence.failText = (await current.text()).slice(0, 3000); evidence.failRequests = await current.evaluate('(window.__bbOfflineRequestLog || []).map((e) => e.method + " " + e.path + " -> " + e.outcome)'); } catch { /* no page */ }
    console.error(err);
  } finally {
    evidence.printJobs = printJobs.map(({ text, ...p }) => ({ ...p, excerpt: text.slice(0, 800) }));
    save();
    if (!process.env.POS_KEEP) { await killElectron(); await serverDown().catch(() => {}); }
  }
})();
