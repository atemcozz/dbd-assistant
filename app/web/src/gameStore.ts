import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const SESSION_KEY = 'dbd-assistant-session'

export type Role = 'SURVIVOR' | 'KILLER'
export type PlayerStatus = 'ALIVE' | 'DEAD' | 'DISCONNECTED'

// Read-only effect summary attached to a character type (e.g. killer abilities).
export type CharacterEffectInfo = {
  effectId: string
  name: string
  description: string
  charges: number | null
  duration: number | null
  cooldown: number
}

export type CharacterType = {
  id: string
  role: Role
  name: string
  description: string
  maxHealth: number | null
  // Effects this character type starts with.
  // Only present in game state (getState), not in the lobby character-types list.
  // Used to show killers their abilities in the survivor's game status view.
  characterEffects?: CharacterEffectInfo[]
}

export type LobbyPlayer = {
  id: string
  name: string
  role: Role
  characterTypeId: string | null
  health: number | null
  status: PlayerStatus
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
  chatMessages: ChatMessage[]
  effects: PlayerEffect[]
  players: LobbyPlayer[]
  quests: GameQuest[]
  currentPlayerId?: string
}
export type PlayerEffect = {
  id: string
  playerId: string
  effectId: string
  name: string
  description: string
  // What the target sees when this effect is applied to them.
  // Falls back to `description` when null.
  targetDescription: string | null
  charges: number | null
  duration: number | null
  expiresAt: string | null
  instruction: string | null
  // Cooldown in seconds before this effect can be used again.
  cooldown: number
  // When the source last used this effect (null if never).
  // Used to compute remaining cooldown on the frontend.
  lastUsedAt: string | null
  // true when the player owns this ability; false when applied to them by someone else.
  owned: boolean
  // Name of the player who applied this effect (null for self-owned abilities).
  sourcePlayerName: string | null
  // Allowed target types (e.g. ["SELF","SURVIVOR"] or ["ALL_SURVIVORS"]).
  allowedTargets: string[]
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
  completedBy: string | null
  completedAt: string | null
  definition: QuestDefinition
}

type Session = { gameCode: string; playerId: string; sessionToken: string }

type GameStore = {
  session: Session | null
  state: LobbyState | null
  characterTypes: CharacterType[]
  questDefinitions: QuestDefinition[]
  error: string | null
  isLoading: boolean
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected'
  restoreSession: () => Promise<void>
  createGame: (name: string, playerName: string) => Promise<void>
  joinGame: (code: string, playerName: string) => Promise<void>
  refreshState: () => Promise<void>
  assignRole: (playerId: string, role: Role) => Promise<void>
  assignCharacter: (playerId: string, characterTypeId: string) => Promise<void>
  selectQuests: (questDefinitionIds: string[]) => Promise<void>
  startGame: () => Promise<void>
  finishGame: () => Promise<void>
  attackPlayer: (playerId: string) => Promise<void>
  completeQuest: (questId: string) => Promise<void>
  useEffect: (effectId: string, targetPlayerId?: string) => Promise<void>
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

export const useGameStore = create<GameStore>((set, get) => ({
  session: null,
  state: null,
  characterTypes: [],
  questDefinitions: [],
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

  useEffect: async (effectId, targetPlayerId) => {
    const { session } = get()
    if (!session) return
    const state = await request<LobbyState>(`/games/${session.gameCode}/effects/${effectId}/use`, { method: 'POST', body: JSON.stringify({ targetPlayerId }) }, session.sessionToken)
    set({ state })
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