import { describe, expect, it } from 'vitest'
import { barSpan, fillGaps, hasIsolatedPoint, seriesHasValue, stackBars } from '~/lib/chart-series'

describe('chart series holes and isolated points', () => {
  it('inserts nulls for missing scrape steps without bridging the gap', () => {
    const filled = fillGaps(
      [
        { x: 0, y: 0.2 },
        { x: 4000, y: 0.4 },
      ],
      1000,
    )
    expect(filled.map((point) => point.y)).toEqual([0.2, null, null, null, 0.4])
  })

  it('detects a single measure and points cut off by holes', () => {
    expect(hasIsolatedPoint([{ x: 0, y: 0.3 }], 1000)).toBe(true)
    expect(
      hasIsolatedPoint(
        [
          { x: 0, y: 0.3 },
          { x: 1000, y: 0.4 },
        ],
        1000,
      ),
    ).toBe(false)
    expect(
      hasIsolatedPoint(
        [
          { x: 0, y: 0.3 },
          { x: 5000, y: 0.4 },
        ],
        1000,
      ),
    ).toBe(true)
  })

  it('distinguishes a real value from an all-null series', () => {
    expect(seriesHasValue([{ x: 0, y: null }])).toBe(false)
    expect(seriesHasValue([{ x: 0, y: 0 }])).toBe(true)
  })
})

describe('stacked cost bars', () => {
  const hour = 3_600_000
  const day = 86_400_000

  it('gives a live hour its step and a backfill point its UTC day', () => {
    expect(barSpan(Date.UTC(2026, 10, 5, 10), hour)).toEqual({
      start: Date.UTC(2026, 10, 5, 10),
      end: Date.UTC(2026, 10, 5, 11),
    })
    const backfill = Date.UTC(2026, 10, 5, 23, 59)
    expect(barSpan(backfill, hour)).toEqual({
      start: Date.UTC(2026, 10, 5),
      end: Date.UTC(2026, 10, 6),
    })
    expect(barSpan(Date.UTC(2026, 10, 5), day).end - Date.UTC(2026, 10, 5)).toBe(day)
  })

  it('stacks parts that share a timestamp and drops a hidden series from the column', () => {
    const stacked = stackBars(
      [
        {
          name: 'bedrock',
          points: [
            { x: 0, y: 5 },
            { x: hour, y: 1 },
          ],
        },
        {
          name: 'opencode-go',
          points: [
            { x: 0, y: 2 },
            { x: hour, y: 4 },
          ],
        },
      ],
      new Set(['bedrock']),
      hour,
    )
    expect(stacked[0]?.points.map((point) => point.base)).toEqual([0, 0])
    expect(stacked[1]?.points).toEqual([
      { x: 0, y: 2, start: 0, end: hour, base: 0 },
      { x: hour, y: 4, start: hour, end: hour * 2, base: 0 },
    ])
    const shown = stackBars(
      [
        { name: 'bedrock', points: [{ x: 0, y: 5 }] },
        { name: 'opencode-go', points: [{ x: 0, y: 2 }] },
      ],
      new Set(),
      hour,
    )
    expect(shown[1]?.points[0]).toMatchObject({ y: 2, base: 5 })
  })
})
