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
import { describeGameEnd, getRemainingSeconds } from '@/lib/format'
import { useGameStore, type LobbyState } from '@/gameStore'

// Modal state — a confirm modal, a timed modal, or a non-timed info modal.
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
  | {
      kind: 'info'
      title: string
      body: string
    }
  | null

// Shared end-of-game modal — same announcement for timeout, full escape,
// no killers left, or no survivors at start. Dismissible; play may continue.
function GameEndModal({
  state,
  onClose,
}: {
  state: LobbyState
  onClose: () => void
}) {
  return (
    <Modal
      info
      title="Игра окончена"
      body={describeGameEnd(state)}
      confirmLabel="Продолжить"
      onClose={onClose}
    />
  )
}

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
  const triggerAbility = useGameStore((store) => store.useAbility)
  const applySelfBuff = useGameStore((store) => store.applySelfBuff)
  const clearSession = useGameStore((store) => store.clearSession)
  const refreshState = useGameStore((store) => store.refreshState)

  const currentPlayer = state.players.find(
    (player) => player.id === session.playerId,
  )!

  const previousHealth = useRef(currentPlayer.health)
  // Track which timed buff IDs we've already shown a modal for,
  // so we don't re-show the same buff every state broadcast.
  const shownBuffModals = useRef<Set<string>>(new Set())
  // End-game modal is shown once per finish (not on every state broadcast).
  const endModalShownFor = useRef<string | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(state.startedAt, state.durationSeconds),
  )
  const [modal, setModal] = useState<ModalState>(null)
  const [endModalOpen, setEndModalOpen] = useState(false)
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

  // When the client clock hits zero, ask the server to re-check expiry so
  // status/winner flip to FINISHED/KILLER without waiting for another action.
  useEffect(() => {
    if (remainingSeconds <= 0 && state.status === 'RUNNING') {
      void refreshState()
    }
  }, [remainingSeconds, state.status, refreshState])

  // Show the shared end-game modal once when the game finishes.
  // Covers timeout, all escaped, no killers left, and no survivors at start.
  useEffect(() => {
    if (state.status !== 'FINISHED') return
    const key = state.id
    if (endModalShownFor.current === key) return
    endModalShownFor.current = key
    setEndModalOpen(true)
  }, [state.status, state.id])

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

  // Detect new buffs applied to this player and show a modal.
  // Timed buffs get the countdown modal; permanent buffs received from a
  // player (e.g. manual self-application) get a non-timed info modal.
  // Starting buffs (no source) never pop — they are just character stats.
  useEffect(() => {
    for (const buff of state.buffs) {
      // Only show modal once per buff instance.
      if (shownBuffModals.current.has(buff.id)) continue

      const isTimed = buff.expiresAt !== null
      const fromPlayer = buff.sourcePlayerName !== null
      if (!isTimed && !fromPlayer) continue

      shownBuffModals.current.add(buff.id)

      const sourceText =
        buff.sourcePlayerName && buff.sourcePlayerName !== currentPlayer.name
          ? ` (от ${buff.sourcePlayerName})`
          : ''

      if (isTimed) {
        setModal({
          kind: 'timed',
          title: `Нанесён эффект: ${buff.name}`,
          body: `${buff.description}${sourceText}`,
          seconds: 5,
        })
      } else {
        setModal({
          kind: 'info',
          title: `Нанесён эффект: ${buff.name}`,
          body: `${buff.description}${sourceText}`,
        })
      }
    }
  }, [state.buffs, currentPlayer.name])

  // Chat unread tracking — messages from other players that arrive while
  // the chat tab is not open. History present at mount counts as read.
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const knownChatIdsRef = useRef<Set<string>>(
    new Set(state.chatMessages.map((message) => message.id)),
  )

  useEffect(() => {
    const known = knownChatIdsRef.current
    const fresh = state.chatMessages.filter(
      (message) => !known.has(message.id),
    )
    if (fresh.length === 0) return

    for (const message of fresh) known.add(message.id)

    const fromOthers = fresh.filter(
      (message) => message.playerId !== session.playerId,
    ).length

    if (fromOthers > 0 && activeTab !== 'chat') {
      setUnreadChatCount((count) => count + fromOthers)
    }
  }, [state.chatMessages, activeTab, session.playerId])

  // Visiting the chat tab clears the unread count.
  useEffect(() => {
    if (activeTab === 'chat') setUnreadChatCount(0)
  }, [activeTab])

  // Escaped players see a dedicated victory screen — they already won.
  if (currentPlayer.status === 'ESCAPED') {
    return (
      <EscapedScreen
        onLeave={clearSession}
        state={state}
        endModalOpen={endModalOpen}
        onCloseEndModal={() => setEndModalOpen(false)}
      />
    )
  }

  // Dead players see a dedicated death screen.
  if (currentPlayer.status === 'DEAD') {
    return (
      <DeathScreen
        onLeave={clearSession}
        state={state}
        endModalOpen={endModalOpen}
        onCloseEndModal={() => setEndModalOpen(false)}
      />
    )
  }

  const isKiller = currentPlayer.role === 'KILLER'
  const survivors = state.players.filter((player) => player.role === 'SURVIVOR')

  // Count active (non-expired) timed buffs — used to flash the Effects tab.
  const activeBuffCount = state.buffs.filter((buff) => {
    if (buff.expiresAt === null) return false
    const remainingMs = new Date(buff.expiresAt).getTime() - Date.now()
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

  function confirmAbilityUse(abilityId: string, targetPlayerId?: string) {
    setModal({
      kind: 'confirm',
      title: 'Применить абилку?',
      body: 'Это действие изменяет состояние игры',
      confirmLabel: 'Использовать',
      onConfirm: () => {
        setModal(null)
        void triggerAbility(abilityId, targetPlayerId)
      },
    })
  }

  // Manual buff application — an unknown id pops a modal instead of the
  // inline error line, echoing what the player typed (the input is cleared).
  function handleApplyBuff(buffId: string) {
    void applySelfBuff(buffId).then((code) => {
      if (code !== 'BUFF_NOT_FOUND') return
      setModal({
        kind: 'info',
        title: 'Эффект не найден',
        body: `Не удалось найти эффект «${buffId}». Проверь id и попробуй ещё раз.`,
      })
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
                : state.winner === 'DRAW'
                  ? 'mt-5 border-warning/60 bg-warning/10'
                  : 'mt-5 border-primary/60 bg-primary/10'
            }
          >
            <CardContent className="flex items-center gap-3 p-4 text-sm font-semibold">
              <Trophy
                className={
                  state.winner === 'SURVIVORS'
                    ? 'size-5 text-success'
                    : state.winner === 'DRAW'
                      ? 'size-5 text-warning'
                      : 'size-5 text-primary'
                }
              />
              <span
                className={
                  state.winner === 'SURVIVORS'
                    ? 'text-success'
                    : state.winner === 'DRAW'
                      ? 'text-warning'
                      : 'text-primary'
                }
              >
                {describeGameEnd(state)}
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
              {activeBuffCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground animate-pulse sm:ml-1 sm:h-5 sm:min-w-5 sm:text-xs">
                  {activeBuffCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quests">[ Квесты ]</TabsTrigger>
            <TabsTrigger value="players">[ Игроки ]</TabsTrigger>
            {!isKiller && (
              <TabsTrigger value="chat" className="relative">
                [ Чат ]
                {unreadChatCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-pulse sm:ml-1 sm:h-5 sm:min-w-5 sm:text-xs">
                    {unreadChatCount}
                  </span>
                )}
              </TabsTrigger>
            )}

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
              abilities={state.abilities}
              buffs={state.buffs}
              players={state.players}
              currentPlayerId={session.playerId}
              onUse={confirmAbilityUse}
              onApplyBuff={handleApplyBuff}
            />
          </TabsContent>
        </Tabs>
      </div>
      {endModalOpen && (
        <GameEndModal state={state} onClose={() => setEndModalOpen(false)} />
      )}
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
      {modal?.kind === 'info' && (
        <Modal
          info
          title={modal.title}
          body={modal.body}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  )
}

// Shown when the current player is dead — game over for that participant.
function DeathScreen({
  onLeave,
  state,
  endModalOpen,
  onCloseEndModal,
}: {
  onLeave: () => void
  state: LobbyState
  endModalOpen: boolean
  onCloseEndModal: () => void
}) {
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
        {endModalOpen && (
          <GameEndModal state={state} onClose={onCloseEndModal} />
        )}
      </div>
    </main>
  )
}

// Shown when the current player has escaped — they won.
function EscapedScreen({
  onLeave,
  state,
  endModalOpen,
  onCloseEndModal,
}: {
  onLeave: () => void
  state: LobbyState
  endModalOpen: boolean
  onCloseEndModal: () => void
}) {
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
        {endModalOpen && (
          <GameEndModal state={state} onClose={onCloseEndModal} />
        )}
      </div>
    </main>
  )
}
