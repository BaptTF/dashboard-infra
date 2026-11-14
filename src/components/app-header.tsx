import { Link, useRouterState, useSearch } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { normalizeHistoryRange, normalizeQuotaWindow } from '~/lib/dates'
import { cn } from '~/lib/utils'
import { FreshnessBadge } from './freshness'
import { NavLink } from './nav-link'
import { RefreshControl } from './refresh-control'
import { ThemeToggle } from './theme-toggle'

export function AppHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const quotaSearch = {
    window: normalizeQuotaWindow(typeof search.window === 'string' ? search.window : undefined),
    history: normalizeHistoryRange(typeof search.history === 'string' ? search.history : undefined),
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:flex-nowrap">
        <Link
          to="/"
          search={pathname === '/' ? quotaSearch : { window: 'monthly', history: '1m' }}
          className={cn(
            'group focus-visible:ring-ring flex shrink-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          )}
        >
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md shadow-xs">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">Pilotage IA</span>
            <span className="text-muted-foreground mt-1 hidden text-[10px] tracking-wide uppercase sm:block">
              Abonnements & consommation
            </span>
          </span>
        </Link>

        <nav
          aria-label="Navigation principale"
          className="order-3 flex w-full items-center gap-1 sm:order-none sm:ml-4 sm:w-auto"
        >
          <NavLink to="/">Abonnements</NavLink>
          <NavLink to="/consommation">Consommation</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <FreshnessBadge compact />
          <RefreshControl compact />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
