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
} from '@prisma/client'
import { PrismaService } from './prisma.service'

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(role?: PlayerRole) {
    return this.prisma.characterType.findMany({
      where: role ? { role } : undefined,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
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

    // Remove character type and effects when changing role
    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: player.id },
        data: {
          role,
          characterTypeId: null,
          health: null,
        },
      })

      await tx.playerEffect.deleteMany({
        where: { playerId: player.id },
      })
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
      include: { characterEffects: true },
    })

    if (!character || character.role !== player.role) {
      throw new BadRequestException('INVALID_CHARACTER_TYPE')
    }

    // copy character effects to player effects and set health
    // based on character maxHealth
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

      await tx.playerEffect.deleteMany({
        where: { playerId: player.id },
      })

      if (character.characterEffects.length > 0) {
        await tx.playerEffect.createMany({
          data: character.characterEffects.map((item) => ({
            playerId: player.id,
            effectId: item.effectId,
            charges: item.charges,
          })),
        })
      }
    })

    return game
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