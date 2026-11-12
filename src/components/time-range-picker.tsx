import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'

export interface TimeRangeOption {
  value: string
  label: string
  title?: string
}

export function TimeRangePicker({
  param,
  value,
  options,
  label,
  className,
  size = 'default',
}: {
  param: string
  value: string
  options: readonly TimeRangeOption[]
  label: string
  className?: string
  size?: 'default' | 'sm'
}) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const navigation = useRef(0)

  // The URL is the single source of truth. The pending hint only covers the
  // short navigation window; back/forward (popstate) cancels it immediately so
  // the visual state always matches the URL.
  useEffect(() => {
    const clearPending = () => setPending(null)
    window.addEventListener('popstate', clearPending)
    return () => window.removeEventListener('popstate', clearPending)
  }, [])

  const activeValue = pending && pending.from === value ? pending.to : value

  function select(next: string) {
    if (next === value) {
      setPending(null)
      return
    }
    const token = navigation.current + 1
    navigation.current = token
    setPending({ from: value, to: next })
    void navigate({
      to: '.',
      search: { ...search, [param]: next },
      replace: false,
      resetScroll: false,
    })
      .catch(() => undefined)
      .finally(() => {
        if (navigation.current === token) setPending(null)
      })
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={pending != null && pending.from === value}
      className={cn(
        'bg-muted/80 inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === activeValue
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={active}
            title={option.title}
            className={cn(
              'inline-flex items-center justify-center rounded-[5px] font-medium transition-colors',
              size === 'sm' ? 'h-9 px-2 text-[11px] sm:h-7' : 'h-9 px-2.5 text-xs sm:h-8',
              active
                ? 'bg-background text-foreground border-border border shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
