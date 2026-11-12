import { StatusBanner } from './status-banner'

const labels: Record<string, string> = {
  quotaUsedRatio: 'quotas consommés',
  quotaResetTimestamp: 'dates de reset',
  quotaElapsedRatio: 'temps écoulé',
  quotaDryDays: 'jours à sec',
  quotaBudgetSeverity: 'niveaux de budget',
  subscriptionMonthlyCost: 'coûts mensuels',
  spend: 'dépenses hors forfait',
  spendLimit: 'limites de dépense',
  acuConsumed: 'consommation ACU',
  collectionSuccess: 'état de collecte',
  collectionPartial: 'collecte partielle',
  collectionLastSuccess: 'dernier succès de collecte',
  collectionDuration: 'durée de collecte',
  keyWeight: 'poids Bifrost',
  weightObservationSuccess: 'état de la collecte des poids',
  weightLastObservation: 'fraîcheur des poids',
}

export function PartialErrors({ errors }: { errors: Record<string, string> }) {
  const entries = Object.entries(errors)
  if (entries.length === 0) return null
  return (
    <StatusBanner
      tone="warning"
      title={`${entries.length} requête${entries.length > 1 ? 's' : ''} Prometheus en échec`}
    >
      <p>Les sections disponibles restent affichées.</p>
      <details className="mt-1">
        <summary className="hover:text-foreground inline-flex min-h-6 items-center font-medium">
          Détails techniques
        </summary>
        <ul className="mt-1 list-inside list-disc space-y-1">
          {entries.map(([key, message]) => (
            <li key={key}>
              <span className="font-medium">{labels[key] ?? key}</span> : {message}
            </li>
          ))}
        </ul>
      </details>
    </StatusBanner>
  )
}
