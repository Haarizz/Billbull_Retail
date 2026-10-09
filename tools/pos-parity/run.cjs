// Drives one till scenario through either the embedded POS (/sales/pos) or the standalone POS
// (/pos/) via headless Chrome, recording every /api request and a screenshot + text dump per step.
// Run the same scenario in both modes, then diff with compare.cjs. See README.md.
//
//   node run.cjs <sale|return|close> <embedded|standalone>
//
// Environment:
//   POS_BASE_URL       default http://127.0.0.1:8090 (server.cjs)
//   POS_USER / POS_PASSWORD   a till user on the disposable tenant (required)
//   POS_BARCODES       comma-separated barcodes to scan for `sale` (required for sale)
//   POS_SALESPERSON    employee code to scan if checkout asks for a salesperson
//   POS_OPENING_1000S  number of 1000 notes for the opening float (default 5)
//   POS_LAYOUT         label for the output folder (classic|compact|focus); also enables the
//                      Compact search-box clear between scans
//   POS_RETURN_INVOICE invoice to return (return scenario)
//   POS_CLOSE_COUNT    JSON {denomination: qty} counted at close, e.g. {"1000":6,"200":1}
//   POS_PROFILE        Chrome profile name; reuse one profile for both modes to share the device
//                      fingerprint/terminal exactly as one till on one origin would
//   POS_OUT            output root (default ./out)
const path = require('path');
const fs = require('fs');
const { launch, helpers, recordApi } = require('./cdp.cjs');

const [scenario, mode] = process.argv.slice(2);
if (!['sale', 'return', 'close'].includes(scenario) || !['embedded', 'standalone'].includes(mode)) {
  console.error('usage: node run.cjs <sale|return|close> <embedded|standalone>');
  process.exit(2);
}
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const BASE = env('POS_BASE_URL', 'http://127.0.0.1:8090');
const USER = env('POS_USER');
const PASSWORD = env('POS_PASSWORD');
if (!USER || !PASSWORD) { console.error('POS_USER and POS_PASSWORD are required'); process.exit(2); }
const LAYOUT = env('POS_LAYOUT', 'default');
const outDir = path.join(path.resolve(env('POS_OUT', path.join(__dirname, 'out'))), scenario, LAYOUT, mode);
fs.mkdirSync(outDir, { recursive: true });

const setInput = (selectorExpr, value) => `(() => {
  const el = ${selectorExpr};
  if (!el) return false;
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

async function signInAndOpenTill(h) {
  await h.navigate(BASE + (mode === 'embedded' ? '/login' : '/pos/login'));
  await h.waitFor(`!!document.querySelector('input[name=username]')`);
  await h.fill('input[name=username]', USER);
  await h.fill('input[name=password]', PASSWORD);
  await h.evaluate(`document.querySelector('form').requestSubmit()`);
  await h.sleep(2500);
  if (mode === 'embedded') await h.navigate(BASE + '/sales/pos');
  await h.waitFor(`document.body.innerText.includes('Point of Sale') && !document.body.innerText.includes('Connecting...')`, { timeout: 30000, label: 'POS dashboard' });
  await h.sleep(1500);
}

async function enterSellingScreen(h, dump) {
  if (await h.evaluate(`document.body.innerText.includes('Continue Session')`)) {
    await h.clickText('Continue Session');
  } else {
    await h.clickText('Start Session');
    await h.waitFor(`!!document.querySelector('[role=dialog]')`, { label: 'start session dialog' });
    await h.evaluate(setInput(`document.querySelector('[role=dialog] input[type=number]:not([disabled])')`, env('POS_OPENING_1000S', '5')));
    await h.sleep(300);
    await dump('start-session');
    await h.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === 'Start Session').click()`);
    await h.sleep(3000);
    if (await h.evaluate(`document.body.innerText.includes('Continue Session')`)) await h.clickText('Continue Session');
  }
  await h.sleep(2500);
  await dump('selling-screen');
}

const scenarios = {
  async sale(h, dump) {
    await signInAndOpenTill(h);
    await dump('dashboard');
    await enterSellingScreen(h, dump);
    const barcodes = env('POS_BARCODES', '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!barcodes.length) throw new Error('POS_BARCODES is required for the sale scenario');
    for (const code of barcodes) {
      // Compact keeps the last barcode in its search box; clear it identically in both modes.
      if (LAYOUT === 'compact') await h.evaluate(`(() => { const el = document.activeElement; if (el && el.tagName === 'INPUT' && el.value) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await h.typeKeys(code);
      await h.sleep(2500);
    }
    await dump('cart');
    await h.clickText('/^CHECKOUT/i');
    await h.sleep(2500);
    if (await h.evaluate(`document.body.innerText.includes('Select Salesperson')`)) {
      const code = env('POS_SALESPERSON');
      if (!code) throw new Error('checkout asks for a salesperson: set POS_SALESPERSON');
      await h.typeKeys(code);
      await h.sleep(2500);
      await h.clickText('Continue');
      await h.sleep(2500);
      if (!(await h.evaluate(`/payment/i.test(document.body.innerText)`))) { await h.clickText('/^CHECKOUT/i'); await h.sleep(2500); }
    }
    await dump('payment');
    await h.typeKeys('c', { enter: false }); // Cash hotkey
    await h.sleep(1200);
    await dump('cash-modal');
    await h.typeKeys('', { enter: true }); // confirm the prefilled exact amount
    await h.sleep(1200);
    await h.clickText('/^Settle Payment/');
    await h.sleep(5000);
    await dump('complete');
    const done = await h.evaluate(`(() => { const t = document.body.innerText; const m = t.match(/PAYMENT COMPLETE\\s+(\\S+)/); return m ? m[1] : null; })()`);
    console.log(done ? `completed ${done}` : 'NOT completed');
  },

  async return(h, dump) {
    const invoice = env('POS_RETURN_INVOICE');
    if (!invoice) throw new Error('POS_RETURN_INVOICE is required');
    await signInAndOpenTill(h);
    await enterSellingScreen(h, dump);
    if (await h.evaluate(`document.body.innerText.includes('Functions')`)) { await h.clickText('Functions'); await h.sleep(1000); }
    await h.clickText('Return');
    await h.sleep(3000);
    await h.evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((x) => x.offsetParent && /invoice|receipt/i.test(x.placeholder || '')); if (i) i.focus(); })()`);
    await h.typeKeys(invoice);
    await h.sleep(3500);
    await dump('invoice-loaded');
    const pt = await h.evaluate(`(() => {
      const b = [...document.querySelectorAll('tr button')].find((x) => x.innerText.trim() === 'Add' && x.offsetParent);
      if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!pt) throw new Error('no returnable line found');
    await h.mouseClick(pt.x, pt.y);
    await h.sleep(1500);
    await h.clickText('Good');
    await h.clickText('Customer Return');
    await h.clickText('Cash Refund');
    await h.sleep(800);
    await dump('return-ready');
    await h.clickText('Confirm Sales Return');
    await h.sleep(4000);
    await dump('return-confirmed');
  },

  async close(h, dump) {
    await signInAndOpenTill(h);
    await h.clickText('X-Report / Close Session');
    await h.sleep(4000);
    const counts = JSON.parse(env('POS_CLOSE_COUNT', '{}'));
    await h.evaluate(`(() => {
      const want = ${JSON.stringify(counts)};
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const r of document.querySelectorAll('tr')) {
        const input = r.querySelector('input'); const label = (r.cells[0]?.innerText || '').trim();
        if (input && want[label] != null) { input.focus(); set.call(input, String(want[label])); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    })()`);
    await h.sleep(800);
    await dump('counted');
    await h.clickText('Generate X-Report');
    await h.sleep(4000);
    await h.clickText('Close Session');
    await h.sleep(3000);
    await dump('close-dialog');
    await h.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => /^Close Session/.test(x.innerText.trim())); if (b) b.click(); return !!b; })()`);
    await h.sleep(4000);
    await dump('after-close');
  },
};

(async () => {
  const client = await launch({ profileDir: path.join(__dirname, '.chrome-profiles', env('POS_PROFILE', mode)) });
  const h = helpers(client, { shotsDir: outDir });
  const api = recordApi(client);
  const errors = [];
  client.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300)); });
  client.on((m) => { if (m.method === 'Page.javascriptDialogOpening') client.send('Page.handleJavaScriptDialog', { accept: true }); });
  let step = 0;
  const dump = async (name) => {
    step += 1;
    const id = `${String(step).padStart(2, '0')}-${name}`;
    fs.writeFileSync(path.join(outDir, id + '.txt'), (await h.text()).replace(/\n{2,}/g, '\n'));
    await h.shot(id);
    console.log('step', id);
  };
  let failed = false;
  try {
    await scenarios[scenario](h, dump);
  } catch (e) {
    failed = true;
    console.error('FAILED', e.message);
    await h.shot('failure').catch(() => {});
  } finally {
    // Never persist the password the login request carried.
    const redacted = api.map((e) => (e.path === '/api/auth/login' ? { ...e, body: '<redacted>', response: '<redacted>' } : e));
    fs.writeFileSync(path.join(outDir, 'api.json'), JSON.stringify(redacted, null, 2));
    console.log('uncaught page errors:', errors.length ? errors : 'none');
    console.log('output:', outDir);
    await client.close();
    process.exitCode = failed ? 1 : 0;
  }
})();
