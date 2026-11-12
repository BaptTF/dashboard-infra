import type { Page } from '@playwright/test'

export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true')
}
