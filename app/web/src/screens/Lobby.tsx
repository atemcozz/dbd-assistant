import { Copy, LogOut, Settings, Swords, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { ConnectionStatus } from '@/components/shared/ConnectionStatus'
import { PlayerCard } from '@/components/shared/PlayerCard'
import { QuestPanel } from '@/features/lobby/QuestPanel'
import {
  loadCharacterTypes,
  loadQuestDefinitions,
  useGameStore,
} from '@/gameStore'

// Lobby screen — waiting room before the game starts.
// Owner configures roles, characters, quests, and game settings here.
export function Lobby() {
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
  const [selectedQuestIds, setSelectedQuestIds] = useState(() =>
    state.quests.map((quest) => quest.definition.id),
  )
  const [durationMinutes, setDurationMinutes] = useState(
    Math.round(state.durationSeconds / 60),
  )
  const [requiredQuestPoints, setRequiredQuestPoints] = useState(
    state.requiredQuestPoints,
  )

  const isOwner = state.ownerPlayerId === session.playerId
  const viewerPlayer = state.players.find(
    (player) => player.id === session.playerId,
  )
  const canSeeQuestsTab =
    isOwner ||
    viewerPlayer?.role === 'KILLER' ||
    state.status !== 'LOBBY'

  // Sum of costs of all selected quests — must meet required points to start.
  const totalQuestPoints = state.quests.reduce(
    (sum, quest) => sum + quest.definition.cost,
    0,
  )
  const hasEnoughPoints = totalQuestPoints >= requiredQuestPoints

  // Build a lookup of killer character id → display name for quest badges.
  const killerLabels = Object.fromEntries(
    state.players
      .filter((player) => player.role === 'KILLER' && player.characterType)
      .map((player) => [
        player.characterTypeId,
        player.characterType?.name ?? player.characterTypeId,
      ]),
  )

  // Set of killer character type IDs currently assigned to players.
  // Used to hide killer-specific quests for unassigned killer types.
  const assignedKillerTypes = new Set(
    state.players
      .filter((player) => player.role === 'KILLER' && player.characterTypeId)
      .map((player) => player.characterTypeId as string),
  )

  // Debounce timer for auto-saving settings.
  const settingsSaveTimer = useRef<number | null>(null)

  // Load character types once when the lobby mounts.
  useEffect(() => {
    if (characterTypes.length > 0) return
    void loadCharacterTypes()
      .then((types) => useGameStore.setState({ characterTypes: types }))
      .catch(() => undefined)
  }, [characterTypes.length])

  // Owner loads quest definitions once — needed for the selection panel.
  useEffect(() => {
    if (!isOwner || questDefinitions.length > 0) return
    void loadQuestDefinitions()
      .then((definitions) => useGameStore.setState({ questDefinitions: definitions }))
      .catch(() => undefined)
  }, [isOwner, questDefinitions.length])

  // Keep local selected IDs in sync when server state changes (e.g. another tab).
  useEffect(() => {
    setSelectedQuestIds(state.quests.map((quest) => quest.definition.id))
  }, [state.quests])

  // Keep local settings inputs in sync when server state changes.
  useEffect(() => {
    setDurationMinutes(Math.round(state.durationSeconds / 60))
    setRequiredQuestPoints(state.requiredQuestPoints)
  }, [state.durationSeconds, state.requiredQuestPoints])

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (settingsSaveTimer.current !== null) {
        window.clearTimeout(settingsSaveTimer.current)
      }
    }
  }, [])

  async function copyCode() {
    await navigator.clipboard.writeText(state.code)
    setCopyLabel('Copied')
    window.setTimeout(() => setCopyLabel('Copy code'), 1400)
  }

  // Serialize quest mutations to avoid race conditions on rapid toggles.
  function updateQuestOrder(next: string[]) {
    setSelectedQuestIds(next)
    void selectQuests(next)
  }

  function toggleQuest(id: string) {
    updateQuestOrder(
      selectedQuestIds.includes(id)
        ? selectedQuestIds.filter((value) => value !== id)
        : [...selectedQuestIds, id],
    )
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

  // Auto-save settings with a 600ms debounce after the last change.
  function scheduleSettingsSave(nextMinutes: number, nextPoints: number) {
    if (settingsSaveTimer.current !== null) {
      window.clearTimeout(settingsSaveTimer.current)
    }
    settingsSaveTimer.current = window.setTimeout(() => {
      void updateSettings(nextMinutes * 60, nextPoints)
    }, 600)
  }

  function handleDurationChange(value: number) {
    setDurationMinutes(value)
    scheduleSettingsSave(value, requiredQuestPoints)
  }

  function handleRequiredPointsChange(value: number) {
    setRequiredQuestPoints(value)
    scheduleSettingsSave(durationMinutes, value)
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge
              variant="outline"
              className="border-teal-300/30 text-teal-200"
            >
              Lobby / waiting room
            </Badge>
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              {state.name}
            </h1>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3 sm:min-w-56">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-slate-500">
                Game code
              </p>
              <strong className="font-display text-2xl tracking-[.16em] text-teal-200">
                {state.code}
              </strong>
            </div>
            <Button
              aria-label="Copy game code"
              onClick={() => void copyCode()}
              size="icon"
              variant="ghost"
              title={copyLabel}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </header>
        <Separator />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-5 text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <Users className="size-4" />
            {state.players.length} player
            {state.players.length === 1 ? '' : 's'}
          </span>
          <ConnectionStatus status={connectionStatus} />
          <Button
            className="ml-auto"
            onClick={clearSession}
            size="sm"
            variant="ghost"
          >
            <LogOut className="size-4" />
            Leave room
          </Button>
        </div>
        {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
        <Tabs
          className="w-full"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="grid h-11 w-full max-w-lg grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="players">Players</TabsTrigger>
            {canSeeQuestsTab && (
              <TabsTrigger value="quests">
                Quests{' '}
                <Badge variant="secondary" className="ml-2">
                  {state.quests.length}
                </Badge>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="settings">
                <Settings className="mr-1 size-3.5" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="players" className="mt-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isOwner={isOwner}
                  characterTypes={characterTypes}
                  onRoleChange={(role) => void assignRole(player.id, role)}
                  onCharacterChange={(id) =>
                    void assignCharacter(player.id, id)
                  }
                />
              ))}
            </section>
          </TabsContent>
          {canSeeQuestsTab && (
            <TabsContent value="quests" className="mt-5">
              <QuestPanel
                quests={state.quests}
                definitions={questDefinitions}
                killerLabels={killerLabels}
                assignedKillerTypes={assignedKillerTypes}
                isOwner={isOwner}
                requiredQuestPoints={state.requiredQuestPoints}
                selectedQuestIds={selectedQuestIds}
                onToggle={toggleQuest}
                onMove={moveQuest}
              />
            </TabsContent>
          )}
          {isOwner && (
            <TabsContent value="settings" className="mt-5">
              <div className="mx-auto max-w-md rounded-md border border-border p-6">
                <h2 className="font-display text-xl font-semibold">
                  Game settings
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Changes save automatically and apply when the game starts.
                </p>
                <div className="mt-6 grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="duration-minutes">Game minutes</Label>
                    <Input
                      id="duration-minutes"
                      type="number"
                      min={1}
                      max={1440}
                      value={durationMinutes}
                      onChange={(event) =>
                        handleDurationChange(Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="required-quest-points">
                      Required quest points to open exits
                    </Label>
                    <Input
                      id="required-quest-points"
                      type="number"
                      min={0}
                      max={100000}
                      value={requiredQuestPoints}
                      onChange={(event) =>
                        handleRequiredPointsChange(Number(event.target.value))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Each quest has a point cost. When total completed points
                      reach this value, exits open.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
        <footer className="flex flex-col gap-4 py-6 text-sm text-slate-500">
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            {isOwner ? (
              <>
                <span>
                  {durationMinutes} min · {requiredQuestPoints} points required
                </span>
                <div className="flex flex-col items-end gap-1">
                  {!hasEnoughPoints && (
                    <span className="text-xs font-semibold text-amber-400">
                      Select more quests — only {totalQuestPoints}/
                      {requiredQuestPoints} points
                    </span>
                  )}
                  <Button
                    onClick={() => void startGame()}
                    disabled={!hasEnoughPoints}
                  >
                    <Swords className="size-4" />
                    Start game
                  </Button>
                </div>
              </>
            ) : (
              <span>
                Waiting for the room owner to configure and start.
              </span>
            )}
          </div>
        </footer>
      </div>
    </main>
  )
}
