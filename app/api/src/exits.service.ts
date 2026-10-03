import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  QuestStatus,
} from '@prisma/client'
import { PrismaService } from './prisma.service'

// Exits are physical escape routes. The owner selects them in the lobby
// (at least 1 required to start). During the game, alive survivors can
// escape through an exit once enough quest points are collected.
// When every survivor has escaped, the game ends and the killer loses.
@Injectable()
export class ExitsService {
  constructor(private readonly prisma: PrismaService) {}

  // Exit definitions are universal — no killer-specific filtering.
  // Visibility mirrors quests: owner + killers in lobby, everyone once running.
  async listDefinitions(codeInput: string, sessionToken: string) {
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
      throw new ForbiddenException('EXITS_HIDDEN_UNTIL_GAME_START')
    }

    return this.prisma.exitDefinition.findMany({
      orderBy: { id: 'asc' },
    })
  }

  // Owner replaces the game's selected exits. Lobby only.
  async select(codeInput: string, sessionToken: string, ids: string[]) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    const uniqueIds = Array.from(new Set(ids))

    await this.prisma.$transaction(async (tx) => {
      await tx.gameExit.deleteMany({
        where: { gameId: game.id },
      })

      for (const exitDefinitionId of uniqueIds) {
        await tx.gameExit.create({
          data: {
            gameId: game.id,
            exitDefinitionId,
          },
        })
      }
    })

    return game
  }

  // A survivor escapes through an exit. This is the win action for that player:
  // killer can no longer interact with them, and other players see them as ESCAPED.
  // If every survivor has now escaped, the game finishes — killer loses.
  async use(codeInput: string, exitDefinitionId: string, sessionToken: string) {
    const code = codeInput.toUpperCase()

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (player.role !== PlayerRole.SURVIVOR) {
      throw new ConflictException('ONLY_SURVIVORS_CAN_ESCAPE')
    }

    if (player.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    const game = await this.prisma.game.findUnique({
      where: { code },
    })

    if (!game || game.id !== player.gameId) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (game.status !== GameStatus.RUNNING) {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    // Exit must be selected for this game.
    const gameExit = await this.prisma.gameExit.findFirst({
      where: {
        gameId: game.id,
        exitDefinitionId,
      },
    })

    if (!gameExit) {
      throw new NotFoundException('EXIT_NOT_IN_GAME')
    }

    // Exits only open once enough quest points are collected.
    const completedQuestPoints = await this.getCompletedQuestPoints(game.id)

    if (completedQuestPoints < game.requiredQuestPoints) {
      throw new ConflictException('EXITS_LOCKED')
    }

    // Mark the player as escaped. Killer and effects already reject non-ALIVE
    // targets, so they become untouchable automatically.
    await this.prisma.player.update({
      where: { id: player.id },
      data: {
        status: PlayerStatus.ESCAPED,
        escapedAt: new Date(),
      },
    })

    // If every survivor has escaped, the killer loses — finish the game.
    await this.finishIfAllSurvivorsEscaped(game.id)

    return game
  }

  private async getCompletedQuestPoints(gameId: string) {
    const quests = await this.prisma.gameQuest.findMany({
      where: { gameId, status: QuestStatus.COMPLETED },
      include: { questDefinition: { select: { cost: true } } },
    })

    return quests.reduce(
      (sum, quest) => sum + quest.questDefinition.cost,
      0,
    )
  }

  private async finishIfAllSurvivorsEscaped(gameId: string) {
    const survivors = await this.prisma.player.findMany({
      where: {
        gameId,
        role: PlayerRole.SURVIVOR,
      },
      select: { status: true },
    })

    // No survivors to evaluate — nothing to finish.
    if (survivors.length === 0) return

    const allEscaped = survivors.every(
      (survivor) => survivor.status === PlayerStatus.ESCAPED,
    )

    if (!allEscaped) return

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        status: GameStatus.FINISHED,
        finishedAt: new Date(),
        winner: 'SURVIVORS',
      },
    })
  }

  private async authorizeOwner(codeInput: string, sessionToken: string) {
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
