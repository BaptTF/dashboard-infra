import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './utils'

test('an empty Prometheus renders an honest empty state without backfill', async ({ page }) => {
  await gotoHydrated(page, 'http://127.0.0.1:3101/?window=monthly&history=30d')
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  await expect(page.getByText('Aucune métrique reçue')).toBeVisible()
  // No quota series at all: the empty state says collection has not started.
  await expect(page.getByText('Pas encore de collecte')).toBeVisible()
  // Missing metrics are not a stale collection, and no invented cost is shown.
  await expect(page.getByText('Données anciennes')).toHaveCount(0)
  await expect(page.getByText('Coût mensuel', { exact: true })).toHaveCount(0)
  // No collection timestamp: the header stays neutral, never "Collecte à l'instant".
  await expect(page.getByText('Aucune collecte reçue').first()).toBeVisible()
  await expect(page.getByText(/Collecte à l’instant|Collecte à l'instant/)).toHaveCount(0)

  // An empty daily window is not the same as a collection that has not started.
  await gotoHydrated(page, 'http://127.0.0.1:3101/?window=daily&history=30d')
  await expect(page.getByText('Aucune série quotidienne exportée')).toBeVisible()

  await apiEmptyConsumption(page)
})

async function apiEmptyConsumption(page: Page) {
  await gotoHydrated(page, 'http://127.0.0.1:3101/consommation?window=1m&source=all')
  await expect(page.getByText('Aucune consommation sur cette période')).toBeVisible()
  await expect(page.getByText('Bifrost · coût')).toHaveCount(0)
  await expect(page.getByText('0,00 $')).toHaveCount(0)
}
