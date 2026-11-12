import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

const isProduction = process.env.NODE_ENV === 'production'

const contentSecurityPolicy = [
  "default-src 'self'",
  isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  isProduction ? "connect-src 'self'" : "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export default createServerEntry({
  async fetch(request, options) {
    const response = await handler.fetch(request, options)
    const headers = new Headers(response.headers)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    )
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Resource-Policy', 'same-origin')
    headers.set('Content-Security-Policy', contentSecurityPolicy)
    if (isProduction) {
      headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
})
