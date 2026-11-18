import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('facturation shows the monthly price, the yearly price, one-time purchases, then every invoice', async ({
  page,
}) => {
  await gotoHydrated(page, '/facturation')
  await expect(page.getByRole('heading', { level: 1, name: 'Facturation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Facturation', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('group', { name: 'Période des charges' })).toHaveCount(0)

  const monthly = page
    .getByText('Par mois', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(monthly).toContainText('20,50')
  await expect(monthly).toContainText('10,00')

  const annual = page
    .getByText('Par an', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(annual).toContainText('4,20')
  await expect(annual).not.toContainText('20,50')

  const oneTime = page
    .getByText('Achats ponctuels', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(oneTime).not.toContainText('4,20')
  await expect(oneTime).not.toContainText('10,00')
  await expect(oneTime).not.toContainText('12,50')

  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Par mois',
    'Par an',
    'Achats ponctuels',
    'Factures',
  ])

  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText('Hetzner')
  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText(
    'Estimation',
  )

  const yearly = page.getByRole('table', { name: 'Prix annuel en cours' })
  await expect(yearly).toContainText('Cloudflare')
  await expect(yearly).toContainText('DNS')
  await expect(yearly).not.toContainText('Contabo')

  const punctual = page.getByRole('table', { name: 'Liste des achats ponctuels' })
  await expect(punctual).not.toContainText('Cloudflare')
  await expect(punctual).not.toContainText('Contabo')
  await expect(punctual).not.toContainText('OpenCode')
  await expect(punctual).not.toContainText('Hetzner')

  const invoices = page
    .getByRole('heading', { level: 2, name: 'Factures' })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(invoices).toContainText('26,20')
  await expect(invoices).toContainText('10,00')
  await expect(invoices).not.toContainText('12,50')
  await expect(invoices).toContainText('Contabo')
  await expect(invoices).toContainText('Cloudflare')
  await expect(invoices).toContainText('DNS')
  await expect(invoices.getByText('7,00 €')).toHaveCount(2)
  await expect(invoices).not.toContainText('Hetzner')
})
