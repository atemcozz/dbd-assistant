import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, ClipboardList, Clock3, Copy, Heart, KeyRound, LogOut, MapPin, MessageSquare, Plus, Puzzle, Radio, Shield, Skull, Sparkles, Swords, Users, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { loadCharacterTypes, loadQuestDefinitions, type GameQuest, type LobbyPlayer, type LobbyState, type QuestDefinition, type Role, useGameStore } from './gameStore'
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
  if (state && session && state.status === 'RUNNING') return <GameScreen />
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
  const startGame = useGameStore((store) => store.startGame)
  const updateSettings = useGameStore((store) => store.updateSettings)
  const [copyLabel, setCopyLabel] = useState('Copy code')
  const [activeTab, setActiveTab] = useState('players')
  const [selectedQuestIds, setSelectedQuestIds] = useState(() => state.quests.map((quest) => quest.definition.id))
  const [durationMinutes, setDurationMinutes] = useState(Math.round(state.durationSeconds / 60))
  const [requiredQuestCount, setRequiredQuestCount] = useState(state.requiredQuestCount)
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
      <footer className="flex flex-col gap-4 py-6 text-sm text-slate-500"><div className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-end">{isOwner ? <><div className="grid gap-2"><Label htmlFor="duration-minutes">Game minutes</Label><Input id="duration-minutes" type="number" min={1} max={1440} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} /></div><div className="grid gap-2"><Label htmlFor="required-quests">Required quests</Label><Input id="required-quests" type="number" min={0} max={100} value={requiredQuestCount} onChange={(event) => setRequiredQuestCount(Number(event.target.value))} /></div><Button onClick={() => void updateSettings(durationMinutes * 60, requiredQuestCount)}>Save settings</Button><Button className="sm:ml-auto" onClick={() => void startGame()}><Swords className="size-4" />Start game</Button></> : <span>Waiting for the room owner to configure and start.</span>}</div></footer>
      </div>
    </main>
  )
}

function GameScreen() {
  const state = useGameStore((store) => store.state)!
  const session = useGameStore((store) => store.session)!
  const connectionStatus = useGameStore((store) => store.connectionStatus)
  const error = useGameStore((store) => store.error)
  const damagePlayer = useGameStore((store) => store.damagePlayer)
  const completeQuest = useGameStore((store) => store.completeQuest)
  const sendChat = useGameStore((store) => store.sendChat)
  const clearSession = useGameStore((store) => store.clearSession)
  const currentPlayer = state.players.find((player) => player.id === session.playerId)!
  const previousHealth = useRef(currentPlayer.health)
  const [remainingSeconds, setRemainingSeconds] = useState(() => getRemainingSeconds(state.startedAt, state.durationSeconds))
  const [modal, setModal] = useState<{ title: string; body: string; confirmLabel?: string; onConfirm?: () => void } | null>(null)
  const [activeTab, setActiveTab] = useState<'status' | 'quests' | 'players' | 'chat' | 'effects'>('status')

  useEffect(() => {
    const timer = window.setInterval(() => setRemainingSeconds(getRemainingSeconds(state.startedAt, state.durationSeconds)), 1000)
    return () => window.clearInterval(timer)
  }, [state.startedAt, state.durationSeconds])

  useEffect(() => {
    if (currentPlayer.health < previousHealth.current && currentPlayer.status !== 'DEAD') {
      setModal({ title: 'You were damaged', body: `Your health is now ${currentPlayer.health}.` })
    }
    previousHealth.current = currentPlayer.health
  }, [currentPlayer.health, currentPlayer.status])

  if (currentPlayer.status === 'DEAD') return <DeathScreen onLeave={clearSession} />

  const isKiller = currentPlayer.role === 'KILLER'
  const survivors = state.players.filter((player) => player.role === 'SURVIVOR')

  function confirmDamage(playerId: string, playerName: string) {
    setModal({
      title: 'Deal 1 damage?',
      body: `Attack ${playerName}? This removes 1 HP.`,
      confirmLabel: 'Deal damage',
      onConfirm: () => {
        setModal(null)
        void damagePlayer(playerId)
      },
    })
  }

  return <main className="min-h-screen px-4 pb-8 pt-4 sm:px-8 lg:px-16">
    <div className="mx-auto max-w-6xl">
      <GameHeader state={state} player={currentPlayer} remainingSeconds={remainingSeconds} connectionStatus={connectionStatus} onLeave={clearSession} />
      {error && <p className="my-3 text-sm text-rose-300">{error}</p>}
      {state.exitsUnlocked && <Card className="mt-5 border-primary bg-primary/10"><CardContent className="flex items-center gap-3 p-4 text-sm font-semibold text-primary"><Sparkles className="size-5" />Required quests complete. Survivors should proceed toward the exits.</CardContent></Card>}
      <Tabs className="mt-5" value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}><TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5"><TabsTrigger value="status">Game</TabsTrigger><TabsTrigger value="quests">Quests</TabsTrigger><TabsTrigger value="players">Players</TabsTrigger>{!isKiller && <TabsTrigger value="chat">Chat</TabsTrigger>}<TabsTrigger value="effects">Effects</TabsTrigger></TabsList>
        <TabsContent value="status" className="mt-5"><GameStatusPanel player={currentPlayer} isKiller={isKiller} /></TabsContent>
        <TabsContent value="quests" className="mt-5"><GameQuests quests={state.quests} isSurvivor={!isKiller} onComplete={(questId) => setModal({ title: 'Complete quest?', body: 'This quest completion cannot be undone.', confirmLabel: 'Complete quest', onConfirm: () => { setModal(null); void completeQuest(questId) } })} /></TabsContent>
        <TabsContent value="players" className="mt-5"><GamePlayers players={isKiller ? survivors : survivors.filter((player) => player.id !== currentPlayer.id)} isKiller={isKiller} onDamage={confirmDamage} /></TabsContent>
        {!isKiller && <TabsContent value="chat" className="mt-5"><ChatSection messages={state.chatMessages} onSend={(text) => void sendChat(text)} /></TabsContent>}
        <TabsContent value="effects" className="mt-5"><PlaceholderSection icon={<Sparkles className="size-5" />} title="Effects" text="Effects and abilities arrive in the next slice." /></TabsContent>
      </Tabs>
    </div>
    {modal && <Modal {...modal} onClose={() => setModal(null)} />}
  </main>
}

function GameStatusPanel({ player, isKiller }: { player: LobbyPlayer; isKiller: boolean }) {
  return <Card><CardHeader><CardTitle>Game status</CardTitle><CardDescription>{isKiller ? 'Control the pressure and watch survivor status.' : 'Keep moving through the physical venue.'}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="rounded-md border border-border p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Your role</p><p className="mt-1 font-display text-2xl font-semibold">{player.characterType?.name ?? player.role}</p><div className="mt-3"><HealthDisplay health={player.health} maxHealth={player.maxHealth} /></div></div></CardContent></Card>
}

function ChatSection({ messages, onSend }: { messages: LobbyState['chatMessages']; onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-5" />Survivor chat</CardTitle><CardDescription>Only alive survivors can send or read messages.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="max-h-80 space-y-3 overflow-y-auto">{messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> : messages.map((message) => <div key={message.id} className="rounded-md bg-muted/50 p-3"><p className="text-xs font-semibold">{message.playerStatus === 'DEAD' ? '[DEAD] ' : ''}{message.playerName}</p><p className="mt-1 text-sm">{message.text}</p></div>)}</div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!text.trim()) return; onSend(text.trim()); setText('') }}><Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Message survivors" maxLength={500} /><Button type="submit">Send</Button></form></CardContent></Card>
}

function GameHeader({ state, player, remainingSeconds, connectionStatus, onLeave }: { state: LobbyState; player: LobbyPlayer; remainingSeconds: number; connectionStatus: ReturnType<typeof useGameStore.getState>['connectionStatus']; onLeave: () => void }) {
  return <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-16 lg:px-16"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><div className="min-w-0 flex-1"><p className="truncate font-display text-lg font-semibold text-foreground">{state.name}</p><p className="text-xs text-muted-foreground">{player.role === 'KILLER' ? 'Killer view' : 'Survivor view'} · {connectionStatus === 'connected' ? 'Live' : 'Connection unavailable'}</p></div><div className="flex items-center gap-3"><div className="flex items-center gap-1" aria-label={`${player.health} of ${player.maxHealth} health`}><HealthDisplay health={player.health} maxHealth={player.maxHealth} compact /></div><div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold tabular-nums"><Clock3 className="size-4 text-primary" />{formatTime(remainingSeconds)}</div><Button aria-label="Leave game" onClick={onLeave} size="icon" variant="ghost" title="Leave game"><LogOut className="size-4" /></Button></div></div></header>
}

function GamePlayers({ players, isKiller, onDamage }: { players: LobbyPlayer[]; isKiller: boolean; onDamage: (playerId: string, playerName: string) => void }) {
  return <Card><CardHeader><CardTitle>Players</CardTitle><CardDescription>{isKiller ? 'Choose a survivor to attack.' : 'Your team status.'}</CardDescription></CardHeader><CardContent className="grid gap-3">{players.map((player) => <div key={player.id} className="flex items-center gap-3 rounded-md border border-border p-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{player.role === 'KILLER' ? <Skull className="size-4" /> : <Shield className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{player.name}</p><p className="text-xs text-muted-foreground">{player.characterType?.name ?? 'Unassigned'} · {player.status}</p></div><HealthDisplay health={player.health} maxHealth={player.maxHealth} />{isKiller && player.status === 'ALIVE' && <Button onClick={() => onDamage(player.id, player.name)} size="sm" variant="destructive"><Swords className="size-4" />Damage</Button>}</div>)}</CardContent></Card>
}

function GameQuests({ quests, isSurvivor, onComplete }: { quests: GameQuest[]; isSurvivor: boolean; onComplete: (questId: string) => void }) {
  const completed = quests.filter((quest) => quest.status === 'COMPLETED').length
  return <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Quests</CardTitle><CardDescription>{completed} of {quests.length} completed</CardDescription></div><Badge variant="secondary">{completed}/{quests.length}</Badge></div></CardHeader><CardContent className="grid gap-3">{quests.map((quest) => <GameQuestCard key={quest.id} quest={quest} isSurvivor={isSurvivor} onComplete={onComplete} />)}</CardContent></Card>
}

function GameQuestCard({ quest, isSurvivor, onComplete }: { quest: GameQuest; isSurvivor: boolean; onComplete: (questId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const completed = quest.status === 'COMPLETED'
  return <div className={cn('rounded-md border p-3 transition-colors', completed ? 'border-primary/60 bg-primary/10' : 'border-border bg-card')}><div className="flex items-center gap-3"><div className={cn('grid size-9 shrink-0 place-items-center rounded-md font-display font-bold', completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-primary')}>{completed ? <Check className="size-4" /> : quest.number}</div><p className="min-w-0 flex-1 truncate text-sm font-medium">{quest.definition.name}</p><Button aria-label="Expand quest" onClick={() => setExpanded((value) => !value)} size="icon" variant="ghost" title={expanded ? 'Collapse quest' : 'Expand quest'}>{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button></div>{expanded && <div className="mt-3 grid gap-3 border-t border-border pt-3"><p className="text-sm leading-6 text-muted-foreground">{quest.definition.description}</p>{isSurvivor && !completed && <Button onClick={() => onComplete(quest.id)} size="sm"><Check className="size-4" />Mark completed</Button>}{completed && <Badge>Completed</Badge>}</div>}</div>
}

function PlaceholderSection({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle><CardDescription>{text}</CardDescription></CardHeader><CardContent><div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Coming soon</div></CardContent></Card>
}

function HealthDisplay({ health, maxHealth, compact = false }: { health: number; maxHealth: number; compact?: boolean }) {
  return <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">{maxHealth <= 6 ? Array.from({ length: maxHealth }, (_, index) => <Heart key={index} className={cn('size-4', index < health ? 'fill-rose-400 text-rose-400' : 'text-muted-foreground')} />) : <><span>{health}/{maxHealth}</span><Heart className="size-4 fill-rose-400 text-rose-400" /></>}{compact && maxHealth <= 6 && <span className="sr-only">{health} of {maxHealth}</span>}</span>
}

function Modal({ title, body, confirmLabel, onConfirm, onClose }: { title: string; body: string; confirmLabel?: string; onConfirm?: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><Card className="w-full max-w-md border-border shadow-2xl"><CardHeader><div className="flex items-start justify-between gap-4"><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-primary" />{title}</CardTitle><Button aria-label="Close modal" onClick={onClose} size="icon" variant="ghost"><X className="size-4" /></Button></div><CardDescription>{body}</CardDescription></CardHeader><CardContent className="flex justify-end gap-2"><Button onClick={onClose} variant="outline">Cancel</Button>{onConfirm && <Button onClick={onConfirm} variant="destructive">{confirmLabel ?? 'OK'}</Button>}</CardContent></Card></div>
}

function DeathScreen({ onLeave }: { onLeave: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center"><div className="max-w-md"><Skull className="mx-auto size-16 text-destructive" /><h1 className="mt-6 font-display text-5xl font-semibold text-foreground">You are dead</h1><p className="mt-4 text-muted-foreground">Your role in the physical trial has ended.</p><Button className="mt-8" onClick={onLeave} variant="outline">Leave game</Button></div></main>
}

function getRemainingSeconds(startedAt: string | null, durationSeconds: number) {
  if (!startedAt) return durationSeconds
  return Math.max(0, durationSeconds - Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
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
