import {
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
export class CombatService {
  constructor(private readonly prisma: PrismaService) {}

  async attack(
    codeInput: string,
    targetPlayerId: string,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const killer = await this.prisma.player.findUnique({
      where: { sessionToken },
    })

    if (!killer) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (killer.role !== PlayerRole.KILLER) {
      throw new ConflictException('ONLY_KILLERS_CAN_ATTACK')
    }

    if (killer.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    const game = await this.prisma.game.findUnique({
      where: { code },
    })

    if (!game || game.id !== killer.gameId) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (game.status === GameStatus.LOBBY) {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    const target = await this.prisma.player.findFirst({
      where: {
        id: targetPlayerId,
        gameId: game.id,
      },
    })

    if (!target) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (target.role !== PlayerRole.SURVIVOR) {
      throw new ConflictException('KILLERS_CANNOT_ATTACK_KILLERS')
    }

    if (target.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    if (target.health === null) {
      throw new ConflictException('TARGET_HAS_NO_HEALTH')
    }

    // Обычная физическая атака всегда снимает ровно 1 HP.
    const health = Math.max(0, target.health - 1)

    await this.prisma.player.update({
      where: { id: target.id },
      data: {
        health,
        status:
          health === 0
            ? PlayerStatus.DEAD
            : PlayerStatus.ALIVE,
      },
    })

    return game
  }
}