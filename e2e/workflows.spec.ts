import { test, expect } from '@playwright/test';
test('dashboard and transactions work without CDN or runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/p/demo-heights');
  await expect(
    page.getByRole('heading', { name: 'Demo Heights operations dashboard' }),
  ).toBeVisible();
  await expect(page.getByText('Demo data only.')).toBeVisible();
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Transactions' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('script[src*="cdn"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('new project starts empty and stays isolated when switching', async ({ page }) => {
  await page.goto('/#/admin/projects/new');
  await page.getByLabel('Name *', { exact: true }).fill('Second Project');
  await page.getByLabel('Code *').fill('SECOND');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Second Project operations dashboard' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Units List', exact: true }).click();
  await expect(page.getByText('No units yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add Unit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tower *', { exact: true }).fill('C');
  await dialog.getByLabel('Flat Number *').fill('401');
  await dialog.getByLabel('Floor *', { exact: true }).fill('4');
  await dialog.getByRole('button', { name: /Save|Create/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('cell', { name: /^C401 / })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Floor *', { exact: true })).toHaveValue('4');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(() => (location.hash = '/p/demo-heights/units'));
  await expect(page.getByRole('cell', { name: /^C401 / })).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(6);
});
test('pending receipt saves once, clears through editing, and cannot archive its unit', async ({
  page,
}) => {
  await page.goto('/#/p/demo-heights/transactions');
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount (₹)').fill('123.45');
  await dialog.getByLabel('Notes').fill('E2E pending receipt');
  await dialog.getByRole('button', { name: 'Save Transaction', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  // Unique amount locates the posted row even if notes are compacted in the ledger.
  const row = page.locator('tbody tr').filter({ hasText: '123.45' });
  await expect(row).toContainText('Pending');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Status', { exact: true }).selectOption('Settled');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Update Transaction', exact: true })
    .click();
  await expect(row).toContainText('Cleared');
  await page.evaluate(() => (location.hash = '/p/demo-heights/units/demo-a101'));
  let alerted = '';
  page.on('dialog', async (d) => {
    if (d.type() === 'confirm') await d.accept();
    else if (d.type() === 'prompt') await d.accept('Testing history');
    else {
      alerted = d.message();
      await d.accept();
    }
  });
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect.poll(() => alerted).toContain('financial history');
  await expect(page.getByRole('button', { name: 'Edit Unit' })).toBeVisible();
});
test('invoice and cross-scope payment reconcile; canceling void prompt preserves data', async ({
  page,
}) => {
  await page.goto('/#/p/demo-heights/transactions');
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type', { exact: true }).selectOption('Vendor Invoice');
  await dialog.getByLabel('Scope', { exact: true }).selectOption('PerUnit');
  await dialog.getByLabel('Vendor name').fill('E2E vendor');
  await dialog.getByLabel('Amount (₹)').fill('100.01');
  await dialog.getByRole('button', { name: 'Save Transaction' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type', { exact: true }).selectOption('Vendor Payment');
  await dialog.getByLabel('Scope', { exact: true }).selectOption('ProjectWide');
  await dialog.getByLabel('Vendor name').fill('E2E vendor');
  await dialog.getByLabel('Amount (₹)').fill('100.01');
  await dialog.getByLabel('Status', { exact: true }).selectOption('Settled');
  await dialog.getByRole('button', { name: 'Save Transaction' }).click();
  const invoice = page
    .locator('tbody tr')
    .filter({ hasText: 'E2E vendor' })
    .filter({ hasText: 'Vendor Invoice' });
  await expect(invoice).toContainText('Paid');
  page.on('dialog', async (d) => {
    if (d.type() === 'confirm') await d.accept();
    else await d.dismiss();
  });
  await invoice.getByRole('button', { name: 'Void', exact: true }).click();
  await expect(invoice).toBeVisible();
});
test('dialog contains keyboard focus and supports Escape on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/p/demo-heights');
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
