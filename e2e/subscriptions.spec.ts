import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('compact subscriptions page keeps weakest link, real quotas and OpenCode weights', async ({
  page,
}) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  await expect(page.getByText('Maillon faible')).toBeVisible()
  await expect(page.getByRole('heading', { name: /OpenCode/ }).first()).toBeVisible()
  // The separator is explicit: "OpenCode · A", never a run-together label.
  await expect(page.getByText('OpenCode · A', { exact: true }).first()).toBeVisible()

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

test('back and forward resynchronise quota window and history range', async ({ page }) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const weekly = page.getByRole('button', { name: 'Hebdo', exact: true })
  const monthly = page.getByRole('button', { name: 'Mensuel', exact: true })
  const range7 = page.getByRole('button', { name: '7 j', exact: true })
  const range30 = page.getByRole('button', { name: '30 j', exact: true })

  await weekly.click()
  await expect(weekly).toHaveAttribute('aria-pressed', 'true')
  await range7.click()
  await expect(range7).toHaveAttribute('aria-pressed', 'true')

  await page.goBack()
  await expect(page).toHaveURL(/window=weekly/)
  await expect(page).toHaveURL(/history=30d/)
  await expect(weekly).toHaveAttribute('aria-pressed', 'true')
  await expect(range30).toHaveAttribute('aria-pressed', 'true')
  await expect(range7).toHaveAttribute('aria-pressed', 'false')

  await page.goForward()
  await expect(page).toHaveURL(/history=7d/)
  await expect(range7).toHaveAttribute('aria-pressed', 'true')

  await monthly.click()
  await expect(monthly).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(weekly).toHaveAttribute('aria-pressed', 'true')
  await expect(monthly).toHaveAttribute('aria-pressed', 'false')
})

test('history merges exact duplicates and keeps readable current labels', async ({ page }) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  // OpenCode main/r/a/n + Cursor default's four monthly quota kinds = 8 series.
  const chart = page.locator('[data-data-key="quotas-monthly-30d"]')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart).toHaveAttribute('data-series-count', '8')
  // Mixed OpenCode 80/95 and Cursor 70/90 grids hide the misleading markers.
  await expect(page.getByText(/Plusieurs grilles de repères coexistent/).first()).toBeVisible()
  await expect(page.getByText('Fin de période')).toHaveCount(0)
})
