import { useEffect, useState } from 'react'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { FinishedScreen } from '@/screens/FinishedScreen'
import { GameScreen } from '@/screens/GameScreen'
import { Home } from '@/screens/Home'
import { Lobby } from '@/screens/Lobby'
import { useGameStore } from '@/gameStore'

// App root — restores session on mount, connects Socket.IO when a session
// exists, then routes to the correct screen based on game status.
export default function App() {
  const state = useGameStore((store) => store.state)
  const session = useGameStore((store) => store.session)
  const restoreSession = useGameStore((store) => store.restoreSession)
  const connectRealtime = useGameStore((store) => store.connectRealtime)
  const disconnectRealtime = useGameStore((store) => store.disconnectRealtime)
  const [isReady, setIsReady] = useState(false)

  // Attempt to restore a saved session (survives page refresh).
  useEffect(() => {
    void restoreSession().finally(() => setIsReady(true))
  }, [restoreSession])

  // Connect Socket.IO whenever a session exists; disconnect on cleanup.
  useEffect(() => {
    if (!session) return
    connectRealtime()
    return disconnectRealtime
  }, [connectRealtime, disconnectRealtime, session])

  if (!isReady) return <LoadingScreen />
  if (state && session && state.status === 'RUNNING') return <GameScreen />
  if (state && session && state.status === 'FINISHED') return <FinishedScreen />
  if (state && session) return <Lobby />
  return <Home />
}
