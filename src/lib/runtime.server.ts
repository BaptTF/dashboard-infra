const startedAt = Date.now()

export const SERVICE_NAME = 'dashboard-infra'

export function appVersion(): string {
  return process.env.APP_VERSION?.trim() || process.env.npm_package_version?.trim() || 'dev'
}

export function uptimeSeconds(): number {
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
}
