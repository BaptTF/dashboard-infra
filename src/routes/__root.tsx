import type { QueryClient } from '@tanstack/react-query'
import '~/styles.css'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { CircleAlert, Compass, Home } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { AppHeader } from '~/components/app-header'
import { FreshnessProvider } from '~/components/freshness'
import { ThemeProvider } from '~/components/theme-provider'
import { Button } from '~/components/ui/button'
import { TooltipProvider } from '~/components/ui/tooltip'

const themeScript = `(function(){try{var t=localStorage.getItem('dashboard-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => ({
    meta: [
      {
        title: matches.some((candidate) => candidate.status === 'notFound')
          ? 'Page introuvable — Pilotage IA'
          : 'Pilotage IA',
      },
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      { name: 'robots', content: 'noindex, nofollow' },
      {
        name: 'description',
        content:
          'Tableau de bord des abonnements IA et de la consommation Bifrost et Hermes, alimenté par Prometheus.',
      },
    ],
    links: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  }),
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbfcfd" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171b22" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <a
          href="#contenu"
          className="skip-link"
          onClick={(event) => {
            const target = document.getElementById('contenu')
            if (!target) return
            // Keep focus deterministic even when the browser is busy hydrating.
            event.preventDefault()
            target.focus()
            target.scrollIntoView({ block: 'start' })
            history.replaceState(null, '', '#contenu')
          }}
        >
          Aller au contenu
        </a>
        {children}
        <HydrationMarker />
        <Scripts />
      </body>
    </html>
  )
}

function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])
  return null
}

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <FreshnessProvider>
          <TooltipProvider delayDuration={250}>
            <div className="flex min-h-dvh flex-col">
              <AppHeader />
              <div className="flex-1">
                <Outlet />
              </div>
              <footer className="text-muted-foreground border-t px-4 py-4 text-[11px] sm:px-6">
                <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2">
                  <p>Prometheus en lecture seule · heures Europe/Paris</p>
                  <p className="tnum">Pilotage IA · dashboard-infra</p>
                </div>
              </footer>
            </div>
          </TooltipProvider>
        </FreshnessProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Erreur inattendue'
  return (
    <RootDocument>
      <ThemeProvider>
        <div className="flex min-h-dvh items-center justify-center p-6">
          <div className="bg-card w-full max-w-lg rounded-lg border p-6 shadow-sm">
            <span className="bg-danger/10 text-danger mb-4 flex size-10 items-center justify-center rounded-full">
              <CircleAlert className="size-5" aria-hidden="true" />
            </span>
            <h1 className="text-lg font-semibold">Une erreur est survenue</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              La page n’a pas pu être rendue. Les données Prometheus restent en lecture seule.
            </p>
            <pre className="bg-muted text-muted-foreground mt-4 max-h-32 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {message}
            </pre>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => window.location.reload()}>Recharger</Button>
              <Button variant="outline" onClick={() => window.location.assign('/')}>
                <Home aria-hidden="true" />
                Accueil
              </Button>
            </div>
          </div>
        </div>
      </ThemeProvider>
    </RootDocument>
  )
}

function NotFound() {
  useEffect(() => {
    document.title = 'Page introuvable — Pilotage IA'
  }, [])

  return (
    <main
      id="contenu"
      tabIndex={-1}
      className="focus-visible:ring-ring mx-auto max-w-xl scroll-mt-20 px-6 py-20 text-center focus-visible:ring-2 focus-visible:outline-none"
    >
      <Compass className="text-muted-foreground mx-auto size-8" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Cette adresse ne correspond à aucune vue du tableau de bord.
      </p>
      <Link
        to="/"
        search={{ window: 'monthly', history: '30d' }}
        className="bg-primary text-primary-foreground focus-visible:ring-ring mt-6 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Revenir aux abonnements
      </Link>
    </main>
  )
}
