import {
  Bot,
  Boxes,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  KeyRound,
  MousePointer2,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { QuotaBar } from '~/components/quota-bar'
import { Badge } from '~/components/ui/badge'
import { countdown, formatParisDateTime, quotaWindowLabel } from '~/lib/dates'
import {
  formatCurrency,
  formatDecimal,
  formatNumber,
  formatWeight,
  relativeSince,
  quotaLabel,
} from '~/lib/format'
import {
  collectionLevel,
  subscriptionJoinKey,
  type ProviderGroup,
  type ProviderSubscription,
  type ProviderSlug,
} from '~/lib/providers'
import type { CollectionStatus, Severity, SubscriptionsOverview } from '~/lib/types'

const providerIcons: Record<ProviderSlug, LucideIcon> = {
  opencode: Terminal,
  cursor: MousePointer2,
  devin: Bot,
  other: Boxes,
}

function collectionBadge(collection: CollectionStatus | null) {
  switch (collectionLevel(collection)) {
    case 'failure':
      return { label: 'Collecte en échec', tone: 'danger' as const, Icon: CircleAlert }
    case 'partial':
      return { label: 'Collecte partielle', tone: 'warning' as const, Icon: CircleAlert }
    case 'stale':
      return { label: 'Données anciennes', tone: 'warning' as const, Icon: Clock3 }
    case 'ok':
      return { label: 'Collecte à jour', tone: 'success' as const, Icon: CircleCheck }
    default:
      return { label: 'Statut inconnu', tone: 'muted' as const, Icon: CircleHelp }
  }
}

function collectionDetail(collection: CollectionStatus | null): string {
  if (!collection) return 'Aucun indicateur de collecte pour cet abonnement.'
  const level = collectionLevel(collection)
  const lastSuccess =
    collection.lastSuccessAt != null
      ? `dernier succès ${relativeSince(collection.lastSuccessAt * 1000)}`
      : 'aucun succès connu'
  if (level === 'failure') return `Dernier essai en échec · ${lastSuccess}`
  if (level === 'partial') return `Collecte partielle · ${lastSuccess}`
  if (level === 'stale' || level === 'ok') {
    return collection.lastSuccessAt != null
      ? `Dernier succès ${relativeSince(collection.lastSuccessAt * 1000)}`
      : 'Aucun succès connu'
  }
  return 'Collecte sans indicateur exploitable.'
}

function providerQuotaHint(slug: ProviderSlug): string {
  if (slug === 'opencode') {
    return 'Repères : 80 % / 95 % (mensuel, hebdo) · 70 % / 90 % (glissant 5 h).'
  }
  if (slug === 'cursor' || slug === 'devin') {
    return 'Repères : 70 % / 90 % (niveau absolu) · temps écoulé et jours à sec informatifs.'
  }
  return 'Repères : 80 % / 95 %.'
}

function spendSeverity(ratio: number | null): Severity | null {
  if (ratio == null) return null
  if (ratio >= 0.95) return 2
  if (ratio >= 0.8) return 1
  return 0
}

function coreSubscription(subscription: ProviderSubscription): boolean {
  const hasData =
    subscription.quotas.length > 0 ||
    subscription.spendBuckets.length > 0 ||
    subscription.acu.length > 0 ||
    subscription.acuCycle != null ||
    subscription.monthlyCostUsd != null
  if (hasData) return true
  // A provider-level collection entry has no subscription label. The provider
  // header already shows that aggregate; do not create an empty phantom card.
  return subscription.collection != null && subscription.subscription !== 'Abonnement inconnu'
}

function SubscriptionCard({
  subscription,
  weightStale,
}: {
  subscription: ProviderSubscription
  weightStale: boolean
}) {
  const status = collectionBadge(subscription.collection)
  const StatusIcon = status.Icon
  const totalAcu = subscription.acu.find((acu) => acu.product === 'all')
  const otherAcu = subscription.acu.filter((acu) => acu.product !== 'all')

  return (
    <div
      className="bg-surface-raised/40 min-w-0 rounded-md border p-3.5"
      data-subscription={subscription.subscription}
      data-collection={collectionLevel(subscription.collection)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold break-words">{subscription.subscription}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {subscription.provider}
            {subscription.quotas.length > 0
              ? ` · ${subscription.quotas.length} fenêtre${subscription.quotas.length > 1 ? 's' : ''}`
              : ''}
          </p>
        </div>
        {subscription.monthlyCostUsd != null ? (
          <Badge variant="outline" className="tnum">
            {formatCurrency(subscription.monthlyCostUsd)} / mois
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={status.tone} title={collectionDetail(subscription.collection)}>
          <StatusIcon aria-hidden="true" />
          {status.label}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {collectionDetail(subscription.collection)}
        </span>
      </div>

      {subscription.quotas.length > 0 ? (
        <div className="mt-3 space-y-4">
          {subscription.quotas.map((quota) => (
            <QuotaBar
              key={`${quota.window}-${quota.quota}-${quota.resetAt ?? 'none'}`}
              label={`${quotaWindowLabel(quota.window)} · ${quotaLabel(quota.quota)}`}
              window={quota.window}
              usedRatio={quota.usedRatio}
              elapsedRatio={quota.elapsedRatio}
              severity={quota.severity}
              dryDays={quota.dryDays}
              resetAt={quota.resetAt}
              provider={subscription.provider}
            />
          ))}
        </div>
      ) : null}

      {subscription.spendBuckets.length > 0 ? (
        <div className="mt-4 space-y-3 border-t pt-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Dépenses et limites
          </p>
          {subscription.spendBuckets.map((bucket) => (
            <QuotaBar
              key={bucket.bucket}
              label={quotaLabel(bucket.bucket)}
              window="monthly"
              usedRatio={bucket.usedRatio}
              elapsedRatio={null}
              severity={spendSeverity(bucket.usedRatio)}
              dryDays={null}
              resetAt={null}
              hint={`${formatCurrency(bucket.spendUsd)} dépensés${bucket.limitUsd != null ? ` sur ${formatCurrency(bucket.limitUsd)}` : ' — limite inconnue'}`}
              provider={subscription.provider}
              thresholds={{ warn: 0.8, critical: 0.95 }}
            />
          ))}
        </div>
      ) : null}

      {subscription.acu.length > 0 || subscription.acuCycle ? (
        <div className="mt-4 border-t pt-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Consommation ACU
          </p>
          {totalAcu ? (
            <p className="tnum mt-1.5 text-sm font-semibold">
              {formatDecimal(totalAcu.consumed)} ACU au total
            </p>
          ) : (
            <p className="text-muted-foreground mt-1.5 text-xs">Total ACU non publié.</p>
          )}
          {subscription.acuCycle ? (
            <div className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
              <p suppressHydrationWarning>
                Cycle ACU :{' '}
                {subscription.acuCycle.startAt != null
                  ? formatParisDateTime(subscription.acuCycle.startAt * 1000)
                  : 'début inconnu'}{' '}
                →{' '}
                {subscription.acuCycle.resetAt != null
                  ? formatParisDateTime(subscription.acuCycle.resetAt * 1000)
                  : 'reset inconnu'}
              </p>
              {subscription.acuCycle.resetAt != null ? (
                <p suppressHydrationWarning className="text-foreground font-medium">
                  Reset ACU {countdown(subscription.acuCycle.resetAt)}
                </p>
              ) : null}
            </div>
          ) : null}
          {otherAcu.length > 0 ? (
            <details className="mt-2">
              <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-6 items-center text-xs font-medium">
                Détail par produit
              </summary>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {otherAcu.map((acu) => (
                  <li key={acu.product} className="flex justify-between gap-2">
                    <span>{acu.product}</span>
                    <span className="tnum text-foreground">{formatNumber(acu.consumed)} ACU</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {subscription.weights.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <KeyRound className="text-muted-foreground size-3.5" aria-hidden="true" />
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Clés OpenCode · poids
            </p>
            {weightStale ? <Badge variant="warning">Dernier connu</Badge> : null}
          </div>
          <ul className="mt-2 space-y-1.5">
            {subscription.weights.map((weight) => (
              <li
                key={`${weight.provider}-${weight.key}`}
                className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-xs"
              >
                <span className="min-w-0 font-mono text-[11px] break-all">{weight.key}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="tnum font-semibold">{formatWeight(weight.weight)}</span>
                  {weight.weight === 0 ? <Badge variant="muted">zéro</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {subscription.quotas.length === 0 &&
      subscription.spendBuckets.length === 0 &&
      subscription.acu.length === 0 &&
      subscription.weights.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">Aucune métrique pour cet abonnement.</p>
      ) : null}
    </div>
  )
}

function weightFreshnessLine(overview: SubscriptionsOverview): string {
  if (overview.weights.length === 0) {
    return 'Aucun poids Bifrost reçu par la collecte des poids.'
  }
  const status = overview.weightStatus
  const observed =
    status.lastObservationAt != null
      ? `observation ${relativeSince(status.lastObservationAt * 1000)}`
      : 'observation non horodatée'
  if (status.success === false) return `Poids : dernier connu, lecture en échec · ${observed}`
  if (status.stale) return `Poids : dernier connu · ${observed}`
  if (status.success === true) return `Poids : à jour · ${observed}`
  return 'Poids : fraîcheur inconnue.'
}

export function ProviderCard({
  group,
  overview,
  className,
}: {
  group: ProviderGroup
  overview: SubscriptionsOverview
  className?: string
}) {
  const Icon = providerIcons[group.slug]
  const status = collectionBadge(group.collection)
  const StatusIcon = status.Icon
  const weightStale = overview.weights.length > 0 && overview.weightStatus.stale
  const visibleSubscriptions = group.subscriptions.filter(coreSubscription)
  const detachedWeights =
    group.slug === 'opencode'
      ? group.weights.filter(
          (weight) =>
            !visibleSubscriptions.some(
              (subscription) =>
                subscriptionJoinKey(subscription.provider, subscription.subscription) ===
                subscriptionJoinKey(weight.provider, weight.subscription),
            ),
        )
      : []

  return (
    <Panel
      title={
        <span className="flex items-center gap-2.5">
          <span
            className="dark:text-background flex size-7 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: group.meta.accent }}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span>
            {group.meta.name}
            {group.rawProviders.length > 0 ? (
              <span className="text-muted-foreground ml-2 font-mono text-[10px] font-normal">
                {' · '}
                {group.rawProviders.join(' · ')}
              </span>
            ) : null}
          </span>
        </span>
      }
      description={group.meta.description}
      actions={
        <Badge variant={status.tone}>
          <StatusIcon aria-hidden="true" />
          {status.label}
        </Badge>
      }
      contentClassName="space-y-3"
      className={className}
    >
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{collectionDetail(group.collection)}</span>
        {visibleSubscriptions.length > 0 ? (
          <span className="ml-auto">
            {visibleSubscriptions.length} abonnement{visibleSubscriptions.length > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {visibleSubscriptions.some((subscription) => subscription.quotas.length > 0) ? (
        <p className="text-muted-foreground text-xs">{providerQuotaHint(group.slug)}</p>
      ) : null}
      {group.slug === 'opencode' ? (
        <p className="text-muted-foreground text-xs">{weightFreshnessLine(overview)}</p>
      ) : null}

      {visibleSubscriptions.length > 0 ? (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] items-start gap-3">
          {visibleSubscriptions.map((subscription) => (
            <SubscriptionCard
              key={`${subscription.provider}-${subscription.subscription}`}
              subscription={subscription}
              weightStale={weightStale}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucun abonnement"
          description={`Aucune série de quota, coût ou poids pour ${group.meta.name}.`}
          className="py-6"
        />
      )}

      {detachedWeights.length > 0 ? (
        <details className="rounded-md border px-3 py-2">
          <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-6 items-center text-xs font-medium">
            {detachedWeights.length} clé{detachedWeights.length > 1 ? 's' : ''} de poids sans
            abonnement
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {detachedWeights.map((weight) => (
              <li
                key={`${weight.provider}-${weight.subscription}-${weight.key}`}
                className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1"
              >
                <span className="min-w-0 font-mono text-[11px] break-all">
                  {weight.key}
                  <span className="text-muted-foreground block font-sans">
                    {weight.provider} · {weight.subscription}
                  </span>
                </span>
                <span className="tnum shrink-0 font-semibold">{formatWeight(weight.weight)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {group.spendBuckets.length > 0 &&
      !visibleSubscriptions.some((subscription) => subscription.spendBuckets.length > 0) ? (
        <div className="space-y-3 border-t pt-3">
          {group.spendBuckets.map((bucket) => (
            <QuotaBar
              key={`${bucket.subscription}-${bucket.bucket}`}
              label={`${bucket.subscription} · ${quotaLabel(bucket.bucket)}`}
              window="monthly"
              usedRatio={bucket.usedRatio}
              elapsedRatio={null}
              severity={spendSeverity(bucket.usedRatio)}
              dryDays={null}
              resetAt={null}
              hint={`${formatCurrency(bucket.spendUsd)} dépensés${bucket.limitUsd != null ? ` sur ${formatCurrency(bucket.limitUsd)}` : ''}`}
              thresholds={{ warn: 0.8, critical: 0.95 }}
            />
          ))}
        </div>
      ) : null}

      {group.acu.length > 0 &&
      !visibleSubscriptions.some((subscription) => subscription.acu.length > 0) ? (
        <div className="flex flex-wrap gap-1.5 border-t pt-3">
          {group.acu.map((acu) => (
            <Badge key={`${acu.subscription}-${acu.product}`} variant="secondary">
              {acu.subscription} · {formatNumber(acu.consumed)} ACU · {acu.product}
            </Badge>
          ))}
        </div>
      ) : null}
    </Panel>
  )
}
