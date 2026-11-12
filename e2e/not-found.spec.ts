import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('the 404 page is inside the root shell, has a title and a way back', async ({ page }) => {
  await gotoHydrated(page, '/cette-page-nexiste-pas')
  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
  await expect(
    page.getByText('Cette adresse ne correspond à aucune vue du tableau de bord.'),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveCount(1)
  await expect(page).toHaveTitle('Page introuvable — Pilotage IA')
  const themeColors = await page.locator('meta[name="theme-color"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      media: node.getAttribute('media'),
      content: node.getAttribute('content'),
    })),
  )
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: light)',
    content: '#fbfcfd',
  })
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: dark)',
    content: '#171b22',
  })
  await page.getByRole('link', { name: 'Revenir aux abonnements' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
})
