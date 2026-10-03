import type {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  QuestStatus,
} from '@prisma/client'

// Player view without credentials (sessionToken)
export type LobbyPlayer = {
  id: string
  name: string
  role: PlayerRole
  characterTypeId: string | null
  health: number | null
  status: PlayerStatus
  characterType: {
    id: string
    role: PlayerRole
    name: string
    description: string
    maxHealth: number | null
  } | null
}


// Game quest with definition flattened for frontend convenience
export type GameQuestView = {
  id: string
  number: number
  status: QuestStatus
  completedBy: string | null
  completedAt: Date | null
  definition: {
    id: string
    name: string
    description: string
    type: string
    radius: number | null
    killerCharacterTypeId: string | null
  }
}
// UI specific view 
export type PlayerEffectView = {
  id: string
  playerId: string
  effectId: string
  name: string
  description: string
  charges: number | null
  duration: number | null
  expiresAt: Date | null
  instruction: string | null
}

// Game state with computional fields for frontend convenience,\
// eg remainingSeconds, exitsUnlocked, effects, chatMessages and etc
export type LobbyState = {
  id: string
  code: string
  name: string
  status: GameStatus
  ownerPlayerId: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  durationSeconds: number
  remainingSeconds: number | null
  requiredQuestCount: number
  exitsUnlocked: boolean
  players: LobbyPlayer[]
  quests: GameQuestView[]
  chatMessages: ChatMessageView[]
  effects: PlayerEffectView[]
}

export type ChatMessageView = {
  id: string
  text: string
  createdAt: Date
  playerId: string
  playerName: string
  playerStatus: PlayerStatus
}