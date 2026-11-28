import { describe, expect, it } from 'vitest';
import {
  duplicateFixSql, fkIndexSql, looksDestructive, needsWriteMode, quoteIdent, selectStarSql, splitStatements, statementAt, toCsv,
} from '../pages/tenant/database/sqlUtils';

describe('statement under the cursor', () => {
  const text = "select 1;\nselect 'a;b' from t;\n-- note ; here\nselect 3";

  it('splits on top-level semicolons only', () => {
    expect(splitStatements(text).map((s) => s.text)).toEqual(['select 1', "select 'a;b' from t", '-- note ; here\nselect 3']);
    expect(splitStatements('select $$a;b$$; select "x;y"').map((s) => s.text)).toEqual(['select $$a;b$$', 'select "x;y"']);
    expect(splitStatements(' ; ;')).toEqual([]);
  });

  it('picks the statement the cursor is in, or the selection', () => {
    expect(statementAt(text, 3)).toBe('select 1');
    expect(statementAt(text, text.indexOf('from'))).toBe("select 'a;b' from t");
    expect(statementAt(text, text.length)).toBe('-- note ; here\nselect 3');
    expect(statementAt(text, 0, 6)).toBe('select');
    expect(statementAt('', 0)).toBe('');
  });
});

describe('mode hints', () => {
  it('knows which statements need write mode', () => {
    expect(needsWriteMode('select 1')).toBe(false);
    expect(needsWriteMode('  -- x\n WITH a AS (select 1) select * from a')).toBe(false);
    expect(needsWriteMode('update t set a = 1 where id = 2')).toBe(true);
    expect(needsWriteMode('/* c */ create index on t (a)')).toBe(true);
  });

  it('flags destructive writes like the agent does', () => {
    expect(looksDestructive('delete from t')).toBe(true);
    expect(looksDestructive('DELETE FROM t WHERE id = 1')).toBe(false);
    expect(looksDestructive('update t set a = 1')).toBe(true);
    expect(looksDestructive('truncate t')).toBe(true);
    expect(looksDestructive('drop index i')).toBe(true);
    expect(looksDestructive('alter table t drop column c')).toBe(true);
    expect(looksDestructive('alter table t add column c int')).toBe(false);
  });
});

describe('generated SQL', () => {
  it('quotes identifiers only when needed', () => {
    expect(quoteIdent('products')).toBe('products');
    expect(quoteIdent('user')).toBe('"user"');
    expect(quoteIdent('Mixed"Case')).toBe('"Mixed""Case"');
    expect(selectStarSql('public', 'products', 10)).toBe('SELECT *\nFROM products\nLIMIT 10;');
    expect(selectStarSql('audit', 'order')).toContain('FROM audit."order"');
  });

  it('builds index fixes', () => {
    expect(fkIndexSql({ schema: 'public', table_name: 'sales_items', columns: 'invoice_id, "Product"' }))
      .toBe('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_items_invoice_id_product\n  ON sales_items (invoice_id, "Product");');
    expect(duplicateFixSql({ schema: 'public', index_names: 'idx_a, idx_b, idx_c' }))
      .toBe('DROP INDEX CONCURRENTLY IF EXISTS idx_b;\nDROP INDEX CONCURRENTLY IF EXISTS idx_c;');
  });
});

describe('CSV export', () => {
  it('quotes, keeps nulls empty and defuses spreadsheet formulas', () => {
    const csv = toCsv([{ name: 'a' }, { name: 'b,c' }], [['x "y"', null], ['=HYPERLINK("http://e")', -5], ['-12.5', '+1']]);
    expect(csv.split('\r\n')).toEqual([
      'a,"b,c"',
      '"x ""y""",',
      '"\'=HYPERLINK(""http://e"")",-5',
      "-12.5,'+1",
    ]);
  });
});
