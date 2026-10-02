import { ArrowDown, ArrowUp, ClipboardList, Copy, KeyRound, LogOut, MapPin, Plus, Puzzle, Radio, Shield, Skull, Users, WifiOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { loadCharacterTypes, loadQuestDefinitions, type GameQuest, type LobbyPlayer, type QuestDefinition, type Role, useGameStore } from './gameStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const questDefinitions = useGameStore((store) => store.questDefinitions)
  const connectionStatus = useGameStore((store) => store.connectionStatus)
  const error = useGameStore((store) => store.error)
  const clearSession = useGameStore((store) => store.clearSession)
  const assignRole = useGameStore((store) => store.assignRole)
  const assignCharacter = useGameStore((store) => store.assignCharacter)
  const selectQuests = useGameStore((store) => store.selectQuests)
  const [copyLabel, setCopyLabel] = useState('Copy code')
  const [activeTab, setActiveTab] = useState('players')
  const [selectedQuestIds, setSelectedQuestIds] = useState(() => state.quests.map((quest) => quest.definition.id))
  const isOwner = state.ownerPlayerId === session.playerId
  const killerLabels = Object.fromEntries(state.players.filter((player) => player.role === 'KILLER' && player.characterType).map((player) => [player.characterTypeId, player.characterType?.name ?? player.characterTypeId]))

  useEffect(() => {
    if (characterTypes.length > 0) return
    void loadCharacterTypes().then((types) => useGameStore.setState({ characterTypes: types })).catch(() => undefined)
  }, [characterTypes.length])

  useEffect(() => {
    if (!isOwner || questDefinitions.length > 0) return
    void loadQuestDefinitions().then((definitions) => useGameStore.setState({ questDefinitions: definitions })).catch(() => undefined)
  }, [isOwner, questDefinitions.length])

  useEffect(() => {
    setSelectedQuestIds(state.quests.map((quest) => quest.definition.id))
  }, [state.quests])

  async function copyCode() {
    await navigator.clipboard.writeText(state.code)
    setCopyLabel('Copied')
    window.setTimeout(() => setCopyLabel('Copy code'), 1400)
  }

  function updateQuestOrder(next: string[]) {
    setSelectedQuestIds(next)
    void selectQuests(next)
  }

  function toggleQuest(id: string) {
    updateQuestOrder(selectedQuestIds.includes(id) ? selectedQuestIds.filter((value) => value !== id) : [...selectedQuestIds, id])
  }

  function moveQuest(id: string, direction: number) {
    const currentOrder = state.quests.map((quest) => quest.definition.id)
    const index = currentOrder.indexOf(id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) return
    const next = [...currentOrder]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    updateQuestOrder(next)
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
      <Tabs className="w-full" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-11 w-full max-w-md grid-cols-2"><TabsTrigger value="players">Players</TabsTrigger>{(isOwner || state.players.find((player) => player.id === session.playerId)?.role === 'KILLER' || state.status !== 'LOBBY') && <TabsTrigger value="quests">Quests <Badge variant="secondary" className="ml-2">{state.quests.length}</Badge></TabsTrigger>}</TabsList>
        <TabsContent value="players" className="mt-5"><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.players.map((player) => <PlayerCard key={player.id} player={player} isOwner={isOwner} characterTypes={characterTypes} onRoleChange={(role) => void assignRole(player.id, role)} onCharacterChange={(id) => void assignCharacter(player.id, id)} />)}</section></TabsContent>
        {(isOwner || state.players.find((player) => player.id === session.playerId)?.role === 'KILLER' || state.status !== 'LOBBY') && <TabsContent value="quests" className="mt-5"><QuestPanel quests={state.quests} definitions={questDefinitions} killerLabels={killerLabels} isOwner={isOwner} selectedQuestIds={selectedQuestIds} onToggle={toggleQuest} onMove={moveQuest} /></TabsContent>}
      </Tabs>
      <footer className="flex flex-col gap-2 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between"><span>{isOwner ? 'You are the room owner. Configure the team below.' : 'The room owner is configuring the team.'}</span><span>Game start arrives in the next step.</span></footer>
      </div>
    </main>
  )
}

function QuestPanel({ quests, definitions, killerLabels, isOwner, selectedQuestIds, onToggle, onMove }: { quests: GameQuest[]; definitions: QuestDefinition[]; killerLabels: Record<string, string | null | undefined>; isOwner: boolean; selectedQuestIds: string[]; onToggle: (id: string) => void; onMove: (id: string, direction: number) => void }) {
  const killerDefinitions = definitions.filter((definition) => definition.killerCharacterTypeId)
  const universalDefinitions = definitions.filter((definition) => !definition.killerCharacterTypeId)
  const killerQuests = quests.filter((quest) => quest.definition.killerCharacterTypeId)
  const universalQuests = quests.filter((quest) => !quest.definition.killerCharacterTypeId)
  return <div className="grid gap-8">
    <section className="grid gap-4">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Pinned quests</p><h2 className="mt-1 font-display text-2xl font-semibold">Physical markers</h2></div><Badge variant="secondary">{quests.length} selected</Badge></div>
      {quests.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No quests selected yet.</CardContent></Card> : <div className="grid gap-6"><SelectedQuestGroup title="Killer-specific quests" quests={killerQuests} total={quests.length} killerLabels={killerLabels} isOwner={isOwner} onMove={onMove} /><SelectedQuestGroup title="Universal quests" quests={universalQuests} total={quests.length} killerLabels={killerLabels} isOwner={isOwner} onMove={onMove} /></div>}
    </section>
    {isOwner && <Card><CardHeader><CardTitle>Quest selection</CardTitle><CardDescription>Choose objectives before the game starts. Adding or removing a quest pins it immediately.</CardDescription></CardHeader><CardContent className="grid gap-7">
      <QuestDefinitionGroup title="Killer-specific quests" definitions={killerDefinitions} killerLabels={killerLabels} selectedQuestIds={selectedQuestIds} onToggle={onToggle} />
    <QuestDefinitionGroup title="Universal quests" definitions={universalDefinitions} killerLabels={killerLabels} selectedQuestIds={selectedQuestIds} onToggle={onToggle} />
     <QuestDefinitionGroup title="Universal quests" definitions={universalDefinitions} killerLabels={killerLabels} selectedQuestIds={selectedQuestIds} onToggle={onToggle} />
    </CardContent></Card>}
  </div>
}

function SelectedQuestGroup({ title, quests, total, killerLabels, isOwner, onMove }: { title: string; quests: GameQuest[]; total: number; killerLabels: Record<string, string | null | undefined>; isOwner: boolean; onMove: (id: string, direction: number) => void }) {
  if (quests.length === 0) return null
  return <section className="grid gap-3"><div className="flex items-center gap-3"><h3 className="font-display text-lg font-semibold">{title}</h3><Separator className="flex-1" /></div><div className="grid gap-4 sm:grid-cols-2">{quests.map((quest) => <QuestCard key={quest.id} quest={quest} total={total} killerLabels={killerLabels} isOwner={isOwner} onMove={onMove} />)}</div></section>
}

function QuestDefinitionGroup({ title, definitions, killerLabels, selectedQuestIds, onToggle }: { title: string; definitions: QuestDefinition[]; killerLabels: Record<string, string | null | undefined>; selectedQuestIds: string[]; onToggle: (id: string) => void }) {
  return <section className="grid gap-3"><div className="flex items-center gap-3"><h3 className="font-display text-lg font-semibold">{title}</h3><Separator className="flex-1" /></div>{definitions.length === 0 ? <p className="text-sm text-muted-foreground">No quests in this category.</p> : <div className="grid gap-3">{definitions.map((definition) => <QuestDefinitionCard key={definition.id} definition={definition} killerLabel={definition.killerCharacterTypeId ? killerLabels[definition.killerCharacterTypeId] ?? definition.killerCharacterTypeId : undefined} selected={selectedQuestIds.includes(definition.id)} onToggle={onToggle} />)}</div>}</section>
}

function QuestDefinitionCard({ definition, killerLabel, selected, onToggle }: { definition: QuestDefinition; killerLabel?: string; selected: boolean; onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = questIcon(definition.type)
  return <Card className={cn('overflow-hidden transition-colors', selected && 'border-primary/60 bg-primary/5')}><div className="flex items-center gap-3 p-4"><div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-primary"><Icon className="size-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{definition.name}</p><div className="flex flex-wrap gap-1"><Badge variant="outline">{definition.type}</Badge>{killerLabel && <Badge variant="secondary">Killer: {killerLabel}</Badge>}</div></div><Button type="button" aria-label={selected ? `Remove ${definition.name}` : `Add ${definition.name}`} onClick={() => onToggle(definition.id)} size="icon" variant={selected ? 'secondary' : 'outline'} title={selected ? 'Remove quest' : 'Add quest'}>{selected ? <span className="text-xs font-bold">✓</span> : <Plus className="size-4" />}</Button><Button type="button" aria-label={expanded ? `Collapse ${definition.name}` : `Expand ${definition.name}`} onClick={() => setExpanded((value) => !value)} size="icon" variant="ghost" title={expanded ? 'Collapse details' : 'Expand details'}>{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button></div>{expanded && <CardContent className="border-t border-border bg-muted/30 pt-4"><p className="text-sm leading-6 text-muted-foreground">{definition.description}</p><div className="mt-4 flex flex-wrap gap-2">{killerLabel && <Badge variant="secondary">Killer: {killerLabel}</Badge>}{definition.radius !== null && <Badge variant="outline">Radius: {definition.radius}m</Badge>}<Badge variant="outline">ID: {definition.id}</Badge></div></CardContent>}</Card>
}

function questIcon(type: string) {
  if (type.includes('EXPLORATION')) return MapPin
  if (type.includes('PUZZLE')) return Puzzle
  if (type.includes('KEY')) return KeyRound
  return ClipboardList
}

function QuestCard({ quest, total, killerLabels, isOwner, onMove }: { quest: GameQuest; total: number; killerLabels: Record<string, string | null | undefined>; isOwner: boolean; onMove: (id: string, direction: number) => void }) {
  const killerLabel = quest.definition.killerCharacterTypeId ? killerLabels[quest.definition.killerCharacterTypeId] ?? quest.definition.killerCharacterTypeId : undefined
  return <Card className="overflow-hidden border-primary/40 bg-card shadow-md shadow-primary/5"><div className="flex min-h-32"><div className="grid w-24 shrink-0 place-items-center bg-primary px-3 text-center text-primary-foreground"><span className="text-xs font-bold uppercase tracking-[.18em]">Marker</span><strong className="font-display text-5xl leading-none">{quest.number}</strong></div><CardContent className="grid min-w-0 flex-1 content-center gap-2 p-5"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Quest {quest.number}</Badge><Badge variant={quest.status === 'COMPLETED' ? 'secondary' : 'default'}>{quest.status}</Badge>{killerLabel && <Badge variant="secondary">Killer: {killerLabel}</Badge>}{isOwner && <span className="ml-auto flex gap-1"><Button type="button" aria-label="Move quest up" disabled={quest.number === 1} onClick={() => onMove(quest.definition.id, -1)} size="icon" variant="ghost" title="Move up"><ArrowUp className="size-3" /></Button><Button type="button" aria-label="Move quest down" disabled={quest.number === total} onClick={() => onMove(quest.definition.id, 1)} size="icon" variant="ghost" title="Move down"><ArrowDown className="size-3" /></Button></span>}</div><h3 className="font-display text-lg font-semibold">{quest.definition.name}</h3><p className="text-sm leading-6 text-muted-foreground">{quest.definition.description}</p></CardContent></div></Card>
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
