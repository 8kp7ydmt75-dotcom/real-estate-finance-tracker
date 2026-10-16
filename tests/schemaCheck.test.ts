import { expect, test } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test('schema checker fails on HTTP 403 instead of reporting success', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end('{"message":"denied"}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    await expect(
      run(process.execPath, ['scripts/check-supabase-schema.mjs'], {
        env: {
          ...process.env,
          VITE_DEMO_MODE: 'false',
          VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
          VITE_SUPABASE_ANON_KEY: 'test-key',
          SUPABASE_USER_JWT: 'test-user',
        },
      }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('403') });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
