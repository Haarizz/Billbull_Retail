// Minimal Chrome DevTools Protocol driver (Node 22 global WebSocket, no dependencies), used by
// run.cjs. Set CHROME_PATH if Chrome is not in the default Windows location.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ port = 9333, profileDir, width = 1440, height = 900 }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 50; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); }
  }
  if (!version) throw new Error('chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable', { maxPostDataSize: 1024 * 1024 });
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  client.close = async () => { try { proc.kill(); } catch {} };
  return client;
}

function connect(url) {
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

function helpers(client, { shotsDir }) {
  const evaluate = async (expression) => {
    const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expression, { timeout = 20000, label = expression } = {}) => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await evaluate(expression).catch(() => null);
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout waiting for: ' + label);
      await sleep(250);
    }
  };
  const navigate = async (url) => { await client.send('Page.navigate', { url }); await sleep(800); };
  const shot = async (name) => {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(shotsDir, name + '.png');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };
  const text = () => evaluate('document.body.innerText');
  // Click the innermost visible element whose own text matches (exact or regex source).
  const clickText = (matcher, { selector = 'body *' } = {}) => evaluate(`(() => {
    const m = ${JSON.stringify(matcher)};
    const re = m.startsWith('/') ? new RegExp(m.slice(1, m.lastIndexOf('/')), m.slice(m.lastIndexOf('/') + 1)) : null;
    const ok = (t) => re ? re.test(t) : t === m;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => visible(el) && ok((el.innerText || '').trim()));
    const target = els.find((el) => el.tagName === 'BUTTON') || els.sort((a, b) => (a.innerText.length - b.innerText.length))[0];
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (target.innerText || '').trim().slice(0, 60) };
  })()`).then(async (hit) => {
    if (!hit) return false;
    await mouseClick(hit.x, hit.y);
    return hit.text;
  });
  const mouseClick = async (x, y) => {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const fill = (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  // Real keyboard events (scanner wedge simulation): each char at scanner speed, then Enter.
  const typeKeys = async (str, { gap = 8, enter = true } = {}) => {
    for (const ch of str) {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      await sleep(gap);
    }
    if (enter) {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }
  };
  return { evaluate, waitFor, navigate, shot, text, clickText, mouseClick, fill, typeKeys, sleep };
}

// Records every /api request (method, path, body) and its response status/body.
function recordApi(client) {
  const reqs = new Map();
  const log = [];
  client.on(async (msg) => {
    if (msg.method === 'Network.requestWillBeSent') {
      const { requestId, request } = msg.params;
      const u = new URL(request.url);
      if (!u.pathname.startsWith('/api/')) return;
      const entry = { method: request.method, path: u.pathname, query: u.search, body: request.postData ?? null, headers: request.headers };
      reqs.set(requestId, entry);
      log.push(entry);
    } else if (msg.method === 'Network.responseReceived') {
      const e = reqs.get(msg.params.requestId);
      if (e) e.status = msg.params.response.status;
    } else if (msg.method === 'Network.loadingFinished') {
      const e = reqs.get(msg.params.requestId);
      if (e && e.method !== 'GET') {
        try {
          const r = await client.send('Network.getResponseBody', { requestId: msg.params.requestId });
          e.response = r.base64Encoded ? null : r.body;
        } catch {}
      }
    }
  });
  return log;
}

module.exports = { launch, helpers, recordApi, sleep };
