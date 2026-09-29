import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /study of oscillation/i }).first()).toBeVisible()
})

test('evaluates the starter math notebook and renders a plot', async ({ page }) => {
  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.getByText(/Out \[2\]/)).toBeVisible()
  await expect(page.getByRole('img', { name: /Plot of f\(x\)/ })).toBeVisible()
})

test('creates, edits, and reopens a notebook', async ({ page }) => {
  await page.getByRole('button', { name: 'Open command palette' }).click()
  await page.getByRole('dialog', { name: 'Command palette' }).getByRole('button', { name: /New notebook/ }).click()
  const title = page.getByRole('textbox', { name: 'Notebook title' })
  await expect(title).toHaveValue('Untitled notebook')
  await title.fill('Persistent vectors')
  await expect(page.locator('.save-state')).toHaveText('Edited')
  await expect(page.locator('.save-state')).toHaveText('Saved')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('calculus-notebook:recovery') ?? '{}').title)).toBe('Persistent vectors')
  await page.getByRole('textbox').last().fill('[1, 2, 3] * 4')
  await expect(page.locator('.save-state')).toHaveText('Edited')
  await page.getByRole('button', { name: 'Run cell' }).click()
  await expect(page.locator('.cell-output')).toContainText('4')
  await expect(page.locator('.save-state')).toHaveText('Saved')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('calculus-notebook:recovery') ?? '{}').title)).toBe('Persistent vectors')
  await page.reload()
  await expect(title).toHaveValue('Persistent vectors')
})

test('keeps notebook controls usable at mobile width', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Run all' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Notebook cells' })).toBeVisible()
})
