import { ArrowLeftRight, Gauge, Timer } from 'lucide-react'

export function SourceNotes() {
  return (
    <details className="bg-card rounded-lg border px-4 py-3">
      <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-6 items-center text-xs font-medium">
        Notes techniques · deux sources, deux horloges
      </summary>
      <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <Timer className="text-info size-3.5" aria-hidden="true" />
            Bifrost · compteurs
          </p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            <code className="font-mono text-[11px]">increase()</code> sur les compteurs{' '}
            <code className="font-mono text-[11px]">bifrost_*_total</code>. Un redémarrage du
            gateway coupe le cumul. Les clés{' '}
            <code className="font-mono text-[11px]">hermes-leo</code> et{' '}
            <code className="font-mono text-[11px]">hermes-lea</code> sont exclues.
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
            <code className="font-mono text-[11px]">lea</code>. Le cache reste hors de l’entrée. Les
            deux sources ne sont jamais additionnées.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
        <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Les tableaux Hermes ne sont jamais ajoutés au tableau Bifrost. Les lignes agent du rapport
        Bifrost sont masquées pour éviter un double affichage.
      </p>
    </details>
  )
}
