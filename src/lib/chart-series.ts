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

export interface BarHit {
  x: number
  parts: { name: string; y: number }[]
}

/**
 * The stack the pointer is on. A live hour can sit inside a backfill day:
 * the short rect wins only where the pointer is inside it, otherwise the
 * taller column wins. Nearest-sample snapping showed the hour for the whole day.
 */
export function barUnderPointer(
  series: { name: string; points: StackedBarPoint[] }[],
  hidden: ReadonlySet<string>,
  time: number,
  value: number,
): BarHit | null {
  const groups = new Map<
    number,
    {
      start: number
      end: number
      height: number
      parts: { name: string; y: number; base: number }[]
    }
  >()
  for (const entry of series) {
    if (hidden.has(entry.name)) continue
    for (const point of entry.points) {
      if (time < point.start || time >= point.end) continue
      const group = groups.get(point.x) ?? {
        start: point.start,
        end: point.end,
        height: 0,
        parts: [],
      }
      group.parts.push({ name: entry.name, y: point.y, base: point.base })
      group.height = Math.max(group.height, point.base + point.y)
      groups.set(point.x, group)
    }
  }
  if (groups.size === 0) return null
  const ranked = [...groups.entries()].sort((left, right) => {
    const leftSpan = left[1].end - left[1].start
    const rightSpan = right[1].end - right[1].start
    return leftSpan - rightSpan || right[1].height - left[1].height
  })
  const inside = ranked.find(([, group]) =>
    group.parts.some((part) => value >= part.base && value < part.base + part.y),
  )
  const chosen =
    inside ??
    ranked.reduce((tallest, group) => (group[1].height > tallest[1].height ? group : tallest))
  return {
    x: chosen[0],
    parts: chosen[1].parts.map((part) => ({ name: part.name, y: part.y })),
  }
}
