import { ArrowLeftRight, Gauge, Timer } from 'lucide-react'

export function SourceNotes() {
  return (
    <details className="bg-card rounded-lg border px-4 py-3">
      <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-xs font-medium sm:min-h-6">
        Notes techniques · deux sources, deux horloges
      </summary>
      <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <Timer className="text-info size-3.5" aria-hidden="true" />
            Bifrost · compteurs
          </p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Coût reconstruit depuis le compteur cumulatif brut{' '}
            <code className="font-mono text-[11px]">bifrost_cost_total</code>, avec baseline avant
            la période et redémarrages traités. Les tokens et le cache utilisent{' '}
            <code className="font-mono text-[11px]">increase()</code>. Toutes les clés sont
            incluses, y compris <code className="font-mono text-[11px]">hermes-leo</code> et{' '}
            <code className="font-mono text-[11px]">hermes-lea</code>. Le backfill est journalier ;
            le live garde la granularité de la période.
          </p>
        </div>
        <div>
          <p className="flex items-center gap-2 font-medium">
            <Gauge className="text-warning size-3.5" aria-hidden="true" />
            Hermes · fenêtres
          </p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Valeur courante des jauges{' '}
            <code className="font-mono text-[11px]">hermes_window_*</code> pour{' '}
            <code className="font-mono text-[11px]">leo</code> et{' '}
            <code className="font-mono text-[11px]">lea</code>. Le cache reste hors de l’entrée.
            C’est une vue par personne, distincte des compteurs Bifrost : les noms de modèles et le
            périmètre des sessions peuvent différer. Écart connu : certaines jauges Hermes ne voient
            pas tous les modèles Bifrost (par exemple{' '}
            <code className="font-mono text-[11px]">claude-opus-5-5</code>) ; le compteur Bifrost
            reste la référence.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
        <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Les tableaux Hermes ne sont jamais ajoutés au tableau Bifrost : ils détaillent la
        consommation par personne, mais peuvent différer des compteurs Bifrost et ne servent pas de
        second total.
      </p>
    </details>
  )
}
