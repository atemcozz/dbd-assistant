import { DoorOpen, Skull, Sparkles, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Modal, TimedModal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { ChatSection } from '@/features/game/ChatSection'
import { EffectsSection } from '@/features/game/EffectsSection'
import { GameExits } from '@/features/game/GameExits'
import { GameHeader } from '@/features/game/GameHeader'
import { GamePlayers } from '@/features/game/GamePlayers'
import { GameQuests } from '@/features/game/GameQuests'
import { GameStatusPanel } from '@/features/game/GameStatusPanel'
import { getRemainingSeconds } from '@/lib/format'
import { useGameStore } from '@/gameStore'

// Modal state — either a regular confirm modal or a timed modal.
type ModalState =
  | {
      kind: 'confirm'
      title: string
      body: string
      confirmLabel?: string
      onConfirm?: () => void
    }
  | {
      kind: 'timed'
      title: string
      body: string
      seconds?: number
    }
  | null

// Main in-game screen — tabs for status, quests, players, chat, effects.
// Killer and survivor see different tabs and actions based on role.
export function GameScreen() {
  const state = useGameStore((store) => store.state)!
  const session = useGameStore((store) => store.session)!
  const connectionStatus = useGameStore((store) => store.connectionStatus)
  const error = useGameStore((store) => store.error)
  const attackPlayer = useGameStore((store) => store.attackPlayer)
  const completeQuest = useGameStore((store) => store.completeQuest)
  const escapeThroughExit = useGameStore((store) => store.escapeThroughExit)
  const sendChat = useGameStore((store) => store.sendChat)
  const triggerEffect = useGameStore((store) => store.useEffect)
  const clearSession = useGameStore((store) => store.clearSession)

  const currentPlayer = state.players.find(
    (player) => player.id === session.playerId,
  )!

  const previousHealth = useRef(currentPlayer.health)
  // Track which active effect IDs we've already shown a modal for,
  // so we don't re-show the same effect every state broadcast.
  const shownEffectModals = useRef<Set<string>>(new Set())
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(state.startedAt, state.durationSeconds),
  )
  const [modal, setModal] = useState<ModalState>(null)
  const [activeTab, setActiveTab] = useState<
    'status' | 'quests' | 'exits' | 'players' | 'chat' | 'effects'
  >('status')

  // Tick the countdown every second.
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setRemainingSeconds(
          getRemainingSeconds(state.startedAt, state.durationSeconds),
        ),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [state.startedAt, state.durationSeconds])

  // Detect health drops and show a timed damage modal.
  useEffect(() => {
    const currentHealth = currentPlayer.health
    const previousHealthValue = previousHealth.current
    if (
      currentHealth !== null &&
      previousHealthValue !== null &&
      currentHealth < previousHealthValue &&
      currentPlayer.status !== 'DEAD'
    ) {
      setModal({
        kind: 'timed',
        title: 'Тебя атаковали!',
        body: `Текущее здоровье: ${currentHealth}`,
        seconds: 5,
      })
    }
    previousHealth.current = currentHealth
  }, [currentPlayer.health, currentPlayer.status])

  // Detect new active effects applied to this player and show a timed modal.
  useEffect(() => {
    const activeEffects = state.effects.filter(
      (effect) => effect.expiresAt !== null && !effect.owned,
    )

    for (const effect of activeEffects) {
      // Only show modal once per active effect instance.
      if (shownEffectModals.current.has(effect.id)) continue
      shownEffectModals.current.add(effect.id)

      const sourceText = effect.sourcePlayerName
        ? ` от ${effect.sourcePlayerName}`
        : ''
      // Show targetDescription — what THIS player sees — falling back to description.
      const displayText = effect.targetDescription ?? effect.description
      const body = effect.instruction
        ? `${displayText}${sourceText ? ` (${effect.sourcePlayerName})` : ''}`
        : `${displayText}${sourceText}`

      setModal({
        kind: 'timed',
        title: `Нанесён эффект: ${effect.name}`,
        body,
        seconds: 5,
      })
    }
  }, [state.effects])

  // Escaped players see a dedicated victory screen — they already won.
  if (currentPlayer.status === 'ESCAPED') {
    return <EscapedScreen onLeave={clearSession} />
  }

  // Dead players see a dedicated death screen.
  if (currentPlayer.status === 'DEAD') return <DeathScreen onLeave={clearSession} />

  const isKiller = currentPlayer.role === 'KILLER'
  const survivors = state.players.filter((player) => player.role === 'SURVIVOR')

  // Count active (non-expired) effects on this player — used to flash the Effects tab.
  const activeEffectCount = state.effects.filter((effect) => {
    if (effect.owned || effect.expiresAt === null) return false
    const remainingMs = new Date(effect.expiresAt).getTime() - Date.now()
    return remainingMs > 0
  }).length

  function confirmDamage(playerId: string, playerName: string) {
    setModal({
      kind: 'confirm',
      title: 'Атаковать?',
      body: `Атаковать ${playerName}? Это отнимет у цели 1 HP.`,
      confirmLabel: 'Атаковать',
      onConfirm: () => {
        setModal(null)
        void attackPlayer(playerId)
      },
    })
  }

  function confirmEffectUse(effectId: string, targetPlayerId?: string) {
    setModal({
      kind: 'confirm',
      title: 'Применить абилку?',
      body: 'Это действие изменяет состояние игры',
      confirmLabel: 'Использовать',
      onConfirm: () => {
        setModal(null)
        void triggerEffect(effectId, targetPlayerId)
      },
    })
  }

  function confirmQuestComplete(questId: string) {
    setModal({
      kind: 'confirm',
      title: 'Завершить квест?',
      body: 'Это действие перманентно и не может быть отменено.',
      confirmLabel: 'Завершить квест',
      onConfirm: () => {
        setModal(null)
        void completeQuest(questId)
      },
    })
  }

  function confirmEscape(exitDefinitionId: string, exitName: string) {
    setModal({
      kind: 'confirm',
      title: `Сбежать через ${exitName}?`,
      body: 'Убедитесь, что условия выхода выполнены, прежде чем покинуть игру.',
      confirmLabel: 'Сбежать',
      onConfirm: () => {
        setModal(null)
        void escapeThroughExit(exitDefinitionId)
      },
    })
  }

  function confirmLeave() {
    setModal({
      kind: 'confirm',
      title: 'Покинуть игру?',
      body: 'Вы выйдете из комнаты. Вы не сможете вернуться позже.',
      confirmLabel: 'Ливнуть',
      onConfirm: () => {
        setModal(null)
        clearSession()
      },
    })
  }

  return (
    <main className="min-h-screen px-4 pb-8 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <GameHeader
          state={state}
          player={currentPlayer}
          remainingSeconds={remainingSeconds}
          connectionStatus={connectionStatus}
          onLeave={confirmLeave}
        />
        {error && <p className="my-3 text-sm text-destructive">{error}</p>}
        {/* Winner banner — shown once the game has finished. */}
        {state.status === 'FINISHED' && (
          <Card
            className={
              state.winner === 'SURVIVORS'
                ? 'mt-5 border-success/60 bg-success/10'
                : 'mt-5 border-primary/60 bg-primary/10'
            }
          >
            <CardContent className="flex items-center gap-3 p-4 text-sm font-semibold">
              <Trophy
                className={
                  state.winner === 'SURVIVORS'
                    ? 'size-5 text-success'
                    : 'size-5 text-primary'
                }
              />
              <span className={state.winner === 'SURVIVORS' ? 'text-success' : 'text-primary'}>
                {state.winner === 'SURVIVORS'
                  ? 'Выжившие побеждают! Все сбежали.'
                  : 'Ман побеждает. Время вышло.'}
              </span>
            </CardContent>
          </Card>
        )}
        {state.exitsUnlocked && state.status === 'RUNNING' && (
          <Card className="mt-5 border-primary bg-primary/10">
            <CardContent className="flex items-center gap-3 p-4 text-sm font-semibold text-primary">
              <Sparkles className="size-5" />
             Сюрвы завершили квесты! Выходы открыты — выжившие могут сбежать.
            </CardContent>
          </Card>
        )}
        <Tabs
          className="mt-5"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
        >
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
<TabsTrigger value="status">[ Игра ]</TabsTrigger>
             <TabsTrigger value="effects" className="relative">
              [ Эффекты ]
              {activeEffectCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-xs font-bold text-warning-foreground animate-pulse">
                  {activeEffectCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quests">[ Квесты ]</TabsTrigger>
            <TabsTrigger value="players">[ Игроки ]</TabsTrigger>
            {!isKiller && <TabsTrigger value="chat">[ Чат ]</TabsTrigger>}

            <TabsTrigger value="exits">[ Выходы ]</TabsTrigger>
          </TabsList>
          <TabsContent value="status" className="mt-5">
            <GameStatusPanel
              player={currentPlayer}
              players={state.players}
              isKiller={isKiller}
            />
          </TabsContent>
          <TabsContent value="quests" className="mt-5">
            <GameQuests
              quests={state.quests}
              isSurvivor={!isKiller}
              requiredQuestPoints={state.requiredQuestPoints}
              completedQuestPoints={state.completedQuestPoints}
              exitsUnlocked={state.exitsUnlocked}
              onComplete={confirmQuestComplete}
            />
          </TabsContent>
          <TabsContent value="exits" className="mt-5">
            <GameExits
              exits={state.exits}
              isSurvivor={!isKiller}
              isAlive={currentPlayer.status === 'ALIVE'}
              exitsUnlocked={state.exitsUnlocked}
              onEscape={confirmEscape}
            />
          </TabsContent>
          <TabsContent value="players" className="mt-5">
            <GamePlayers
              players={
                isKiller
                  ? survivors
                  : survivors.filter((player) => player.id !== currentPlayer.id)
              }
              isKiller={isKiller}
              onDamage={confirmDamage}
            />
          </TabsContent>
          {!isKiller && (
            <TabsContent value="chat" className="mt-5">
              <ChatSection
                messages={state.chatMessages}
                onSend={(text) => void sendChat(text)}
              />
            </TabsContent>
          )}
          <TabsContent value="effects" className="mt-5">
            <EffectsSection
              effects={state.effects}
              players={state.players}
              currentPlayerId={session.playerId}
              onUse={confirmEffectUse}
            />
          </TabsContent>
        </Tabs>
      </div>
      {modal?.kind === 'confirm' && (
        <Modal
          title={modal.title}
          body={modal.body}
          confirmLabel={modal.confirmLabel}
          onConfirm={modal.onConfirm}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'timed' && (
        <TimedModal
          title={modal.title}
          body={modal.body}
          seconds={modal.seconds}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  )
}

// Shown when the current player is dead — game over for that participant.
function DeathScreen({ onLeave }: { onLeave: () => void }) {
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <Skull className="mx-auto size-16 text-destructive" />
        <h1 className="mt-6 font-display text-5xl font-semibold text-foreground">
          Ты умер
        </h1>
        <p className="mt-4 text-muted-foreground">
          Покойся с миром
        </p>
        <Button
          className="mt-8"
          onClick={() => setConfirmLeaveOpen(true)}
          variant="outline"
        >
          Ливнуть
        </Button>
        {confirmLeaveOpen && (
          <Modal
            title="Покинуть игру?"
            body="Вы выйдете из комнаты. Вы сможете вернуться по коду игры."
            confirmLabel="Ливнуть"
            onConfirm={() => {
              setConfirmLeaveOpen(false)
              onLeave()
            }}
            onClose={() => setConfirmLeaveOpen(false)}
          />
        )}
      </div>
    </main>
  )
}

// Shown when the current player has escaped — they won.
function EscapedScreen({ onLeave }: { onLeave: () => void }) {
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <DoorOpen className="mx-auto size-16 text-success" />
        <h1 className="mt-6 font-display text-5xl font-semibold text-foreground">
          Ты сбежал!
        </h1>
        <p className="mt-4 text-muted-foreground">
          Молодец! Возьми с полки пирожок
        </p>
        <Button
          className="mt-8"
          onClick={() => setConfirmLeaveOpen(true)}
          variant="outline"
        >
          Ливнуть
        </Button>
        {confirmLeaveOpen && (
          <Modal
            title="Покинуть игру?"
            body="Вы выйдете из комнаты. Вы сможете вернуться по коду игры."
            confirmLabel="Ливнуть"
            onConfirm={() => {
              setConfirmLeaveOpen(false)
              onLeave()
            }}
            onClose={() => setConfirmLeaveOpen(false)}
          />
        )}
      </div>
    </main>
  )
}
