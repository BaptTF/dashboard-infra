import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('compact subscriptions page keeps weakest link, real quotas and OpenCode weights', async ({
  page,
}) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  await expect(page.getByText('Maillon faible')).toBeVisible()
  await expect(page.getByText('OpenCode', { exact: true }).first()).toBeVisible()

  // The duplicated top-level KPI cards and the separate weights panel are gone.
  await expect(page.getByText('Coût mensuel', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Collecte', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Poids Bifrost des clés OpenCode' })).toHaveCount(
    0,
  )

  await expect(page.getByText('main-01', { exact: true }).first()).toBeVisible()
  const mainZero = page.locator('li').filter({ hasText: 'main-02' })
  await expect(mainZero).toContainText('zéro')

  await expect(page.getByText(/Reset ACU dans/)).toBeVisible()
  // 1m is the current month on the consumption page, but the quota history keeps
  // explicit monthly/weekly/daily/rolling controls.
  await expect(page.getByText('Quota total').first()).toBeVisible()
  await expect(page.getByText('Quotidien', { exact: true })).toBeVisible()
  // One failing subscription does not turn fresh data into a stale page banner.
  await expect(page.getByText('Données anciennes')).toHaveCount(0)

  const selected = page.getByRole('link', { name: 'Abonnements', exact: true })
  await expect(selected).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Consommation', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('open_code subscription collection is per subscription, never the first one', async ({
  page,
}) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const failing = page.locator('[data-subscription="r"]')
  const healthy = page.locator('[data-subscription="main"]')
  await expect(failing).toHaveAttribute('data-collection', 'failure')
  await expect(failing).toContainText('Collecte en échec')
  await expect(healthy).toHaveAttribute('data-collection', 'ok')
  await expect(healthy).toContainText('Collecte à jour')
  // The provider aggregate exposes the failure instead of hiding it behind main.
  await expect(page.getByText('Collecte en échec').first()).toBeVisible()
})

test('history controls live in the URL, use aria-pressed and survive a refresh', async ({
  page,
}) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const weekly = page.getByRole('button', { name: 'Hebdo', exact: true })
  await weekly.click()
  await expect(page).toHaveURL(/window=weekly/)
  await expect(weekly).toHaveAttribute('aria-pressed', 'true')
  const range = page.getByRole('button', { name: '7 j', exact: true })
  await range.click()
  await expect(page).toHaveURL(/history=7d/)
  await expect(range).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  await expect(page).toHaveURL(/window=weekly/)
  await expect(page).toHaveURL(/history=7d/)
  await expect(page.getByRole('button', { name: 'Hebdo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('re-clicking the active tab keeps the selected filters', async ({ page }) => {
  await gotoHydrated(page, '/?window=weekly&history=7d')
  await page.getByRole('link', { name: 'Abonnements', exact: true }).click()
  await expect(page).toHaveURL(/window=weekly/)
  await expect(page).toHaveURL(/history=7d/)
})
