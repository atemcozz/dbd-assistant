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
import { AbilitiesService } from './abilities.service'
import type {
  CharacterAbilityInfo,
  CharacterStartBuffInfo,
  GameExitView,
  GameQuestView,
  LobbyPlayer,
  LobbyState,
  PlayerAbilityView,
  PlayerBuffView,
} from './game.types'

// Result of create/join: the session token + player id + full lobby state.
// The frontend needs all three to establish the session and render the lobby.
export type GameSessionResult = {
  sessionToken: string
  playerId: string
  state: LobbyState
}

// Prisma include shape for quests in getState — keeps filterQuests typed.
type QuestWithDefinition = {
  id: string
  number: number
  status: QuestStatus
  blockedUntil: Date | null
  completedById: string | null
  completedAt: Date | null
  questDefinition: {
    id: string
    name: string
    description: string
    type: string
    radius: number | null
    cost: number
    killerCharacterTypeId: string | null
  }
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilitiesService: AbilitiesService,
  ) {}

  async createGame(
    name: string,
    playerName: string,
  ): Promise<GameSessionResult> {
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

    const state = await this.getState(game.code, sessionToken)

    return {
      sessionToken,
      playerId: state.players.find(
        (player) => player.id === game.ownerPlayerId,
      )!.id,
      state,
    }
  }

  async joinGame(
    codeInput: string,
    playerName: string,
  ): Promise<GameSessionResult> {
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

    const state = await this.getState(code, sessionToken)

    return {
      sessionToken,
      playerId: player.id,
      state,
    }
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

    // Sum the costs of all selected quests — must meet the required points
    // before the game can start, otherwise exits could never open.
    const selectedQuests = await this.prisma.gameQuest.findMany({
      where: { gameId: game.id },
      include: { questDefinition: { select: { cost: true } } },
    })

    const totalQuestPoints = selectedQuests.reduce(
      (sum, quest) => sum + quest.questDefinition.cost,
      0,
    )

    if (totalQuestPoints < game.requiredQuestPoints) {
      throw new ConflictException('NOT_ENOUGH_QUEST_POINTS')
    }

    // At least one exit must be selected — without exits survivors can never win.
    const exitCount = await this.prisma.gameExit.count({
      where: { gameId: game.id },
    })

    if (exitCount === 0) {
      throw new ConflictException('NO_EXITS_SELECTED')
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        winner: null,
      },
    })

    // A game with no survivors is a misconfigured lobby, but it is NOT an
    // instant killer win — the killer only wins when every survivor is dead.
    // The game simply runs until the timeout (draw) or the owner finishes it.

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
    requiredQuestPoints: number,
  ) {
    const game = await this.authorizeOwner(codeInput, sessionToken)

    if (game.status !== GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_IN_LOBBY')
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        durationSeconds,
        requiredQuestPoints,
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
          include: {
            characterType: {
              include: {
                characterAbilities: {
                  include: {
                    ability: {
                      include: { buffs: { include: { buff: true } } },
                    },
                  },
                },
                characterStartBuffs: {
                  include: { buff: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        quests: {
          include: { questDefinition: true },
          orderBy: { number: 'asc' },
        },
        exits: {
          include: { exitDefinition: true },
          orderBy: { exitDefinition: { id: 'asc' } },
        },
        chatMessages: {
          include: { player: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    })

    if (!game) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    // Mid-game win checks first (all escaped / all dead / no killers left)
    // so timeout only applies when someone is still alive and not escaped.
    await this.finishIfDecided(game.id)
    await this.finishIfExpired(game)

    // Re-read status/winner so the response reflects any finish that just fired.
    const fresh = await this.prisma.game.findUnique({
      where: { id: game.id },
      select: { status: true, winner: true, finishedAt: true },
    })

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
          // Flatten abilities and starting buffs into read-only summaries.
          // duration = effective first-buff length (ability override ?? default)
          // so the frontend can show the same badges as before.
          abilities: player.characterType.characterAbilities.map(
            (ca): CharacterAbilityInfo => {
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
            },
          ),
          startingBuffs: player.characterType.characterStartBuffs.map(
            (cs): CharacterStartBuffInfo => ({
              buffId: cs.buffId,
              name: cs.buff.name,
              description: cs.buff.description,
            }),
          ),
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

    // Sum the costs of all completed quests — shared across the whole team.
    const completedQuestPoints = game.quests
      .filter((quest) => quest.status === QuestStatus.COMPLETED)
      .reduce((sum, quest) => sum + quest.questDefinition.cost, 0)

    const exitsUnlocked =
      completedQuestPoints >= game.requiredQuestPoints

    if (canSeeQuests) {
      quests = this.filterQuests(game.quests, exitsUnlocked)
    }

    // Exits are shown to all players once the game runs.
    // In lobby only the owner and killers see the selected exits.
    let exits: GameExitView[] = []

    if (canSeeQuests) {
      exits = game.exits.map((exit) => ({
        id: exit.id,
        definition: {
          id: exit.exitDefinition.id,
          name: exit.exitDefinition.name,
          description: exit.exitDefinition.description,
        },
      }))
    }

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

    // Only alive survivors can read survivor chat — killers and dead players get nothing.
    const chatMessages = []

    if (
      viewer?.role === PlayerRole.SURVIVOR &&
      viewer?.status === PlayerStatus.ALIVE
    ) {
      // chatMessages is newest-first (desc); reverse so UI shows oldest→newest.
      for (const message of [...game.chatMessages].reverse()) {
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

    let abilities: PlayerAbilityView[] = []
    let buffs: PlayerBuffView[] = []

    if (viewer) {
      abilities = await this.abilitiesService.getAbilities(viewer.id)
      buffs = await this.abilitiesService.getBuffs(viewer.id)
    }

    return {
      id: game.id,
      code: game.code,
      name: game.name,
      status: fresh?.status ?? game.status,
      ownerPlayerId: game.ownerPlayerId,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      finishedAt: fresh?.finishedAt ?? game.finishedAt,
      durationSeconds: game.durationSeconds,
      remainingSeconds,
      requiredQuestPoints: game.requiredQuestPoints,
      completedQuestPoints,
      exitsUnlocked,
      exits,
      winner: fresh?.winner ?? game.winner,
      players,
      quests,
      chatMessages,
      abilities,
      buffs,
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
    // Re-read — finishIfDecided may have just finished the game.
    const current = await this.prisma.game.findUnique({
      where: { id: game.id },
      select: { status: true, startedAt: true, durationSeconds: true },
    })

    if (!current || current.status !== GameStatus.RUNNING) {
      return
    }

    if (!current.startedAt) {
      return
    }

    const end =
      current.startedAt.getTime() +
      current.durationSeconds * 1000

    if (Date.now() < end) {
      return
    }

    // Time is out and the game is still running — nobody secured a win.
    // finishIfDecided already handled all-escaped / all-dead cases.
    // Remaining case: some survivors are still alive and not escaped → both lose.
    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.FINISHED,
        finishedAt: new Date(end),
        winner: 'DRAW',
      },
    })
  }

  // Win conditions that can fire mid-game (not only on timeout):
  // - every survivor has escaped → survivors win;
  // - every survivor is dead → killer wins;
  // - every killer is dead → survivors win.
  // Disconnects never decide a game. A player who only reloaded their
  // phone comes back ALIVE on reconnect, so a temporary network loss
  // must not award a win to anyone.
  // Called from getState after actions that change player status.
  async finishIfDecided(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
    })

    if (!game || game.status !== GameStatus.RUNNING) {
      return
    }

    const players = await this.prisma.player.findMany({
      where: { gameId },
      select: { role: true, status: true },
    })

    const survivors = players.filter((p) => p.role === PlayerRole.SURVIVOR)
    const killers = players.filter((p) => p.role === PlayerRole.KILLER)

    // All survivors escaped — survivors win.
    if (
      survivors.length > 0 &&
      survivors.every((s) => s.status === PlayerStatus.ESCAPED)
    ) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.FINISHED,
          finishedAt: new Date(),
          winner: 'SURVIVORS',
        },
      })
      return
    }

    // Every survivor is dead — killer wins. Covers killing the last
    // survivor mid-game, not only the clock running out.
    // DISCONNECTED deliberately does not count: a survivor who only
    // reloaded their phone must not hand the killer a free win.
    // (A mix of escaped and dead survivors never gives the killer a win —
    // the escaped ones are still in the game as survivors.)
    if (
      survivors.length > 0 &&
      survivors.every((s) => s.status === PlayerStatus.DEAD)
    ) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.FINISHED,
          finishedAt: new Date(),
          winner: 'KILLER',
        },
      })
      return
    }

    // Every killer is dead — survivors win. Same rule as above:
    // a killer who only reloaded must not hand survivors the win.
    // (No killers at all is a misconfigured lobby; leave the game running.)
    if (killers.length > 0 && killers.every((k) => k.status === PlayerStatus.DEAD)) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.FINISHED,
          finishedAt: new Date(),
          winner: 'SURVIVORS',
        },
      })
    }
  }

  // No killer-type filtering here — everyone who can see quests (owner,
  // killers in lobby, all players in game) gets the full selected list.
  // Orphaned killer quests are removed on the server when a type is swapped.
  private filterQuests(
    quests: QuestWithDefinition[],
    exitsUnlocked: boolean,
  ): GameQuestView[] {
    const result: GameQuestView[] = []

    for (const quest of quests) {
      // When exits are unlocked, hide remaining available quests —
      // survivors no longer need to complete them.
      if (exitsUnlocked && quest.status === QuestStatus.AVAILABLE) {
        continue
      }

      result.push({
        id: quest.id,
        number: quest.number,
        status: quest.status,
        blockedUntil: quest.blockedUntil,
        completedBy: quest.completedById,
        completedAt: quest.completedAt,
        definition: {
          id: quest.questDefinition.id,
          name: quest.questDefinition.name,
          description: quest.questDefinition.description,
          type: quest.questDefinition.type,
          radius: quest.questDefinition.radius,
          cost: quest.questDefinition.cost,
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