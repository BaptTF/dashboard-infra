import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('manual theme persists across reloads', async ({ page }) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  await page.getByRole('button', { name: /Thème/ }).click()
  await page.getByRole('menuitemradio', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Thème : Sombre' })).toBeVisible()
})
