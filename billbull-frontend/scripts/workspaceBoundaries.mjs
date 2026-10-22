// Workspace boundary + export-map tooling for the Retail app (src/), the standalone POS app
// (apps/pos/) and the shared package (packages/shared/).
//
// Rules (see docs/standalone-pos/ARCHITECTURE.md):
//   - A relative import never crosses a zone: Retail, POS and shared each import their own
//     files relatively and nothing else.
//   - Retail and POS reach shared code only through `@billbull/shared/<key>`, and every key must
//     be listed in packages/shared/package.json "exports".
//   - Shared never imports `@billbull/shared` (itself) or `@billbull/pos`, and nothing imports
//     `@billbull/pos`.
//
// CLI:  node scripts/workspaceBoundaries.mjs            → report violations, exit 1 if any
//       node scripts/workspaceBoundaries.mjs --write    → regenerate the shared export map
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHARED_PACKAGE = '@billbull/shared';
const POS_PACKAGE = '@billbull/pos';

const ZONES = [
  { name: 'shared', dir: 'packages/shared/src' },
  { name: 'pos', dir: 'apps/pos' }, // the app's own vite.config.js belongs to it too (dist/ is skipped)
  { name: 'retail', dir: 'src' },
];
const CODE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

const toPosix = (p) => p.split(path.sep).join('/');
const rel = (abs, root) => toPosix(path.relative(root, abs));

export function zoneOf(absFile, root = FRONTEND_ROOT) {
  const r = rel(absFile, root);
  const zone = ZONES.find((z) => r === z.dir || r.startsWith(z.dir + '/'));
  return zone ? zone.name : null;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE.test(e.name)) out.push(p);
  }
  return out;
}

// Module specifiers only: static/dynamic imports, re-exports, vi.mock family and require().
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*\(\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/gm;

export function specifiersOf(source) {
  const out = [];
  let m;
  SPECIFIER.lastIndex = 0;
  while ((m = SPECIFIER.exec(source))) out.push(m[2]);
  return out;
}

function resolveFile(base) {
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function resolveRelative(absFile, spec) {
  return resolveFile(path.resolve(path.dirname(absFile), spec));
}

export function readSharedExports(root = FRONTEND_ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/shared/package.json'), 'utf8'));
  return pkg.exports || {};
}

/** Every `@billbull/shared/<key>` used by Retail and POS, mapped to the file it must export. */
export function collectSharedKeys(root = FRONTEND_ROOT) {
  const keys = new Map();
  const unresolved = [];
  for (const zone of ['retail', 'pos']) {
    const dir = path.join(root, ZONES.find((z) => z.name === zone).dir);
    for (const file of walk(dir)) {
      for (const spec of specifiersOf(fs.readFileSync(file, 'utf8'))) {
        if (!spec.startsWith(SHARED_PACKAGE + '/')) continue;
        const key = spec.slice(SHARED_PACKAGE.length + 1);
        const target = resolveFile(path.join(root, 'packages/shared/src', key));
        if (!target) unresolved.push(`${rel(file, root)}: ${spec}`);
        else keys.set(key, './' + rel(target, path.join(root, 'packages/shared')));
      }
    }
  }
  return { keys, unresolved };
}

export function buildExportMap(keys) {
  const map = {};
  for (const key of [...keys.keys()].sort()) map['./' + key] = keys.get(key);
  return map;
}

export function findViolations(root = FRONTEND_ROOT) {
  const exportsMap = readSharedExports(root);
  const violations = [];
  for (const zone of ZONES) {
    for (const file of walk(path.join(root, zone.dir))) {
      const where = rel(file, root);
      for (const spec of specifiersOf(fs.readFileSync(file, 'utf8'))) {
        violations.push(...checkSpecifier({ file, where, zone: zone.name, spec, exportsMap, root }));
      }
    }
  }
  return violations;
}

export function checkSpecifier({ file, where, zone, spec, exportsMap, root = FRONTEND_ROOT }) {
  const v = [];
  if (spec.startsWith('.')) {
    const target = resolveRelative(file, spec);
    if (!target) return v; // unresolvable relative literal (e.g. asset query) — bundler reports it
    const targetZone = zoneOf(target, root);
    if (targetZone !== zone) {
      v.push(`${where}: relative import "${spec}" crosses from ${zone} into ${targetZone ?? 'outside the workspace'}`);
    }
    return v;
  }
  if (spec === POS_PACKAGE || spec.startsWith(POS_PACKAGE + '/')) {
    v.push(`${where}: nothing may import the POS app ("${spec}")`);
  }
  if (spec === SHARED_PACKAGE || spec.startsWith(SHARED_PACKAGE + '/')) {
    if (zone === 'shared') v.push(`${where}: shared must import itself relatively, not via "${spec}"`);
    else if (!exportsMap['./' + spec.slice(SHARED_PACKAGE.length + 1)]) {
      v.push(`${where}: "${spec}" is not in packages/shared/package.json exports (run npm run shared:exports)`);
    }
  }
  return v;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const { keys, unresolved } = collectSharedKeys();
    if (unresolved.length) {
      console.error('Unresolved shared specifiers:\n' + unresolved.join('\n'));
      process.exit(1);
    }
    const pkgPath = path.join(FRONTEND_ROOT, 'packages/shared/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.exports = buildExportMap(keys);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`wrote ${keys.size} exports`);
  } else {
    const violations = findViolations();
    violations.forEach((x) => console.error(x));
    console.log(`${violations.length} boundary violation(s)`);
    process.exit(violations.length ? 1 : 0);
  }
}
