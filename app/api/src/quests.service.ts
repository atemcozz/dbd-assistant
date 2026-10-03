import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { GameStatus, PlayerRole, PlayerStatus, QuestStatus } from '@prisma/client'
import { PrismaService } from './prisma.service'

@Injectable()
export class QuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(
    codeInput: string,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: { game: true },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (player.game.code !== code) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (
      player.game.status === GameStatus.LOBBY &&
      player.role !== PlayerRole.KILLER &&
      player.id !== player.game.ownerPlayerId
    ) {
      throw new ForbiddenException('QUESTS_HIDDEN_UNTIL_GAME_START')
    }

    // No killer-type filter on definitions either — lobby access is the only
  // gate (owner/killers/running game). Orphan cleanup happens when a
  // player's killer type changes.
    return this.prisma.questDefinition.findMany({
      orderBy: { id: 'asc' },
    })
  }

  async select(
    codeInput: string,
    sessionToken: string,
    ids: string[],
  ) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    const uniqueIds = Array.from(new Set(ids))

    // replace all quests with the selected ones, preserving order
    await this.prisma.$transaction(async (tx) => {
      await tx.gameQuest.deleteMany({
        where: { gameId: game.id },
      })

      for (let i = 0; i < uniqueIds.length; i++) {
        await tx.gameQuest.create({
          data: {
            gameId: game.id,
            questDefinitionId: uniqueIds[i],
            number: i + 1,
          },
        })
      }
    })

    return game
  }

  async complete(
    codeInput: string,
    questId: string,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (
      player.role !== PlayerRole.SURVIVOR ||
      player.status !== PlayerStatus.ALIVE
    ) {
      throw new ConflictException('ONLY_ACTIVE_SURVIVORS')
    }

    const game = await this.prisma.game.findUnique({
      where: { code },
    })

    if (!game || game.id !== player.gameId) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (game.status === GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_RUNNING')
    }
    // updateMany to avoid race conditions
    const result = await this.prisma.gameQuest.updateMany({
      where: {
        id: questId,
        gameId: game.id,
        status: QuestStatus.AVAILABLE,
      },
      data: {
        status: QuestStatus.COMPLETED,
        completedById: player.id,
        completedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new ConflictException('QUEST_ALREADY_COMPLETED')
    }

    return game
  }

  private async authorizeOwner(
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

    return game
  }
}