import { Copy, LogOut, Radio, Shield, Skull, Users, WifiOff } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { loadCharacterTypes, type LobbyPlayer, type Role, useGameStore } from './gameStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

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

  if (!isReady) return <LoadingScreen />
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

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'create') await createGame(gameName, playerName)
    else await joinGame(code, playerName)
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10 lg:px-16">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_26rem] lg:gap-20">
      <section className="max-w-2xl">
        <Badge variant="outline" className="border-teal-300/30 text-teal-200">Local multiplayer / step 02</Badge>
        <h1 className="mt-5 max-w-xl font-display text-5xl font-semibold leading-[.95] tracking-tight text-white sm:text-7xl">Gather your trial.</h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">Create a room for your group or slip into an existing lobby with a short game code.</p>
      </section>
      <Card className="w-full">
        <Tabs className="border-b p-2" value={mode} onValueChange={(value) => setMode(value as 'create' | 'join')}><TabsList className="grid h-11 w-full grid-cols-2"><TabsTrigger value="create">Create game</TabsTrigger><TabsTrigger value="join">Join game</TabsTrigger></TabsList></Tabs>
        <CardHeader><CardTitle>{mode === 'create' ? 'Open a room' : 'Enter a room'}</CardTitle><CardDescription>{mode === 'create' ? 'Set a name and invite your group.' : 'Use the code shared by the room owner.'}</CardDescription></CardHeader>
        <CardContent><form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-2">{mode === 'create' ? <><Label htmlFor="game-name">Room name</Label><Input id="game-name" value={gameName} onChange={(event) => setGameName(event.target.value)} maxLength={80} required /></> : <><Label htmlFor="game-code">Game code</Label><Input id="game-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="A1B2C3" required /></>}</div>
          <div className="grid gap-2"><Label htmlFor="player-name">Your name</Label><Input id="player-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={80} placeholder="Enter a display name" required /></div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Button disabled={isLoading} type="submit">{isLoading ? 'Connecting...' : mode === 'create' ? 'Create room' : 'Join room'}</Button>
        </form></CardContent>
      </Card>
      </div>
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
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
      <header className="flex flex-col gap-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><Badge variant="outline" className="border-teal-300/30 text-teal-200">Lobby / waiting room</Badge><h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl">{state.name}</h1></div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3 sm:min-w-56"><div><p className="text-xs uppercase tracking-[.16em] text-slate-500">Game code</p><strong className="font-display text-2xl tracking-[.16em] text-teal-200">{state.code}</strong></div><Button aria-label="Copy game code" onClick={() => void copyCode()} size="icon" variant="ghost" title={copyLabel}><Copy className="size-4" /></Button></div>
      </header>
      <Separator />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-5 text-sm text-slate-400"><span className="inline-flex items-center gap-2"><Users className="size-4" />{state.players.length} player{state.players.length === 1 ? '' : 's'}</span><ConnectionStatus status={connectionStatus} /><Button className="ml-auto" onClick={clearSession} size="sm" variant="ghost"><LogOut className="size-4" />Leave room</Button></div>
      {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.players.map((player) => <PlayerCard key={player.id} player={player} isOwner={isOwner} characterTypes={characterTypes} onRoleChange={(role) => void assignRole(player.id, role)} onCharacterChange={(id) => void assignCharacter(player.id, id)} />)}</section>
      <footer className="flex flex-col gap-2 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between"><span>{isOwner ? 'You are the room owner. Configure the team below.' : 'The room owner is configuring the team.'}</span><span>Game start arrives in the next step.</span></footer>
      </div>
    </main>
  )
}

function PlayerCard({ player, isOwner, characterTypes, onRoleChange, onCharacterChange }: { player: LobbyPlayer; isOwner: boolean; characterTypes: Awaited<ReturnType<typeof loadCharacterTypes>>; onRoleChange: (role: Role) => void; onCharacterChange: (id: string) => void }) {
  const availableCharacters = characterTypes.filter((character) => character.role === player.role)
  return (
    <Card><CardHeader className="flex-row items-start gap-3 space-y-0"><div className={cn('grid size-10 shrink-0 place-items-center rounded-full', player.role === 'KILLER' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary')}>{player.role === 'KILLER' ? <Skull className="size-5" /> : <Shield className="size-5" />}</div><div className="min-w-0"><CardTitle className="truncate">{player.name}</CardTitle><CardDescription>{player.characterType?.name ?? 'Character unassigned'}</CardDescription></div>{player.status === 'ALIVE' && <Badge className="ml-auto shrink-0">Ready</Badge>}</CardHeader><CardContent>{isOwner ? <div className="grid gap-4"><div className="grid gap-2"><Label htmlFor={`${player.id}-role`}>Role</Label><Select value={player.role} onValueChange={(value) => onRoleChange(value as Role)}><SelectTrigger id={`${player.id}-role`}><SelectValue placeholder="Select role" /></SelectTrigger><SelectContent><SelectItem value="SURVIVOR">Survivor</SelectItem><SelectItem value="KILLER">Killer</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor={`${player.id}-character`}>Character</Label><Select value={player.characterTypeId ?? undefined} onValueChange={onCharacterChange}><SelectTrigger id={`${player.id}-character`}><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{availableCharacters.map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent></Select></div></div> : <p className="text-sm leading-6 text-muted-foreground">{player.characterType?.description ?? 'Waiting for the owner to assign a character.'}</p>}</CardContent></Card>
  )
}

function ConnectionStatus({ status }: { status: ReturnType<typeof useGameStore.getState>['connectionStatus'] }) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  return <Badge variant={connected ? 'default' : connecting ? 'secondary' : 'destructive'}>{connected ? <Radio className="size-3" /> : <WifiOff className="size-3" />}{connected ? 'Live connection' : connecting ? 'Connecting...' : 'Connection unavailable'}</Badge>
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center px-4"><div className="text-center"><p className="font-display text-xl font-semibold text-white">DBD Assistant</p><p className="mt-2 text-sm text-slate-400">Restoring session...</p></div></main>
}

export default App
