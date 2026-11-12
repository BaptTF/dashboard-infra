import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
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
  // The clicked option looks active immediately; the URL update follows in the
  // same tick because loaders never block client-side prefetches. Once the URL
  // carries the new value the pending hint is ignored instead of reset in an effect.
  const activeValue = pending && pending.from === value ? pending.to : value

  function select(next: string) {
    if (next === value) return
    setPending({ from: value, to: next })
    void navigate({
      to: '.',
      search: { ...search, [param]: next },
      replace: false,
      resetScroll: false,
    }).catch(() => setPending(null))
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
              size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-xs',
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
