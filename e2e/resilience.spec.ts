import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('a total refresh failure keeps the previous data and says so', async ({ page }) => {
  await gotoHydrated(page, '/?window=monthly&history=1m')
  await expect(page.getByText('Maillon faible')).toBeVisible()
  await expect(page.getByText('main-01', { exact: true }).first()).toBeVisible()
  // Idle live region never claims success.
  await expect(page.getByText('Données à jour')).toHaveCount(0)

  await page.route('**/_serverFn/**', (route) => route.abort())
  await page.getByRole('button', { name: 'Actualiser les données' }).click()

  await expect(page.getByText('Mise à jour impossible')).toBeVisible()
  await expect(page.getByText('Données à jour')).toHaveCount(0)
  // The old values must stay visible: never fall back to a false empty state.
  await expect(page.getByText('Maillon faible')).toBeVisible()
  await expect(page.getByText('main-01', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Aucune métrique reçue')).toHaveCount(0)
  await page.unroute('**/_serverFn/**')
})
