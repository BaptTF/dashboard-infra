import { ChevronRight } from 'lucide-react'
import { Fragment, useId, useState, type ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { cn } from '~/lib/utils'

export interface DataTableColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  className?: string
  headerClassName?: string
  cell: (row: T, depth: number) => ReactNode
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  getRowLabel,
  getSubRows,
  emptyLabel = 'Aucune ligne à afficher',
  className,
}: {
  caption: string
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  getRowLabel: (row: T) => string
  getSubRows?: (row: T) => T[]
  emptyLabel?: string
  className?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const captionId = useId()

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderRows(row: T, depth: number, ancestry: string[]): ReactNode {
    const id = getRowId(row)
    const children = getSubRows?.(row) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(id)
    const rowKey = ancestry.length > 0 ? `${ancestry.join('/')}/${id}` : id

    return (
      <Fragment key={rowKey}>
        <TableRow className={cn(depth > 0 && 'bg-muted/20')}>
          {columns.map((column, index) => (
            <TableCell
              key={column.key}
              className={cn(
                column.align === 'right' && 'text-right',
                index === 0 && 'min-w-40 sm:min-w-52',
                column.className,
              )}
            >
              {index === 0 ? (
                <div
                  className="flex items-center gap-1.5"
                  style={{ paddingLeft: `${depth * 16}px` }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Replier' : 'Déplier'} ${getRowLabel(row)}`}
                      className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring -ml-1 flex size-6 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <ChevronRight
                        className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <span className="size-6 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">{column.cell(row, depth)}</div>
                </div>
              ) : (
                column.cell(row, depth)
              )}
            </TableCell>
          ))}
        </TableRow>
        {hasChildren && isExpanded
          ? children.map((child) => renderRows(child, depth + 1, [...ancestry, id]))
          : null}
      </Fragment>
    )
  }

  return (
    <div className={className}>
      <p id={captionId} className="text-muted-foreground mb-1.5 text-xs">
        {caption}
      </p>
      <Table scrollLabel={`${caption} — tableau défilable`} labelledBy={captionId}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                scope="col"
                className={cn(column.align === 'right' && 'text-right', column.headerClassName)}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-20 text-center"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => renderRows(row, 0, []))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
