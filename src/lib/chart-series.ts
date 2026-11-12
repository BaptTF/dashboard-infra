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
