import type { UseQueryResult } from '@tanstack/react-query'
import { CircleAlert, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from './empty-state'
import { StatusBanner } from './status-banner'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

export function QueryState<T>({
  query,
  skeleton,
  isEmpty = false,
  emptyTitle = 'Aucune donnée',
  emptyDescription,
  emptyAction,
  staleMessage,
  children,
  className,
  ariaLabel,
}: {
  query: UseQueryResult<T>
  skeleton?: ReactNode
  isEmpty?: boolean | ((data: T) => boolean)
  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  staleMessage?: string | null
  children: (data: T) => ReactNode
  className?: string
  ariaLabel?: string
}) {
  if (query.isPending && query.data === undefined) {
    return (
      <div
        className={className}
        aria-busy="true"
        aria-label={ariaLabel ?? 'Chargement des données'}
      >
        <span role="status" className="sr-only">
          {ariaLabel ?? 'Chargement des données'}
        </span>
        {skeleton}
      </div>
    )
  }

  if (query.isError && query.data === undefined) {
    return (
      <StatusBanner
        tone="danger"
        title="Impossible de charger les données"
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RotateCcw aria-hidden="true" />
            Réessayer
          </Button>
        }
      >
        <p>{query.error instanceof Error ? query.error.message : 'Erreur inattendue.'}</p>
        <p className="mt-1">Les paramètres de période et de filtre restent inchangés.</p>
      </StatusBanner>
    )
  }

  const data = query.data
  if (data === undefined) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    )
  }

  return (
    <div className={className} aria-busy={query.isFetching}>
      {query.isFetching ? (
        <span role="status" className="sr-only">
          Mise à jour des données en cours
        </span>
      ) : null}
      {query.isError ? (
        <StatusBanner
          tone="warning"
          title="Mise à jour impossible"
          className="mb-4"
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          }
        >
          <p>
            {query.error instanceof Error
              ? query.error.message
              : 'La dernière actualisation a échoué.'}{' '}
            Les dernières données reçues restent affichées.
          </p>
        </StatusBanner>
      ) : null}
      {staleMessage && !query.isError ? (
        <StatusBanner tone="warning" title="Données anciennes" className="mb-4">
          {staleMessage}
        </StatusBanner>
      ) : null}
      {(typeof isEmpty === 'function' ? isEmpty(data) : isEmpty) ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        children(data)
      )}
    </div>
  )
}

export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="bg-card rounded-lg border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-lg border p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-card rounded-lg border p-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-4 h-28 w-full" />
        </div>
        <div className="bg-card rounded-lg p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-28 w-full" />
        </div>
      </div>
    </div>
  )
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="border-danger/25 bg-danger/8 text-danger flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}
