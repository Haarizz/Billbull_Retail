// Builds build/icon.ico, build/icon.png and src/assets/icon.png from the bull mark in the BillBull
// logo (an AVIF file, decoded by Chromium). Run: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const out = path.join(root, 'build');
  const src = process.env.SRC
    || path.resolve(root, '..', '..', 'billbull-frontend', 'packages', 'shared', 'src', 'assets', 'billBullLogo.png');
  const b64 = fs.readFileSync(src).toString('base64');
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<body>');
  const result = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = 'data:image/avif;base64,${b64}'; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H);
    // Bull = yellow pixels (low blue) in the left part of the logo, left of the wordmark.
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    const limit = Math.round(W * 0.31);
    for (let y = 0; y < H; y++) for (let x = 0; x < limit; x++) {
      const i = (y * W + x) * 4, r = d.data[i], gg = d.data[i+1], b = d.data[i+2];
      if (r > 180 && gg > 150 && b < 140) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const pad = 4; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const bw = x1 - x0, bh = y1 - y0;
    // Cut the bull out: alpha from "how far from white" (blue channel), colour = brand yellow.
    const m = document.createElement('canvas'); m.width = bw; m.height = bh;
    const mg = m.getContext('2d'); const md = mg.createImageData(bw, bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const si = ((y + y0) * W + (x + x0)) * 4, di = (y * bw + x) * 4;
      const r = d.data[si], gg = d.data[si+1], b = d.data[si+2];
      const isText = r < 120 && gg < 120 && b < 120;          // wordmark black: drop
      const a = isText ? 0 : Math.max(0, Math.min(1, (165 - b) / (165 - 70)));
      md.data[di] = 0xF5; md.data[di+1] = 0xC7; md.data[di+2] = 0x42; md.data[di+3] = Math.round(a * 255);
    }
    mg.putImageData(md, 0, 0);
    // Clean-up: blur the mask, then re-threshold. Isolated noise dots fall below the cut; the
    // shape keeps a smooth anti-aliased edge.
    const bl = document.createElement('canvas'); bl.width = bw; bl.height = bh;
    const bg = bl.getContext('2d'); bg.filter = 'blur(2px)'; bg.drawImage(m, 0, 0);
    const bd = bg.getImageData(0, 0, bw, bh);
    for (let i = 0; i < bd.data.length; i += 4) {
      const a = bd.data[i + 3] / 255, t = Math.max(0, Math.min(1, (a - 0.42) / 0.16));
      bd.data[i] = 0xF5; bd.data[i+1] = 0xC7; bd.data[i+2] = 0x42; bd.data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    mg.clearRect(0, 0, bw, bh); mg.putImageData(bd, 0, 0);
    const render = (S) => {
      const k = document.createElement('canvas'); k.width = S; k.height = S;
      const q = k.getContext('2d'); q.imageSmoothingQuality = 'high';
      const rad = S * 0.22;
      q.fillStyle = '#1e293b';
      q.beginPath(); q.roundRect(0, 0, S, S, rad); q.fill();
      const box = S * (S <= 24 ? 0.80 : 0.68);
      const sc = Math.min(box / bw, box / bh);
      const dw = bw * sc, dh = bh * sc;
      q.drawImage(m, (S - dw) / 2, (S - dh) / 2 + S * 0.01, dw, dh);
      return k.toDataURL('image/png').split(',')[1];
    };
    const sizes = ${JSON.stringify(SIZES)};
    return { bbox: [x0, y0, bw, bh], pngs: Object.fromEntries([...sizes, 512].map((s) => [s, render(s)])) };
  })()`);
  console.log('bull bbox', result.bbox);
  const pngs = Object.fromEntries(Object.entries(result.pngs).map(([s, v]) => [s, Buffer.from(v, 'base64')]));
  fs.writeFileSync(path.join(out, 'icon.png'), pngs[512]);
  fs.writeFileSync(path.join(root, 'src', 'assets', 'icon.png'), pngs[256]);
  // ICO with PNG-compressed entries (Vista+).
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(SIZES.length, 4);
  const dir = Buffer.alloc(16 * SIZES.length); let offset = 6 + dir.length; const bodies = [];
  SIZES.forEach((s, i) => { const p = pngs[s]; const e = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, e); dir.writeUInt8(s >= 256 ? 0 : s, e + 1); dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6); dir.writeUInt32LE(p.length, e + 8); dir.writeUInt32LE(offset, e + 12);
    offset += p.length; bodies.push(p); });
  fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, dir, ...bodies]));
  app.quit();
});
