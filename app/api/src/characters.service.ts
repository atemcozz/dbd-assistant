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
    // maxHealth, and drop selected killer quests whose type this player
    // no longer plays.
    await this.prisma.$transaction(async (tx) => {
      let health: number | null = null

      if (character.role === PlayerRole.SURVIVOR) {
        health = character.maxHealth
      }

      await tx.player.update({
        where: { id: player.id },
        data: {
          characterTypeId: character.id,
          health,
          status: PlayerStatus.ALIVE,
        },
      })

      await tx.playerAbility.deleteMany({
        where: { playerId: player.id },
      })

      // Reassigning also clears buffs — in practice this only runs in the
      // lobby where no in-game buffs exist yet.
      await tx.activeBuff.deleteMany({
        where: { targetPlayerId: player.id },
      })

      if (character.characterAbilities.length > 0) {
        await tx.playerAbility.createMany({
          data: character.characterAbilities.map((item) => ({
            playerId: player.id,
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
              targetPlayerId: player.id,
              appliedAt: now,
              expiresAt:
                seconds === null
                  ? null
                  : new Date(now.getTime() + seconds * 1000),
            }
          }),
        })
      }

      await this.removeOrphanKillerQuests(tx, game.id)
    })

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