// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRONTEND_ROOT,
  buildExportMap,
  checkSpecifier,
  collectSharedKeys,
  findViolations,
  readSharedExports,
  specifiersOf,
  zoneOf,
} from '../workspaceBoundaries.mjs';

const at = (p) => path.join(FRONTEND_ROOT, p);

describe('workspace boundaries (Retail src / apps/pos / packages/shared)', () => {
  it('has no cross-zone relative imports, no POS-app imports and no unexported shared keys', () => {
    expect(findViolations()).toEqual([]);
  });

  it('keeps the shared export map exactly in sync with what Retail and POS import', () => {
    const { keys, unresolved } = collectSharedKeys();
    expect(unresolved).toEqual([]);
    // Nothing public that no app imports, nothing imported that is not public.
    expect(readSharedExports()).toEqual(buildExportMap(keys));
  });

  it('points every export at a file that exists inside packages/shared/src', () => {
    for (const target of Object.values(readSharedExports())) {
      const abs = path.join(FRONTEND_ROOT, 'packages/shared', target);
      expect(fs.existsSync(abs), target).toBe(true);
      expect(zoneOf(abs)).toBe('shared');
    }
  });
});

describe('checkSpecifier', () => {
  const exportsMap = { './utils/vatMath': './src/utils/vatMath.js' };
  const check = (zone, fileRel, spec) =>
    checkSpecifier({ file: at(fileRel), where: fileRel, zone, spec, exportsMap });

  it('rejects a shared module reaching into the Retail tree relatively', () => {
    expect(check('shared', 'packages/shared/src/utils/vatMath.js', '../../../../src/App.jsx')).toHaveLength(1);
  });

  it('rejects Retail reaching into shared relatively instead of through the package', () => {
    expect(check('retail', 'src/App.jsx', '../packages/shared/src/utils/vatMath.js')).toHaveLength(1);
  });

  it('rejects the POS app importing Retail relatively', () => {
    expect(check('pos', 'apps/pos/src/PosApp.jsx', '../../../src/App.jsx')).toHaveLength(1);
  });

  it('rejects anything importing the POS app package', () => {
    expect(check('retail', 'src/App.jsx', '@billbull/pos/src/PosApp')).toHaveLength(1);
  });

  it('rejects shared importing itself by package name', () => {
    expect(check('shared', 'packages/shared/src/utils/vatMath.js', '@billbull/shared/utils/vatMath')).toHaveLength(1);
  });

  it('rejects a shared key missing from the export map, and accepts an exported one', () => {
    expect(check('retail', 'src/App.jsx', '@billbull/shared/utils/notExported')).toHaveLength(1);
    expect(check('pos', 'apps/pos/src/PosApp.jsx', '@billbull/shared/utils/vatMath')).toEqual([]);
  });

  it('accepts same-zone relative imports and third-party packages', () => {
    expect(check('retail', 'src/main.jsx', './App.jsx')).toEqual([]);
    expect(check('shared', 'packages/shared/src/api/auth.js', 'jwt-decode')).toEqual([]);
  });
});

describe('specifiersOf', () => {
  it('finds static, dynamic, re-export, side-effect, vi.mock and require specifiers', () => {
    const src = [
      "import a from './a';",
      "import './side.css';",
      "export { b } from '../b';",
      "const c = () => import('./c');",
      "vi.mock('../d', () => ({}));",
      "const e = require('e');",
    ].join('\n');
    expect(specifiersOf(src)).toEqual(['./a', './side.css', '../b', './c', '../d', 'e']);
  });
});
