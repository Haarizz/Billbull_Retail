// Phase 0 / M2.2.2 + M2.2.3 — durable pending checkout recovery, in a real browser with real page
// reloads, a second real tab, a killed browser process and cleared site data.
//
// Drives the standalone POS (/pos/) in headless Chrome against a backend on a DISPOSABLE database,
// and uses the DevTools Fetch domain to break the checkout request exactly where a real network
// breaks it: the answer lost after the server committed, the request held until the page reloads,
// and so on. The browser's own IndexedDB, reloads and service code are real; only the network
// fault is injected. After each scenario the database is queried for what actually happened.
//
//   node run.cjs <scenario|all>
//
// Scenarios: lost-response, held-response, held-request, in-progress, refused, changed-cart,
//            no-indexeddb, abandon, two-tabs, crash, data-loss, pi-delivery, default-delivery
//
// Environment:
//   POS_BASE_URL    default http://127.0.0.1:8090 (tools/pos-parity/server.cjs)
//   POS_USER / POS_PASSWORD   a till user on the disposable tenant (required)
//   POS_BARCODE     barcode to scan (required)
//   POS_SALESPERSON employee code to scan when checkout asks for one
//   POS_DB          the disposable database (required; must not be testdb)
//   PSQL            psql.exe path (default: PostgreSQL 17 on Windows); PGPASSWORD for its password
//   POS_OUT         output root (default: ./out). Holds screenshots, text dumps and api.json, which
//                   contains bearer tokens: keep it outside the repository and delete it after use.
//   POS_PROFILE_DIR Chrome profile dir (default: <POS_OUT>/.chrome-profile)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, helpers, recordApi, sleep } = require('../pos-parity/cdp.cjs');
const CDP_PORT = 9333; // cdp.cjs launch() default

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const BASE = env('POS_BASE_URL', 'http://127.0.0.1:8090');
const USER = env('POS_USER');
const PASSWORD = env('POS_PASSWORD');
const BARCODE = env('POS_BARCODE');
const DB = env('POS_DB');
const PSQL = env('PSQL', 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe');
const OUT = path.resolve(env('POS_OUT', path.join(__dirname, 'out')));
if (!USER || !PASSWORD || !BARCODE || !DB) { console.error('POS_USER, POS_PASSWORD, POS_BARCODE and POS_DB are required'); process.exit(2); }
if (DB === 'testdb' || !/^billbull_m0_/.test(DB)) { console.error('POS_DB must be a disposable billbull_m0_* database'); process.exit(2); }

const sql = (q) => execFileSync(PSQL, ['-w', '-h', 'localhost', '-U', 'postgres', '-d', DB, '-tAc', q], { encoding: 'utf8' }).trim();
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const dbFacts = (key) => ({
  invoices: Number(sql(`select count(*) from sales_invoices where pos_checkout_key = ${quote(key)}`)),
  invoiceNumbers: sql(`select coalesce(string_agg(invoice_number, ','), '') from sales_invoices where pos_checkout_key = ${quote(key)}`),
  invoiceStatus: sql(`select coalesce(string_agg(status || case when pos_proforma_pending then ' PROFORMA' else '' end, ','), '') from sales_invoices where pos_checkout_key = ${quote(key)}`),
  attempt: sql(`select coalesce(max(state || ' attempts=' || attempt_count), 'none') from pos_checkout_attempts where checkout_key = ${quote(key)}`),
});
/** Full diagnostic snapshot of one key: the attempt row and every invoice under it, with timestamps. */
const dbTrace = (key) => ({
  at: new Date().toISOString(),
  attempt: sql(`select coalesce(string_agg(concat_ws(' | ', state, 'attempts=' || attempt_count, 'last_step=' || last_step, 'invoice=' || invoice_number, 'created=' || created_at, 'updated=' || updated_at, 'detail=' || left(outcome_detail, 200)), ' || '), 'none') from pos_checkout_attempts where checkout_key = ${quote(key)}`),
  invoices: sql(`select coalesce(string_agg(concat_ws(' | ', invoice_number, status, 'proforma=' || pos_proforma_pending, 'payment_mode=' || payment_mode, 'created=' || created_at), ' || '), 'none') from sales_invoices where pos_checkout_key = ${quote(key)}`),
});

// ── page helpers ────────────────────────────────────────────────────────────────────────────
const IDB_DUMP = `(async () => {
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  if (!dbs.some((d) => d.name === 'billbull-pos-checkout')) return [];
  return await new Promise((res, rej) => {
    const q = indexedDB.open('billbull-pos-checkout');
    q.onerror = () => rej(String(q.error));
    q.onsuccess = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains('operations')) { db.close(); res([]); return; }
      const r = db.transaction('operations', 'readonly').objectStore('operations').getAll();
      r.onsuccess = () => {
        db.close();
        res(r.result.map((x) => ({ key: x.checkoutKey, type: x.operationType, state: x.state, attempts: x.attempts,
          hash: x.payloadHash, items: ((x.payload && x.payload.items) || []).map((i) => i.itemCode + 'x' + i.quantity).join(','),
          context: x.context, lookup: x.lookup || null, result: x.result || null, lastResponse: x.lastResponse || null,
          storedKeys: Object.keys(x.payload || {}).sort() })));
      };
    };
  });
})()`;

async function signIn(h) {
  await h.navigate(BASE + '/pos/login');
  await h.waitFor(`/Use username & password instead|Start Session|Continue Session|Continue Selling|Session open|CHECKOUT|Banknotes/i.test(document.body.innerText) || !!document.querySelector('input[name=username]')`, { label: 'login screen or signed-in till' });
  // Chrome restores sessionStorage after it is killed (crash scenario): already signed in.
  if (!(await h.evaluate(`/Use username & password instead/.test(document.body.innerText) || !!document.querySelector('input[name=username]')`))) {
    await waitTill(h);
    return;
  }
  // The till defaults to PIN sign-in; this harness uses username and password.
  if (!(await h.evaluate(`!!document.querySelector('input[name=username]')`))) await h.clickText('Use username & password instead');
  await h.waitFor(`!!document.querySelector('input[name=username]')`, { label: 'login form' });
  await h.fill('input[name=username]', USER);
  await h.fill('input[name=password]', PASSWORD);
  await h.evaluate(`document.querySelector('form').requestSubmit()`);
  await chooseBranch(h);
  await waitTill(h);
}

const BRANCH = env('POS_BRANCH_LABEL', '(BR-01)');
async function chooseBranch(h) {
  await h.waitFor(`/Choose a branch|Start Session|Continue Session|Continue Selling|CHECKOUT|Banknotes/i.test(document.body.innerText)`, { timeout: 40000, label: 'branch chooser or till' });
  if (await h.evaluate(`/Choose a branch/i.test(document.body.innerText)`)) {
    const escaped = BRANCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await h.clickText(`/${escaped}/`);
    await sleep(2500);
  }
}

async function waitTill(h) {
  await chooseBranch(h);
  await h.waitFor(`/Start Session|Continue Session|Continue Selling|CHECKOUT|Banknotes|Settle/i.test(document.body.innerText) && !document.body.innerText.includes('Connecting...')`, { timeout: 40000, label: 'POS till' });
  await sleep(2500);
}

const setInput = (selectorExpr, value) => `(() => {
  const el = ${selectorExpr};
  if (!el) return false;
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

async function enterSellingScreen(h) {
  for (let i = 0; i < 4; i += 1) {
    const t = await h.text();
    if (/Banknotes & coins|CHECKOUT/.test(t)) break; // already on the selling screen
    if (t.includes('Transfer Session Here')) { await h.clickText('Transfer Session Here'); await sleep(3500); continue; }
    if (t.includes('Continue Selling')) { await h.clickText('Continue Selling'); await sleep(3000); continue; }
    if (t.includes('Continue Session')) { await h.clickText('Continue Session'); await sleep(3000); continue; }
    if (t.includes('Start Session')) {
      await h.clickText('Start Session');
      await h.waitFor(`!!document.querySelector('[role=dialog]')`, { label: 'start session dialog' });
      await h.evaluate(setInput(`document.querySelector('[role=dialog] input[type=number]:not([disabled])')`, '5'));
      await sleep(300);
      const clicked = await h.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Start Session'); if (!b) return 'none'; b.click(); return b.disabled ? 'disabled' : 'clicked'; })()`);
      await sleep(3500);
      if (process.env.POS_DEBUG) console.log('  start-session:', clicked, (await h.text()).replace(/\s+/g, ' ').slice(-400));
      continue;
    }
    break;
  }
  await sleep(1500);
}

async function ringItems(h, count = 1) {
  for (let i = 0; i < count; i += 1) { await h.typeKeys(BARCODE); await sleep(2200); }
}

async function openPayment(h) {
  const dbg = async (label) => { if (process.env.POS_DEBUG) console.log('  [' + label + ']', (await h.text()).replace(/\n+/g, ' | ').slice(0, 700)); };
  // Classic/Focus show a CHECKOUT button; the quick-checkout bar shows tender tiles instead.
  if (!(await h.clickText('/^CHECKOUT/i'))) await h.clickText('Banknotes & coins');
  await sleep(2500);
  await dbg('after checkout');
  if (await h.evaluate(`document.body.innerText.includes('Select Salesperson')`)) {
    const code = env('POS_SALESPERSON');
    if (!code) throw new Error('checkout asks for a salesperson: set POS_SALESPERSON');
    await h.typeKeys(code);
    await sleep(2500);
    await dbg('after salesperson scan');
    if (await h.evaluate(`document.body.innerText.includes('Select Salesperson')`)) await h.clickText('Verify');
    await sleep(1500);
    await h.clickText('Continue').catch(() => {});
    await sleep(2500);
    if (!(await h.clickText('/^CHECKOUT/i'))) await h.clickText('Banknotes & coins');
    await sleep(2500);
  }
  await dbg('payment?');
  await h.waitFor(`/Settle Payment/.test(document.body.innerText)`, { label: 'payment screen', timeout: 15000 });
  // Cash for the exact amount. The quick-checkout tile opens the Cash modal itself; otherwise use the hotkey.
  if (!(await h.evaluate(`/CASH RECEIVED/i.test(document.body.innerText)`))) { await h.typeKeys('c', { enter: false }); await sleep(1200); }
  await h.clickText('/^Exact/');
  await sleep(600);
  await h.clickText('/^Confirm/');
  await sleep(1200);
  await dbg('cash entered');
}

async function pressSettle(h) {
  const hit = await h.clickText('/^Settle Payment/');
  if (!hit) throw new Error('no Settle Payment button');
}

// ── network fault injection (DevTools Fetch domain) ─────────────────────────────────────────
function faults(client) {
  let rule = null; // (stage, request) => 'pass' | 'fail' | 'hold' | { fulfil: { status, body } }
  const held = [];
  const checkoutBodies = [];
  const checkoutResponses = [];
  client.on(async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') return;
    const p = msg.params;
    const stage = p.responseStatusCode !== undefined || p.responseErrorReason ? 'response' : 'request';
    const isCheckout = new URL(p.request.url).pathname === '/api/pos/checkout' && p.request.method === 'POST';
    if (isCheckout && stage === 'request') checkoutBodies.push(p.request.postData || null);
    if (isCheckout && stage === 'response') {
      // What the server actually answered, even when the answer is then held from the page.
      const entry = { at: new Date().toISOString(), status: p.responseStatusCode ?? null, error: p.responseErrorReason ?? null, body: null };
      try {
        const r = await client.send('Fetch.getResponseBody', { requestId: p.requestId });
        const text = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
        try { const j = JSON.parse(text); entry.body = { code: j.code ?? null, message: typeof j.message === 'string' ? j.message.slice(0, 300) : null, id: j.id ?? null, invoiceNumber: j.invoiceNumber ?? null, posProformaPending: j.posProformaPending ?? null }; } catch { entry.body = text.slice(0, 300); }
      } catch { /* no body */ }
      checkoutResponses.push(entry);
    }
    const decision = isCheckout && rule ? rule(stage, p.request) : 'pass';
    try {
      if (decision === 'fail') {
        await client.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionReset' });
      } else if (decision === 'hold') {
        held.push(p.requestId);
      } else if (decision && decision.fulfil) {
        await client.send('Fetch.fulfillRequest', {
          requestId: p.requestId, responseCode: decision.fulfil.status,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(decision.fulfil.body)).toString('base64'),
        });
      } else if (stage === 'response') {
        await client.send('Fetch.continueResponse', { requestId: p.requestId });
      } else {
        await client.send('Fetch.continueRequest', { requestId: p.requestId });
      }
    } catch (e) { /* the page went away mid-request */ }
  });
  return {
    async enable() {
      await client.send('Fetch.enable', { patterns: [
        { urlPattern: '*/api/pos/checkout', requestStage: 'Request' },
        { urlPattern: '*/api/pos/checkout', requestStage: 'Response' },
      ] });
    },
    set(r) { rule = r; },
    /** Lets every held request or response continue (a slow network that recovers). */
    async release() {
      const ids = held.splice(0);
      for (const id of ids) {
        try { await client.send('Fetch.continueRequest', { requestId: id }); } catch { /* response stage */
          try { await client.send('Fetch.continueResponse', { requestId: id }); } catch { /* gone */ }
        }
      }
    },
    held,
    checkoutBodies,
    checkoutResponses,
  };
}

// ── scenarios ───────────────────────────────────────────────────────────────────────────────
const scenarios = {
  // Server records the sale; the answer is lost (connection reset). Reload. The till must find the
  // recorded sale by its saved key, without sending it again.
  async 'lost-response'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'response' ? 'fail' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(`/did not confirm this sale/.test(document.body.innerText)`, { label: 'unconfirmed message' });
    const [rec] = await t.idb();
    t.f.set(null);
    t.note('before reload', { idb: rec, db: dbFacts(rec.key) });
    t.expect(rec.state === 'UNCERTAIN', 'record kept as UNCERTAIN after the lost answer');
    await t.reload();
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'recovered notice', timeout: 30000 });
    const [after] = (await t.idb()).filter((r) => r.key === rec.key);
    const db = dbFacts(rec.key);
    t.note('after reload', { idb: after, db, checkoutPostsSinceReload: t.postsSince() });
    t.expect(after.state === 'COMPLETED', 'reconciled to COMPLETED from the server');
    t.expect(db.invoices === 1, 'exactly one invoice under the key');
    t.expect(t.postsSince() === 0, 'no checkout POST after the reload (read-only lookup only)');
    t.expect(after.result?.invoiceNumber === db.invoiceNumbers, 'the recovered invoice is the recorded one');
    await t.shot('recovered');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // The request reaches the server, the answer is held (a slow network), the cashier reloads.
  async 'held-response'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'response' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted' });
    // Let the server finish: wait for the invoice to exist, the browser still has no answer.
    let rec;
    for (let i = 0; i < 40; i += 1) { [rec] = await t.idb(); if (rec && dbFacts(rec.key).invoices === 1) break; await sleep(500); }
    t.note('while held', { idb: rec, db: dbFacts(rec.key) });
    t.expect(rec.state === 'SENT', 'record says SENT while the answer is outstanding');
    t.f.set(null);
    await t.reload();
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'recovered notice', timeout: 30000 });
    const db = dbFacts(rec.key);
    t.note('after reload', { idb: (await t.idb()).find((r) => r.key === rec.key), db, checkoutPostsSinceReload: t.postsSince() });
    t.expect(db.invoices === 1, 'one invoice: the reload did not create a second');
    t.expect(t.postsSince() === 0, 'no checkout POST after the reload');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // The request never leaves the browser before the reload (a timeout on the way out). After the
  // reload the server has nothing; "Send again" sends the SAME key and payload once.
  async 'held-request'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'request' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted' });
    await sleep(1000);
    const [rec] = await t.idb();
    const firstBody = t.f.checkoutBodies[t.f.checkoutBodies.length - 1];
    t.note('held before reaching the server', { idb: rec, db: dbFacts(rec.key) });
    t.expect(dbFacts(rec.key).attempt === 'none', 'the server never saw it');
    t.f.set(null);
    await t.reload();
    await t.h.waitFor(`/server has no sale under this checkout/.test(document.body.innerText)`, { label: 'not-found state', timeout: 30000 });
    await t.shot('not-found');
    t.expect(t.postsSince() === 0, 'nothing re-sent automatically after the reload');
    await t.h.clickText('Send again (same sale)');
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'replay result', timeout: 30000 });
    const replayBody = t.f.checkoutBodies[t.f.checkoutBodies.length - 1];
    const db = dbFacts(rec.key);
    t.note('after Send again', { idb: (await t.idb()).find((r) => r.key === rec.key), db });
    t.expect(JSON.parse(replayBody).checkoutKey === rec.key, 'the replay carries the original key');
    t.expect(replayBody === firstBody, 'the replay body is byte-identical to the original request');
    t.expect(db.invoices === 1, 'exactly one invoice');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // A real server worker is still recording the sale when the till reloads. Needs a backend started
  // with the chaos pause (see README): pos.checkout.attempt.chaos='|INVOICE_SAVE|before|<ms>' on a
  // billbull_m0_ clone, so the claimed attempt stays ACTIVE for that long. The browser request is
  // abandoned by the reload; the server carries on. After the reload: in progress, a replay is
  // answered CHECKOUT_IN_PROGRESS and kept, and once the worker finishes the check finds the invoice.
  async 'in-progress'(t) {
    if (!process.env.POS_CHAOS_MS) throw new Error('in-progress needs a chaos-armed backend: set POS_CHAOS_MS to its pause');
    await t.freshSale();
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted' });
    const [rec] = await t.idb();
    // Wait until the server has claimed the key (the worker is now paused before INVOICE_SAVE).
    for (let i = 0; i < 40 && !dbFacts(rec.key).attempt.startsWith('ACTIVE'); i += 1) await sleep(250);
    t.expect(dbFacts(rec.key).attempt.startsWith('ACTIVE'), 'the server worker holds the attempt (ACTIVE)');
    await t.reload();
    await t.h.waitFor(`/still recording it/.test(document.body.innerText)`, { label: 'in-progress state', timeout: 30000 });
    const shown = (await t.idb()).find((r) => r.key === rec.key);
    t.note('after reload', { idb: shown, db: dbFacts(rec.key) });
    await t.shot('in-progress');
    t.expect(t.postsSince() === 0, 'nothing re-sent automatically');
    t.expect(shown.state === 'UNCERTAIN' && shown.lookup?.recorded === 'UNKNOWN' && shown.lookup?.sameRequest === true,
      'reconciled as in progress (UNKNOWN, same request), kept');
    // Send again while the worker still holds it.
    await t.h.clickText('Send again (same sale)');
    await t.h.waitFor(`/still being recorded by an earlier request/.test(document.body.innerText)`, { label: 'in-progress answer', timeout: 30000 });
    const replayed = (await t.idb()).find((r) => r.key === rec.key);
    t.note('after Send again', { idb: replayed, db: dbFacts(rec.key) });
    t.expect(replayed.state === 'UNCERTAIN' && replayed.lastResponse?.code === 'CHECKOUT_IN_PROGRESS', 'CHECKOUT_IN_PROGRESS keeps the operation');
    t.expect(JSON.parse(t.f.checkoutBodies[t.f.checkoutBodies.length - 1]).checkoutKey === rec.key, 'replayed under the original key');
    t.expect(dbFacts(rec.key).invoices === 0, 'no invoice yet');
    // The worker finishes; the cashier checks again.
    for (let i = 0; i < 120 && dbFacts(rec.key).attempt.split(' ')[0] !== 'COMPLETED'; i += 1) await sleep(500);
    await t.h.clickText('Check status');
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'completed after the worker finished', timeout: 30000 });
    const db = dbFacts(rec.key);
    t.note('after the worker finished', { idb: (await t.idb()).find((r) => r.key === rec.key), db });
    t.expect(db.invoices === 1, 'exactly one invoice');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // A proven pre-write refusal (the session guard's body). Released; nothing to recover on reload.
  async refused(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'request'
      ? { fulfil: { status: 409, body: { code: 'SESSION_NOT_OPEN', message: 'POS session is CLOSED, so this sale was not recorded.', recorded: false } } }
      : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(`/so this sale was not recorded/.test(document.body.innerText)`, { label: 'refusal message' });
    const [rec] = await t.idb();
    t.f.set(null);
    t.note('after refusal', { idb: rec });
    t.expect(rec.state === 'REFUSED', 'released as REFUSED');
    await t.reload();
    await sleep(4000);
    const shown = await t.h.evaluate(`!!document.querySelector('[data-testid=pending-checkout-notice]')`);
    t.note('after reload', { noticeShown: shown, postsSinceReload: t.postsSince() });
    t.expect(!shown, 'no unresolved notice after the reload');
    t.expect(dbFacts(rec.key).invoices === 0, 'no invoice');
  },

  // Lost answer, then the cashier edits the cart and settles: refused without explicit confirmation,
  // original payload kept; once confirmed, a new key, and both records are distinct.
  async 'changed-cart'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'response' ? 'fail' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(`/did not confirm this sale/.test(document.body.innerText)`, { label: 'unconfirmed message' });
    t.f.set(null);
    const [orig] = await t.idb();
    // Back to the cart, add another unit, settle again.
    await t.h.typeKeys('Escape', { enter: false }).catch(() => {});
    await t.client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await t.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1500);
    await ringItems(t.h, 1);
    await openPayment(t.h);
    t.dialogs.answer = false;
    const postsBefore = t.f.checkoutBodies.length;
    await pressSettle(t.h);
    await t.h.waitFor(`/earlier sale on this till has not been confirmed/.test(document.body.innerText)`, { label: 'blocked message' });
    t.expect(t.f.checkoutBodies.length === postsBefore, 'declining the confirmation sends nothing');
    t.expect(t.dialogs.seen.some((m) => /NEW, SEPARATE sale/.test(m)), 'the cashier was asked about a separate sale');
    t.dialogs.answer = true;
    await pressSettle(t.h);
    await t.h.waitFor(`/PAYMENT COMPLETE/i.test(document.body.innerText)`, { label: 'second sale complete', timeout: 30000 });
    const rows = await t.idb();
    const first = rows.find((r) => r.key === orig.key);
    const second = rows.find((r) => r.key !== orig.key);
    t.note('records', { first, second, dbFirst: dbFacts(orig.key), dbSecond: dbFacts(second.key) });
    t.expect(first.items === orig.items && first.state === 'UNCERTAIN', 'original payload and state untouched');
    t.expect(second.state === 'COMPLETED' && second.items !== orig.items, 'the changed sale is its own operation');
    t.dialogs.answer = true;
    await t.reload();
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'original recovered', timeout: 30000 });
    t.expect(dbFacts(orig.key).invoices === 1 && dbFacts(second.key).invoices === 1, 'one invoice per key');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // IndexedDB unavailable: the sale is not sent at all.
  async 'no-indexeddb'(t) {
    const { identifier } = await t.client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(window, 'indexedDB', { configurable: true, get() { return undefined; } });`,
    });
    try {
      await t.reload();
      await t.freshSale({ skipReload: true });
      const before = t.f.checkoutBodies.length;
      await pressSettle(t.h);
      await t.h.waitFor(`/could not save the sale safely/.test(document.body.innerText)`, { label: 'storage error' });
      await t.shot('no-indexeddb');
      t.expect(t.f.checkoutBodies.length === before, 'no checkout request was sent');
    } finally {
      await t.client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await t.reload();
    }
  },

  // ── M2.2.3 ──────────────────────────────────────────────────────────────────────────────────

  // The request never reaches the server, the till reloads: "nothing found" no longer allows a
  // dismissal. The cashier abandons it ON THE SERVER; the record closes only once the server says
  // ABANDONED, and a late copy of the original request is then refused with nothing written.
  async abandon(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'request' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted' });
    await sleep(1000);
    const [rec] = await t.idb();
    const firstBody = t.f.checkoutBodies[t.f.checkoutBodies.length - 1];
    t.f.set(null);
    await t.reload();
    await t.h.waitFor(`/server has no sale under this checkout yet/.test(document.body.innerText)`, { label: 'not-found state', timeout: 30000 });
    const buttons = await t.h.evaluate(`[...document.querySelectorAll('[data-testid=pending-checkout-notice] button')].map((b) => b.innerText.trim())`);
    t.note('notice buttons', buttons);
    t.expect(!buttons.includes('Dismiss'), 'no local dismissal of a record the server merely has not seen');
    t.expect(buttons.includes('Abandon on server'), 'the explicit abandonment action is offered');
    const stateBefore = (await t.idb())[0].state;
    t.expect(!['REFUSED', 'DISMISSED', 'ABANDONED'].includes(stateBefore), `NOT_FOUND did not resolve the record (${stateBefore})`);
    t.dialogs.answer = true;
    await t.h.clickText('Abandon on server');
    for (let i = 0; i < 40 && (await t.idb())[0].state !== 'ABANDONED'; i += 1) await sleep(250);
    const after = (await t.idb()).find((r) => r.key === rec.key);
    const db = dbFacts(rec.key);
    t.note('after abandon', { idb: after, db });
    t.expect(after.state === 'ABANDONED', 'record resolved only after the server confirmed ABANDONED');
    t.expect(db.attempt.startsWith('ABANDONED'), 'the server holds a terminal ABANDONED tombstone for the key');
    // A late copy of the original request (a retry the network delivered late).
    const late = await t.h.evaluate(`fetch('/api/pos/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + sessionStorage.getItem('token') }, body: ${JSON.stringify(firstBody)} })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
    t.note('late copy', late);
    t.expect(late.status === 409 && late.body?.code === 'CHECKOUT_ABANDONED', 'a late copy is refused with CHECKOUT_ABANDONED');
    t.expect(dbFacts(rec.key).invoices === 0, 'no invoice was ever written under the key');
    await t.shot('abandoned');
  },

  // Two real tabs of the same till. Tab A's request is in flight; tab B sees the operation, cannot
  // send it, and re-ringing the same sale in B neither sends nor creates a second key.
  async 'two-tabs'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'request' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted (tab A)' });
    const [rec] = await t.idb();
    const b = await t.openTab();
    try {
      await b.h.waitFor(`/Being sent from another tab or window of this till/.test(document.body.innerText)`, { label: 'tab B notice', timeout: 30000 });
      const bButtons = await b.h.evaluate(`[...document.querySelectorAll('[data-testid=pending-checkout-notice] button')].map((x) => x.innerText.trim())`);
      t.note('tab B notice buttons', bButtons);
      t.expect(!bButtons.includes('Send again (same sale)') && !bButtons.includes('Abandon on server'), 'tab B offers neither send nor abandon while A holds the lease');
      await b.h.shot('two-tabs-B-notice');
      await enterSellingScreen(b.h);
      await ringItems(b.h, 1);
      await openPayment(b.h);
      t.dialogs.answer = false; // a "separate sale?" prompt, if B's payload differs, is declined
      const bPostsBefore = b.f.checkoutBodies.length;
      await pressSettle(b.h);
      await sleep(4000);
      const bText = await b.h.text();
      t.note('tab B after settle', (bText.match(/(being sent from another tab[^\n]*|earlier sale on this till[^\n]*)/i) || [bText.slice(-300)])[0]);
      t.expect(b.f.checkoutBodies.length === bPostsBefore, 'tab B sent no checkout request');
      t.expect((await t.idb()).length === 1, 'still exactly one operation (one key) in the shared IndexedDB');
      await b.h.shot('two-tabs-B-settle');
    } finally {
      t.dialogs.answer = true;
      await t.f.release();
    }
    await t.h.waitFor(`/PAYMENT COMPLETE/i.test(document.body.innerText)`, { label: 'tab A completes', timeout: 30000 });
    const db = dbFacts(rec.key);
    t.note('after release', { idb: await t.idb(), db });
    t.expect(db.invoices === 1, 'exactly one invoice');
    t.expect((await t.idb())[0].state === 'COMPLETED', 'the single operation completed');
    await b.close();
  },

  // A real browser crash (the Chrome process is killed: no pagehide, no unload) with the request out.
  //  (1) the server committed: after relaunch the lookup recovers it, nothing is re-sent;
  //  (2) the server never saw it: once the dead tab's lease runs out, Send again replays the
  //      original key and the byte-identical body; one invoice.
  async crash(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'response' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(t.hasRecord(), { label: 'record persisted' });
    let [rec] = await t.idb();
    for (let i = 0; i < 40 && dbFacts(rec.key).invoices !== 1; i += 1) await sleep(500);
    t.expect(dbFacts(rec.key).invoices === 1 && (await t.idb())[0].state === 'SENT', '(1) committed on the server, SENT locally, answer outstanding');
    await t.crashAndRelaunch();
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'recovered after crash', timeout: 45000 });
    t.note('(1) after relaunch', { idb: (await t.idb()).find((r) => r.key === rec.key), db: dbFacts(rec.key), postsSinceRelaunch: t.postsSince() });
    t.expect(t.postsSince() === 0 && dbFacts(rec.key).invoices === 1, '(1) recovered read-only, one invoice');
    await t.h.clickText('OK');
    await sleep(1500);

    await t.freshSale({ skipWipe: true });
    t.f.set((stage) => (stage === 'request' ? 'hold' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(`(${IDB_DUMP}).then((r) => r.some((x) => x.state === 'SENT'))`, { label: 'second record SENT' });
    await sleep(800);
    rec = (await t.idb()).find((r) => r.state === 'SENT');
    const firstBody = t.f.checkoutBodies[t.f.checkoutBodies.length - 1];
    t.expect(dbFacts(rec.key).attempt === 'none', '(2) the server never saw it');
    await t.crashAndRelaunch();
    await t.h.waitFor(`/Send again \\(same sale\\)/.test(document.body.innerText)`, { label: 'actionable once the dead lease expired', timeout: 60000 });
    t.expect(t.postsSince() === 0, '(2) nothing re-sent automatically');
    await t.h.clickText('Send again (same sale)');
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'replay recorded', timeout: 30000 });
    const replayBody = t.f.checkoutBodies[t.f.checkoutBodies.length - 1];
    t.note('(2) after Send again', { idb: (await t.idb()).find((r) => r.key === rec.key), db: dbFacts(rec.key), firstBody, replayBody });
    t.expect(replayBody === firstBody, '(2) the replay body is byte-identical to the request that was out at the crash');
    t.expect(dbFacts(rec.key).invoices === 1, '(2) exactly one invoice');
    await t.h.clickText('OK');
    await sleep(1500);
  },

  // The server recorded the sale, the answer was lost, then the browser's IndexedDB was cleared
  // (site data): the local record is gone. The till asks the server and shows the recorded sale.
  async 'data-loss'(t) {
    await t.freshSale();
    t.f.set((stage) => (stage === 'response' ? 'fail' : 'pass'));
    await pressSettle(t.h);
    await t.h.waitFor(`/did not confirm this sale/.test(document.body.innerText)`, { label: 'unconfirmed message' });
    t.f.set(null);
    const [rec] = await t.idb();
    t.expect(dbFacts(rec.key).invoices === 1, 'the server recorded it');
    await t.client.send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'indexeddb' });
    await t.reload();
    t.expect((await t.idb()).length === 0, 'the local store is empty (site data cleared)');
    await t.h.waitFor(`/Found on the server, not saved on this till/.test(document.body.innerText)`, { label: 'server recovery list', timeout: 30000 });
    const item = await t.h.evaluate(`(() => { const li = document.querySelector('[data-testid=server-recovered-checkouts] [data-checkout-key="${rec.key}"]'); return li ? li.innerText : null; })()`);
    const db = dbFacts(rec.key);
    t.note('server-recovered', { item, db, postsSinceReload: t.postsSince() });
    t.expect(!!item && item.includes(db.invoiceNumbers), 'the recorded sale and its invoice number are shown from the server');
    t.expect(t.postsSince() === 0, 'nothing sent');
    await t.shot('data-loss');
    await t.h.evaluate(`document.querySelector('[data-testid=server-recovered-checkouts] [data-checkout-key="${rec.key}"] button').click()`);
    await sleep(2000);
    t.expect(!(await t.h.evaluate(`!!document.querySelector('[data-testid=server-recovered-checkouts] [data-checkout-key="${rec.key}"]')`)), 'acknowledged away');
  },

  // Out for Delivery under each workflow, with the answer held and the page reloaded.
  async 'pi-delivery'(t) { await deliveryReload(t, 'PI_FLOW'); },
  async 'default-delivery'(t) { await deliveryReload(t, 'DEFAULT_SETTLEMENT'); },
};

const setField = (selectorExpr, value, proto = 'HTMLInputElement') => `(() => {
  const el = ${selectorExpr};
  if (!el) return false;
  el.focus();
  Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

async function fillDelivery(h) {
  // Quick-checkout layouts keep the function buttons behind "Add-ons · Functions & tools".
  if (!(await h.clickText('/^Delivery$/'))) {
    await h.clickText('/^Add-ons/');
    await sleep(1200);
  }
  if (!(await h.clickText('/^Delivery$/'))) {
    const labels = await h.evaluate("[...document.querySelectorAll('button')].map((b) => b.innerText.trim().replace(/\\s+/g, ' ')).filter(Boolean).slice(0, 80)");
    throw new Error('no Delivery function button on this layout; buttons: ' + JSON.stringify(labels));
  }
  await h.waitFor(`/Assign Delivery Person/i.test(document.body.innerText)`, { label: 'delivery form' });
  await sleep(800);
  const pickedCustomer = await h.evaluate(`(() => { const c = [...document.querySelectorAll('.max-h-40 button')].find((b) => b.querySelector('.rounded-full')); if (!c) return null; c.click(); return c.innerText; })()`);
  if (!pickedCustomer) throw new Error('no customer to deliver to');
  await sleep(600);
  await h.evaluate(setField(`document.querySelector('textarea[placeholder^="Building"]')`, 'M2.2.3 harness address, Dubai', 'HTMLTextAreaElement'));
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await h.evaluate(setField(`document.querySelector('input[type=date]')`, tomorrow));
  await h.evaluate(setField(`[...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /Morning/.test(o.value)))`, 'Morning (9 AM - 1 PM)', 'HTMLSelectElement'));
  await h.evaluate(`document.querySelector('input[role=combobox]').focus()`);
  await sleep(1000);
  const person = env('POS_DELIVERY_PERSON', 'EMP7361');
  const pickedPerson = await h.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(${JSON.stringify(person)})); if (!b) return null; b.click(); return b.innerText; })()`);
  if (!pickedPerson) throw new Error(`delivery person ${person} not offered`);
  await sleep(600);
  return { pickedCustomer, pickedPerson };
}

async function deliveryReload(t, mode) {
  const before = sql('select delivery_workflow_mode from pos_settings where branch_id = 1');
  sql(`update pos_settings set delivery_workflow_mode = ${quote(mode)} where branch_id = 1`);
  try {
    await t.freshSale({ noPayment: true });
    // A delivery order must carry a salesperson (the server refuses it with 400 otherwise), and only
    // the payment path prompts for one, so scan it from the cart's salesperson field first.
    const code = env('POS_SALESPERSON');
    if (!code) throw new Error('delivery needs a salesperson: set POS_SALESPERSON');
    // POS_DIAG_SKIP_SALESPERSON=1 reproduces the original harness flow (no scan) for diagnosis.
    if (!process.env.POS_DIAG_SKIP_SALESPERSON) {
    await t.h.clickText('/^Scan$/');
    await t.h.waitFor(`/Select Salesperson/i.test(document.body.innerText)`, { label: 'salesperson picker' });
    await t.h.typeKeys(code);
    await sleep(2500);
    if (await t.h.evaluate(`/Select Salesperson/i.test(document.body.innerText)`)) await t.h.clickText('Verify');
    await sleep(1500);
    await t.h.clickText('Continue').catch(() => {});
    await sleep(2000);
    t.expect(!(await t.h.evaluate(`/Not verified/.test(document.body.innerText)`)), 'salesperson verified on the cart');
    }
    t.note('delivery form', await fillDelivery(t.h));
    t.f.set((stage) => (stage === 'response' ? 'hold' : 'pass'));
    await t.h.clickText('/^Out for Delivery$/');
    await t.h.waitFor(t.hasRecord(), { label: 'delivery record persisted' });
    const sentAt = new Date().toISOString();
    const [rec] = await t.idb();
    const trace = [dbTrace(rec.key)];
    for (let i = 0; i < 40 && dbFacts(rec.key).invoices !== 1 && t.f.checkoutResponses.length === 0; i += 1) await sleep(500);
    await sleep(1000);
    trace.push(dbTrace(rec.key));
    t.note('while held', { sentAt, idb: (await t.idb()).find((r) => r.key === rec.key), request: t.f.checkoutBodies[t.f.checkoutBodies.length - 1], serverAnswer: t.f.checkoutResponses.slice(-1)[0] || null, trace });
    t.expect(rec.type === 'DELIVERY', 'the operation is a DELIVERY');
    t.expect(dbFacts(rec.key).invoices === 1 && (await t.idb())[0].state === 'SENT', 'recorded on the server, SENT locally, answer outstanding');
    t.f.set(null);
    await t.reload();
    await t.h.waitFor(`/Recorded on the server as /.test(document.body.innerText)`, { label: 'delivery recovered', timeout: 30000 });
    const db = dbFacts(rec.key);
    t.note('after reload', { idb: (await t.idb()).find((r) => r.key === rec.key), db, postsSinceReload: t.postsSince() });
    t.expect(t.postsSince() === 0, 'no checkout POST after the reload');
    t.expect(db.invoices === 1, 'exactly one invoice / pro-forma under the key');
    t.expect(mode === 'PI_FLOW' ? db.invoiceStatus.includes('PROFORMA') : !db.invoiceStatus.includes('PROFORMA'),
      mode === 'PI_FLOW' ? `issued as a Pro-forma Invoice (${db.invoiceStatus})` : `posted as a Default-Settlement sale (${db.invoiceStatus})`);
    await t.shot('recovered');
    await t.h.clickText('OK');
    await sleep(1500);
  } finally {
    sql(`update pos_settings set delivery_workflow_mode = ${quote(before)} where branch_id = 1`);
  }
}

// ── runner ──────────────────────────────────────────────────────────────────────────────────

/** A minimal DevTools client for an extra target (cdp.cjs only connects the first page). */
function connectTarget(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const client = {
      send(method, params = {}) {
        id += 1;
        const msgId = id;
        ws.send(JSON.stringify({ id: msgId, method, params }));
        return new Promise((res, rej) => pending.set(msgId, { res, rej, method }));
      },
      on(fn) { listeners.push(fn); },
      close: async () => { try { ws.close(); } catch { /* gone */ } },
    };
    ws.onopen = () => resolve(client);
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`)); else p.res(msg.result);
      } else if (msg.method) listeners.forEach((fn) => fn(msg));
    };
  });
}

(async () => {
  // A DevTools call on a closed socket never settles; without this the process would then just
  // exit 0 with no summary. Instead it stays up until the shell's timeout and shows where it hung.
  const keepAlive = setInterval(() => {}, 60 * 1000);
  const which = process.argv[2] || 'all';
  const names = which === 'all'
    ? Object.keys(scenarios).filter((n) => (n === 'in-progress') === !!process.env.POS_CHAOS_MS)
    : which.split(',');
  fs.mkdirSync(OUT, { recursive: true });
  const profileDir = env('POS_PROFILE_DIR', path.join(OUT, '.chrome-profile'));
  const dialogs = { answer: true, seen: [] };
  const apiLogs = [];
  const bindDialogs = (client) => client.on((m) => {
    if (m.method !== 'Page.javascriptDialogOpening') return;
    dialogs.seen.push(m.params.message);
    client.send('Page.handleJavaScriptDialog', { accept: m.params.type === 'confirm' ? dialogs.answer : true }).catch(() => {});
  });
  // proc.kill() alone can leave Chrome running (a launch on a profile that is already open only hands
  // off to the running browser), so force-kill every chrome.exe whose command line names THIS
  // harness's profile dir, and wait for DevTools to go away.
  const killHarnessChrome = async () => {
        const killed = execFileSync('powershell', ['-NoProfile', '-Command',
          `$p = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${profileDir.replace(/'/g, "''")}*' }; `
          + '$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ($p | Measure-Object).Count'],
        { encoding: 'utf8' }).trim();
        let down = false;
        for (let i = 0; i < 50 && !down; i += 1) {
          try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); await sleep(200); } catch { down = true; }
        }
        if (!down) throw new Error('Chrome did not go down after the kill');

    return killed;
  };
  await killHarnessChrome(); // a browser left over from an interrupted run
  const openBrowser = async () => {
    // After a real kill, Chrome restores the crashed session and can replace the tab launch()
    // attached to, which closes our socket. Mark the profile as cleanly exited (IndexedDB is
    // untouched; only the browser's tab-restore is skipped) and drive a tab we open ourselves.
    try {
      const prefsPath = path.join(profileDir, 'Default', 'Preferences');
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      prefs.profile = { ...(prefs.profile || {}), exit_type: 'Normal', exited_cleanly: true };
      fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    } catch { /* first launch: no profile yet */ }
    await launch({ profileDir });
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const client = await connectTarget(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable', { maxPostDataSize: 1024 * 1024 });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const h = helpers(client, { shotsDir: OUT });
    apiLogs.push(recordApi(client));
    const f = faults(client);
    await f.enable();
    bindDialogs(client);
    return { client, h, f };
  };
  let browser = await openBrowser();
  const results = [];
  try {
    await signIn(browser.h);
  } catch (e) {
    await browser.h.shot('signin-failure').catch(() => {});
    fs.writeFileSync(path.join(OUT, 'signin-failure.txt'), await browser.h.text().catch(() => ''));
    console.error('sign-in failed:', e.message, '(see signin-failure.png/.txt)');
    await browser.client.close();
    process.exit(1);
  }
  for (const name of names) {
    const notes = [];
    const checks = [];
    let reloadMark = 0;
    const t = {
      get h() { return browser.h; },
      get client() { return browser.client; },
      get f() { return browser.f; },
      dialogs,
      note: (label, data) => notes.push({ label, data }),
      expect: (ok, label) => { checks.push({ ok: !!ok, label }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); },
      // Sales only: payload-less placeholders of acknowledged server-found checkouts are left out.
      idb: () => browser.h.evaluate(IDB_DUMP).then((r) => r.filter((x) => x.type !== 'SERVER_RECOVERED')),
      hasRecord: () => `(${IDB_DUMP}).then((r) => r.some((x) => x.type !== 'SERVER_RECOVERED'))`,
      postsSince: () => browser.f.checkoutBodies.length - reloadMark,
      shot: (n) => browser.h.shot(`${name}-${n}`),
      reload: async () => { await browser.client.send('Page.reload', { ignoreCache: false }); await waitTill(browser.h); reloadMark = browser.f.checkoutBodies.length; },
      // Kills the Chrome process outright (no pagehide, no unload: a crash), then starts it again on
      // the same profile. sessionStorage (the JWT) dies with the browser, IndexedDB does not.
      crashAndRelaunch: async () => {
        const killed = await killHarnessChrome();
        console.log(`  (killed ${killed} Chrome processes of the harness profile)`);
        await sleep(1500);
        browser = await openBrowser();
        await signIn(browser.h);
        await enterSellingScreen(browser.h);
        reloadMark = browser.f.checkoutBodies.length;
      },
      // A second real tab of the same browser (same origin, same IndexedDB). It signs in itself:
      // sessionStorage is per tab.
      openTab: async () => {
        const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
        const client = await connectTarget(target.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Network.enable', { maxPostDataSize: 1024 * 1024 });
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        const h = helpers(client, { shotsDir: OUT });
        const f = faults(client);
        await f.enable();
        bindDialogs(client);
        await signIn(h);
        return { client, h, f, close: async () => { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`).catch(() => {}); await client.close(); } };
      },
      // A clean till for each scenario: wipe the local store (never the server), reload, ring one item.
      freshSale: async ({ skipReload, skipWipe, noPayment } = {}) => {
        if (!skipReload) {
          if (!skipWipe) {
            await browser.h.evaluate(`new Promise((r) => { const q = indexedDB.deleteDatabase('billbull-pos-checkout'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
          }
          await t.reload();
        }
        await enterSellingScreen(browser.h);
        // After the wipe the till lists what the server holds for this session (as after real data
        // loss); acknowledge those so they do not cover the till.
        await sleep(2500);
        await browser.h.evaluate("(() => { const all = document.querySelector('[data-action=ack-all-recorded]'); if (all) { all.click(); return; } document.querySelectorAll('[data-testid=server-recovered-checkouts] button').forEach((b) => b.click()); })()");
        await sleep(1500);
        await ringItems(browser.h, 1);
        if (!noPayment) await openPayment(browser.h);
      },
    };
    console.log(`scenario ${name}`);
    let error = null;
    try { await scenarios[name](t); } catch (e) { error = e.message; console.log('  ERROR ', e.message); await browser.h.shot(`${name}-error`).catch(() => {}); }
    fs.writeFileSync(path.join(OUT, `${name}.txt`), (await browser.h.text().catch(() => '')).replace(/\n{2,}/g, '\n'));
    results.push({ name, error, checks, notes });
  }
  const redacted = apiLogs.flat().map((e) => (e.path.startsWith('/api/auth/') ? { ...e, body: '<redacted>', response: '<redacted>' } : e));
  fs.writeFileSync(path.join(OUT, 'api.json'), JSON.stringify(redacted, null, 2));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.error || r.checks.some((c) => !c.ok));
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed; output: ${OUT}`);
  await browser.client.close();
  await killHarnessChrome();
  clearInterval(keepAlive);
  process.exitCode = failed.length ? 1 : 0;
})();
