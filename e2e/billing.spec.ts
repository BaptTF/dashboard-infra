import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('facturation shows declared, invoice and estimate prices without adding them together', async ({
  page,
}) => {
  await gotoHydrated(page, '/facturation?window=1m')
  await expect(page.getByRole('heading', { level: 1, name: 'Facturation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Facturation', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  const billed = page
    .getByText('Facturé sur la période')
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(billed).toContainText('12,20')
  await expect(billed).toContainText('10,00')
  await expect(billed).not.toContainText('12,50')

  await expect(page.getByText('Prix en cours', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText('Hetzner')
  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText(
    'Estimation',
  )
  await expect(page.getByRole('table', { name: 'Charges de la période affichée' })).toContainText(
    'Contabo',
  )
  await expect(page.getByRole('table', { name: 'Charges de la période affichée' })).toContainText(
    'Cloudflare',
  )
  await expect(
    page.getByRole('table', { name: 'Charges de la période affichée' }),
  ).not.toContainText('Hetzner')
})

test('widening the period keeps an older charge and still omits the catalog price', async ({
  page,
}) => {
  await gotoHydrated(page, '/facturation?window=3m')
  const table = page.getByRole('table', { name: 'Charges de la période affichée' })
  await expect(table.getByText('7,00 €')).toHaveCount(2)
  await expect(table).not.toContainText('Hetzner')
})
