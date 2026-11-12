import { describe, expect, it } from 'vitest'
import { fillGaps, hasIsolatedPoint, seriesHasValue } from '~/lib/chart-series'

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
