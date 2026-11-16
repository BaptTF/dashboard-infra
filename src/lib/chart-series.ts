export interface ChartPoint {
  x: number
  y: number | null
}

/**
 * Insert explicit nulls where a scrape step is missing. ECharts then draws a
 * real hole instead of joining two distant points with a straight line.
 */
export function fillGaps(points: ChartPoint[], stepMs: number | undefined): ChartPoint[] {
  if (!stepMs || stepMs <= 0 || points.length < 2) return points
  const result: ChartPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    result.push(point)
    const next = points[index + 1]
    if (!next) continue
    const gap = next.x - point.x
    if (gap <= stepMs * 1.5) continue
    for (let x = point.x + stepMs; x < next.x; x += stepMs) {
      result.push({ x, y: null })
    }
  }
  return result
}

/**
 * A point is isolated when it has no value-bearing neighbour at one sampling
 * step. Such points are invisible with `showSymbol: false`, so the chart shows
 * small symbols for that series while keeping `connectNulls: false`.
 */
export function hasIsolatedPoint(points: ChartPoint[], stepMs: number | undefined): boolean {
  const tolerance = stepMs != null && stepMs > 0 ? stepMs * 1.5 : Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    if (point.y == null) continue
    const previous = points[index - 1]
    const next = points[index + 1]
    const previousLinked =
      previous != null && previous.y != null && point.x - previous.x <= tolerance
    const nextLinked = next != null && next.y != null && next.x - point.x <= tolerance
    if (!previousLinked && !nextLinked) return true
  }
  return false
}

export function seriesHasValue(points: ChartPoint[]): boolean {
  return points.some((point) => point.y != null)
}

/** Backfill samples are labelled at 23:59 UTC of the consumed day. */
export const BACKFILL_DAY_OFFSET_MS = 86_340_000
export const DAY_MS = 86_400_000

/**
 * The bar covers the bucket that produced the point. A backfill point is a
 * whole UTC day. A live point starts at its timestamp and lasts one sampling step.
 */
export function barSpan(x: number, stepMs: number | undefined): { start: number; end: number } {
  const dayOffset = ((x % DAY_MS) + DAY_MS) % DAY_MS
  if (dayOffset === BACKFILL_DAY_OFFSET_MS) {
    const start = x - BACKFILL_DAY_OFFSET_MS
    return { start, end: start + DAY_MS }
  }
  const width = stepMs != null && stepMs > 0 ? stepMs : DAY_MS
  return { start: x, end: x + width }
}

export interface StackedBarPoint {
  x: number
  y: number
  start: number
  end: number
  base: number
}

/** Stacks positive points that share a timestamp. Hidden series stay listed and add nothing. */
export function stackBars(
  series: { name: string; points: ChartPoint[] }[],
  hidden: ReadonlySet<string>,
  stepMs: number | undefined,
): { name: string; points: StackedBarPoint[] }[] {
  const baseline = new Map<number, number>()
  return series.map((entry) => {
    const visible = !hidden.has(entry.name)
    const points: StackedBarPoint[] = []
    for (const point of entry.points) {
      if (point.y == null || !Number.isFinite(point.y) || point.y <= 0) continue
      const span = barSpan(point.x, stepMs)
      const base = visible ? (baseline.get(point.x) ?? 0) : 0
      points.push({ x: point.x, y: point.y, start: span.start, end: span.end, base })
      if (visible) baseline.set(point.x, base + point.y)
    }
    return { name: entry.name, points }
  })
}

/**
 * Axis domain that contains every visible bar. The sample timestamp sits at
 * one edge of its bucket, so scaling to the samples alone clips the first and
 * last columns. The Y max is the stacked column, not the tallest single part.
 */
export function barDomain(
  series: { name: string; points: StackedBarPoint[] }[],
  hidden: ReadonlySet<string>,
): { xMin: number; xMax: number; yMax: number } | null {
  let xMin = Infinity
  let xMax = -Infinity
  let yMax = 0
  let found = false
  for (const entry of series) {
    if (hidden.has(entry.name)) continue
    for (const point of entry.points) {
      found = true
      xMin = Math.min(xMin, point.start)
      xMax = Math.max(xMax, point.end)
      yMax = Math.max(yMax, point.base + point.y)
    }
  }
  if (!found || !(xMax > xMin)) return null
  return { xMin, xMax, yMax }
}
