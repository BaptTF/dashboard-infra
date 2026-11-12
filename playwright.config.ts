import { defineConfig, devices } from '@playwright/test'

const nominalPort = 3100
const emptyPort = 3101
const downPort = 3102

const server = (port: number, mockPort: number, scenario: string) =>
  `PORT=${port} MOCK_PORT=${mockPort} PROMETHEUS_URL=http://127.0.0.1:${mockPort} MOCK_SCENARIO=${scenario} npm run dev:mock`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${nominalPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: server(nominalPort, 9190, 'nominal'),
      url: `http://127.0.0.1:${nominalPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NODE_ENV: 'development' },
    },
    {
      command: server(emptyPort, 9191, 'empty'),
      url: `http://127.0.0.1:${emptyPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NODE_ENV: 'development' },
    },
    {
      command: `PORT=${downPort} PROMETHEUS_URL=http://127.0.0.1:9 npm run dev`,
      url: `http://127.0.0.1:${downPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NODE_ENV: 'development' },
    },
  ],
})
