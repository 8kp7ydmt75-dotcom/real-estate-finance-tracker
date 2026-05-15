import fs from 'node:fs';

const readEnvFile = (path) => {
  if (!fs.existsSync(path)) return {};

  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
};

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...process.env
};

const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const tables = ['projects', 'units', 'transactions', 'transaction_audit_log'];
const missing = [];

for (const table of tables) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    }
  });

  if (response.ok) {
    console.log(`ok ${table}`);
    continue;
  }

  const body = await response.json().catch(() => ({}));
  const message = body.message ?? response.statusText;
  console.log(`fail ${table}: ${response.status} ${message}`);

  if (body.code === 'PGRST205' || message.includes('schema cache')) {
    missing.push(table);
  }
}

if (missing.length > 0) {
  console.error(`Missing Supabase tables: ${missing.join(', ')}. Run sql/supabase_setup.sql in Supabase SQL Editor.`);
  process.exit(1);
}

console.log('Supabase schema check passed.');
