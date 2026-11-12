import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { formatParisDateTime } from '~/lib/dates'
import { relativeSince } from '~/lib/format'
import { cn } from '~/lib/utils'

export interface FreshnessState {
  fetchedAt: string | null
  lastSuccessAt: number | null
  stale: boolean
  failed?: boolean
  partial?: boolean
  source: string | null
}

interface FreshnessContextValue {
  state: FreshnessState
  publish: (next: FreshnessState | null) => void
}

const EMPTY: FreshnessState = {
  fetchedAt: null,
  lastSuccessAt: null,
  stale: false,
  failed: false,
  partial: false,
  source: null,
}

const FreshnessContext = createContext<FreshnessContextValue | null>(null)

export function FreshnessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FreshnessState>(EMPTY)
  const publish = useCallback((next: FreshnessState | null) => {
    setState(next ?? EMPTY)
  }, [])
  const value = useMemo(() => ({ state, publish }), [state, publish])
  return <FreshnessContext.Provider value={value}>{children}</FreshnessContext.Provider>
}

export function usePublishFreshness(input: {
  fetchedAt: string | null | undefined
  lastSuccessAt: number | null | undefined
  stale: boolean | undefined
  failed?: boolean
  partial?: boolean
  source: string
}) {
  const context = useContext(FreshnessContext)
  const publish = context?.publish
  useEffect(() => {
    publish?.({
      fetchedAt: input.fetchedAt ?? null,
      lastSuccessAt: input.lastSuccessAt ?? null,
      stale: input.stale ?? false,
      failed: input.failed ?? false,
      partial: input.partial ?? false,
      source: input.source,
    })
    return () => publish?.(null)
  }, [
    publish,
    input.fetchedAt,
    input.lastSuccessAt,
    input.stale,
    input.failed,
    input.partial,
    input.source,
  ])
}

export function useFreshness() {
  return useContext(FreshnessContext)?.state ?? EMPTY
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function FreshnessBadge({
  state,
  compact = false,
  className,
}: {
  state?: FreshnessState
  compact?: boolean
  className?: string
}) {
  const context = useFreshness()
  const value = state ?? context
  const now = useNow()
  const hasResponse = value.fetchedAt != null
  const hasCollection = value.lastSuccessAt != null
  const failed = hasResponse && value.failed === true
  const partial = hasResponse && !failed && value.partial === true
  const neutral = !hasResponse || (!hasCollection && !failed && !partial && !value.stale)
  const tone = neutral
    ? 'neutral'
    : failed
      ? 'danger'
      : partial || value.stale
        ? 'warning'
        : 'success'
  const Icon = neutral ? CircleHelp : failed || partial || value.stale ? CircleAlert : CircleCheck
  const since = hasCollection ? relativeSince(value.lastSuccessAt!, now) : null
  const clockAhead = since === 'horloge source en avance'
  const unknownSince = 'aucun succès connu'
  const label = neutral
    ? 'Aucune collecte reçue'
    : failed
      ? `Collecte en échec · ${since ?? unknownSince}`
      : partial
        ? `Collecte partielle · ${since ?? unknownSince}`
        : value.stale
          ? `Collecte en retard · ${since ?? unknownSince}`
          : clockAhead
            ? 'Horloge source en avance'
            : `Collecte ${since}`

  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
        tone === 'success' && 'border-success/25 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
        tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'neutral' && 'border-border bg-muted/60 text-muted-foreground',
        className,
      )}
      title={
        hasCollection
          ? `Dernière collecte réussie : ${formatParisDateTime(value.lastSuccessAt)} · Réponse reçue : ${formatParisDateTime(value.fetchedAt)}`
          : hasResponse
            ? `Aucune collecte horodatée · Réponse reçue : ${formatParisDateTime(value.fetchedAt)}`
            : 'Aucune collecte reçue pour le moment'
      }
      aria-live="polite"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span suppressHydrationWarning className={compact ? 'sr-only sm:not-sr-only' : undefined}>
        {label}
      </span>
      {compact ? (
        <span suppressHydrationWarning className="sm:hidden">
          {neutral
            ? '—'
            : failed
              ? 'Échec'
              : partial
                ? 'Partiel'
                : value.stale
                  ? 'Retard'
                  : 'À jour'}
        </span>
      ) : null}
    </span>
  )
}
