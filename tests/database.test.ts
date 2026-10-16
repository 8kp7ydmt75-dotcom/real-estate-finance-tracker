import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

let db: PGlite;
const owner = '10000000-0000-4000-8000-000000000001';
const viewer = '10000000-0000-4000-8000-000000000002';
const stranger = '10000000-0000-4000-8000-000000000003';
const accountant = '10000000-0000-4000-8000-000000000004';
const asUser = async (id = owner, role = 'authenticated') => {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
};
async function project() {
  const { rows } = await db.query<{ p: { id: string } }>(
    'select finance_create_project($1::jsonb) p',
    [
      JSON.stringify({
        code: crypto.randomUUID().replaceAll('-', '').toUpperCase(),
        name: 'Test project',
      }),
    ],
  );
  return rows[0].p.id;
}
async function unit(p: string, ownership = 'Developer') {
  const { rows } = await db.query<{ id: string }>(
    "insert into units(project_id,unit_code,tower,flat_no,floor_no,bhk,ownership_type,is_sold,buyer_name) values($1,$2,'C',$2,4,'2BHK',$3,$4,'Test buyer') returning id",
    [p, crypto.randomUUID(), ownership, ownership === 'Developer'],
  );
  return rows[0].id;
}
async function transaction(p: string, options: Record<string, unknown> = {}) {
  const payload = {
    project_id: p,
    request_id: crypto.randomUUID(),
    type: 'VendorInvoice',
    scope: 'ProjectWide',
    amount: 100,
    date: '2026-10-16',
    party: 'Acme',
    unit_id: null,
    invoice_id: null,
    details: '{}',
    mode: null,
    status: 'Pending',
    ...options,
  };
  const { rows } = await db.query<{ t: { id: string; version: number } }>(
    'select finance_create_transaction($1::jsonb) t',
    [JSON.stringify(payload)],
  );
  return rows[0].t;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values('${owner}'),('${viewer}'),('${stranger}'),('${accountant}');`);
  await db.exec(readFileSync('sql/supabase_setup.sql', 'utf8'));
  await asUser();
});
afterAll(async () => {
  await db?.close();
});

test('owner creates project atomically with membership and audit', async () => {
  const p = await project();
  const role = await db.query<{ role: string }>('select finance_role($1) role', [p]);
  expect(role.rows[0].role).toBe('owner');
  const events = await db.query<{ actor_id: string }>(
    'select actor_id from audit_events where project_id=$1',
    [p],
  );
  expect(events.rows[0].actor_id).toBe(owner);
});
test('anon cannot read or write; outsiders cannot see another project', async () => {
  const p = await project();
  await unit(p);
  await asUser('', 'anon');
  await expect(db.query('select * from projects')).rejects.toThrow();
  await expect(db.query("insert into projects(code,name) values('BAD','bad')")).rejects.toThrow();
  await asUser(stranger);
  const snapshot = await db.query<{ s: { role: null; units: unknown[] } }>(
    'select finance_snapshot($1) s',
    [p],
  );
  expect(snapshot.rows[0].s).toMatchObject({ role: null, units: [] });
  await expect(transaction(p)).rejects.toThrow();
  await asUser();
});
test('viewers can read but cannot edit; accountants can write', async () => {
  const p = await project();
  const u = await unit(p);
  await db.exec('reset role');
  await db.query('insert into project_members values($1,$2,$3),($1,$4,$5)', [
    p,
    viewer,
    'viewer',
    accountant,
    'accountant',
  ]);
  await asUser(viewer);
  expect((await db.query('select * from units where id=$1', [u])).rows).toHaveLength(1);
  expect(
    (await db.query('update units set floor_no=9 where id=$1 returning id', [u])).rows,
  ).toHaveLength(0);
  await expect(transaction(p)).rejects.toThrow();
  await asUser(accountant);
  expect((await transaction(p)).id).toBeTruthy();
  await expect(
    db.query('insert into project_members values($1,$2,$3)', [p, stranger, 'owner']),
  ).rejects.toThrow();
  await asUser();
});
test('floor survives persistence, invalid money and cross-project links fail', async () => {
  const p = await project(),
    other = await project(),
    u = await unit(p);
  expect(
    (await db.query<{ floor_no: number }>('select floor_no from units where id=$1', [u])).rows[0]
      .floor_no,
  ).toBe(4);
  await expect(
    transaction(other, { type: 'BuyerReceipt', scope: 'PerUnit', unit_id: u }),
  ).rejects.toThrow('same project');
  for (const amount of [0, -1, 1.001, 'NaN', 'Infinity'])
    await expect(transaction(p, { amount })).rejects.toThrow();
  await expect(
    transaction(p, { type: 'LandownerReimbursable', scope: 'PerUnit', unit_id: u }),
  ).rejects.toThrow('landowner');
});
test('pending and cleared payment edits produce atomic full audit records', async () => {
  const p = await project(),
    t = await transaction(p, { type: 'VendorPayment' });
  await db.query("update transactions set status='Completed',mode='UPI',details='{}' where id=$1", [
    t.id,
  ]);
  const { rows } = await db.query<{
    actor_id: string;
    old_record: { status: string };
    new_record: { mode: string };
  }>("select * from audit_events where entity_id=$1 and action='UPDATE'", [t.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].actor_id).toBe(owner);
  expect(rows[0].old_record.status).toBe('Pending');
  expect(rows[0].new_record.mode).toBe('UPI');
  await expect(db.query('update transactions set amount=-1 where id=$1', [t.id])).rejects.toThrow();
  expect(
    (await db.query("select * from audit_events where entity_id=$1 and action='UPDATE'", [t.id]))
      .rows,
  ).toHaveLength(1);
  await expect(db.query('delete from audit_events where entity_id=$1', [t.id])).rejects.toThrow();
  await expect(
    db.query(
      "insert into audit_events(project_id,entity,entity_id,action) values($1,'fake',$2,'UPDATE')",
      [p, t.id],
    ),
  ).rejects.toThrow();
});
test('version compare prevents lost updates', async () => {
  const p = await project(),
    t = await transaction(p);
  expect(
    (
      await db.query(
        'update transactions set amount=101 where id=$1 and version=1 returning version',
        [t.id],
      )
    ).rows,
  ).toEqual([{ version: 2 }]);
  expect(
    (
      await db.query(
        'update transactions set amount=102 where id=$1 and version=1 returning version',
        [t.id],
      )
    ).rows,
  ).toHaveLength(0);
});
test('units with history cannot be archived even after transactions are voided', async () => {
  const p = await project(),
    u = await unit(p),
    t = await transaction(p, { type: 'BuyerReceipt', scope: 'PerUnit', unit_id: u });
  await expect(
    db.query("update units set deleted_at=now(),delete_reason='test' where id=$1", [u]),
  ).rejects.toThrow('financial history');
  await db.query("update transactions set deleted_at=now(),delete_reason='test' where id=$1", [
    t.id,
  ]);
  await expect(
    db.query("update units set deleted_at=now(),delete_reason='test' where id=$1", [u]),
  ).rejects.toThrow('financial history');
  await expect(db.query('delete from transactions where id=$1', [t.id])).rejects.toThrow();
  await expect(
    db.query('update transactions set deleted_at=null where id=$1', [t.id]),
  ).rejects.toThrow('immutable');
});
test('linked payments validate vendor, project, type and invoice lifecycle', async () => {
  const p = await project(),
    invoice = await transaction(p);
  await expect(
    transaction(p, { type: 'VendorPayment', invoice_id: invoice.id, party: 'Other' }),
  ).rejects.toThrow('same project and vendor');
  await transaction(p, { type: 'VendorPayment', invoice_id: invoice.id, status: 'Completed' });
  await expect(
    db.query("update transactions set deleted_at=now(),delete_reason='test' where id=$1", [
      invoice.id,
    ]),
  ).rejects.toThrow('linked payments');
});
test('idempotent retries reuse the original row and reject changed payloads', async () => {
  const p = await project(),
    request_id = crypto.randomUUID();
  const first = await transaction(p, { request_id });
  const retry = await transaction(p, { request_id });
  expect(retry.id).toBe(first.id);
  await expect(transaction(p, { request_id, amount: 110 })).rejects.toThrow('different values');
  expect((await db.query('select * from transactions where project_id=$1', [p])).rows).toHaveLength(
    1,
  );
});
test('snapshot returns more than 1000 transactions in one complete result', async () => {
  const p = await project();
  await db.query(
    "insert into transactions(project_id,type,scope,amount,date,party) select $1,'VendorInvoice','ProjectWide',1,'2026-10-16','Scale vendor' from generate_series(1,1005)",
    [p],
  );
  const { rows } = await db.query<{ n: number }>(
    "select jsonb_array_length(finance_snapshot($1)->'transactions') n",
    [p],
  );
  expect(rows[0].n).toBe(1005);
});

test('revoked creator loses all project access', async () => {
  const p = await project();
  await db.exec('reset role');
  await db.query('delete from project_members where project_id=$1', [p]);
  await asUser();
  expect((await db.query('select * from projects where id=$1', [p])).rows).toHaveLength(0);
  await expect(transaction(p)).rejects.toThrow();
});
