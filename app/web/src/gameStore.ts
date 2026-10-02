import { create } from 'zustand'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const SESSION_KEY = 'dbd-assistant-session'

export type Role = 'SURVIVOR' | 'KILLER'
export type PlayerStatus = 'ALIVE' | 'DEAD' | 'DISCONNECTED'

export type CharacterType = {
  id: string
  role: Role
  name: string
  description: string
  maxHealth: number
}

export type LobbyPlayer = {
  id: string
  name: string
  role: Role
  characterTypeId: string | null
  health: number
  maxHealth: number
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
  players: LobbyPlayer[]
  currentPlayerId?: string
}

type Session = { gameCode: string; playerId: string; sessionToken: string }

type GameStore = {
  session: Session | null
  state: LobbyState | null
  characterTypes: CharacterType[]
  error: string | null
  isLoading: boolean
  restoreSession: () => Promise<void>
  createGame: (name: string, playerName: string) => Promise<void>
  joinGame: (code: string, playerName: string) => Promise<void>
  refreshState: () => Promise<void>
  assignRole: (playerId: string, role: Role) => Promise<void>
  assignCharacter: (playerId: string, characterTypeId: string) => Promise<void>
  clearSession: () => void
}

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
  error: null,
  isLoading: false,

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

  clearSession: () => {
    localStorage.removeItem(SESSION_KEY)
    set({ session: null, state: null, error: null })
  },
}))

export async function loadCharacterTypes() {
  return request<CharacterType[]>('/character-types')
}