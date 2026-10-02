import type { CharacterType, Game, Player } from '@prisma/client'

export type LobbyPlayer = Pick<
  Player,
  'id' | 'name' | 'role' | 'characterTypeId' | 'health' | 'maxHealth' | 'status'
> & {
  characterType: Pick<CharacterType, 'id' | 'role' | 'name' | 'description' | 'maxHealth'> | null
}

export type LobbyState = Pick<Game, 'id' | 'code' | 'name' | 'status' | 'ownerPlayerId' | 'createdAt'> & {
  players: LobbyPlayer[]
}