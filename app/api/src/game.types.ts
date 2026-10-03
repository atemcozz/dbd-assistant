import type {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  QuestStatus,
} from '@prisma/client'

// Read-only effect summary for character type display (e.g. killer info for survivors).
export type CharacterEffectInfo = {
  effectId: string
  name: string
  description: string
  charges: number | null
  duration: number | null
  cooldown: number
}

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
    // Effects this character type starts with (from CharacterEffect + EffectDefinition).
    // Used to show killers their abilities in the survivor's game status view.
    characterEffects: CharacterEffectInfo[]
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
    cost: number
    killerCharacterTypeId: string | null
  }
}

// Selected exit with definition flattened — shown to all players.
export type GameExitView = {
  id: string
  definition: {
    id: string
    name: string
    description: string
  }
}

// Exit definition for the lobby selection panel.
export type ExitDefinitionView = {
  id: string
  name: string
  description: string
}
// UI specific view
export type PlayerEffectView = {
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
  expiresAt: Date | null
  instruction: string | null
  // Cooldown in seconds before this effect can be used again.
  cooldown: number
  // When the source last used this effect (null if never).
  // Used by the frontend to compute remaining cooldown.
  lastUsedAt: Date | null
  // true when this is an ability the player owns (from PlayerEffect table).
  // false when it's an active effect applied TO the player by someone else.
  owned: boolean
  // Name of the player who applied this effect (null for self-owned abilities).
  sourcePlayerName: string | null
  // Allowed target types for this effect (e.g. ["SELF","SURVIVOR"] or ["ALL_SURVIVORS"]).
  // The frontend uses this to decide whether to show a target picker / "All survivors" option.
  allowedTargets: string[]
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
  // Total quest points needed to unlock the exits.
  requiredQuestPoints: number
  // Sum of costs of all completed quests so far.
  completedQuestPoints: number
  exitsUnlocked: boolean
  // Selected exits for this game — visible to all players once the game runs.
  exits: GameExitView[]
  // Winner when the game has finished: 'SURVIVORS' | 'KILLER' | 'DRAW' | null.
  // DRAW = time ran out with survivors still alive and not escaped (both lose).
  winner: string | null
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