import { lazy, Suspense, useEffect, useState } from 'react'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { GameScreen } from '@/screens/GameScreen'
import { Home } from '@/screens/Home'
import { Lobby } from '@/screens/Lobby'
import { DebugPanel } from '@/screens/DebugPanel'
import { useGameStore } from '@/gameStore'

// Wiki is public reference content and pulls in the Markdown renderer.
// Lazy-load it so normal game screens keep the smaller bundle.
const Wiki = lazy(async () => {
  const module = await import('@/screens/Wiki')
  return { default: module.Wiki }
})

// Admin diagnostics (?debug or #debug) render standalone, without waiting
// for session restore — the point is debugging broken clients.
function isDebugMode() {
  return (
    new URLSearchParams(window.location.search).has('debug') ||
    window.location.hash === '#debug'
  )
}

// Public wiki — standalone and session-free, like debug diagnostics.
function isWikiMode() {
  return (
    new URLSearchParams(window.location.search).has('wiki') ||
    window.location.hash === '#wiki'
  )
}

// App root — restores session on mount, connects Socket.IO when a session
// exists, then routes to the correct screen based on game status.
// FINISHED games stay on GameScreen: a dismissible end-game modal appears,
// and players may keep using the UI if they want to continue informally.
export default function App() {
  const state = useGameStore((store) => store.state)
  const session = useGameStore((store) => store.session)
  const restoreSession = useGameStore((store) => store.restoreSession)
  const connectRealtime = useGameStore((store) => store.connectRealtime)
  const disconnectRealtime = useGameStore((store) => store.disconnectRealtime)
  const [isReady, setIsReady] = useState(false)
  const wikiMode = isWikiMode()

  // Attempt to restore a saved session (survives page refresh).
  useEffect(() => {
    if (wikiMode) return
    void restoreSession().finally(() => setIsReady(true))
  }, [restoreSession, wikiMode])

  // Connect Socket.IO whenever a session exists; disconnect on cleanup.
  useEffect(() => {
    if (wikiMode || !session) return
    connectRealtime()
    return disconnectRealtime
  }, [connectRealtime, disconnectRealtime, session, wikiMode])

  if (wikiMode) {
    return (
      <Suspense
        fallback={
          <main className="grid min-h-screen place-items-center px-4">
            <p className="text-sm text-muted-foreground">Загрузка вики...</p>
          </main>
        }
      >
        <Wiki />
      </Suspense>
    )
  }
  if (isDebugMode()) return <DebugPanel />
  if (!isReady) return <LoadingScreen />
  if (state && session && (state.status === 'RUNNING' || state.status === 'FINISHED')) {
    return <GameScreen />
  }
  if (state && session) return <Lobby />
  return <Home />
}
