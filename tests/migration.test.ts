import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
const migration = readFileSync('sql/20261016_finance_hardening.sql', 'utf8');
async function legacy() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  await db.exec(readFileSync('tests/fixtures/legacy-schema.sql', 'utf8'));
  await db.exec(
    "insert into projects(id,code,name) values('10000000-0000-4000-8000-000000000001','OLD','Existing'); insert into transactions(project_id,type,scope,date,amount,party,details) values('10000000-0000-4000-8000-000000000001','VendorInvoice','ProjectWide','2026-01-01',100,'Acme','{\"description\":\"legacy note\"}');",
  );
  return db;
}
test('upgrade preserves legacy records, enables RLS, and can be reapplied', async () => {
  const db = await legacy();
  try {
    await db.exec(migration);
    await db.exec(migration);
    const { rows } = await db.query<{
      amount: string;
      party: string;
      vendor_id: string;
      details: string;
    }>('select amount,party,vendor_id,details from transactions');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(100);
    expect(rows[0].party).toBe('Acme');
    expect(rows[0].vendor_id).toBeTruthy();
    expect(rows[0].details).toContain('legacy note');
    expect((await db.query('select * from project_members')).rows).toHaveLength(0);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname in ('projects','units','transactions','audit_events')",
    );
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
  } finally {
    await db.close();
  }
});
test('invalid legacy records abort migration without partial changes', async () => {
  const db = await legacy();
  try {
    await db.exec('update transactions set amount=0');
    await expect(db.exec(migration)).rejects.toThrow();
    await db.exec('rollback');
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='projects' and column_name='version'",
        )
      ).rows,
    ).toHaveLength(0);
    expect((await db.query('select * from transactions')).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});
test('fresh setup contains exactly the same security migration', () => {
  const setup = readFileSync('sql/supabase_setup.sql', 'utf8');
  expect(setup.slice(setup.indexOf('-- Apply once'))).toBe(
    migration.replace('begin;\nalter table', 'alter table'),
  );
});
