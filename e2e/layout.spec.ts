import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './utils'

function normalizeColor(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

async function hoverChart(page: Page) {
  const chart = page.locator('[data-data-key="bifrost-1m-day"]').first()
  await chart.scrollIntoViewIfNeeded()
  // Let the ECharts instance finish its first layout before probing it.
  await page.waitForTimeout(700)
  const box = await chart.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return null
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 1)
  return page.locator('.chart-tooltip').first()
}

test('the chart tooltip is styled, readable and absent at rest in light mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'hover tooltip is a desktop interaction')
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await expect(page.locator('.chart-tooltip').first()).toBeHidden()

  const tooltip = await hoverChart(page)
  if (!tooltip) return
  await expect(tooltip).toBeVisible()
  const style = await tooltip.evaluate((element) => {
    const computed = getComputedStyle(element)
    const root = getComputedStyle(document.documentElement)
    return {
      background: computed.backgroundColor,
      color: computed.color,
      card: root.getPropertyValue('--card'),
      foreground: root.getPropertyValue('--foreground'),
      border: computed.borderTopWidth,
      padding: computed.paddingTop,
      maxHeight: computed.maxHeight,
      overflowY: computed.overflowY,
    }
  })
  expect(normalizeColor(style.background)).toBe(normalizeColor(style.card))
  expect(normalizeColor(style.color)).toBe(normalizeColor(style.foreground))
  expect(style.border).not.toBe('0px')
  expect(style.padding).not.toBe('0px')
  // A long legend must scroll inside the tooltip instead of growing off-screen.
  expect(style.maxHeight).not.toBe('none')
  expect(style.overflowY).toBe('auto')
})

test('the chart tooltip uses the dark theme surface instead of white', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'hover tooltip is a desktop interaction')
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await page.getByRole('button', { name: /Thème/ }).click()
  await page.getByRole('menuitemradio', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  const tooltip = await hoverChart(page)
  if (!tooltip) return
  await expect(tooltip).toBeVisible()
  const style = await tooltip.evaluate((element) => {
    const computed = getComputedStyle(element)
    const root = getComputedStyle(document.documentElement)
    return {
      background: computed.backgroundColor,
      color: computed.color,
      card: root.getPropertyValue('--card'),
      foreground: root.getPropertyValue('--foreground'),
    }
  })
  expect(normalizeColor(style.background)).toBe(normalizeColor(style.card))
  expect(normalizeColor(style.color)).toBe(normalizeColor(style.foreground))
  expect(normalizeColor(style.background).toLowerCase()).not.toContain('255 255 255')
})

test('mobile scroll hint only appears when a table really overflows', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile scroll scenario')
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  const region = page.getByRole('region', { name: /Consommation Bifrost/ })
  await region.scrollIntoViewIfNeeded()
  const overflow = await region.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
  const hint = region.locator('xpath=following-sibling::p[1]')
  if (overflow) {
    await expect(hint).toBeVisible()
    await expect(region).toHaveAttribute('aria-label', /tableau défilable/)
  } else {
    await expect(hint).toHaveCount(0)
    // The scroll region must not claim to be scrollable when it is not.
    await expect(region).not.toHaveAttribute('aria-label', /tableau défilable/)
  }
})

test('mobile tables keep tokens, cache and sessions reachable without horizontal scroll', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile data access scenario')
  await gotoHydrated(page, '/consommation?window=1m&source=all')

  const bifrostRow = page.getByRole('row').filter({ hasText: 'tailscale-camille' }).first()
  await bifrostRow.scrollIntoViewIfNeeded()
  await expect(bifrostRow.getByText('Entrée', { exact: true })).toBeVisible()
  await expect(bifrostRow.getByText('Cache lu', { exact: true })).toBeVisible()
  await expect(bifrostRow.getByText('Sortie', { exact: true })).toBeVisible()

  const hermesRow = page.getByRole('row').filter({ hasText: 'Camille' }).last()
  await hermesRow.scrollIntoViewIfNeeded()
  await expect(hermesRow.getByText('Sessions', { exact: true })).toBeVisible()
})

test('cost chart uses UTC day ticks on desktop and mobile', async ({ page }, testInfo) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  const chart = page.locator('[data-data-key="bifrost-1m-day"]')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart).toHaveAttribute('data-x-label-mode', 'utc-day')
  // Three cost keys fit as a wrapped legend on mobile; larger grids only use
  // the table fallback.
  await expect(chart).toHaveAttribute(
    'data-legend-mode',
    testInfo.project.name.includes('mobile') ? 'plain' : 'scroll',
  )
})

test('cost history shows the consumed UTC day in the tooltip and table', async ({
  page,
}, testInfo) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  const chart = page.locator('[data-data-key="bifrost-1m-day"]')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart).toHaveAttribute('data-x-label-mode', 'utc-day')

  await page.getByText('Voir les données sous forme de tableau').first().click()
  const table = page.getByRole('region', { name: /Données du graphique/ }).first()
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Jour UTC' })).toBeVisible()
  const firstRow = table.getByRole('row').nth(1)
  await expect(firstRow).toContainText('31/10')
  await expect(firstRow.locator('[title]').first()).toHaveAttribute('title', /31\s+oct\..*2026/)

  if (!testInfo.project.name.includes('mobile')) {
    const tooltip = await hoverChart(page)
    if (!tooltip) return
    await expect(tooltip).toBeVisible()
    const firstLine = (await tooltip.innerText()).split('\n')[0]?.trim() ?? ''
    // Date only: the UTC day must never be rendered with the Paris time 00:59.
    expect(firstLine).toMatch(/^\d{1,2}\s+\S+\s+2026$/)
    expect(firstLine).not.toContain(':')
  }
})

test('mobile header shows a short freshness label and aligned KPI titles', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile header scenario')
  // The consumption page has a healthy collection, unlike the nominal fixture
  // where one OpenCode subscription deliberately fails.
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await expect(page.locator('header').getByText(/^À jour(?: · .+)?$/)).toBeVisible()
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const title = page.getByText('Maillon faible', { exact: true })
  const minHeight = await title.evaluate((element) => getComputedStyle(element).minHeight)
  expect(minHeight).not.toBe('0px')
})

test('mobile history uses compact dates instead of four-line timestamps', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile history scenario')
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoHydrated(page, '/?window=monthly&history=30d')
  // The large quota history hides the canvas legend; the table is the fallback.
  const chart = page.locator('[data-data-key="quotas-monthly-30d"]')
  await chart.scrollIntoViewIfNeeded()
  await expect(chart).toHaveAttribute('data-legend-mode', 'hidden')
  await page.getByText('Voir les données sous forme de tableau').first().click()
  const table = page.getByRole('region', { name: /Données du graphique/ }).first()
  await expect(table).toBeVisible()
  const compact = table.getByText(/^\d{2}\/\d{2} \d{2}:\d{2}$/).first()
  await expect(compact).toBeVisible()
  await expect(compact).toHaveAttribute('title', /\d{4}/)
  await expect(table.getByRole('columnheader', { name: 'Consommé' })).toBeVisible()
  await expect(table.getByText(/OpenCode · /).first()).toBeVisible()

  const firstRow = table.getByRole('row').nth(1)
  const value = firstRow.locator('td').last()
  await expect(value).toBeVisible()
  const [regionBox, valueBox] = await Promise.all([table.boundingBox(), value.boundingBox()])
  expect(regionBox).not.toBeNull()
  expect(valueBox).not.toBeNull()
  if (regionBox && valueBox) {
    // The right-aligned value stays inside the viewport even if the table scrolls.
    expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(regionBox.x + regionBox.width + 1)
  }
  const overflow = await table.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
  if (overflow) {
    await expect(
      page.getByText(/Défilement horizontal… La dernière colonne reste visible/),
    ).toBeVisible()
  }
})

test('history panel header and filters wrap on a narrow viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile layout scenario')
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const heading = page.getByRole('heading', { name: 'Historique des quotas' })
  await heading.scrollIntoViewIfNeeded()
  await expect(heading).toBeVisible()
  const actions = page.getByRole('button', { name: 'Hebdo', exact: true })
  await expect(actions).toBeVisible()
  const box = await actions.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(20)
  const panel = heading.locator('xpath=ancestor::div[contains(@class,"monitoring-panel")]').first()
  const panelBox = await panel.boundingBox()
  expect(panelBox?.width ?? 0).toBeGreaterThan(200)
})

test('dataZoom survives a refresh of the same period and resets on a window change', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'wheel zoom is a desktop interaction')
  await gotoHydrated(page, '/?window=monthly&history=30d')
  const chart = page.locator('[data-data-key="quotas-monthly-30d"]')
  await chart.scrollIntoViewIfNeeded()
  // Let ECharts finish its first animation before interacting with the slider.
  await page.waitForTimeout(900)
  const box = await chart.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  // Drag the right dataZoom handle to the left. The handle is a few pixels wide,
  // so try neighbouring offsets to keep the test stable across scale factors.
  const sliderY = box.y + box.height - 10
  for (const offset of [18, 22, 26, 30, 34, 38, 42]) {
    await page.mouse.move(box.x + box.width - offset, sliderY)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, sliderY, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    if (await chart.getAttribute('data-zoom')) break
  }
  await expect(chart).toHaveAttribute('data-zoom', /.+/)

  const zoom = await chart.getAttribute('data-zoom')
  await page.getByRole('button', { name: 'Actualiser les données' }).click()
  await expect.poll(() => chart.getAttribute('data-zoom')).toBe(zoom)

  await page.getByRole('button', { name: 'Hebdo', exact: true }).click()
  const weeklyChart = page.locator('[data-data-key="quotas-weekly-30d"]')
  await expect(weeklyChart).toBeVisible()
  await expect(weeklyChart).not.toHaveAttribute('data-zoom', /.+/)
})

test('the skip link moves focus to the main content', async ({ page }) => {
  await gotoHydrated(page, '/?window=monthly&history=30d')
  await page.bringToFront()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Aller au contenu' })
  await expect(skip).toBeFocused()
  // Multiple Playwright workers can background each other's pages. Retry the
  // real anchor activation while bringing this page forward so the focus check
  // remains deterministic without weakening the assertion.
  await expect
    .poll(
      async () => {
        await page.bringToFront()
        return page.evaluate(() => {
          const link = document.querySelector<HTMLAnchorElement>('.skip-link')
          if (!link) return ''
          link.click()
          return document.activeElement?.id ?? ''
        })
      },
      { timeout: 10_000 },
    )
    .toBe('contenu')
})
