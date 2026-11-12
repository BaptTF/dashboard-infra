import { LoaderCircle } from 'lucide-react'
import { cn } from '~/lib/utils'

/**
 * Local transition state only. When the fetch is idle we keep an empty, silent
 * live region: never announce "up to date" next to a failed or stale banner.
 */
export function UpdateIndicator({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'text-muted-foreground inline-flex items-center gap-1.5 text-xs',
        !active && 'sr-only',
        className,
      )}
    >
      {active ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Mise à jour…
        </>
      ) : null}
    </span>
  )
}
