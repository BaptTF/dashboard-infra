import { Coins, Database, Users, Zap } from 'lucide-react'
import { MetricCard } from '~/components/metric-card'
import {
  formatCurrency,
  formatDecimal,
  formatPercent,
  formatTokens,
  formatTokensExact,
  share,
} from '~/lib/format'
import { sumLeo, sumPeople } from '~/lib/spend'
import { includesAgent, includesBifrost, type SpendSource } from '~/lib/spend-view'
import type { SpendReport } from '~/lib/types'

export function SpendSummary({ report, source }: { report: SpendReport; source: SpendSource }) {
  const bifrost = sumPeople(report.people, 'bifrost')
  const leo = sumLeo(report.leo, report.leoOther)
  const lea = sumLeo(report.lea, report.leaOther)
  const cacheShare = share(bifrost.cacheRead, bifrost.tokensIn)
  const bifrostTokens = bifrost.tokensIn + bifrost.tokensOut
  const hasBifrostData =
    bifrost.cost !== 0 ||
    bifrost.tokensIn !== 0 ||
    bifrost.tokensOut !== 0 ||
    bifrost.cacheRead !== 0
  const hasLeoData =
    leo.costUsd !== 0 ||
    leo.sessions !== 0 ||
    leo.tokensIn !== 0 ||
    leo.tokensOut !== 0 ||
    leo.cacheRead !== 0 ||
    leo.cacheWrite !== 0
  const hasLeaData =
    lea.costUsd !== 0 ||
    lea.sessions !== 0 ||
    lea.tokensIn !== 0 ||
    lea.tokensOut !== 0 ||
    lea.cacheRead !== 0 ||
    lea.cacheWrite !== 0
  const showBifrost = includesBifrost(source) && hasBifrostData
  const showLeo = includesAgent(source, 'leo') && hasLeoData
  const showLea = includesAgent(source, 'lea') && hasLeaData
  const hermesCost = (showLeo ? leo.costUsd : 0) + (showLea ? lea.costUsd : 0)
  const hermesSessions = (showLeo ? leo.sessions : 0) + (showLea ? lea.sessions : 0)
  const hermesCache = share(
    (showLeo ? leo.cacheRead + leo.cacheWrite : 0) + (showLea ? lea.cacheRead + lea.cacheWrite : 0),
    (showLeo ? leo.tokensIn + leo.cacheRead + leo.cacheWrite : 0) +
      (showLea ? lea.tokensIn + lea.cacheRead + lea.cacheWrite : 0),
  )
  const showHermes = showLeo || showLea

  if (!showBifrost && !showHermes) return null

  return (
    <div className="grid grid-cols-2 items-stretch gap-2.5 sm:gap-3 xl:grid-cols-4">
      {showBifrost ? (
        <>
          <MetricCard
            label="Bifrost · coût"
            value={formatCurrency(bifrost.cost)}
            hint="Compteurs Bifrost, clés Hermes incluses"
            icon={Coins}
            tone="info"
            className="h-full p-3.5"
          />
          <MetricCard
            label="Bifrost · tokens"
            value={formatTokens(bifrostTokens)}
            valueTitle={`${formatTokensExact(bifrost.tokensIn)} entrée + ${formatTokensExact(bifrost.tokensOut)} sortie`}
            hint={`${formatTokens(bifrost.tokensIn)} entrée · ${formatTokens(bifrost.tokensOut)} sortie`}
            icon={Database}
            tone="neutral"
            className="h-full p-3.5"
          />
          <MetricCard
            label="Bifrost · cache lu"
            value={formatTokens(bifrost.cacheRead)}
            valueTitle={formatTokensExact(bifrost.cacheRead)}
            hint={`${formatPercent(cacheShare)} des tokens d’entrée`}
            icon={Zap}
            tone="success"
            className="h-full p-3.5"
          />
        </>
      ) : null}
      {showHermes ? (
        <MetricCard
          label={
            source === 'leo'
              ? 'Hermes Léo · coût'
              : source === 'lea'
                ? 'Hermes Léa · coût'
                : 'Hermes · coût'
          }
          value={formatCurrency(hermesCost)}
          hint={`${formatDecimal(hermesSessions)} sessions · cache ${formatPercent(hermesCache)} · vue non ajoutée`}
          icon={Users}
          tone="warning"
          className="h-full p-3.5"
        />
      ) : null}
    </div>
  )
}
