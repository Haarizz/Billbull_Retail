import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMBEDDED_POS_HOST, PosHostContext, STANDALONE_POS_HOST, usePosHost } from '../posHost';

const Probe = () => <span>{String(usePosHost().terminalAdministration)}</span>;
const CONSOLE = fs.readFileSync(path.resolve(__dirname, '../POSConsole.jsx'), 'utf8').replace(/\r\n/g, '\n');

describe('POS host capabilities', () => {
  it('defaults to the embedded Retail host, which keeps terminal administration', () => {
    render(<Probe />);
    expect(screen.getByText('true')).toBeTruthy();
    expect(EMBEDDED_POS_HOST.terminalAdministration).toBe(true);
  });

  it('lets the standalone host turn terminal administration off', () => {
    render(<PosHostContext.Provider value={STANDALONE_POS_HOST}><Probe /></PosHostContext.Provider>);
    expect(screen.getByText('false')).toBeTruthy();
  });

  it('gates both the Terminals & Counters tab and its panel on the capability', () => {
    expect(CONSOLE).toContain("const { terminalAdministration } = usePosHost();");
    expect(CONSOLE).toContain("...(terminalAdministration ? [{ id:'terminals', label:'Terminals & Counters'");
    expect(CONSOLE).toContain("{consoleTab === 'terminals' && terminalAdministration && (() => {");
    // The other console tabs stay unconditional on the host.
    for (const id of ['layout', 'devices', 'templates']) expect(CONSOLE).toMatch(new RegExp(`\\{ id:'${id}',`));
  });
});
