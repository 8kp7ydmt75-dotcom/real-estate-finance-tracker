import fs from 'node:fs';
const readEnv = (path) =>
  fs.existsSync(path)
    ? Object.fromEntries(
        fs
          .readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#') && l.includes('='))
          .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
          }),
      )
    : {};
const env = { ...readEnv('.env'), ...readEnv('.env.local'), ...process.env };
if (String(env.VITE_DEMO_MODE).toLowerCase() === 'true') {
  console.log('Demo mode: no Supabase checks were performed.');
} else {
  try {
    const url = env.VITE_SUPABASE_URL,
      key = env.VITE_SUPABASE_ANON_KEY,
      jwt = env.SUPABASE_USER_JWT;
    if (!url || !key || !jwt)
      throw new Error(
        'Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_USER_JWT (an authenticated user session token; never a service-role key).',
      );
    const request = async (path, token) =>
      fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
    const version = await request('rpc/finance_schema_version', jwt);
    if (!version.ok)
      throw new Error(
        `Schema version check failed (HTTP ${version.status}). Apply the migration and verify the user token.`,
      );
    if ((await version.json()) !== 20261016)
      throw new Error('Unexpected schema version. Apply sql/20261016_finance_hardening.sql.');
    for (const table of [
      'projects',
      'units',
      'transactions',
      'project_members',
      'vendors',
      'audit_events',
      'transaction_audit_log',
    ]) {
      const response = await request(`${table}?select=*&limit=0`, jwt);
      if (!response.ok)
        throw new Error(`Authenticated ${table} check failed (HTTP ${response.status}).`);
      const anonymous = await request(`${table}?select=*&limit=0`, key);
      if (anonymous.ok)
        throw new Error(
          `Anonymous access is still enabled for ${table}. Apply the security migration.`,
        );
      if (![401, 403].includes(anonymous.status))
        throw new Error(`Unexpected anonymous ${table} response (HTTP ${anonymous.status}).`);
      console.log(`ok ${table}: authenticated read; anonymous access denied`);
    }
    console.log(
      'Schema version and API access checks passed. Role isolation is covered by the automated database tests.',
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Supabase check failed.');
    process.exitCode = 1;
  }
}
