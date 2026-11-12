import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react'
import { cn } from '~/lib/utils'

export function Table({
  className,
  scrollLabel,
  labelledBy,
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  /** Unique name for the scrollable region; several tables must not share it. */
  scrollLabel?: string
  labelledBy?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const update = () => setOverflowing(scroll.scrollWidth > scroll.clientWidth + 1)
    queueMicrotask(update)

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => update()) : null
    resizeObserver?.observe(scroll)
    if (tableRef.current) resizeObserver?.observe(tableRef.current)

    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(() => update()) : null
    mutationObserver?.observe(scroll, { childList: true, subtree: true, characterData: true })

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [])

  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        className="scroll-shadow overflow-x-auto"
        role="region"
        aria-label={scrollLabel ?? 'Tableau défilable horizontalement'}
        tabIndex={0}
      >
        <table
          ref={tableRef}
          className={cn('w-full caption-bottom text-sm', className)}
          aria-labelledby={labelledBy}
          {...props}
        >
          {children}
        </table>
      </div>
      {overflowing ? (
        <p className="text-muted-foreground mt-1 text-xs md:hidden">Défilement horizontal…</p>
      ) : null}
    </div>
  )
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn('bg-muted/40 border-t font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-border/80 hover:bg-muted/35 border-b transition-colors', className)}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'text-muted-foreground h-9 px-2.5 text-left align-middle text-[11px] font-medium tracking-wide whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-2.5 py-2.5 align-middle', className)} {...props} />
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('text-muted-foreground mt-3 text-xs', className)} {...props} />
}
