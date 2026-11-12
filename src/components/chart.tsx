import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import { ChartNoAxesCombined, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { fillGaps, hasIsolatedPoint, seriesHasValue } from '~/lib/chart-series'
import { formatParisDateTime, formatParisDay, formatParisDayTime } from '~/lib/dates'
import { formatCurrency, formatPercent, formatTokens } from '~/lib/format'
import { useTheme } from './theme-provider'
import { EmptyState } from './empty-state'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
  LegacyGridContainLabel,
])

export interface ChartSeries {
  name: string
  points: { x: number; y: number | null }[]
  color?: string
}

export interface ChartTable {
  columns: { label: string; align?: 'left' | 'right' }[]
  rows: ReactNode[][]
}

const fallbackPalette = ['#0f766e', '#2563eb', '#b45309', '#b91c1c', '#7e22ce', '#15803d']

function readColors() {
  if (typeof window === 'undefined') {
    return {
      palette: fallbackPalette,
      text: '#334155',
      muted: '#64748b',
      grid: '#e2e8f0',
      warning: '#b45309',
      background: '#ffffff',
    }
  }
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    palette: fallbackPalette.map((fallback, index) => read(`--chart-${index + 1}`, fallback)),
    text: read('--foreground', '#334155'),
    muted: read('--muted-foreground', '#64748b'),
    grid: read('--chart-grid', '#e2e8f0'),
    warning: read('--warning', '#b45309'),
    background: read('--card', '#ffffff'),
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatValue(value: number, unit: 'percent' | 'currency' | 'tokens'): string {
  if (unit === 'percent') return formatPercent(value)
  if (unit === 'currency') return formatCurrency(value)
  return formatTokens(value)
}

const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  month: 'short',
  year: '2-digit',
})

export function Chart({
  series,
  unit,
  ariaLabel,
  description,
  height = 320,
  stacked = false,
  area = false,
  thresholdLines,
  yMax,
  xLabelMode = 'day',
  table,
  stepSeconds,
  dataKey = 'default',
  emptyTitle = 'Aucun point à tracer',
  emptyDescription,
}: {
  series: ChartSeries[]
  unit: 'percent' | 'currency' | 'tokens'
  ariaLabel: string
  description?: string
  height?: number
  stacked?: boolean
  area?: boolean
  thresholdLines?: number[]
  yMax?: number
  xLabelMode?: 'day' | 'month' | 'time'
  table?: ChartTable
  /** Sampling step. Missing steps become null so real holes stay visible. */
  stepSeconds?: number
  /** Stable key of the displayed period. Zoom is kept within one key only. */
  dataKey?: string
  emptyTitle?: string
  emptyDescription?: ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null)
  const zoomState = useRef<{ key: string; start: number; end: number } | null>(null)
  const { resolvedTheme } = useTheme()
  const [reducedMotion, setReducedMotion] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const descriptionId = useId()
  const hasData = series.some((entry) => seriesHasValue(entry.points))
  const stepMs = stepSeconds != null ? stepSeconds * 1000 : undefined

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia('(max-width: 767px)')
    const updateMotion = () => setReducedMotion(motion.matches)
    const updateWidth = () => setNarrow(mobile.matches)
    updateMotion()
    updateWidth()
    motion.addEventListener('change', updateMotion)
    mobile.addEventListener('change', updateWidth)
    return () => {
      motion.removeEventListener('change', updateMotion)
      mobile.removeEventListener('change', updateWidth)
    }
  }, [])

  useEffect(() => {
    if (!hasData || !container.current) return
    const colors = readColors()
    const instance =
      chart.current ?? echarts.init(container.current, undefined, { renderer: 'canvas' })
    chart.current = instance
    const restore = zoomState.current?.key === dataKey ? zoomState.current : null

    const option = {
      animation: !reducedMotion,
      animationDuration: 400,
      color: colors.palette,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        decal: { show: false },
        label: { description: description ?? ariaLabel },
      },
      grid: {
        left: 6,
        // Keep the last timestamp label fully visible instead of clipping it.
        right: 32,
        top: series.length > 1 && !narrow ? 50 : 22,
        bottom: 54,
        containLabel: true,
      },
      legend: {
        // Canvas legend pagination is unusable on mobile; the accessible table
        // below the chart always carries the series names instead.
        show: series.length > 1 && !narrow,
        type: 'scroll',
        top: 0,
        left: 0,
        right: 0,
        itemWidth: 9,
        itemHeight: 9,
        icon: 'roundRect',
        textStyle: { color: colors.text, fontSize: 11 },
        pageTextStyle: { color: colors.muted, fontSize: 10 },
        pageIconColor: colors.muted,
        pageIconInactiveColor: colors.grid,
        formatter: (name: string) => (name.length > 36 ? `${name.slice(0, 35)}…` : name),
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        className: 'chart-tooltip',
        extraCssText:
          'max-height: min(60vh, 320px); overflow-y: auto; max-width: min(92vw, 420px);',
        backgroundColor: colors.background,
        borderColor: colors.grid,
        borderWidth: 1,
        axisPointer: {
          type: 'line',
          lineStyle: { color: colors.muted, width: 1, type: 'dashed' },
        },
        textStyle: { color: colors.text, fontSize: 11 },
        formatter: (params: unknown) => {
          // Keep the tooltip content in the theme text colour; the CSS class
          // provides radius, padding and shadow without fighting ECharts.

          if (!Array.isArray(params)) return ''
          const rows = params
            .filter(
              (
                entry,
              ): entry is {
                axisValue: number
                seriesName: string
                value: [number, number | null]
                color: string
              } => {
                if (typeof entry !== 'object' || entry === null) return false
                if (!('axisValue' in entry) || !('seriesName' in entry) || !('value' in entry)) {
                  return false
                }
                const value = (entry as { value?: unknown }).value
                return Array.isArray(value) && value[1] != null
              },
            )
            .map((entry) => {
              const point = Array.isArray(entry.value) ? entry.value : [0, null]
              return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:3px"><span style="display:inline-flex;align-items:center;gap:6px;min-width:0"><span style="width:7px;height:7px;border-radius:2px;background:${escapeHtml(entry.color)};flex:none"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">${escapeHtml(entry.seriesName)}</span></span><strong style="font-variant-numeric:tabular-nums">${escapeHtml(formatValue(Number(point[1] ?? 0), unit))}</strong></div>`
            })
            .join('')
          if (rows === '') return ''
          const first = params[0] as { axisValue?: number } | undefined
          return `<div><div style="color:${escapeHtml(colors.muted)};font-size:10px;margin-bottom:4px">${escapeHtml(formatParisDateTime(first?.axisValue ?? Date.now()))}</div>${rows}</div>`
        },
      },
      dataZoom: [
        { type: 'inside', throttle: 60 },
        {
          type: 'slider',
          height: 16,
          bottom: 4,
          borderColor: colors.grid,
          backgroundColor: 'transparent',
          fillerColor: `${colors.palette[0]}22`,
          handleStyle: { color: colors.palette[0], borderColor: colors.palette[0] },
          textStyle: { color: colors.muted, fontSize: 10 },
          brushSelect: false,
        },
      ],
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.grid } },
        axisTick: { show: false },
        axisLabel: {
          color: colors.muted,
          fontSize: 10,
          hideOverlap: true,
          showMaxLabel: true,
          margin: 8,
          formatter: (value: number) => {
            if (xLabelMode === 'month') return monthYearFormatter.format(new Date(value))
            if (xLabelMode === 'time') return formatParisDayTime(value)
            return formatParisDay(value)
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: colors.muted,
          fontSize: 10,
          formatter: (value: number) => formatValue(value, unit),
        },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      series: series.map((entry, index) => {
        const color = entry.color ?? colors.palette[index % colors.palette.length]
        const filled = fillGaps(entry.points, stepMs)
        // A singleton or a point cut off by holes has no line segment: draw its
        // symbol so real data never looks like an empty chart.
        const isolated = hasIsolatedPoint(filled, stepMs)
        return {
          type: 'line',
          name: entry.name,
          data: filled.map((point) => [point.x, point.y]),
          showSymbol: isolated,
          symbol: 'circle',
          symbolSize: 4,
          smooth: false,
          sampling: 'lttb',
          connectNulls: false,
          lineStyle: { width: 1.8, color },
          itemStyle: { color },
          areaStyle: area ? { opacity: stacked ? 0.16 : 0.08, color } : undefined,
          stack: stacked ? 'total' : undefined,
          emphasis: { focus: 'series' },
          markLine:
            index === 0 && thresholdLines && thresholdLines.length > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: colors.warning, type: 'dashed', width: 1 },
                  label: {
                    color: colors.muted,
                    fontSize: 10,
                    formatter: (params: { value: number }) => formatPercent(Number(params.value)),
                    position: 'insideEndTop',
                  },
                  data: thresholdLines.map((value) => ({ yAxis: value })),
                }
              : undefined,
        }
      }),
    }

    instance.setOption(option, { notMerge: true })
    if (restore) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: restore.start,
        end: restore.end,
      })
    } else {
      if (container.current) delete container.current.dataset.zoom
      zoomState.current = null
    }

    const onZoom = (event: unknown) => {
      if (typeof event !== 'object' || event === null) return
      const start = (event as { start?: unknown }).start
      const end = (event as { end?: unknown }).end
      if (typeof start !== 'number' || typeof end !== 'number') return
      zoomState.current = { key: dataKey, start, end }
      if (container.current) container.current.dataset.zoom = `${start},${end}`
    }
    instance.on('datazoom', onZoom)

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null
    if (observer && container.current) observer.observe(container.current)
    const onResize = () => instance.resize()
    window.addEventListener('resize', onResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
      instance.off('datazoom', onZoom)
    }
  }, [
    ariaLabel,
    area,
    dataKey,
    description,
    hasData,
    narrow,
    reducedMotion,
    resolvedTheme,
    series,
    stacked,
    stepMs,
    thresholdLines,
    unit,
    xLabelMode,
    yMax,
  ])

  useEffect(() => {
    return () => {
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  if (!hasData) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={ChartNoAxesCombined}
        className="min-h-56"
      />
    )
  }

  return (
    <div className="min-w-0">
      {description ? (
        <p id={descriptionId} className="sr-only">
          {description}
        </p>
      ) : null}
      <div
        ref={container}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={description ? descriptionId : undefined}
        data-data-key={dataKey}
        data-series-count={series.length}
      />
      {table ? (
        <details
          className="group mt-2"
          onToggle={(event) => setTableOpen(event.currentTarget.open)}
        >
          <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded text-xs font-medium focus-visible:ring-2 focus-visible:outline-none sm:min-h-6">
            <ChevronRight
              className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            {tableOpen ? 'Masquer les données' : 'Voir les données sous forme de tableau'}
          </summary>
          <div
            className="scroll-shadow mt-2 max-h-72 overflow-auto rounded-md border"
            role="region"
            aria-label={`Données du graphique — ${ariaLabel}`}
            tabIndex={0}
          >
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">{ariaLabel}</caption>
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  {table.columns.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={`text-muted-foreground border-b px-2.5 py-1.5 font-medium whitespace-nowrap ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`px-2.5 py-1.5 tabular-nums ${table.columns[cellIndex]?.align === 'right' ? 'text-right' : ''}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}
