import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PlayerRole, PlayerStatus } from '@prisma/client'
import { PrismaService } from './prisma.service'
import type { PlayerEffectView } from './game.types'

@Injectable()
export class EffectsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlayerEffects(
    playerId: string,
  ): Promise<PlayerEffectView[]> {
    const effects = await this.prisma.playerEffect.findMany({
      where: { playerId },
      include: { effect: true },
      orderBy: { effect: { name: 'asc' } },
    })

    const result: PlayerEffectView[] = []

    for (const item of effects) {
      const active = await this.prisma.activeEffect.findFirst({
        where: {
          targetPlayerId: playerId,
          effectId: item.effectId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: 'desc' },
      })

      let instruction: string | null = null

      if (item.effect.action === 'TEXT') {
        instruction = item.effect.description
      }

      result.push({
        id: item.id,
        playerId,
        effectId: item.effectId,
        name: item.effect.name,
        description: item.effect.description,
        charges: item.charges,
        duration: item.effect.duration,
        expiresAt: active ? active.expiresAt : null,
        instruction,
      })
    }

    return result
  }

  async use(
    codeInput: string,
    effectId: string,
    targetPlayerId: string | undefined,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const source = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: {
        game: true,
        effects: {
          include: { effect: true },
        },
      },
    })

    if (!source) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (source.game.code !== code) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (source.game.status !== 'RUNNING') {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    if (source.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    const owned = source.effects.find(
      (item) => item.effectId === effectId,
    )

    if (!owned) {
      throw new NotFoundException('EFFECT_NOT_AVAILABLE')
    }

    if (owned.charges !== null && owned.charges <= 0) {
      throw new ConflictException('NO_EFFECT_CHARGES')
    }

    if (owned.lastUsedAt) {
      const cooldownEnds =
        owned.lastUsedAt.getTime() +
        owned.effect.cooldown * 1000

      if (Date.now() < cooldownEnds) {
        throw new ConflictException('EFFECT_ON_COOLDOWN')
      }
    }

    const allowedTargets = this.parseTargets(
      owned.effect.allowedTargets,
    )

    const targets = await this.findTargets(
      source.id,
      source.role,
      source.gameId,
      targetPlayerId,
      allowedTargets,
    )

    // apply effect to all targets in a transaction
    await this.prisma.$transaction(async (tx) => {
      const now = new Date()

      for (const target of targets) {
        if (owned.effect.action === 'HEAL') {
          if (
            target.role !== PlayerRole.SURVIVOR ||
            target.health === null
          ) {
            throw new ConflictException('TARGET_CANNOT_BE_HEALED')
          }

          const maxHealth = await this.getMaxHealth(
            tx,
            target.characterTypeId,
          )

          if (maxHealth === null) {
            throw new ConflictException('TARGET_CANNOT_BE_HEALED')
          }

          let health = target.health + owned.effect.quantity
          const status: PlayerStatus = PlayerStatus.ALIVE

          if (health > maxHealth) {
            health = maxHealth
          }

          await tx.player.update({
            where: { id: target.id },
            data: {
              health,
              status,
            },
          })
        }

        if (owned.effect.action === 'DAMAGE') {
          if (
            target.role !== PlayerRole.SURVIVOR ||
            target.health === null
          ) {
            throw new ConflictException('TARGET_CANNOT_TAKE_DAMAGE')
          }

          let health = target.health - owned.effect.quantity

          if (health < 0) {
            health = 0
          }

          let status: PlayerStatus = PlayerStatus.ALIVE

          if (health === 0) {
            status = PlayerStatus.DEAD
          }

          await tx.player.update({
            where: { id: target.id },
            data: { health, status },
          })
        }

        if (owned.effect.action === 'TEXT') {
          // TEXT effects are physical-game instructions — the player reads the
          // effect description (returned as `instruction` in getPlayerEffects).
          // No server-side state change is needed beyond consuming the charge.
        }

        if (
          owned.effect.action === 'ADD_EFFECT' &&
          owned.effect.duration !== null
        ) {
          const expiresAt = new Date(
            now.getTime() +
              owned.effect.duration * 1000,
          )

          await tx.activeEffect.create({
            data: {
              effectId: owned.effect.id,
              sourcePlayerId: source.id,
              targetPlayerId: target.id,
              appliedAt: now,
              expiresAt,
            },
          })
        }
      }

      let charges = owned.charges

      if (charges !== null) {
        charges--
      }

      await tx.playerEffect.update({
        where: { id: owned.id },
        data: {
          charges,
          lastUsedAt: now,
        },
      })
    })

    return true
  }

  private async findTargets(
    sourcePlayerId: string,
    sourceRole: PlayerRole,
    gameId: string,
    targetPlayerId: string | undefined,
    allowedTargets: string[],
  ) {
    if (allowedTargets.includes('ALL_SURVIVORS')) {
      if (sourceRole !== PlayerRole.KILLER) {
        throw new ForbiddenException('ONLY_KILLERS_CAN_USE_GROUP_EFFECTS')
      }

      return this.prisma.player.findMany({
        where: {
          gameId,
          role: PlayerRole.SURVIVOR,
          status: PlayerStatus.ALIVE,
        },
      })
    }

    let id = targetPlayerId

    if (!id && allowedTargets.includes('SELF')) {
      id = sourcePlayerId
    }

    if (!id) {
      throw new BadRequestException('EFFECT_TARGET_REQUIRED')
    }

    const target = await this.prisma.player.findFirst({
      where: {
        id,
        gameId,
      },
      include: {
        characterType: true,
      },
    })

    if (!target) {
      throw new NotFoundException('TARGET_NOT_FOUND')
    }

    if (target.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('TARGET_NOT_ACTIVE')
    }

    if (
      target.id === sourcePlayerId &&
      allowedTargets.includes('SELF')
    ) {
      return [target]
    }

    if (
      target.role === PlayerRole.SURVIVOR &&
      allowedTargets.includes('SURVIVOR')
    ) {
      return [target]
    }

    if (
      target.role === PlayerRole.KILLER &&
      allowedTargets.includes('KILLER')
    ) {
      return [target]
    }

    throw new ForbiddenException('INVALID_EFFECT_TARGET')
  }

  private parseTargets(value: string) {
    const parsed = JSON.parse(value)

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('INVALID_EFFECT_TARGETS')
    }

    return parsed as string[]
  }

  private async getMaxHealth(
    prisma: {
      characterType: {
        findUnique: (args: {
          where: { id: string }
          select: { maxHealth: true }
        }) => Promise<{ maxHealth: number | null } | null>
      }
    },
    characterTypeId: string | null,
  ) {
    if (!characterTypeId) {
      return null
    }

    const character = await prisma.characterType.findUnique({
      where: { id: characterTypeId },
      select: { maxHealth: true },
    })

    if (!character) {
      return null
    }

    return character.maxHealth
  }
}