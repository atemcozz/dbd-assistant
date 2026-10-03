import { Copy, LogOut, Swords, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [requiredQuestCount, setRequiredQuestCount] = useState(
    state.requiredQuestCount,
  )

  const isOwner = state.ownerPlayerId === session.playerId
  const viewerPlayer = state.players.find(
    (player) => player.id === session.playerId,
  )
  const canSeeQuestsTab =
    isOwner ||
    viewerPlayer?.role === 'KILLER' ||
    state.status !== 'LOBBY'

  // Build a lookup of killer character id → display name for quest badges.
  const killerLabels = Object.fromEntries(
    state.players
      .filter((player) => player.role === 'KILLER' && player.characterType)
      .map((player) => [
        player.characterTypeId,
        player.characterType?.name ?? player.characterTypeId,
      ]),
  )

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
          <TabsList className="grid h-11 w-full max-w-md grid-cols-2">
            <TabsTrigger value="players">Players</TabsTrigger>
            {canSeeQuestsTab && (
              <TabsTrigger value="quests">
                Quests{' '}
                <Badge variant="secondary" className="ml-2">
                  {state.quests.length}
                </Badge>
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
                isOwner={isOwner}
                selectedQuestIds={selectedQuestIds}
                onToggle={toggleQuest}
                onMove={moveQuest}
              />
            </TabsContent>
          )}
        </Tabs>
        <footer className="flex flex-col gap-4 py-6 text-sm text-slate-500">
          <div className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-end">
            {isOwner ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="duration-minutes">Game minutes</Label>
                  <Input
                    id="duration-minutes"
                    type="number"
                    min={1}
                    max={1440}
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="required-quests">Required quests</Label>
                  <Input
                    id="required-quests"
                    type="number"
                    min={0}
                    max={100}
                    value={requiredQuestCount}
                    onChange={(event) =>
                      setRequiredQuestCount(Number(event.target.value))
                    }
                  />
                </div>
                <Button
                  onClick={() =>
                    void updateSettings(durationMinutes * 60, requiredQuestCount)
                  }
                >
                  Save settings
                </Button>
                <Button className="sm:ml-auto" onClick={() => void startGame()}>
                  <Swords className="size-4" />
                  Start game
                </Button>
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
