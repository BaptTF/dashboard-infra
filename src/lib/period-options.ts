import type { SpendWindow } from './types'

/**
 * One calendar-period vocabulary for both dashboards. The labels are the same
 * on Consommation and Abonnements; only what is plotted changes.
 */
export const PERIOD_OPTIONS = [
  { value: '1m', label: 'Mois en cours' },
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
  {
    value: 'all',
    label: 'Depuis le début',
    title: 'Au maximum deux ans, depuis la première donnée',
  },
] as const satisfies readonly { value: SpendWindow; label: string; title?: string }[]
