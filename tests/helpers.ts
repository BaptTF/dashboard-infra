import type { MetricSample } from '~/lib/types'

export function sample(value: number, labels: Record<string, string> = {}): MetricSample {
  return { labels, value }
}

export function samples(
  values: Array<{ value: number; labels?: Record<string, string> }>,
): MetricSample[] {
  return values.map((entry) => ({ value: entry.value, labels: entry.labels ?? {} }))
}
