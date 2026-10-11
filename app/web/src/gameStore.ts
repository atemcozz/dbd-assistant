import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'

// API base URL — baked in at build time from VITE_API_URL (required;
// the build fails without it, because an empty value silently redirects
// all API and socket.io traffic to the page origin). Absolute, so the
// app works under any page path or domain.
export const API_URL =
  import.meta.env.VITE_API_URL
export const SESSION_KEY = 'dbd-assistant-session'

export type Role = 'SURVIVOR' | 'KILLER'
export type PlayerStatus = 'ALIVE' | 'DEAD' | 'DISCONNECTED' | 'ESCAPED'

// Read-only ability summary attached to a character type (e.g. killer abilities).
export type CharacterAbilityInfo = {
  abilityId: string
  name: string
  description: string
  // ACTIVE = usable action, PASSIVE = display-only trait.
  type: 'ACTIVE' | 'PASSIVE'
  // Effective buff duration in seconds (ability override ?? buff default).
  // null for instantaneous (HEAL/HURT), permanent buffs, and passives.
  duration: number | null
  cooldown: number
  // Configured starting use count for this character (null = unlimited).
  count: number | null
}

// Read-only permanent starting buff attached to a character type.
export type CharacterStartBuffInfo = {
  buffId: string
  name: string
  description: string
}

export type CharacterType = {
  id: string
  role: Role
  name: string
  description: string
  maxHealth: number | null
  // Cover art path relative to config/images/ (null = no cover).
  coverImage: string | null
  // Abilities and permanent starting buffs this character type has.
  // Only present in game state (getState), not in the lobby character-types list.
  // Used to show killers their abilities in the survivor's game status view.
  abilities?: CharacterAbilityInfo[]
  startingBuffs?: CharacterStartBuffInfo[]
}

export type LobbyPlayer = {
  id: string
  name: string
  role: Role
  characterTypeId: string | null
  health: number | null
  status: PlayerStatus
  // True while the player holds an active `shield` buff — attacks rejected.
  isInvincible: boolean
  // Invincibility expiry (ISO); null = not invincible or permanent shield.
  // Derived live on the client so an expired shield disappears without
  // waiting for the next state fetch.
  invincibleUntil: string | null
  characterType: CharacterType | null
}
export type LobbyState = {
  id: string
  code: string
  name: string
  status: 'LOBBY' | 'RUNNING' | 'FINISHED'
  ownerPlayerId: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  durationSeconds: number
  remainingSeconds: number | null
  // Total quest points needed to unlock the exits.
  requiredQuestPoints: number
  // Sum of costs of all completed quests so far.
  completedQuestPoints: number
  exitsUnlocked: boolean
  // Selected exits for this game — visible to all players once the game runs.
  exits: GameExit[]
  // Winner when the game has finished: 'SURVIVORS' | 'KILLER' | 'DRAW' | null.
  // DRAW = time out with survivors still alive and not escaped (both lose).
  winner: string | null
  chatMessages: ChatMessage[]
  // Abilities the current player owns (usable, with cooldown).
  abilities: PlayerAbility[]
  // Buffs currently applied to the current player (timed and permanent).
  buffs: PlayerBuff[]
  players: LobbyPlayer[]
  quests: GameQuest[]
  currentPlayerId?: string
}
// An ability owned by the player (from their character kit).
export type PlayerAbility = {
  id: string
  abilityId: string
  name: string
  description: string
  // ACTIVE = usable action, PASSIVE = display-only trait (never usable).
  type: 'ACTIVE' | 'PASSIVE'
  // Cooldown in seconds before this ability can be used again.
  cooldown: number
  // When the player last used this ability (null if never).
  // Used to compute remaining cooldown on the frontend.
  lastUsedAt: string | null
  // Remaining uses (null = unlimited). Decremented on every use.
  chargesRemaining: number | null
  // Allowed target types (e.g. ["SELF","SURVIVOR"] or ["ALL_SURVIVORS"]).
  allowedTargets: string[]
}
// An instant effect applied by an ability use (HEAL/HURT resolve immediately
// and leave no buff row). The use endpoint returns these so the client can
// show a feedback modal — INFO buffs already pop one via the buff list.
export type AppliedInstantEffect = {
  buffId: string
  name: string
  description: string
  targetPlayerId: string
  targetPlayerName: string
}
// A quest block applied by an ability use. The use endpoint returns these
// so the client can show a feedback modal — blocked quests also show a lock
// badge with a countdown in the quest list.
export type AppliedQuestBlock = {
  questNumber: number
  questName: string
  blockedUntil: string
}
// What an ability use applied: instant player effects, quest blocks, or
// nothing (pure INFO abilities surface through the buff list instead).
export type AbilityUseResult = {
  appliedEffects: AppliedInstantEffect[]
  appliedQuestBlocks: AppliedQuestBlock[]
}
// A buff currently applied to the player (timed or permanent).
export type PlayerBuff = {
  id: string
  buffId: string
  name: string
  // What the affected player sees (the physical-game instruction).
  description: string
  // Expiry timestamp; null = permanent buff.
  expiresAt: string | null
  // Name of the player who applied this buff (null for starting/manual buffs).
  sourcePlayerName: string | null
}
export type ChatMessage = { id: string; text: string; createdAt: string; playerId: string; playerName: string; playerStatus: PlayerStatus }

export type QuestDefinition = {
  id: string
  name: string
  description: string
  type: string
  radius: number | null
  // Point value of this quest. Completed quest costs sum toward requiredQuestPoints.
  cost: number
  killerCharacterTypeId: string | null
}

export type GameQuest = {
  id: string
  number: number
  status: 'AVAILABLE' | 'COMPLETED'
  // Killer block expiry (ISO); null = not blocked. The client derives the
  // remaining countdown from this timestamp.
  blockedUntil: string | null
  completedBy: string | null
  completedAt: string | null
  definition: QuestDefinition
}

// Exit definition — a physical escape route selected for the game.
export type ExitDefinition = {
  id: string
  name: string
  description: string
}

// Selected exit with definition flattened — shown to all players in game.
export type GameExit = {
  id: string
  definition: ExitDefinition
}

type Session = { gameCode: string; playerId: string; sessionToken: string }
export type { Session }

type GameStore = {
  session: Session | null
  state: LobbyState | null
  characterTypes: CharacterType[]
  questDefinitions: QuestDefinition[]
  exitDefinitions: ExitDefinition[]
  error: string | null
  isLoading: boolean
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected'
  restoreSession: () => Promise<void>
  createGame: (name: string, playerName: string) => Promise<void>
  joinGame: (code: string, playerName: string) => Promise<void>
  refreshState: () => Promise<void>
  assignRole: (playerId: string, role: Role) => Promise<void>
  assignCharacter: (playerId: string, characterTypeId: string) => Promise<void>
  rollSurvivors: () => Promise<void>
  selectQuests: (questDefinitionIds: string[]) => Promise<void>
  selectExits: (exitDefinitionIds: string[]) => Promise<void>
  startGame: () => Promise<void>
  finishGame: () => Promise<void>
  attackPlayer: (playerId: string) => Promise<void>
  completeQuest: (questId: string) => Promise<void>
  escapeThroughExit: (exitDefinitionId: string) => Promise<void>
  useAbility: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => Promise<AbilityUseResult | null>
  applySelfBuff: (buffId: string) => Promise<string | null>
  updateSettings: (durationSeconds: number, requiredQuestPoints: number) => Promise<void>
  sendChat: (text: string) => Promise<void>
  connectRealtime: () => void
  disconnectRealtime: () => void
  requestRealtimeState: () => void
  clearSession: () => void
}

let realtimeSocket: Socket | null = null
let questMutationQueue = Promise.resolve()

function readSession(): Session | null {
  const saved = localStorage.getItem(SESSION_KEY)
  if (!saved) return null
  try {
    return JSON.parse(saved) as Session
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

async function request<T>(path: string, init?: RequestInit, sessionToken?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

// Player-facing messages for error codes returned by the backend.
const ACTION_ERROR_MESSAGES: Record<string, string> = {
  ABILITY_NOT_AVAILABLE: 'Абилка недоступна',
  ABILITY_ON_COOLDOWN: 'Абилка ещё перезаряжается',
  ABILITY_NO_CHARGES: 'Закончились заряды абилки',
  ABILITY_IS_PASSIVE: 'Это пассивная способность — её нельзя использовать',
  QUEST_TARGET_REQUIRED: 'Выбери квест',
  QUEST_NOT_FOUND: 'Квест не найден',
  QUEST_BLOCKED: 'Квест заблокирован маньяком — дождись окончания блокировки',
  ONLY_KILLERS_CAN_BLOCK_QUESTS: 'Только маньяк может блокировать квесты',
  INVALID_ABILITY_CONFIG: 'Недопустимая настройка абилки',
  NO_SURVIVOR_CHARACTERS: 'Нет персонажей выживших',
  ABILITY_TARGET_REQUIRED: 'Выбери цель',
  INVALID_ABILITY_TARGET: 'Недопустимая цель',
  INVALID_ABILITY_TARGETS: 'Недопустимая цель',
  TARGET_NOT_ACTIVE: 'Цель не может действовать',
  TARGET_CANNOT_BE_HEALED: 'Эту цель нельзя вылечить',
  TARGET_CANNOT_TAKE_DAMAGE: 'Эту цель нельзя ранить',
  TARGET_INVINCIBLE: 'Этот выживший неуязвим — атака невозможна',
  PLAYER_NOT_ACTIVE: 'Ты не можешь действовать',
  GAME_NOT_RUNNING: 'Игра ещё не началась',
  BUFF_ID_REQUIRED: 'Введи id баффа',
  INVALID_BUFF_ACTION: 'Этот бафф нельзя применить вручную',
}

export const useGameStore = create<GameStore>((set, get) => ({
  session: null,
  state: null,
  characterTypes: [],
  questDefinitions: [],
  exitDefinitions: [],
  error: null,
  isLoading: false,
  connectionStatus: 'idle',

  restoreSession: async () => {
    const session = readSession()
    if (!session) return
    set({ session, isLoading: true, error: null })
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}`, undefined, session.sessionToken)
      set({ state, isLoading: false })
    } catch (error) {
      localStorage.removeItem(SESSION_KEY)
      set({ session: null, state: null, isLoading: false, error: error instanceof Error ? error.message : 'Session expired' })
    }
  },

  createGame: async (name, playerName) => {
    set({ isLoading: true, error: null })
    try {
      const result = await request<{ sessionToken: string; playerId: string; state: LobbyState }>('/games', {
        method: 'POST',
        body: JSON.stringify({ name, playerName }),
      })
      const session = { gameCode: result.state.code, playerId: result.playerId, sessionToken: result.sessionToken }
      saveSession(session)
      set({ session, state: result.state, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Could not create game' })
      throw error
    }
  },

  joinGame: async (code, playerName) => {
    set({ isLoading: true, error: null })
    try {
      const result = await request<{ sessionToken: string; playerId: string; state: LobbyState }>('/games/join', {
        method: 'POST',
        body: JSON.stringify({ code, playerName }),
      })
      const session = { gameCode: result.state.code, playerId: result.playerId, sessionToken: result.sessionToken }
      saveSession(session)
      set({ session, state: result.state, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Could not join game' })
      throw error
    }
  },

  refreshState: async () => {
    const { session } = get()
    if (!session) return
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}`, undefined, session.sessionToken)
      set({ state, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not refresh lobby' })
    }
  },

  assignRole: async (playerId, role) => {
    const { session } = get()
    if (!session) return
    set({ error: null })
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/players/${playerId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }, session.sessionToken)
      set({ state })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not assign role' })
    }
  },

  assignCharacter: async (playerId, characterTypeId) => {
    const { session } = get()
    if (!session) return
    set({ error: null })
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/players/${playerId}/character`, {
        method: 'PATCH',
        body: JSON.stringify({ characterTypeId }),
      }, session.sessionToken)
      set({ state })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not assign character' })
    }
  },

  rollSurvivors: async () => {
    const { session } = get()
    if (!session) return
    set({ error: null })
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/roll-survivors`, {
        method: 'POST',
      }, session.sessionToken)
      set({ state })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not roll survivors'
      set({ error: ACTION_ERROR_MESSAGES[message] ?? message })
    }
  },

  selectQuests: async (questDefinitionIds) => {
    const { session } = get()
    if (!session) return
    questMutationQueue = questMutationQueue.then(async () => {
      set({ error: null })
      try {
        const state = await request<LobbyState>(`/games/${session.gameCode}/quests`, {
          method: 'PUT',
          body: JSON.stringify({ questDefinitionIds }),
        }, session.sessionToken)
        set({ state })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Could not save quests' })
      }
    })
    await questMutationQueue
  },

  selectExits: async (exitDefinitionIds) => {
    const { session } = get()
    if (!session) return
    questMutationQueue = questMutationQueue.then(async () => {
      set({ error: null })
      try {
        const state = await request<LobbyState>(`/games/${session.gameCode}/exits`, {
          method: 'PUT',
          body: JSON.stringify({ exitDefinitionIds }),
        }, session.sessionToken)
        set({ state })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Could not save exits' })
      }
    })
    await questMutationQueue
  },

  startGame: async () => {
    const { session } = get()
    if (!session) return
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/start`, { method: 'POST' }, session.sessionToken)
      set({ state, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not start game' })
    }
  },

  finishGame: async () => {
    const { session } = get()
    if (!session) return
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/finish`, { method: 'POST' }, session.sessionToken)
      set({ state, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not finish game' })
    }
  },

  attackPlayer: async (playerId) => {
    const { session } = get()
    if (!session) return

    try {
      const state = await request<LobbyState>(
        `/games/${session.gameCode}/players/${playerId}/attack`,
        {
          method: 'POST',
        },
        session.sessionToken,
      )

      set({ state, error: null })
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Could not attack player',
      })
    }
  },

  completeQuest: async (questId) => {
    const { session } = get()
    if (!session) return
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/quests/${questId}/complete`, { method: 'POST' }, session.sessionToken)
      set({ state, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not complete quest' })
    }
  },

  escapeThroughExit: async (exitDefinitionId) => {
    const { session } = get()
    if (!session) return
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/exits/${exitDefinitionId}/use`, { method: 'POST' }, session.sessionToken)
      set({ state, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not escape' })
    }
  },

  // Returns what this use applied (instant effects and quest blocks),
  // or null when the use failed.
  useAbility: async (abilityId, targetPlayerId, targetQuestNumber) => {
    const { session } = get()
    if (!session) return null
    try {
      const { state, appliedEffects, appliedQuestBlocks } = await request<{ state: LobbyState; appliedEffects: AppliedInstantEffect[]; appliedQuestBlocks: AppliedQuestBlock[] }>(`/games/${session.gameCode}/abilities/${abilityId}/use`, { method: 'POST', body: JSON.stringify({ targetPlayerId, targetQuestNumber }) }, session.sessionToken)
      set({ state, error: null })
      return { appliedEffects, appliedQuestBlocks }
    } catch (error) {
      // Backend returns error codes; show a player-facing message for the
      // common ability failures instead of the raw code.
      const message = error instanceof Error ? error.message : 'Не удалось использовать абилку'
      set({ error: ACTION_ERROR_MESSAGES[message] ?? message })
      return null
    }
  },

  // Returns the backend error code, or null on success. BUFF_NOT_FOUND is
  // returned without the inline error line — the caller shows it as a modal.
  applySelfBuff: async (buffId) => {
    const { session } = get()
    if (!session) {
      set({ error: ACTION_ERROR_MESSAGES.GAME_NOT_RUNNING })
      return 'GAME_NOT_RUNNING'
    }
    try {
      const state = await request<LobbyState>(`/games/${session.gameCode}/buffs/self`, { method: 'POST', body: JSON.stringify({ buffId }) }, session.sessionToken)
      set({ state, error: null })
      return null
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN'
      if (code !== 'BUFF_NOT_FOUND') {
        set({ error: ACTION_ERROR_MESSAGES[code] ?? code })
      }
      return code
    }
  },

  updateSettings: async (durationSeconds, requiredQuestPoints) => {
    const { session } = get()
    if (!session) return
    const state = await request<LobbyState>(`/games/${session.gameCode}/settings`, { method: 'PATCH', body: JSON.stringify({ durationSeconds, requiredQuestPoints }) }, session.sessionToken)
    set({ state })
  },

  sendChat: async (text) => {
    const { session } = get()
    if (!session) return
    const state = await request<LobbyState>(`/games/${session.gameCode}/chat`, { method: 'POST', body: JSON.stringify({ text }) }, session.sessionToken)
    set({ state })
  },

  connectRealtime: () => {
    const { session } = get()
    if (!session || realtimeSocket?.connected) return
    realtimeSocket?.disconnect()
    set({ connectionStatus: 'connecting' })
    realtimeSocket = io(API_URL, {
      auth: { sessionToken: session.sessionToken },
      transports: ['websocket', 'polling'],
    })
    realtimeSocket.on('connect', () => {
      set({ connectionStatus: 'connected', error: null })
      realtimeSocket?.emit('state:request')
    })
    realtimeSocket.on('disconnect', () => set({ connectionStatus: 'disconnected' }))
    realtimeSocket.on('connect_error', (error) => set({ connectionStatus: 'disconnected', error: error.message }))
    realtimeSocket.on('connection:error', (payload: { message?: string }) => {
      set({ connectionStatus: 'disconnected', error: payload.message ?? 'Realtime session rejected' })
    })
    realtimeSocket.on('game:state', (state: LobbyState) => set({ state, connectionStatus: 'connected', error: null }))
  },

  disconnectRealtime: () => {
    realtimeSocket?.disconnect()
    realtimeSocket = null
    set({ connectionStatus: 'idle' })
  },

  requestRealtimeState: () => {
    realtimeSocket?.emit('state:request')
  },

  clearSession: () => {
    realtimeSocket?.disconnect()
    realtimeSocket = null
    localStorage.removeItem(SESSION_KEY)
    set({ session: null, state: null, error: null, connectionStatus: 'idle' })
  },
}))

export async function loadCharacterTypes() {
  return request<CharacterType[]>('/character-types')
}

export async function loadQuestDefinitions() {
  const session = useGameStore.getState().session
  return request<QuestDefinition[]>(`/quest-definitions?code=${encodeURIComponent(session?.gameCode ?? '')}`, undefined, session?.sessionToken)
}

export async function loadExitDefinitions() {
  const session = useGameStore.getState().session
  return request<ExitDefinition[]>(`/exit-definitions?code=${encodeURIComponent(session?.gameCode ?? '')}`, undefined, session?.sessionToken)
}