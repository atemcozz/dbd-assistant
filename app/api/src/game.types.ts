import type { CharacterType, ChatMessage, Game, GameQuest, QuestDefinition, Player } from '@prisma/client'

export type LobbyPlayer = Pick<
  Player,
  'id' | 'name' | 'role' | 'characterTypeId' | 'health' | 'maxHealth' | 'status'
> & {
  characterType: Pick<CharacterType, 'id' | 'role' | 'name' | 'description' | 'maxHealth'> | null
}

export type LobbyState = Pick<Game, 'id' | 'code' | 'name' | 'status' | 'ownerPlayerId' | 'createdAt'> & {
  players: LobbyPlayer[]
  quests: GameQuestView[]
  startedAt: Date | null
  durationSeconds: number
  requiredQuestCount: number
  exitsUnlocked: boolean
  chatMessages: ChatMessageView[]
  effects: PlayerEffectView[]
}
export type PlayerEffectView = { id: string; playerId: string; effectId: string; name: string; description: string; charges: number | null; duration: number | null; expiresAt: Date | null; instruction: string | null }

export type ChatMessageView = Pick<ChatMessage, 'id' | 'text' | 'createdAt' | 'playerId'> & { playerName: string; playerStatus: Player['status'] }

export type GameQuestView = Pick<GameQuest, 'id' | 'number' | 'status' | 'completedBy' | 'completedAt'> & {
  definition: Pick<QuestDefinition, 'id' | 'name' | 'description' | 'type' | 'radius' | 'settings' | 'killerCharacterTypeId'>
}