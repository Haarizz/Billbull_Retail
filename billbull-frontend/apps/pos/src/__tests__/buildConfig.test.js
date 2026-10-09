// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('POS build configuration', () => {
  it('serves from /pos/, builds into its own dist, and reads the same env files as Retail', async () => {
    const { default: configFn, POS_BASE } = await import('../../vite.config.js');
    const config = configFn({ command: 'build', mode: 'production' });
    const frontendRoot = path.resolve(__dirname, '../../../..');
    expect(POS_BASE).toBe('/pos/');
    expect(config.base).toBe('/pos/');
    expect(path.resolve(config.envDir)).toBe(frontendRoot);
    expect(path.resolve(config.build.outDir)).toBe(path.resolve(frontendRoot, 'apps/pos/dist'));
    expect(path.resolve(config.build.outDir)).not.toBe(path.resolve(frontendRoot, 'dist'));
    expect(Object.keys(config.server.proxy)).toEqual(['/api', '/uploads']);
  });

  it('keeps production API calls same-origin (empty VITE_API_BASE_URL → window.location.origin)', () => {
    const env = fs.readFileSync(path.resolve(__dirname, '../../../../.env.production'), 'utf8');
    expect(env).toMatch(/^VITE_API_BASE_URL=\s*$/m);
  });
});
