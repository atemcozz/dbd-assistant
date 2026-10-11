import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from './prisma.service'

// Character kit shape needed to copy it onto a player.
type CharacterKit = {
  id: string
  role: PlayerRole
  maxHealth: number | null
  characterAbilities: { abilityId: string; count: number | null }[]
  characterStartBuffs: {
    buffId: string
    duration: number | null
    buff: { defaultDuration: number | null }
  }[]
}

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(role?: PlayerRole) {
    const characters = await this.prisma.characterType.findMany({
      where: role ? { role } : undefined,
      include: {
        characterAbilities: {
          include: {
            ability: { include: { buffs: { include: { buff: true } } } },
          },
        },
        characterStartBuffs: {
          include: { buff: true },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })

    // Flatten into the same shapes used by getState, so the frontend
    // can consume both sources uniformly.
    return characters.map((character) => ({
      id: character.id,
      role: character.role,
      name: character.name,
      description: character.description,
      maxHealth: character.maxHealth,
      coverImage: character.coverImage,
      abilities: character.characterAbilities.map((ca) => {
        const link = ca.ability.buffs[0]
        return {
          abilityId: ca.abilityId,
          name: ca.ability.name,
          description: ca.ability.description,
          type: ca.ability.type,
          duration: link
            ? (link.duration ?? link.buff.defaultDuration)
            : null,
          cooldown: ca.ability.cooldown,
          count: ca.count,
        }
      }),
      startingBuffs: character.characterStartBuffs.map((cs) => ({
        buffId: cs.buffId,
        name: cs.buff.name,
        description: cs.buff.description,
      })),
    }))
  }

  async assignRole(
    code: string,
    playerId: string,
    sessionToken: string,
    role: PlayerRole,
  ) {
    const game = await this.getOwnedLobby(code, sessionToken)

    const player = await this.prisma.player.findFirst({
      where: {
        id: playerId,
        gameId: game.id,
      },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    // Remove character type, abilities and buffs when changing role.
    // Also drop selected killer-specific quests that no longer apply
    // (this player was the last killer of that type).
    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: player.id },
        data: {
          role,
          characterTypeId: null,
          health: null,
        },
      })

      await tx.playerAbility.deleteMany({
        where: { playerId: player.id },
      })

      await tx.activeBuff.deleteMany({
        where: { targetPlayerId: player.id },
      })

      await this.removeOrphanKillerQuests(tx, game.id)
    })

    return game
  }

  async assignCharacter(
    code: string,
    playerId: string,
    sessionToken: string,
    characterTypeId: string,
  ) {
    const game = await this.getOwnedLobby(code, sessionToken)

    const player = await this.prisma.player.findFirst({
      where: {
        id: playerId,
        gameId: game.id,
      },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    const character = await this.prisma.characterType.findUnique({
      where: { id: characterTypeId },
      include: {
        characterAbilities: true,
        characterStartBuffs: { include: { buff: true } },
      },
    })

    if (!character || character.role !== player.role) {
      throw new BadRequestException('INVALID_CHARACTER_TYPE')
    }

    // Copy abilities and starting buffs to the player, set health from
    // maxHealth, drop selected killer quests whose type this player no
    // longer plays, and auto-select this killer type's quests so the
    // owner doesn't forget them.
    await this.prisma.$transaction(async (tx) => {
      await this.applyCharacterKit(tx, player.id, character)
      await this.removeOrphanKillerQuests(tx, game.id)

      if (character.role === PlayerRole.KILLER) {
        await this.addKillerQuests(tx, game.id, character.id)
      }
    })

    return game
  }

  // Picks a random survivor type no one in the game has yet (repeating
  // only when every type is taken) and applies it to the player.
  // Returns the type id, or null when no survivor types exist — the
  // caller then leaves the player unassigned for manual setup.
  async assignRandomSurvivor(
    gameId: string,
    playerId: string,
  ): Promise<string | null> {
    const types = await this.prisma.characterType.findMany({
      where: { role: PlayerRole.SURVIVOR },
      include: {
        characterAbilities: true,
        characterStartBuffs: { include: { buff: true } },
      },
    })

    if (types.length === 0) {
      return null
    }

    const taken = new Set(
      (
        await this.prisma.player.findMany({
          where: { gameId },
          select: { characterTypeId: true },
        })
      )
        .map((player) => player.characterTypeId)
        .filter((id): id is string => id !== null),
    )

    const free = types.filter((type) => !taken.has(type.id))
    const pool = free.length > 0 ? free : types
    const character = pool[Math.floor(Math.random() * pool.length)]!

    await this.prisma.$transaction(async (tx) => {
      await this.applyCharacterKit(tx, playerId, character)
    })

    return character.id
  }

  // Copies a character kit onto a player: role-appropriate health,
  // abilities and starting buffs. Shared by owner assignment and
  // join-time auto-assignment.
  private async applyCharacterKit(
    tx: Prisma.TransactionClient,
    playerId: string,
    character: CharacterKit,
  ) {
    let health: number | null = null

    if (character.role === PlayerRole.SURVIVOR) {
      health = character.maxHealth
    }

    await tx.player.update({
      where: { id: playerId },
      data: {
        characterTypeId: character.id,
        health,
        status: PlayerStatus.ALIVE,
      },
    })

    await tx.playerAbility.deleteMany({
      where: { playerId },
    })

    // Reassigning also clears buffs — in practice this only runs in the
    // lobby where no in-game buffs exist yet.
    await tx.activeBuff.deleteMany({
      where: { targetPlayerId: playerId },
    })

    if (character.characterAbilities.length > 0) {
      await tx.playerAbility.createMany({
        data: character.characterAbilities.map((item) => ({
          playerId,
          abilityId: item.abilityId,
          // null count = unlimited uses.
          chargesRemaining: item.count,
        })),
      })
    }

    // Materialize starting buffs on the player (permanent or timed).
    // Only permanent starting buffs are used in config today.
    const now = new Date()

    if (character.characterStartBuffs.length > 0) {
      await tx.activeBuff.createMany({
        data: character.characterStartBuffs.map((item) => {
          const seconds = item.duration ?? item.buff.defaultDuration

          return {
            buffId: item.buffId,
            sourcePlayerId: null,
            targetPlayerId: playerId,
            appliedAt: now,
            expiresAt:
              seconds === null
                ? null
                : new Date(now.getTime() + seconds * 1000),
          }
        }),
      })
    }
  }

  // Owner convenience: make everyone except the owner a survivor with
  // a random character. Types don't repeat while supply lasts; with more
  // players than types the shuffled deck simply repeats.
  async rollSurvivors(code: string, sessionToken: string) {
    const game = await this.getOwnedLobby(code, sessionToken)

    const types = await this.prisma.characterType.findMany({
      where: { role: PlayerRole.SURVIVOR },
    })

    if (types.length === 0) {
      throw new ConflictException('NO_SURVIVOR_CHARACTERS')
    }

    const players = (
      await this.prisma.player.findMany({
        where: { gameId: game.id },
        orderBy: { createdAt: 'asc' },
      })
    ).filter((player) => player.id !== game.ownerPlayerId)

    const deck = [...types]

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = deck[i]!
      deck[i] = deck[j]!
      deck[j] = tmp
    }

    for (let i = 0; i < players.length; i++) {
      await this.assignRole(code, players[i]!.id, sessionToken, PlayerRole.SURVIVOR)
      await this.assignCharacter(code, players[i]!.id, sessionToken, deck[i % deck.length]!.id)
    }

    return game
  }

  // After a lobby role/character change, selected quests may reference a
  // killer character type that is no longer assigned to anyone.
  // Delete those GameQuest rows and renumber the rest so the physical
  // marker numbers stay 1..n without gaps.
  private async removeOrphanKillerQuests(
    tx: Prisma.TransactionClient,
    gameId: string,
  ) {
    const killers = await tx.player.findMany({
      where: { gameId, role: PlayerRole.KILLER },
      select: { characterTypeId: true },
    })

    const assignedKillerTypes = new Set(
      killers
        .map((killer) => killer.characterTypeId)
        .filter((value): value is string => value !== null),
    )

    const gameQuests = await tx.gameQuest.findMany({
      where: { gameId },
      include: {
        questDefinition: { select: { killerCharacterTypeId: true } },
      },
      orderBy: { number: 'asc' },
    })

    const orphanIds = gameQuests
      .filter((quest) => {
        const killerType = quest.questDefinition.killerCharacterTypeId
        return killerType !== null && !assignedKillerTypes.has(killerType)
      })
      .map((quest) => quest.id)

    if (orphanIds.length === 0) {
      return
    }

    await tx.gameQuest.deleteMany({
      where: { id: { in: orphanIds } },
    })

    const remaining = await tx.gameQuest.findMany({
      where: { gameId },
      include: {
        questDefinition: { select: { killerCharacterTypeId: true } },
      },
      orderBy: { number: 'asc' },
    })

    for (let index = 0; index < remaining.length; index++) {
      const nextNumber = index + 1

      if (remaining[index].number !== nextNumber) {
        await tx.gameQuest.update({
          where: { id: remaining[index].id },
          data: { number: nextNumber },
        })
      }
    }
  }

  // After assigning a killer character, auto-select that type's quests
  // so the owner doesn't forget them. Only missing ones are added,
  // appended after existing numbers — manual deselection of other
  // quests is never touched.
  private async addKillerQuests(
    tx: Prisma.TransactionClient,
    gameId: string,
    killerTypeId: string,
  ) {
    const existing = await tx.gameQuest.findMany({
      where: { gameId },
      select: { questDefinitionId: true, number: true },
    })
    const existingIds = new Set(
      existing.map((quest) => quest.questDefinitionId),
    )

    const defs = await tx.questDefinition.findMany({
      where: { killerCharacterTypeId: killerTypeId },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    const missing = defs.filter((def) => !existingIds.has(def.id))

    if (missing.length === 0) {
      return
    }

    const nextNumber = existing.reduce(
      (max, quest) => Math.max(max, quest.number),
      0,
    )

    await tx.gameQuest.createMany({
      data: missing.map((def, index) => ({
        gameId,
        questDefinitionId: def.id,
        number: nextNumber + index + 1,
      })),
    })
  }

  private async getOwnedLobby(
    codeInput: string,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    const game = await this.prisma.game.findUnique({
      where: { code },
    })

    if (!game) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (game.ownerPlayerId !== player.id) {
      throw new ConflictException('NOT_GAME_OWNER')
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    return game
  }
}