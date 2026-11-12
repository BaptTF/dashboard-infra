import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

for (const [path, heading] of [
  ['/?window=monthly&history=30d', 'Abonnements'],
  ['/consommation?window=1m&source=all', 'Consommation'],
] as const) {
  test(`WCAG AA — ${heading}`, async ({ page }) => {
    await gotoHydrated(page, path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    const results = await new AxeBuilder({ page } as never)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}
