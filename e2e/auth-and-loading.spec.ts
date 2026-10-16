import { test, expect, type Page, type Route } from '@playwright/test';
const origin = 'http://127.0.0.1:4174';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const projects = [
  { id: '10000000-0000-4000-8000-000000000010', code: 'ONE', name: 'First project', version: 1 },
  { id: '10000000-0000-4000-8000-000000000020', code: 'TWO', name: 'Second project', version: 1 },
];
async function mock(page: Page, snapshot: (route: Route) => Promise<void>, signedIn = true) {
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated', aud: 'authenticated' })).toString('base64url')}.test`;
  const session = {
    access_token: jwt,
    refresh_token: 'test-refresh',
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  if (signedIn)
    await page.addInitScript(
      (value) => localStorage.setItem('sb-finance-test-auth-token', JSON.stringify(value)),
      session,
    );
  await page.route('https://finance-test.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: route.request().url().includes('/token') ? session : user }),
  );
  await page.route('https://finance-test.supabase.co/rest/v1/rpc/**', async (route) => {
    const name = route.request().url().split('/').at(-1);
    if (name === 'finance_projects') await route.fulfill({ json: projects });
    else if (name === 'finance_project_stats') await route.fulfill({ json: {} });
    else await snapshot(route);
  });
}
test('sign-in gate hides ledger until authenticated and viewer controls are read-only', async ({
  page,
}) => {
  let snapshotCount = 0;
  await mock(
    page,
    async (route) => {
      snapshotCount++;
      await route.fulfill({ json: { units: [], transactions: [], role: 'viewer' } });
    },
    false,
  );
  await page.goto(`${origin}/#/p/${projects[0].id}`);
  await expect(page.getByRole('heading', { name: 'Sign in to Builder Ledger' })).toBeVisible();
  expect(snapshotCount).toBe(0);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'First project operations dashboard' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Transaction', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Builder Ledger' })).toBeVisible();
});
test('failed load does not loop; explicit retry succeeds', async ({ page }) => {
  let count = 0;
  await mock(page, async (route) => {
    count++;
    await route.fulfill(
      count === 1
        ? { status: 400, json: { message: 'Database temporarily unavailable' } }
        : { json: { units: [], transactions: [], role: 'owner' } },
    );
  });
  await page.goto(`${origin}/#/p/${projects[0].id}`);
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  expect(count).toBe(1);
  await page.getByRole('button', { name: /Retry/ }).click();
  await expect(
    page.getByRole('heading', { name: 'First project operations dashboard' }),
  ).toBeVisible();
  expect(count).toBe(2);
});
test('late response cannot overwrite a newly selected project', async ({ page }) => {
  let first: Route | undefined;
  await mock(page, async (route) => {
    const payload = route.request().postDataJSON();
    if (payload.target_project === projects[0].id) {
      first = route;
      return;
    }
    await route.fulfill({ json: { units: [], transactions: [], role: 'owner' } });
  });
  await page.goto(`${origin}/#/p/${projects[0].id}`);
  await expect.poll(() => !!first).toBe(true);
  await page.evaluate((id) => (location.hash = `/p/${id}`), projects[1].id);
  await expect(
    page.getByRole('heading', { name: 'Second project operations dashboard' }),
  ).toBeVisible();
  await first!.fulfill({ json: { units: [], transactions: [], role: 'viewer' } });
  await expect(
    page.getByRole('heading', { name: 'Second project operations dashboard' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Transaction', exact: true })).toBeEnabled();
});
