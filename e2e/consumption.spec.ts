import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('drills from person to provider and model, and keeps period/source in the URL', async ({
  page,
}) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await expect(page.getByRole('heading', { level: 1, name: 'Consommation' })).toBeVisible()
  await expect(page.getByText('Bifrost · coût')).toBeVisible()
  await expect(page.getByText('Bifrost · tokens')).toBeVisible()
  await expect(page.getByText('Bifrost · cache lu')).toBeVisible()
  await expect(page.getByText('Hermes · coût')).toBeVisible()
  // Only four useful summary cards: no separate entry/output cards.
  await expect(page.getByText('Bifrost · entrée', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Bifrost · sortie', { exact: true })).toHaveCount(0)

  const expandPerson = page.getByRole('button', { name: /tailscale-noe/ })
  await expandPerson.scrollIntoViewIfNeeded()
  await expandPerson.click()
  await expect(expandPerson).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('bedrock', { exact: true }).first()).toBeVisible()
  await page
    .getByRole('button', { name: /bedrock/ })
    .first()
    .click()
  await expect(page.getByText('anthropic/claude-sonnet-4.5', { exact: true }).first()).toBeVisible()

  await expect(page.getByText('compteur increase')).toHaveCount(0)
  await expect(page.getByText('fenêtre Hermes')).toHaveCount(0)

  const threeMonths = page.getByRole('button', { name: '3 mois', exact: true })
  await threeMonths.click()
  await expect(page).toHaveURL(/window=3m/)
  await expect(threeMonths).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Léo', exact: true }).click()
  await expect(page).toHaveURL(/source=leo/)
  await expect(page.getByRole('heading', { name: 'Hermes Léo · personnes Telegram' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Clés Bifrost/ })).toHaveCount(0)

  // One source filter drives cards, tables and the curve together.
  await expect(page.getByText('Bifrost · coût')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Courbe de coût Bifrost/ })).toHaveCount(0)
  await expect(page.getByText('Hermes Léo · coût')).toBeVisible()

  const url = page.url()
  await page.getByRole('button', { name: 'Actualiser les données' }).click()
  await expect(page).toHaveURL(url)
  await page.reload()
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('button', { name: '3 mois', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('shows Hermes keys as Bifrost keys and offers all-time', async ({ page }) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await expect(page.getByRole('heading', { name: /Clés Bifrost/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Déplier hermes-leo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Déplier hermes-lea' })).toBeVisible()

  const allTime = page.getByRole('button', { name: 'Depuis le début', exact: true })
  await allTime.scrollIntoViewIfNeeded()
  await allTime.click()
  await expect(page).toHaveURL(/window=all/)
  await expect(allTime).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: /Courbe de coût Bifrost/ })).toBeVisible()
  const description = page.getByText(/Points datables, backfill inclus/).first()
  await expect(description).toBeVisible()
  await expect(description).toContainText(/totaux identiques à la somme des points/)
  await expect(page.getByText(/Total courbe :/)).toBeVisible()
})

test('back and forward resynchronise period and source controls', async ({ page }) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  const oneMonth = page.getByRole('button', { name: 'Mois en cours', exact: true })
  const threeMonths = page.getByRole('button', { name: '3 mois', exact: true })
  const all = page.getByRole('button', { name: 'Tout', exact: true })
  const leo = page.getByRole('button', { name: 'Léo', exact: true })

  await threeMonths.click()
  await expect(threeMonths).toHaveAttribute('aria-pressed', 'true')
  await leo.click()
  await expect(leo).toHaveAttribute('aria-pressed', 'true')

  await page.goBack()
  await expect(page).toHaveURL(/source=all/)
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await expect(leo).toHaveAttribute('aria-pressed', 'false')

  await page.goBack()
  await expect(page).toHaveURL(/window=1m/)
  await expect(oneMonth).toHaveAttribute('aria-pressed', 'true')
  await expect(threeMonths).toHaveAttribute('aria-pressed', 'false')

  await page.goForward()
  await expect(threeMonths).toHaveAttribute('aria-pressed', 'true')
  await expect(oneMonth).toHaveAttribute('aria-pressed', 'false')
})

test('a slow filter change keeps previous data visible and announces the update', async ({
  page,
}) => {
  await gotoHydrated(page, '/consommation?window=1m&source=all')
  await expect(page.getByText('Bifrost · coût')).toBeVisible()

  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    // A superseded server-function request can already be handled by the time
    // the artificial delay ends; the test only needs the slow initial request.
    await route.continue().catch(() => undefined)
  })

  await page.getByRole('button', { name: '3 mois', exact: true }).click()
  await expect(page).toHaveURL(/window=3m/)
  await expect(page.getByRole('button', { name: '3 mois', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Mise à jour…')).toBeVisible()
  // keepPreviousData: the old cards stay on screen until the new payload lands.
  await expect(page.getByText('Bifrost · coût')).toBeVisible()
  await page.unroute('**/_serverFn/**')
})
