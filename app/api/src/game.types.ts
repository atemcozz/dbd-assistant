import type {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  QuestStatus,
} from '@prisma/client'

// Read-only ability summary for character type display (e.g. killer info for survivors).
export type CharacterAbilityInfo = {
  abilityId: string
  name: string
  description: string
  // ACTIVE = usable action, PASSIVE = display-only trait.
  type: string
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

// Player view without credentials (sessionToken)
export type LobbyPlayer = {
  id: string
  name: string
  role: PlayerRole
  characterTypeId: string | null
  health: number | null
  // Knockouts taken this game (0..MAX_KNOCKOUTS). Drives the heart color
  // shown to every player: green / yellow / red.
  knockouts: number
  status: PlayerStatus
  // True while the player holds an active `shield` buff — the killer
  // cannot attack them (server rejects with TARGET_INVINCIBLE).
  isInvincible: boolean
  // Expiry of the invincibility (max over active shield rows); null means
  // either not invincible or a permanent shield. Clients derive the live
  // state from this timestamp so an expired shield disappears without
  // waiting for the next state fetch.
  invincibleUntil: Date | null
  characterType: {
    id: string
    role: PlayerRole
    name: string
    description: string
    maxHealth: number | null
    // Cover art path relative to config/images/ (null = no cover).
    // Served by the API under /static/images/.
    coverImage: string | null
    // Abilities and permanent starting buffs this character type has
    // (from CharacterAbility + AbilityDefinition, CharacterStartBuff + BuffDefinition).
    // Used to show killers their abilities in the survivor's game status view.
    abilities: CharacterAbilityInfo[]
    startingBuffs: CharacterStartBuffInfo[]
  } | null
}


// Game quest with definition flattened for frontend convenience
export type GameQuestView = {
  id: string
  number: number
  status: QuestStatus
  // Killer block expiry; null = not blocked. The client derives the
  // remaining countdown from this timestamp.
  blockedUntil: Date | null
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
// UI specific view — an ability the viewer owns (from PlayerAbility).
export type PlayerAbilityView = {
  id: string
  abilityId: string
  name: string
  description: string
  // ACTIVE = usable action, PASSIVE = display-only trait (never usable).
  type: string
  // Cooldown in seconds before this ability can be used again.
  cooldown: number
  // When the player last used this ability (null if never).
  // Used by the frontend to compute remaining cooldown.
  lastUsedAt: Date | null
  // Remaining uses (null = unlimited). Decremented on every use.
  chargesRemaining: number | null
  // Allowed target types for this ability (e.g. ["SELF","SURVIVOR"] or ["ALL_SURVIVORS"]).
  // The frontend uses this to decide whether to show a target picker / "All survivors" option.
  allowedTargets: string[]
}

// UI specific view — a buff currently applied to the viewer (from ActiveBuff).
export type PlayerBuffView = {
  // ActiveBuff row id — used by the frontend to dedupe apply modals.
  id: string
  buffId: string
  name: string
  // What the affected player sees (the physical-game instruction).
  description: string
  // Expiry timestamp; null = permanent buff.
  expiresAt: Date | null
  // Name of the player who applied this buff (null for starting/manual buffs).
  sourcePlayerName: string | null
}

// An instant effect applied by an ability use (HEAL/HURT resolve immediately
// and leave no ActiveBuff row). Returned by the use endpoint so the client
// can show a feedback modal — INFO buffs already pop one via the buff list.
export type AppliedInstantEffect = {
  buffId: string
  name: string
  description: string
  targetPlayerId: string
  targetPlayerName: string
}

// A quest block applied by an ability use. Returned by the use endpoint so
// the client can show a feedback modal — blocked quests also show a lock
// badge with a countdown in the quest list.
export type AppliedQuestBlock = {
  questNumber: number
  questName: string
  blockedUntil: Date
}

// What an ability use applied: instant player effects, quest blocks, or
// nothing (pure INFO abilities surface through the buff list instead).
export type AbilityUseResult = {
  appliedEffects: AppliedInstantEffect[]
  appliedQuestBlocks: AppliedQuestBlock[]
}

// Game state with computional fields for frontend convenience,\
// eg remainingSeconds, exitsUnlocked, abilities, buffs, chatMessages and etc
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
  // Abilities the viewer owns (active usable ones plus passive traits).
  abilities: PlayerAbilityView[]
  // Buffs currently applied to the viewer (timed and permanent).
  buffs: PlayerBuffView[]
}

export type ChatMessageView = {
  id: string
  text: string
  createdAt: Date
  playerId: string
  playerName: string
  playerStatus: PlayerStatus
}