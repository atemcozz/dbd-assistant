import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  QuestStatus,
} from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { PrismaService } from './prisma.service'
import { EffectsService } from './effects.service'
import type {
  GameQuestView,
  LobbyPlayer,
  LobbyState,
  PlayerEffectView,
} from './game.types'

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: EffectsService,
  ) {}

 async createGame(name: string, playerName: string) {
  const sessionToken = this.createSessionToken()

  let code = this.createCode()

  while (await this.prisma.game.findUnique({ where: { code } })) {
    code = this.createCode()
  }

  const game = await this.prisma.$transaction(async (tx) => {
    const createdGame = await tx.game.create({
      data: {
        code,
        name,
      },
    })

    const player = await tx.player.create({
      data: {
        gameId: createdGame.id,
        name: playerName,
        sessionToken,
        role: PlayerRole.SURVIVOR,
        health: null,
      },
    })

    return tx.game.update({
      where: { id: createdGame.id },
      data: {
        ownerPlayerId: player.id,
      },
    })
  })

  return this.getState(game.code, sessionToken)
}

  async joinGame(codeInput: string, playerName: string) {
    const code = codeInput.toUpperCase()

    const game = await this.prisma.game.findUnique({
      where: { code },
    })

    if (!game) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    const sessionToken = this.createSessionToken()

    const player = await this.prisma.player.create({
      data: {
        gameId: game.id,
        name: playerName,
        sessionToken,
        role: PlayerRole.SURVIVOR,
        health: null,
      },
    })

    return this.getState(code, player.sessionToken)
  }

  async startGame(codeInput: string, sessionToken: string) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    const players = await this.prisma.player.findMany({
      where: { gameId: game.id },
      select: { characterTypeId: true },
    })

    for (const player of players) {
      if (!player.characterTypeId) {
        throw new ConflictException(
          'ALL_PLAYERS_NEED_CHARACTER',
        )
      }
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
      },
    })

    return this.getState(game.code, sessionToken)
  }

  async finishGame(codeInput: string, sessionToken: string) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    if (game.status !== GameStatus.RUNNING) {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.FINISHED,
        finishedAt: new Date(),
      },
    })

    return this.getState(game.code, sessionToken)
  }

  async updateSettings(
    codeInput: string,
    sessionToken: string,
    durationSeconds: number,
    requiredQuestCount: number,
  ) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        durationSeconds,
        requiredQuestCount,
      },
    })

    return this.getState(game.code, sessionToken)
  }

  async getState(
    codeInput: string,
    sessionToken?: string,
  ): Promise<LobbyState> {
    const code = codeInput.toUpperCase()

    const game = await this.prisma.game.findUnique({
      where: { code },
      include: {
        players: {
          include: { characterType: true },
          orderBy: { createdAt: 'asc' },
        },
        quests: {
          include: { questDefinition: true },
          orderBy: { number: 'asc' },
        },
        chatMessages: {
          include: { player: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    })

    if (!game) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    await this.finishIfExpired(game)

    const viewer = game.players.find(
      (player) => player.sessionToken === sessionToken,
    )

    const players: LobbyPlayer[] = []

    for (const player of game.players) {
      let characterType: LobbyPlayer['characterType'] = null

      if (player.characterType) {
        characterType = {
          id: player.characterType.id,
          role: player.characterType.role,
          name: player.characterType.name,
          description: player.characterType.description,
          maxHealth: player.characterType.maxHealth,
        }
      }

      players.push({
        id: player.id,
        name: player.name,
        role: player.role,
        characterTypeId: player.characterTypeId,
        health: player.health,
        status: player.status,
        characterType,
      })
    }

    let quests: GameQuestView[] = []

    const canSeeQuests =
      game.status !== GameStatus.LOBBY ||
      viewer?.role === PlayerRole.KILLER ||
      viewer?.id === game.ownerPlayerId

    if (canSeeQuests) {
      quests = this.filterQuests(game.quests, viewer)
    }

    const completedQuestCount = game.quests.filter(
      (quest) => quest.status === QuestStatus.COMPLETED,
    ).length

    const exitsUnlocked =
      completedQuestCount >= game.requiredQuestCount

    let remainingSeconds: number | null = null

    if (game.status === GameStatus.RUNNING && game.startedAt) {
      const end =
        game.startedAt.getTime() +
        game.durationSeconds * 1000

      remainingSeconds = Math.max(
        0,
        Math.floor((end - Date.now()) / 1000),
      )
    }

    const chatMessages = []

    if (viewer?.role === PlayerRole.SURVIVOR) {
      for (const message of game.chatMessages) {
        chatMessages.push({
          id: message.id,
          text: message.text,
          createdAt: message.createdAt,
          playerId: message.playerId,
          playerName: message.player.name,
          playerStatus: message.player.status,
        })
      }
    }

    let effects: PlayerEffectView[] = []

    if (viewer) {
      effects = await this.effects.getPlayerEffects(viewer.id)
    }

    return {
      id: game.id,
      code: game.code,
      name: game.name,
      status: game.status,
      ownerPlayerId: game.ownerPlayerId,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      durationSeconds: game.durationSeconds,
      remainingSeconds,
      requiredQuestCount: game.requiredQuestCount,
      exitsUnlocked,
      players,
      quests,
      chatMessages,
      effects,
    }
  }

  async getSession(sessionToken: string) {
    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: { game: true },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    return player
  }

 async markConnected(sessionToken: string) {
  const player =
    await this.getSession(sessionToken)

  if (player.status === PlayerStatus.DISCONNECTED) {
    return this.prisma.player.update({
      where: { id: player.id },
      data: {
        status: PlayerStatus.ALIVE,
      },
    })
  }

  return player
}

async markDisconnected(sessionToken: string) {
  const player =
    await this.getSession(sessionToken)

  if (player.status === PlayerStatus.ALIVE) {
    return this.prisma.player.update({
      where: { id: player.id },
      data: {
        status: PlayerStatus.DISCONNECTED,
      },
    })
  }

  return player
}

async getStateById(
  gameId: string,
  sessionToken?: string,
) {
  const game = await this.prisma.game.findUnique({
    where: { id: gameId },
    select: { code: true },
  })

  if (!game) {
    throw new NotFoundException('GAME_NOT_FOUND')
  }

  return this.getState(game.code, sessionToken)
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

    if (
      game.id !== player.gameId ||
      game.ownerPlayerId !== player.id
    ) {
      throw new ConflictException('NOT_GAME_OWNER')
    }

    return game
  }

  private async finishIfExpired(game: {
    id: string
    status: GameStatus
    startedAt: Date | null
    durationSeconds: number
  }) {
    if (game.status !== GameStatus.RUNNING) {
      return
    }

    if (!game.startedAt) {
      return
    }

    const end =
      game.startedAt.getTime() +
      game.durationSeconds * 1000

    if (Date.now() < end) {
      return
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.FINISHED,
        finishedAt: new Date(end),
      },
    })
  }

  private filterQuests(
    quests: typeof Array.prototype,
    viewer: {
      role: PlayerRole
      characterTypeId: string | null
    } | undefined,
  ): GameQuestView[] {
    const result: GameQuestView[] = []

    for (const quest of quests as any[]) {
      if (viewer?.role === PlayerRole.KILLER) {
        const killerType = quest.questDefinition.killerCharacterTypeId

        if (
          killerType !== null &&
          killerType !== viewer.characterTypeId
        ) {
          continue
        }
      }

      result.push({
        id: quest.id,
        number: quest.number,
        status: quest.status,
        completedBy: quest.completedById,
        completedAt: quest.completedAt,
        definition: {
          id: quest.questDefinition.id,
          name: quest.questDefinition.name,
          description: quest.questDefinition.description,
          type: quest.questDefinition.type,
          radius: quest.questDefinition.radius,
          killerCharacterTypeId:
            quest.questDefinition.killerCharacterTypeId,
        },
      })
    }

    return result
  }

  private createCode() {
    return randomBytes(3).toString('hex').toUpperCase()
  }

  private createSessionToken() {
    return randomBytes(24).toString('hex')
  }
}