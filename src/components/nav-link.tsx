import { Link, useRouterState, useSearch } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { normalizeHistoryRange, normalizeQuotaWindow, normalizeSpendWindow } from '~/lib/dates'
import type { SpendSource } from '~/lib/spend-view'
import { cn } from '~/lib/utils'

const defaults = {
  '/': { window: 'monthly', history: '1m' },
  '/consommation': { window: '1m', source: 'all' },
} as const

function normalizeSource(value: unknown): SpendSource {
  return value === 'bifrost' || value === 'leo' || value === 'lea' ? value : 'all'
}

export function NavLink({
  to,
  children,
  className,
}: {
  to: '/' | '/consommation'
  children: ReactNode
  className?: string
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const active = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
  const linkClassName = cn(
    'relative inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
    active
      ? 'bg-secondary text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    className,
  )
  const content = (
    <>
      {children}
      {active ? (
        <span
          aria-hidden="true"
          className="bg-primary absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full"
        />
      ) : null}
    </>
  )

  if (to === '/') {
    const quotaSearch = {
      window: normalizeQuotaWindow(typeof search.window === 'string' ? search.window : undefined),
      history: normalizeHistoryRange(
        typeof search.history === 'string' ? search.history : undefined,
      ),
    }
    return (
      <Link
        to="/"
        // Re-clicking the active tab must not erase its filters.
        search={active ? quotaSearch : defaults['/']}
        aria-current={active ? 'page' : undefined}
        className={linkClassName}
      >
        {content}
      </Link>
    )
  }

  const spendSearch = {
    window: normalizeSpendWindow(typeof search.window === 'string' ? search.window : undefined),
    source: normalizeSource(search.source),
  }
  return (
    <Link
      to="/consommation"
      search={active ? spendSearch : defaults['/consommation']}
      aria-current={active ? 'page' : undefined}
      className={linkClassName}
    >
      {content}
    </Link>
  )
}
