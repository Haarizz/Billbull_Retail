// M3 server-side offline scenarios against the real backend on a disposable clone. A second till
// ("terminal B", cashier1) is played by this script with its own WebCrypto P-256 key, signing with
// the same RFC 8785 canonicaliser the browser till uses (packages/shared/.../offline/jcs.js).
//
// Covers: valid post, tampering, wrong tenant, wrong branch (context and record), unsupported tender,
// unsupported (batch) product, price drift, value cap, duplicate conflict, session gates while a
// lease is outstanding, expiry + reconciliation grace, lease settlement refusal and abandonment.
//
// Usage: PGPASSWORD=… POS_DB=billbull_m3_… POS_PASSWORD=… POS_OUT=… node tools/pos-offline-e2e/server-scenarios.cjs
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');

const env = (k, d) => process.env[k] ?? d;
const DB = env('POS_DB');
if (!/^billbull_m3_/.test(DB || '')) throw new Error('POS_DB must be a disposable billbull_m3_* clone');
const API = env('POS_BACKEND', 'http://127.0.0.1:8081');
const PASSWORD = env('POS_PASSWORD');
const OUT = env('POS_OUT');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const sql = (q) => execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', DB, '-At', '-F', '|', '-c', q], { encoding: 'utf8' }).trim();
const subtle = webcrypto.subtle;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail).slice(0, 300)); };

async function call(method, url, { token, branch = 1, body } = {}) {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch != null ? { 'X-Branch-Id': String(branch) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  const { canonicalize } = await import(pathToFileURL(path.resolve(__dirname, '../../billbull-frontend/packages/shared/src/pages/Sales/POS/offline/jcs.js')).href);
  const login = async (username) => (await call('POST', '/api/auth/login', { branch: null, body: { username, password: PASSWORD } })).data.token;
  const admin = await login('admin');
  const cashier = await login('cashier1@test.com');
  const invoices = () => Number(sql('select count(*) from sales_invoices'));
  const payments = () => Number(sql('select count(*) from sales_payments'));

  // ── terminal B: register, approve, open a session as cashier1 ─────────────────────────────
  const reg = await call('POST', '/api/pos/terminals/register', { token: cashier, body: { deviceFingerprint: `m3-script-B-${DB}`, terminalName: 'M3 script B', counterName: 'M3B' } });
  let terminal = reg.data.terminal || reg.data;
  if (terminal.status && terminal.status !== 'ACTIVE') {
    await call('POST', `/api/pos/terminals/${terminal.id}/approve`, { token: admin });
    terminal = (await call('POST', '/api/pos/terminals/register', { token: cashier, body: { deviceFingerprint: `m3-script-B-${DB}`, terminalName: 'M3 script B', counterName: 'M3B' } })).data;
    terminal = terminal.terminal || terminal;
  }
  const T = terminal.terminalId;
  // A real till heartbeats continuously; the health sweep marks a silent one OFFLINE (e.g. a clone
  // reused days later), and offline enrolment/leases need an ACTIVE terminal. Heartbeat like the till.
  if (terminal.status === 'OFFLINE') {
    const hb = await call('POST', `/api/pos/terminals/${T}/heartbeat`, { token: cashier, body: {} });
    terminal = { ...terminal, status: hb.data?.status || terminal.status };
  }
  let session = (await call('GET', `/api/pos/sessions/active?terminalId=${T}`, { token: cashier })).data;
  if (!session?.id) session = (await call('POST', '/api/pos/sessions/open', { token: cashier, body: { terminalId: T, counterName: 'M3B', openingCash: 0 } })).data;
  check('setup terminal B + session', session?.id && session.status === 'OPEN', { terminal: T, status: terminal.status, session: session?.id });

  // ── enrolment (admin) and lease (session owner only) ─────────────────────────────────────
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const spki = Buffer.from(await subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const notAdmin = await call('POST', '/api/pos/offline/keys', { token: cashier, body: { terminalId: T, publicKeySpki: spki } });
  check('enrolment refused for a non-administrator', notAdmin.status === 403 && notAdmin.data.code === 'OFFLINE_ENROLL_ADMIN_ONLY', notAdmin.data);
  const enrol = await call('POST', '/api/pos/offline/keys', { token: admin, body: { terminalId: T, publicKeySpki: spki } });
  check('enrolment by administrator', enrol.status === 200 && enrol.data.keyId, enrol.data);
  const wrongOwner = await call('POST', '/api/pos/offline/leases', { token: admin, body: { terminalId: T, sessionId: session.id } });
  check('lease refused to a user who does not own the session', wrongOwner.status === 403 && wrongOwner.data.code === 'OFFLINE_OPERATOR_NOT_SESSION_OWNER', wrongOwner.data);
  const otherBranch = await call('POST', '/api/pos/offline/leases', { token: admin, branch: 2, body: { terminalId: T, sessionId: session.id } });
  check('lease refused for another branch', otherBranch.status === 403 || otherBranch.data.code === 'BRANCH_CONTEXT', { status: otherBranch.status, code: otherBranch.data.code });
  const leaseRes = await call('POST', '/api/pos/offline/leases', { token: cashier, body: { terminalId: T, sessionId: session.id } });
  const [h, p, s] = leaseRes.data.jws.split('.');
  const serverKey = await subtle.importKey('spki', Buffer.from(leaseRes.data.serverKey.spki, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const jwsOk = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, serverKey, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  check('lease issued and its ES256 signature verifies with WebCrypto', leaseRes.status === 200 && jwsOk, { claims });
  const leaseA = sql(`select terminal_id, max_sales, max_value_minor, seq_start, seq_end, status from pos_offline_leases where status='ACTIVE' order by issued_at`);

  // ── records ───────────────────────────────────────────────────────────────────────────────
  let prev = 'GENESIS';
  const make = (seq, over = {}) => {
    const rid = webcrypto.randomUUID();
    const qty = over.qty ?? 1;
    const priceMinor = over.priceMinor ?? 10000;
    const total = over.totalMinor ?? priceMinor * qty;
    return {
      typ: 'bb.pos.offline.sale', v: 1, rid, ck: `off-${rid}`, lid: claims.lid, kid: claims.kid, seq, prev,
      ten: claims.ten, br: claims.br, term: claims.term, sid: claims.sid, op: claims.op, bd: claims.bd,
      at: over.at ?? new Date().toISOString(), cat: null, taxInc: true,
      lines: [{ code: over.code ?? '08747', name: 'Script line', qty, unit: 'PCS', priceMinor, taxBp: 500 }],
      totalMinor: total, tender: { type: over.tender ?? 'CASH', tenderedMinor: total, changeMinor: 0 },
      sp: { id: null, code: 'EMP1257' }, ref: `OFF-${claims.term}-${String(seq).padStart(6, '0')}`,
      ...(over.patch || {}),
    };
  };
  const sign = async (rec) => b64u(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(canonicalize(rec))));
  const sha = async (rec) => Buffer.from(await subtle.digest('SHA-256', Buffer.from(canonicalize(rec)))).toString('hex');
  const send = async (rec, sig, { token = cashier, branch = 1 } = {}) => {
    const r = await call('POST', '/api/pos/offline/sales', { token, branch, body: { records: [{ record: rec, sig: sig ?? await sign(rec) }] } });
    return r.data.results ? r.data.results[0] : r.data;
  };
  const accept = async (rec) => { const r = await send(rec); prev = await sha(rec); return r; };

  let inv0 = invoices();
  const r1 = await accept(make(claims.seqStart));
  check('valid offline sale posts through checkout', r1.status === 'POSTED' && r1.invoiceNumber && invoices() === inv0 + 1, r1);

  inv0 = invoices();
  const tampered = make(claims.seqStart + 1);
  const goodSig = await sign(tampered);
  tampered.totalMinor = 1; // edited after signing
  const r2 = await send(tampered, goodSig);
  check('tampered record refused (signature)', r2.status === 'REJECTED' && r2.code === 'SIGNATURE_INVALID' && invoices() === inv0
    && sql(`select count(*) from pos_offline_sales where id='${tampered.rid}'`) === '0', r2);

  const foreign = make(claims.seqStart + 1, { patch: { ten: 'billbull_other_tenant' } });
  const r3 = await send(foreign);
  check('record for another tenant refused', r3.status === 'REJECTED' && r3.code === 'WRONG_TENANT', r3);

  const r4 = await send(make(claims.seqStart + 1), undefined, { token: admin, branch: 2 });
  check('record submitted under another branch context is not stored', r4.status === 'RETRY' && r4.code === 'BRANCH_CONTEXT', r4);

  const r5 = await send(make(claims.seqStart + 1, { patch: { br: 2 } }));
  check('record claiming another branch refused', r5.status === 'REJECTED' && r5.code === 'LEASE_MISMATCH', r5);

  inv0 = invoices();
  const r6 = await accept(make(claims.seqStart + 1, { tender: 'CARD' }));
  check('card tender blocked for review, nothing posted', r6.status === 'BLOCKED' && r6.code === 'TENDER_NOT_ALLOWED' && invoices() === inv0, r6);

  const batchCode = sql(`select code from products where is_batch and available_in_pos and is_active limit 1`);
  const r7 = await accept(make(claims.seqStart + 2, { code: batchCode }));
  check('batch-controlled product blocked for review, nothing posted', r7.status === 'BLOCKED' && r7.code === 'PRODUCT_NOT_ELIGIBLE' && invoices() === inv0, r7);

  const r8 = await accept(make(claims.seqStart + 3, { priceMinor: 9000 }));
  check('price below list price blocked for review', r8.status === 'BLOCKED' && r8.code === 'PRICE_DRIFT' && invoices() === inv0, r8);

  const dupe = make(claims.seqStart, { qty: 2 });
  const r9 = await send(dupe);
  check('different record under a used sequence refused', r9.status === 'REJECTED' && r9.code === 'DUPLICATE_CONFLICT', r9);


  // ── session gates while the lease is outstanding ─────────────────────────────────────────
  const susp = await call('POST', `/api/pos/sessions/${session.id}/suspend`, { token: cashier });
  check('session cannot be suspended while a lease is outstanding', susp.status === 409 && /OFFLINE_LEASE_OUTSTANDING/.test(JSON.stringify(susp.data)), { status: susp.status, msg: String(susp.data.message || susp.data).slice(0, 200) });
  const xr = await call('POST', `/api/pos/sessions/${session.id}/x-report/generate`, { token: cashier });
  check('X-Report (closure start) refused while a lease is outstanding', xr.status === 409 && /OFFLINE_LEASE_OUTSTANDING/.test(JSON.stringify(xr.data)), { status: xr.status });
  const bc = await call('POST', `/api/pos/sessions/${session.id}/begin-closure`, { token: cashier, body: {} });
  check('begin-closure refused while a lease is outstanding', bc.status >= 400 && bc.status < 500, { status: bc.status, msg: String(bc.data.message || bc.data).slice(0, 200) });

  // ── expiry and reconciliation grace ──────────────────────────────────────────────────────
  sql(`update pos_offline_leases set not_after = now() - interval '10 minutes' where id='${claims.lid}'`);
  const beforeExpiry = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  inv0 = invoices();
  const r12 = await accept(make(claims.seqStart + 4, { at: beforeExpiry }));
  check('sale captured before expiry, uploaded after it, posts within the grace', r12.status === 'POSTED' && invoices() === inv0 + 1, r12);
  const r13 = await accept(make(claims.seqStart + 5));
  check('sale captured after expiry is held, not posted', r13.status === 'HELD' && r13.code === 'CAPTURED_AFTER_EXPIRY' && invoices() === inv0 + 1, r13);
  const renew = await call('POST', '/api/pos/offline/leases', { token: cashier, body: { terminalId: T, sessionId: session.id } });
  check('no new lease while the expired one is unsettled', renew.status === 409 && renew.data.code === 'OFFLINE_LEASE_OUTSTANDING', renew.data);
  sql(`update pos_offline_leases set grace_until = now() - interval '1 second' where id='${claims.lid}'`);
  const r14 = await accept(make(claims.seqStart + 6, { at: beforeExpiry }));
  check('sale arriving after the grace is held for review', r14.status === 'HELD' && r14.code === 'ARRIVED_AFTER_GRACE' && invoices() === inv0 + 1, r14);

  // Value cap, inside a still-open grace window (re-opened here only to sequence the test).
  sql(`update pos_offline_leases set grace_until = now() + interval '1 hour' where id='${claims.lid}'`);
  inv0 = invoices();
  const r10 = await accept(make(claims.seqStart + 7, { qty: 30, at: beforeExpiry }));
  const r11 = await accept(make(claims.seqStart + 8, { qty: 20, at: beforeExpiry }));
  check('value cap: the sale that would exceed the lease value is held', r10.status === 'POSTED' && r11.status === 'HELD' && r11.code === 'CAP_EXCEEDED' && invoices() === inv0 + 1, { r10, r11 });

  // ── settlement: refused while records need review; abandonment by an administrator ─────────
  const summary = { typ: 'bb.pos.offline.lease-close', v: 1, lid: claims.lid, count: 9, lastSeq: claims.seqStart + 8, valueMinor: 0 };
  const rows = sql(`select count(*), coalesce(sum(total_minor),0) from pos_offline_sales where lease_id='${claims.lid}'`).split('|');
  summary.count = Number(rows[0]); summary.valueMinor = Number(rows[1]);
  const close = await call('POST', `/api/pos/offline/leases/${claims.lid}/close`, { token: cashier, body: { summary, sig: await sign(summary) } });
  check('lease cannot be settled while records need supervisor review', close.status === 409 && close.data.code === 'OFFLINE_RECORDS_UNRESOLVED', close.data);
  const ab1 = await call('POST', `/api/pos/offline/leases/${claims.lid}/abandon`, { token: cashier, body: { reason: 'test' } });
  check('only an administrator may abandon a lease', ab1.status === 403, ab1.data);
  const ab2 = await call('POST', `/api/pos/offline/leases/${claims.lid}/abandon`, { token: admin, body: { reason: 'M3 scenario: till retired' } });
  check('administrator abandons the lease (audited)', ab2.status === 200 && ab2.data.status === 'ABANDONED', ab2.data);
  const r15 = await accept(make(claims.seqStart + 9, { at: beforeExpiry }));
  check('a late record under an abandoned lease is held', r15.status === 'HELD' && /LEASE_ABANDONED|ARRIVED_AFTER_GRACE/.test(r15.code), r15);
  const susp2 = await call('POST', `/api/pos/sessions/${session.id}/suspend`, { token: cashier });
  check('session can change again once the lease is settled/abandoned', susp2.status === 200, { status: susp2.status });
  await call('POST', `/api/pos/sessions/${session.id}/resume`, { token: cashier });

  // ── clean settlement: a new lease, one sale, a signed close summary that matches ──────────
  const lease2 = await call('POST', '/api/pos/offline/leases', { token: cashier, body: { terminalId: T, sessionId: session.id } });
  const c2 = JSON.parse(Buffer.from(lease2.data.jws.split('.')[1], 'base64url').toString());
  check('next lease continues the key\'s sequence (no overlap)', lease2.status === 200 && c2.seqStart > claims.seqStart, { seqStart: c2.seqStart, previousSeqEnd: claims.seqEnd });
  Object.assign(claims, c2);
  prev = 'GENESIS';
  inv0 = invoices();
  const s1 = await accept(make(c2.seqStart));
  const mismatch = { typ: 'bb.pos.offline.lease-close', v: 1, lid: c2.lid, count: 2, lastSeq: c2.seqStart + 1, valueMinor: 20000 };
  const badClose = await call('POST', `/api/pos/offline/leases/${c2.lid}/close`, { token: cashier, body: { summary: mismatch, sig: await sign(mismatch) } });
  check('settlement refused when the till reports a sale the server does not hold', badClose.status === 409 && badClose.data.code === 'OFFLINE_RECORDS_MISSING', badClose.data);
  const good = { typ: 'bb.pos.offline.lease-close', v: 1, lid: c2.lid, count: 1, lastSeq: c2.seqStart, valueMinor: 10000 };
  const forged = await call('POST', `/api/pos/offline/leases/${c2.lid}/close`, { token: cashier, body: { summary: good, sig: await sign({ ...good, count: 0 }) } });
  check('settlement refused when the summary is not signed by the till', forged.status === 422 && forged.data.code === 'SIGNATURE_INVALID', forged.data);
  const goodClose = await call('POST', `/api/pos/offline/leases/${c2.lid}/close`, { token: cashier, body: { summary: good, sig: await sign(good) } });
  check('lease settles on a matching signed summary once every sale is posted', s1.status === 'POSTED' && invoices() === inv0 + 1 && goodClose.data.status === 'CLOSED', { s1, goodClose: goodClose.data });
  const susp3 = await call('POST', `/api/pos/sessions/${session.id}/suspend`, { token: cashier });
  check('session transitions allowed after settlement', susp3.status === 200, { status: susp3.status });
  await call('POST', `/api/pos/sessions/${session.id}/resume`, { token: cashier });

  const review =await call('GET', '/api/pos/offline/sales/review', { token: admin });
  const audit = sql(`select action, count(*) from pos_audit_log where action like 'OFFLINE_%' group by action order by action`);
  const out = { at: new Date().toISOString(), terminal: T, session: session.id, lease: claims, activeLeasesAtStart: leaseA, review: review.data, audit, results, payments: payments() };
  if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'server-scenarios.json'), JSON.stringify(out, null, 2)); }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
