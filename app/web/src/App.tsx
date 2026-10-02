import { useEffect, useState } from 'react'
import { loadCharacterTypes, type LobbyPlayer, type Role, useGameStore } from './gameStore'

function App() {
  const state = useGameStore((store) => store.state)
  const session = useGameStore((store) => store.session)
  const restoreSession = useGameStore((store) => store.restoreSession)
  const connectRealtime = useGameStore((store) => store.connectRealtime)
  const disconnectRealtime = useGameStore((store) => store.disconnectRealtime)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    void restoreSession().finally(() => setIsReady(true))
  }, [restoreSession])

  useEffect(() => {
    if (!session) return
    connectRealtime()
    return disconnectRealtime
  }, [connectRealtime, disconnectRealtime, session])

  if (!isReady) return <div className="page-shell"><p className="eyebrow">DBD Assistant</p><p>Restoring session...</p></div>
  if (state && session) return <Lobby />
  return <Home />
}

function Home() {
  const createGame = useGameStore((store) => store.createGame)
  const joinGame = useGameStore((store) => store.joinGame)
  const error = useGameStore((store) => store.error)
  const isLoading = useGameStore((store) => store.isLoading)
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [gameName, setGameName] = useState('Friday Night Trial')
  const [playerName, setPlayerName] = useState('')
  const [code, setCode] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (mode === 'create') await createGame(gameName, playerName)
    else await joinGame(code, playerName)
  }

  return (
    <main className="page-shell home-layout">
      <section className="intro-block">
        <p className="eyebrow">Local multiplayer / step 02</p>
        <h1>Gather your trial.</h1>
        <p className="lede">Create a room for your group or slip into an existing lobby with a short game code.</p>
      </section>
      <section className="panel form-panel">
        <div className="mode-switch" role="tablist" aria-label="Game room action">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')} type="button">Create game</button>
          <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')} type="button">Join game</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'create' ? <label>Room name<input value={gameName} onChange={(event) => setGameName(event.target.value)} maxLength={80} required /></label> : <label>Game code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="A1B2C3" required /></label>}
          <label>Your name<input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={80} placeholder="Enter a display name" required /></label>
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button" disabled={isLoading} type="submit">{isLoading ? 'Connecting...' : mode === 'create' ? 'Create room' : 'Join room'}</button>
        </form>
      </section>
    </main>
  )
}

function Lobby() {
  const state = useGameStore((store) => store.state)!
  const session = useGameStore((store) => store.session)!
  const characterTypes = useGameStore((store) => store.characterTypes)
  const connectionStatus = useGameStore((store) => store.connectionStatus)
  const error = useGameStore((store) => store.error)
  const clearSession = useGameStore((store) => store.clearSession)
  const assignRole = useGameStore((store) => store.assignRole)
  const assignCharacter = useGameStore((store) => store.assignCharacter)
  const [copyLabel, setCopyLabel] = useState('Copy code')

  useEffect(() => {
    if (characterTypes.length > 0) return
    void loadCharacterTypes().then((types) => useGameStore.setState({ characterTypes: types })).catch(() => undefined)
  }, [characterTypes.length])

  const isOwner = state.ownerPlayerId === session.playerId

  async function copyCode() {
    await navigator.clipboard.writeText(state.code)
    setCopyLabel('Copied')
    window.setTimeout(() => setCopyLabel('Copy code'), 1400)
  }

  return (
    <main className="page-shell lobby-shell">
      <header className="lobby-header"><div><p className="eyebrow">Lobby / waiting room</p><h1>{state.name}</h1></div><div className="code-lockup"><span>Game code</span><strong>{state.code}</strong><button onClick={() => void copyCode()} type="button">{copyLabel}</button></div></header>
      <div className="lobby-meta"><span>{state.players.length} player{state.players.length === 1 ? '' : 's'}</span><span className={`connection-status ${connectionStatus}`}><span className="status-dot" />{connectionStatus === 'connected' ? 'Live connection' : connectionStatus === 'connecting' ? 'Connecting...' : 'Connection unavailable'}</span><button className="text-button" onClick={clearSession} type="button">Leave room</button></div>
      {error && <p className="error-message">{error}</p>}
      <section className="player-grid">{state.players.map((player) => <PlayerCard key={player.id} player={player} isOwner={isOwner} characterTypes={characterTypes} onRoleChange={(role) => void assignRole(player.id, role)} onCharacterChange={(id) => void assignCharacter(player.id, id)} />)}</section>
      <footer className="lobby-footer"><span>{isOwner ? 'You are the room owner. Configure the team below.' : 'The room owner is configuring the team.'}</span><span>Game start arrives in the next step.</span></footer>
    </main>
  )
}

function PlayerCard({ player, isOwner, characterTypes, onRoleChange, onCharacterChange }: { player: LobbyPlayer; isOwner: boolean; characterTypes: Awaited<ReturnType<typeof loadCharacterTypes>>; onRoleChange: (role: Role) => void; onCharacterChange: (id: string) => void }) {
  const availableCharacters = characterTypes.filter((character) => character.role === player.role)
  return (
    <article className="player-card"><div className="player-card-heading"><span className={`role-mark ${player.role.toLowerCase()}`}>{player.role === 'KILLER' ? 'K' : 'S'}</span><div><h2>{player.name}</h2><p>{player.characterType?.name ?? 'Character unassigned'}</p></div>{player.status === 'ALIVE' && <span className="alive-label">Ready</span>}</div>{isOwner ? <div className="assignment-fields"><label>Role<select value={player.role} onChange={(event) => onRoleChange(event.target.value as Role)}><option value="SURVIVOR">Survivor</option><option value="KILLER">Killer</option></select></label><label>Character<select value={player.characterTypeId ?? ''} onChange={(event) => onCharacterChange(event.target.value)}><option value="" disabled>Select type</option>{availableCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label></div> : <p className="player-description">{player.characterType?.description ?? 'Waiting for the owner to assign a character.'}</p>}</article>
  )
}

export default App
