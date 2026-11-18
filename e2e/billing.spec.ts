import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('facturation shows the monthly price, the lifetime total, and every invoice', async ({
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

  const oneTime = page
    .getByText('Achats ponctuels', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(oneTime).toContainText('4,20')
  await expect(oneTime).not.toContainText('10,00')
  await expect(oneTime).not.toContainText('12,50')

  const lifetime = page
    .getByText('Depuis toujours', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded")]')
    .first()
  await expect(lifetime).toContainText('26,20')
  await expect(lifetime).toContainText('10,00')
  await expect(lifetime).not.toContainText('12,50')

  await expect(page.getByRole('table', { name: 'Totaux de chaque mois' })).toContainText('7,00')
  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText('Hetzner')
  await expect(page.getByRole('table', { name: 'Prix mensuels en cours' })).toContainText(
    'Estimation',
  )

  const punctual = page.getByRole('table', { name: 'Liste des achats ponctuels' })
  await expect(punctual).toContainText('Cloudflare')
  await expect(punctual).not.toContainText('Contabo')
  await expect(punctual).not.toContainText('OpenCode')
  await expect(punctual).not.toContainText('Hetzner')

  const invoices = page.getByRole('table', { name: 'Toutes les factures' })
  await expect(invoices).toContainText('Contabo')
  await expect(invoices).toContainText('Cloudflare')
  await expect(invoices.getByText('7,00 €')).toHaveCount(2)
  await expect(invoices).not.toContainText('Hetzner')
})
