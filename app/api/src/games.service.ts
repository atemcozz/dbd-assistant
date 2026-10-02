import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PlayerRole, QuestStatus } from '@prisma/client'
import { PrismaService } from './prisma.service'
import type { GameQuestView, LobbyState } from './game.types'

type CreateGameInput = { name?: unknown; playerName?: unknown }
type JoinGameInput = { code?: unknown; playerName?: unknown }
type QuestSelectionInput = { questDefinitionIds?: unknown }
type QuestConfig = {
  id: string
  name: string
  description: string
  type: string
  radius: number | null
  settings: Record<string, unknown>
  killerCharacterTypeId: string | null
}
type PersistedQuest = {
  id: string
  number: number
  status: QuestStatus
  completedBy: string | null
  completedAt: Date | null
  questDefinition: Omit<QuestConfig, 'settings'> & { settings: string }
}
type SettingsInput = { durationSeconds?: unknown; requiredQuestCount?: unknown }
type ChatInput = { text?: unknown }

const characterDefinitions = [
  {
    id: 'medic',
    role: PlayerRole.SURVIVOR,
    name: 'Medic',
    description: 'Keeps the team alive.',
    maxHealth: 3,
  },
  {
    id: 'scout',
    role: PlayerRole.SURVIVOR,
    name: 'Scout',
    description: 'Fast and observant.',
    maxHealth: 2,
  },
  {
    id: 'stalker',
    role: PlayerRole.KILLER,
    name: 'Stalker',
    description: 'A relentless hunter.',
    maxHealth: 5,
  },
]

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCharacterTypes(role?: PlayerRole) {
    await this.ensureCharacterTypes()
    return this.prisma.characterType.findMany({
      where: role ? { role } : undefined,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  }

  async createGame(input: CreateGameInput) {
    const name = this.requiredText(input.name, 'Game name')
    const playerName = this.requiredText(input.playerName, 'Player name')
    await this.ensureCharacterTypes()

    let code = this.createCode()
    while (await this.prisma.game.findUnique({ where: { code } })) {
      code = this.createCode()
    }

    const sessionToken = this.createSessionToken()
    const game = await this.prisma.$transaction(async (transaction) => {
      const createdGame = await transaction.game.create({
        data: { code, name, ownerPlayerId: 'pending' },
      })
      const player = await transaction.player.create({
        data: {
          gameId: createdGame.id,
          name: playerName,
          sessionToken,
        },
      })
      return transaction.game.update({
        where: { id: createdGame.id },
        data: { ownerPlayerId: player.id },
      })
    })

    return { sessionToken, playerId: game.ownerPlayerId, state: await this.getState(game.code, sessionToken) }
  }

  async joinGame(input: JoinGameInput) {
    const code = this.requiredText(input.code, 'Game code').toUpperCase()
    const playerName = this.requiredText(input.playerName, 'Player name')
    const game = await this.prisma.game.findUnique({ where: { code } })
    if (!game) throw new NotFoundException('GAME_NOT_FOUND')
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')

    const player = await this.prisma.player.create({
      data: { gameId: game.id, name: playerName, sessionToken: this.createSessionToken() },
    })
    return { sessionToken: player.sessionToken, playerId: player.id, state: await this.getState(code, player.sessionToken) }
  }

  async listQuestDefinitions(sessionToken?: string, codeInput?: string) {
    if (!sessionToken) throw new ForbiddenException('SESSION_REQUIRED')
    const viewer = await this.getRealtimeSession(sessionToken)
    if (viewer.game.status === 'LOBBY' && viewer.role !== PlayerRole.KILLER && viewer.id !== viewer.game.ownerPlayerId) {
      throw new ForbiddenException('QUESTS_HIDDEN_UNTIL_GAME_START')
    }
    await this.syncQuestDefinitions()
    const code = codeInput ? this.requiredText(codeInput, 'Game code').toUpperCase() : undefined
    const game = code ? await this.prisma.game.findUnique({ where: { code }, include: { players: true } }) : null
    if (code && (!game || game.id !== viewer.gameId)) throw new NotFoundException('GAME_NOT_FOUND')
    const killerTypeIds = new Set((game?.players ?? []).filter((player) => player.role === PlayerRole.KILLER && player.characterTypeId).map((player) => player.characterTypeId as string))
    return this.prisma.questDefinition.findMany({
      where: code ? { OR: [{ killerCharacterTypeId: null }, { killerCharacterTypeId: { in: [...killerTypeIds] } }] } : undefined,
      orderBy: { id: 'asc' },
    })
  }

  async selectQuests(codeInput: string, sessionToken: string, input: QuestSelectionInput) {
    const game = await this.authorizeOwner(codeInput, sessionToken)
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')
    const values = input.questDefinitionIds
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
      throw new BadRequestException('QUEST_SELECTION_REQUIRED')
    }
    const questDefinitionIds = [...new Set(values)] as string[]
    await this.syncQuestDefinitions()
    const killerTypeIds = new Set((await this.prisma.player.findMany({ where: { gameId: game.id, role: PlayerRole.KILLER, characterTypeId: { not: null } }, select: { characterTypeId: true } })).map((player) => player.characterTypeId as string))
    const definitions = await this.prisma.questDefinition.findMany({ where: { OR: [{ killerCharacterTypeId: null }, { killerCharacterTypeId: { in: [...killerTypeIds] } }] } })
    const availableIds = new Set(definitions.map((definition) => definition.id))
    if (questDefinitionIds.some((id) => !availableIds.has(id))) throw new BadRequestException('INVALID_QUEST_DEFINITION')

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.gameQuest.findMany({ where: { gameId: game.id } })
      const existingIds = new Set(existing.map((quest) => quest.questDefinitionId))
      await transaction.gameQuest.deleteMany({ where: { gameId: game.id, questDefinitionId: { notIn: questDefinitionIds } } })
      await transaction.gameQuest.updateMany({ where: { gameId: game.id }, data: { number: { increment: 100000 } } })
      for (const [index, questDefinitionId] of questDefinitionIds.entries()) {
        if (existingIds.has(questDefinitionId)) {
          await transaction.gameQuest.updateMany({ where: { gameId: game.id, questDefinitionId }, data: { number: index + 1 } })
        } else {
          await transaction.gameQuest.create({ data: { gameId: game.id, questDefinitionId, number: index + 1 } })
        }
      }
    })
    return this.getState(game.code, sessionToken)
  }

  async completeQuest(codeInput: string, questId: string, sessionToken: string) {
    const code = this.requiredText(codeInput, 'Game code').toUpperCase()
    const player = await this.prisma.player.findUnique({ where: { sessionToken } })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    if (player.role !== PlayerRole.SURVIVOR) throw new ConflictException('ONLY_SURVIVORS_CAN_COMPLETE_QUESTS')
    if (player.status !== 'ALIVE') throw new ConflictException('PLAYER_NOT_ACTIVE')

    const game = await this.prisma.game.findUnique({ where: { code } })
    if (!game || game.id !== player.gameId) throw new NotFoundException('GAME_NOT_FOUND')
    if (game.status !== 'RUNNING') throw new ConflictException('GAME_NOT_RUNNING')

    const quest = await this.prisma.gameQuest.findFirst({ where: { id: questId, gameId: game.id } })
    if (!quest) throw new NotFoundException('QUEST_NOT_FOUND')
    if (quest.status === QuestStatus.COMPLETED) throw new ConflictException('QUEST_ALREADY_COMPLETED')
    await this.prisma.gameQuest.update({
      where: { id: quest.id },
      data: { status: QuestStatus.COMPLETED, completedBy: player.id, completedAt: new Date() },
    })
    return this.getState(code, sessionToken)
  }

  async startGame(codeInput: string, sessionToken: string) {
    const game = await this.authorizeOwner(codeInput, sessionToken)
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')
    await this.prisma.game.update({
      where: { id: game.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
    return this.getState(game.code, sessionToken)
  }

  async updateSettings(codeInput: string, sessionToken: string, input: SettingsInput) {
    const game = await this.authorizeOwner(codeInput, sessionToken)
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')
    const durationSeconds = this.optionalInteger(input.durationSeconds, game.durationSeconds, 60, 86400)
    const requiredQuestCount = this.optionalInteger(input.requiredQuestCount, game.requiredQuestCount, 0, 100)
    await this.prisma.game.update({ where: { id: game.id }, data: { durationSeconds, requiredQuestCount } })
    return this.getState(game.code, sessionToken)
  }

  async sendChat(codeInput: string, sessionToken: string, input: ChatInput) {
    const code = this.requiredText(codeInput, 'Game code').toUpperCase()
    const player = await this.prisma.player.findUnique({ where: { sessionToken } })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    if (player.role !== PlayerRole.SURVIVOR || player.status !== 'ALIVE') throw new ForbiddenException('SURVIVOR_CHAT_RESTRICTED')
    const game = await this.prisma.game.findUnique({ where: { code } })
    if (!game || game.id !== player.gameId) throw new NotFoundException('GAME_NOT_FOUND')
    if (game.status !== 'RUNNING') throw new ConflictException('GAME_NOT_RUNNING')
    const text = this.requiredText(input.text, 'Message')
    await this.prisma.chatMessage.create({ data: { gameId: game.id, playerId: player.id, text: text.slice(0, 500) } })
    return this.getState(code, sessionToken)
  }

  async damagePlayer(codeInput: string, targetPlayerId: string, sessionToken: string) {
    const code = this.requiredText(codeInput, 'Game code').toUpperCase()
    const source = await this.prisma.player.findUnique({ where: { sessionToken } })
    if (!source) throw new NotFoundException('PLAYER_NOT_FOUND')
    if (source.role !== PlayerRole.KILLER) throw new ConflictException('ONLY_KILLERS_CAN_ATTACK')
    const game = await this.prisma.game.findUnique({ where: { code } })
    if (!game || game.id !== source.gameId) throw new NotFoundException('GAME_NOT_FOUND')
    if (game.status !== 'RUNNING') throw new ConflictException('GAME_NOT_RUNNING')
    const target = await this.prisma.player.findFirst({ where: { id: targetPlayerId, gameId: game.id } })
    if (!target) throw new NotFoundException('PLAYER_NOT_FOUND')
    if (target.role !== PlayerRole.SURVIVOR) throw new ConflictException('KILLERS_CANNOT_DAMAGE_KILLERS')
    if (target.status !== 'ALIVE') throw new ConflictException('PLAYER_NOT_ACTIVE')
    const health = Math.max(0, target.health - 1)
    await this.prisma.player.update({
      where: { id: target.id },
      data: { health, status: health === 0 ? 'DEAD' : 'ALIVE' },
    })
    return this.getState(code, sessionToken)
  }

  async getState(codeInput: string, sessionToken?: string): Promise<LobbyState & { currentPlayerId?: string }> {
    const code = codeInput.toUpperCase()
    const game = await this.prisma.game.findUnique({
      where: { code },
      include: {
        players: { include: { characterType: true }, orderBy: { createdAt: 'asc' } },
        quests: { include: { questDefinition: true }, orderBy: { number: 'asc' } },
        chatMessages: { include: { player: true }, orderBy: { createdAt: 'asc' }, take: 100 },
      },
    })
    if (!game) throw new NotFoundException('GAME_NOT_FOUND')
    const { players, quests, chatMessages, ...gameState } = game
    const viewer = sessionToken ? players.find((player) => player.sessionToken === sessionToken) : undefined
    const canSeeQuests = game.status !== 'LOBBY' || viewer?.role === PlayerRole.KILLER || viewer?.id === game.ownerPlayerId
    return {
      ...gameState,
      players: players.map(({ id, name, role, characterTypeId, health, maxHealth, status, characterType }) => ({
        id,
        name,
        role,
        characterTypeId,
        health,
        maxHealth,
        status,
        characterType,
      })),
      quests: canSeeQuests ? this.filterQuests(quests) : [],
      exitsUnlocked: quests.filter((quest) => quest.status === QuestStatus.COMPLETED).length >= game.requiredQuestCount,
      chatMessages: viewer?.role === PlayerRole.SURVIVOR ? chatMessages.map((message) => ({ id: message.id, text: message.text, createdAt: message.createdAt, playerId: message.playerId, playerName: message.player.name, playerStatus: message.player.status })) : [],
      ...(sessionToken ? { currentPlayerId: players.find((player) => player.sessionToken === sessionToken)?.id } : {}),
    }
  }

  async getRealtimeSession(sessionToken: string) {
    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: { game: true },
    })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    return player
  }

  async getStateById(gameId: string, sessionToken?: string): Promise<LobbyState & { currentPlayerId?: string }> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } })
    if (!game) throw new NotFoundException('GAME_NOT_FOUND')
    return this.getState(game.code, sessionToken)
  }

  async markConnected(sessionToken: string) {
    const player = await this.getRealtimeSession(sessionToken)
    if (player.status === 'DISCONNECTED') {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { status: 'ALIVE' },
      })
    }
    return player
  }

  async markDisconnected(sessionToken: string) {
    const player = await this.getRealtimeSession(sessionToken)
    if (player.status === 'ALIVE') {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { status: 'DISCONNECTED' },
      })
    }
    return player
  }

  async assignRole(codeInput: string, targetPlayerId: string, sessionToken: string, roleInput: unknown) {
    const game = await this.authorizeOwner(codeInput, sessionToken)
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')
    const role = this.parseRole(roleInput)
    const player = await this.prisma.player.findFirst({ where: { id: targetPlayerId, gameId: game.id } })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    await this.prisma.player.update({
      where: { id: player.id },
      data: { role, characterTypeId: null, maxHealth: 1, health: 1 },
    })
    return this.getState(game.code, sessionToken)
  }

  async assignCharacter(codeInput: string, targetPlayerId: string, sessionToken: string, characterTypeId: unknown) {
    const game = await this.authorizeOwner(codeInput, sessionToken)
    if (game.status !== 'LOBBY') throw new ConflictException('GAME_NOT_IN_LOBBY')
    const player = await this.prisma.player.findFirst({ where: { id: targetPlayerId, gameId: game.id } })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    const characterId = this.requiredText(characterTypeId, 'Character type')
    const character = await this.prisma.characterType.findUnique({ where: { id: characterId } })
    if (!character || character.role !== player.role) throw new BadRequestException('INVALID_CHARACTER_TYPE')
    await this.prisma.player.update({
      where: { id: player.id },
      data: { characterTypeId: character.id, maxHealth: character.maxHealth, health: character.maxHealth },
    })
    return this.getState(game.code, sessionToken)
  }

  private async authorizeOwner(codeInput: string, sessionToken: string) {
    const code = codeInput.toUpperCase()
    const player = await this.prisma.player.findUnique({ where: { sessionToken } })
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND')
    const game = await this.prisma.game.findUnique({ where: { code } })
    if (!game) throw new NotFoundException('GAME_NOT_FOUND')
    if (game.id !== player.gameId || game.ownerPlayerId !== player.id) throw new ConflictException('NOT_GAME_OWNER')
    return game
  }

  private filterQuests(quests: PersistedQuest[]): GameQuestView[] {
    return quests
      .map(({ questDefinition, ...quest }) => ({
        ...quest,
        definition: questDefinition,
      }))
  }

  private async upsertQuestDefinition(definition: QuestConfig) {
    return this.prisma.questDefinition.upsert({
      where: { id: definition.id },
      create: { ...definition, settings: JSON.stringify(definition.settings) },
      update: { ...definition, settings: JSON.stringify(definition.settings) },
    })
  }

  private async syncQuestDefinitions() {
    const definitions = this.readQuestConfig()
    await Promise.all(definitions.map((definition) => this.upsertQuestDefinition(definition)))
  }

  private readQuestConfig(): QuestConfig[] {
    const candidates = [
      resolve(process.cwd(), 'config/quests.json'),
      resolve(process.cwd(), '../../config/quests.json'),
      resolve(dirname(__dirname), '../../config/quests.json'),
    ]
    const filePath = candidates.find((candidate) => existsSync(candidate))
    if (!filePath) throw new NotFoundException('QUEST_CONFIG_NOT_FOUND')
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!Array.isArray(parsed)) throw new BadRequestException('INVALID_QUEST_CONFIG')
    return parsed as QuestConfig[]
  }

  private async ensureCharacterTypes() {
    await Promise.all(
      characterDefinitions.map((definition) =>
        this.prisma.characterType.upsert({ where: { id: definition.id }, create: definition, update: definition }),
      ),
    )
  }

  private requiredText(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 80) {
      throw new BadRequestException(`${label} is required`)
    }
    return value.trim()
  }

  private optionalInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
    if (value === undefined) return fallback
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new BadRequestException('INVALID_GAME_SETTING')
    return value
  }

  private parseRole(value: unknown): PlayerRole {
    if (value !== PlayerRole.SURVIVOR && value !== PlayerRole.KILLER) throw new BadRequestException('INVALID_ROLE')
    return value
  }

  private createCode() {
    return randomBytes(3).toString('hex').toUpperCase()
  }

  private createSessionToken() {
    return randomBytes(24).toString('hex')
  }
}