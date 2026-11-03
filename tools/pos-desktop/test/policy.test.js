'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeServerUrl, isInsecureRemote, posUrl, looksLikePosPage, describeNetError } = require('../src/serverUrl');
const { classifyNavigation, classifyWindowOpen, isPermissionAllowed, isSignInRedirect } = require('../src/navigationPolicy');
const { createSettingsStore, DEFAULTS } = require('../src/settingsStore');

const ORIGIN = 'https://shop.example.com';

test('normalizeServerUrl adds https and keeps only the origin', () => {
  assert.equal(normalizeServerUrl('shop.example.com'), ORIGIN);
  assert.equal(normalizeServerUrl('  https://Shop.Example.com/pos/sales?x=1#y '), ORIGIN);
  assert.equal(normalizeServerUrl('http://192.168.1.20:8080/'), 'http://192.168.1.20:8080');
  assert.equal(normalizeServerUrl('https://shop.example.com:443'), ORIGIN);
});

test('normalizeServerUrl rejects empty, non-web and credentialed addresses', () => {
  assert.throws(() => normalizeServerUrl(''), /Enter the BillBull server/);
  assert.throws(() => normalizeServerUrl('ftp://shop.example.com'), /https:\/\/ or http:\/\//);
  assert.throws(() => normalizeServerUrl('file:///C:/x'), /https:\/\/ or http:\/\//);
  assert.throws(() => normalizeServerUrl('https://user:pw@shop.example.com'), /user name or password/);
  assert.throws(() => normalizeServerUrl('https://'), /not a valid/);
});

test('isInsecureRemote flags only plain http outside the local network', () => {
  assert.equal(isInsecureRemote(ORIGIN), false);
  assert.equal(isInsecureRemote('http://localhost:8080'), false);
  assert.equal(isInsecureRemote('http://127.0.0.1'), false);
  assert.equal(isInsecureRemote('http://10.0.0.5'), false);
  assert.equal(isInsecureRemote('http://172.20.1.1'), false);
  assert.equal(isInsecureRemote('http://192.168.1.20'), false);
  assert.equal(isInsecureRemote('http://172.40.1.1'), true);
  assert.equal(isInsecureRemote('http://shop.example.com'), true);
});

test('posUrl and looksLikePosPage', () => {
  assert.equal(posUrl(ORIGIN), `${ORIGIN}/pos/`);
  assert.equal(looksLikePosPage('<html><head><title>BillBull POS</title>'), true);
  assert.equal(looksLikePosPage('<title>BillBull</title>'), false);
  assert.equal(looksLikePosPage(null), false);
});

test('describeNetError turns Chromium codes into plain text', () => {
  assert.match(describeNetError('net::ERR_CONNECTION_REFUSED'), /refused the connection.*ERR_CONNECTION_REFUSED/);
  assert.match(describeNetError('net::ERR_CERT_AUTHORITY_INVALID'), /security certificate/);
  assert.match(describeNetError('net::ERR_SSL_PROTOCOL_ERROR'), /security certificate/);
  assert.match(describeNetError('ERR_NAME_NOT_RESOLVED'), /could not be found/);
  assert.equal(describeNetError('net::ERR_FOO'), 'Could not reach the server (ERR_FOO).');
  assert.equal(describeNetError(''), 'Could not reach the server.');
});

test('navigation stays on the tenant origin; other web links go to the browser', () => {
  assert.equal(classifyNavigation(`${ORIGIN}/pos/sales`, ORIGIN), 'allow');
  assert.equal(classifyNavigation(`${ORIGIN}/login`, ORIGIN), 'allow');
  assert.equal(classifyNavigation('https://wa.me/971500000000?text=hi', ORIGIN), 'external');
  assert.equal(classifyNavigation('mailto:a@b.c', ORIGIN), 'external');
  assert.equal(classifyNavigation('https://shop.example.com.evil.com/', ORIGIN), 'external');
  assert.equal(classifyNavigation('http://shop.example.com/pos/', ORIGIN), 'external');
  assert.equal(classifyNavigation('file:///C:/Windows/system.ini', ORIGIN), 'deny');
  assert.equal(classifyNavigation('javascript:alert(1)', ORIGIN), 'deny');
  assert.equal(classifyNavigation('not a url', ORIGIN), 'deny');
  assert.equal(classifyNavigation(`${ORIGIN}/pos/`, null), 'external');
});

test('a jump to the Retail sign-in is recognised; till and other pages are not', () => {
  assert.equal(isSignInRedirect(`${ORIGIN}/login`, ORIGIN), true);
  assert.equal(isSignInRedirect(`${ORIGIN}/login/`, ORIGIN), true);
  assert.equal(isSignInRedirect(`${ORIGIN}/`, ORIGIN), true);
  assert.equal(isSignInRedirect(`${ORIGIN}/pos/login`, ORIGIN), false);
  assert.equal(isSignInRedirect(`${ORIGIN}/pos/`, ORIGIN), false);
  assert.equal(isSignInRedirect(`${ORIGIN}/uploads/logo.png`, ORIGIN), false);
  assert.equal(isSignInRedirect('https://other.example.com/login', ORIGIN), false);
  assert.equal(isSignInRedirect(`${ORIGIN}/login`, null), false);
});

test('blank print popups open in the app; WhatsApp share opens in the browser', () => {
  assert.equal(classifyWindowOpen('', ORIGIN), 'allow');
  assert.equal(classifyWindowOpen('about:blank', ORIGIN), 'allow');
  assert.equal(classifyWindowOpen(`${ORIGIN}/uploads/logo.png`, ORIGIN), 'allow');
  assert.equal(classifyWindowOpen('https://wa.me/1', ORIGIN), 'external');
  assert.equal(classifyWindowOpen('ms-settings:printers', ORIGIN), 'deny');
});

test('only clipboard-write and fullscreen are granted, and only to the tenant origin', () => {
  assert.equal(isPermissionAllowed('clipboard-sanitized-write', `${ORIGIN}/pos/`, ORIGIN), true);
  assert.equal(isPermissionAllowed('fullscreen', ORIGIN, ORIGIN), true);
  assert.equal(isPermissionAllowed('media', `${ORIGIN}/pos/`, ORIGIN), false);
  assert.equal(isPermissionAllowed('geolocation', `${ORIGIN}/pos/`, ORIGIN), false);
  assert.equal(isPermissionAllowed('clipboard-sanitized-write', 'https://evil.com/', ORIGIN), false);
});

test('settings store survives a missing or corrupt file and merges writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbpos-'));
  try {
    const store = createSettingsStore(dir);
    assert.deepEqual(store.read(), DEFAULTS);
    store.write({ serverOrigin: ORIGIN });
    store.write({ fullscreen: true });
    assert.deepEqual(store.read(), { ...DEFAULTS, serverOrigin: ORIGIN, fullscreen: true });
    fs.writeFileSync(store.file, '{not json');
    assert.deepEqual(store.read(), DEFAULTS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
