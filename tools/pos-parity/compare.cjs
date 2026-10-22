// Field-by-field diff of the requests two smoke runs sent. Usage: node compare.cjs <a/api.json> <b/api.json> [pathFilter]
const [aFile, bFile, filter = '/api/pos/checkout'] = process.argv.slice(2);
const pick = (f) => require(f).filter((e) => e.method !== 'GET' && e.path.startsWith(filter));
const A = pick(aFile);
const B = pick(bFile);
console.log(`${filter}: ${A.length} vs ${B.length} request(s)`);

const flat = (v, p = '', out = {}) => {
  if (v && typeof v === 'object') {
    const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v).sort();
    if (!keys.length) out[p] = Array.isArray(v) ? '[]' : '{}';
    keys.forEach((k) => flat(v[k], p ? `${p}.${k}` : String(k), out));
  } else out[p] = v;
  return out;
};

A.forEach((a, i) => {
  const b = B[i];
  if (!b) return console.log('missing counterpart for', a.path);
  const fa = flat(JSON.parse(a.body || 'null'));
  const fb = flat(JSON.parse(b.body || 'null'));
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  const diffs = keys.filter((k) => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
  console.log(`#${i} ${a.path}: ${keys.length} fields, ${diffs.length} differ`);
  diffs.forEach((k) => console.log(`  ${k}: ${JSON.stringify(fa[k])} | ${JSON.stringify(fb[k])}`));
  const ha = Object.keys(a.headers).filter((h) => /^x-|authorization/i.test(h)).sort();
  const hb = Object.keys(b.headers).filter((h) => /^x-|authorization/i.test(h)).sort();
  console.log('  app headers', JSON.stringify(ha), JSON.stringify(ha) === JSON.stringify(hb) ? '(same set)' : 'vs ' + JSON.stringify(hb));
  console.log('  X-Branch-Id', a.headers['X-Branch-Id'], '|', b.headers['X-Branch-Id'], ' status', a.status, '|', b.status);
});
