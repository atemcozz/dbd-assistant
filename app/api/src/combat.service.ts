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
import { applyDamage } from './player-damage'

// Timed buff that makes its target immune to killer attacks while active.
// Single-use by design: only the `adrenaline` ability inflicts it, so a plain
// buff id (instead of a generic flag framework) is enough.
export const INVINCIBILITY_BUFF_ID = 'adrenaline'

@Injectable()
export class CombatService {
  constructor(private readonly prisma: PrismaService) {}

  // Whether the player currently holds an active invincibility buff.
  async isInvincible(targetPlayerId: string): Promise<boolean> {
    const row = await this.prisma.activeBuff.findFirst({
      where: {
        buffId: INVINCIBILITY_BUFF_ID,
        targetPlayerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    })

    return row !== null
  }

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

    if (await this.isInvincible(target.id)) {
      throw new ConflictException('TARGET_INVINCIBLE')
    }

    // Обычная физическая атака всегда наносит ровно 1 урон. Смертельный
    // удар при этом сначала расходует нокаут, а не снимает последнее HP.
    const damage = applyDamage(target.health, target.knockouts, 1)

    await this.prisma.player.update({
      where: { id: target.id },
      data: {
        health: damage.health,
        knockouts: damage.knockouts,
        status: damage.died
          ? PlayerStatus.DEAD
          : target.status,
      },
    })

    return game
  }
}