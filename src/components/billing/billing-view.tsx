import {
  annualCharges,
  billingAccountLabel,
  billingChargeItemLabel,
  billingItemLabel,
  billingProviderLabel,
  billingQualityLabel,
  eurosEquivalent,
  oneTimeCharges,
  totalsByCurrency,
} from '~/lib/billing'
import { formatMoney } from '~/lib/format'
import type { BillingCharge, BillingMonthly, BillingQuality, BillingRate } from '~/lib/types'
import { DataTable, type DataTableColumn } from '../data-table'
import { Panel } from '../panel'
import { Badge } from '../ui/badge'

function qualityVariant(quality: BillingQuality): 'muted' | 'success' | 'warning' {
  if (quality === 'invoice') return 'success'
  if (quality === 'estimate') return 'warning'
  return 'muted'
}

function QualityBadge({ quality }: { quality: BillingQuality }) {
  return <Badge variant={qualityVariant(quality)}>{billingQualityLabel(quality)}</Badge>
}

function MoneyStack({ rows }: { rows: { currency: string; amount: number }[] }) {
  const totals = totalsByCurrency(rows)
  if (totals.length === 0) return <>—</>
  return (
    <span className="flex flex-col gap-0.5">
      {totals.map((total) => (
        <span key={total.currency}>{formatMoney(total.amount, total.currency)}</span>
      ))}
    </span>
  )
}

function euroHint(amount: number, currency: string, rates: BillingRate[]): string | null {
  if (currency === 'EUR') return null
  const euros = eurosEquivalent(amount, currency, rates)
  if (euros == null) return null
  return `≈ ${formatMoney(euros, 'EUR')}`
}

function lineLabel(provider: string, account: string, item: string): string {
  return `${billingProviderLabel(provider)} ${billingAccountLabel(provider, account)} ${billingChargeItemLabel(provider, item)}`
}

function SectionAmount({ rows }: { rows: { currency: string; amount: number }[] }) {
  return (
    <p className="tnum mb-4 text-2xl leading-none font-semibold tracking-tight">
      <MoneyStack rows={rows} />
    </p>
  )
}

const monthlyColumns = (rates: BillingRate[]): DataTableColumn<BillingMonthly>[] => [
  {
    key: 'provider',
    header: 'Fournisseur',
    cell: (row) => billingProviderLabel(row.provider),
  },
  {
    key: 'account',
    header: 'Compte',
    cell: (row) => billingAccountLabel(row.provider, row.account),
  },
  {
    key: 'item',
    header: 'Poste',
    cell: (row) => billingItemLabel(row.item),
  },
  {
    key: 'quality',
    header: 'Qualité',
    cell: (row) => <QualityBadge quality={row.quality} />,
  },
  {
    key: 'amount',
    header: 'Montant',
    align: 'right',
    cell: (row) => {
      const hint = euroHint(row.amount, row.currency, rates)
      return (
        <span className="block text-right tabular-nums">
          {formatMoney(row.amount, row.currency)}
          {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
        </span>
      )
    },
  },
]

const chargeColumns = (rates: BillingRate[]): DataTableColumn<BillingCharge>[] => [
  {
    key: 'provider',
    header: 'Fournisseur',
    cell: (row) => billingProviderLabel(row.provider),
  },
  {
    key: 'account',
    header: 'Compte',
    cell: (row) => billingAccountLabel(row.provider, row.account),
  },
  {
    key: 'item',
    header: 'Poste',
    cell: (row) =>
      row.resource !== row.item
        ? `${billingChargeItemLabel(row.provider, row.item)} · ${row.resource}`
        : billingChargeItemLabel(row.provider, row.item),
  },
  {
    key: 'period',
    header: 'Période',
    cell: (row) => (
      <span className="tabular-nums">
        {row.periodStart} → {row.periodEnd}
      </span>
    ),
  },
  {
    key: 'quality',
    header: 'Qualité',
    cell: (row) => <QualityBadge quality={row.quality} />,
  },
  {
    key: 'amount',
    header: 'Montant',
    align: 'right',
    cell: (row) => {
      const hint = euroHint(row.amount, row.currency, rates)
      return (
        <span className="block text-right tabular-nums">
          {formatMoney(row.amount, row.currency)}
          {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
        </span>
      )
    },
  },
]

export function BillingTables({
  charges,
  monthly,
  rates,
}: {
  charges: BillingCharge[]
  monthly: BillingMonthly[]
  rates: BillingRate[]
}) {
  const annual = annualCharges(charges)
  const oneTime = oneTimeCharges(charges, monthly)
  return (
    <div className="space-y-5">
      <Panel
        title="Par mois"
        description="Tarif en cours. Hetzner est le catalogue, pas une facture déjà payée."
      >
        <SectionAmount rows={monthly} />
        <DataTable
          caption="Prix mensuels en cours"
          columns={monthlyColumns(rates)}
          rows={monthly}
          getRowId={(row) =>
            [row.provider, row.account, row.item, row.resource, row.currency, row.quality].join(':')
          }
          getRowLabel={(row) => lineLabel(row.provider, row.account, row.item)}
          emptyLabel="Aucun prix en cours"
        />
      </Panel>
      <Panel
        title="Par an"
        description="DNS Cloudflare, une facture par an. Les années d'avant restent dans Factures."
      >
        <SectionAmount rows={annual} />
        <DataTable
          caption="Prix annuel en cours"
          columns={chargeColumns(rates)}
          rows={annual}
          getRowId={(row) =>
            [
              row.provider,
              row.account,
              row.item,
              row.resource,
              row.currency,
              row.quality,
              row.periodStart,
              row.periodEnd,
            ].join(':')
          }
          getRowLabel={(row) =>
            `${lineLabel(row.provider, row.account, row.item)} ${row.periodEnd}`
          }
          emptyLabel="Aucun prix annuel"
        />
      </Panel>
      <Panel
        title="Achats ponctuels"
        description="Factures hors tarif mensuel et hors DNS annuel. Le top-up Vercel est ici."
      >
        <SectionAmount rows={oneTime} />
        <DataTable
          caption="Liste des achats ponctuels"
          columns={chargeColumns(rates)}
          rows={oneTime}
          getRowId={(row) =>
            [
              row.provider,
              row.account,
              row.item,
              row.resource,
              row.currency,
              row.quality,
              row.periodStart,
              row.periodEnd,
            ].join(':')
          }
          getRowLabel={(row) =>
            `${lineLabel(row.provider, row.account, row.item)} ${row.periodEnd}`
          }
          emptyLabel="Aucun achat ponctuel"
        />
      </Panel>
      <Panel
        title="Factures"
        description="Toutes les factures. Le tarif en cours n'est pas ajouté."
      >
        <SectionAmount rows={charges} />
        <DataTable
          caption="Toutes les factures"
          columns={chargeColumns(rates)}
          rows={charges}
          getRowId={(row) =>
            [
              row.provider,
              row.account,
              row.item,
              row.resource,
              row.currency,
              row.quality,
              row.periodStart,
              row.periodEnd,
            ].join(':')
          }
          getRowLabel={(row) =>
            `${lineLabel(row.provider, row.account, row.item)} ${row.periodEnd}`
          }
          emptyLabel="Aucune facture"
        />
      </Panel>
    </div>
  )
}
