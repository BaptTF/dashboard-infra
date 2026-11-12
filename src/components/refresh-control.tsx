import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export function RefreshControl({
  queryKey,
  className,
  compact = false,
}: {
  queryKey?: readonly unknown[]
  className?: string
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const isFetching = useIsFetching(queryKey ? { queryKey } : undefined)
  const [announcement, setAnnouncement] = useState('')

  async function refresh() {
    setAnnouncement('Actualisation en cours')
    await queryClient.invalidateQueries(queryKey ? { queryKey } : undefined)
    // Never claim success here: the query state itself reports a failed refetch.
    setAnnouncement('Actualisation terminée')
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        onClick={refresh}
        disabled={isFetching > 0}
        aria-label="Actualiser les données"
        title="Actualiser les données"
      >
        <RefreshCw className={cn(isFetching > 0 && 'animate-spin')} aria-hidden="true" />
        {compact ? null : <span>Actualiser</span>}
      </Button>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
