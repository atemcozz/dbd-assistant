import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PlayerRole, PlayerStatus } from '@prisma/client'
import { PrismaService } from './prisma.service'
import type { PlayerAbilityView, PlayerBuffView } from './game.types'

// Abilities are activatable actions owned by a player; buffs are states
// applied to players. An ability inflicts its configured buffs on the
// resolved targets:
//   HEAL / HURT resolve instantly (health change, no row),
//   INFO creates an ActiveBuff row (expiresAt null = permanent).
@Injectable()
export class AbilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // Abilities the player owns (from their character kit), with cooldown state.
  async getAbilities(playerId: string): Promise<PlayerAbilityView[]> {
    const owned = await this.prisma.playerAbility.findMany({
      where: { playerId },
      include: { ability: true },
      orderBy: { ability: { name: 'asc' } },
    })

    return owned.map((item) => ({
      id: item.id,
      abilityId: item.abilityId,
      name: item.ability.name,
      description: item.ability.description,
      cooldown: item.ability.cooldown,
      lastUsedAt: item.lastUsedAt,
      chargesRemaining: item.chargesRemaining,
      allowedTargets: this.parseTargets(item.ability.allowedTargets),
    }))
  }

  // Buffs currently on the player (timed and permanent), including buffs
  // applied by other players — e.g. a survivor sees the killer's stun.
  async getBuffs(playerId: string): Promise<PlayerBuffView[]> {
    const now = new Date()

    const rows = await this.prisma.activeBuff.findMany({
      where: {
        targetPlayerId: playerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        buff: true,
        sourcePlayer: true,
      },
      orderBy: [{ expiresAt: 'asc' }, { appliedAt: 'desc' }],
    })

    return rows.map((row) => ({
      id: row.id,
      buffId: row.buffId,
      name: row.buff.name,
      description: row.buff.description,
      expiresAt: row.expiresAt,
      sourcePlayerName: row.sourcePlayer?.name ?? null,
    }))
  }

  async use(
    codeInput: string,
    abilityId: string,
    targetPlayerId: string | undefined,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()

    const source = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: {
        game: true,
        abilities: {
          include: {
            ability: {
              include: { buffs: { include: { buff: true } } },
            },
          },
        },
      },
    })

    if (!source) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (source.game.code !== code) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (source.game.status === 'LOBBY') {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    if (source.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    const owned = source.abilities.find(
      (item) => item.abilityId === abilityId,
    )

    if (!owned) {
      throw new NotFoundException('ABILITY_NOT_AVAILABLE')
    }

    if (owned.lastUsedAt) {
      const cooldownEnds =
        owned.lastUsedAt.getTime() + owned.ability.cooldown * 1000

      if (Date.now() < cooldownEnds) {
        throw new ConflictException('ABILITY_ON_COOLDOWN')
      }
    }

    // chargesRemaining null = unlimited uses.
    if (owned.chargesRemaining !== null && owned.chargesRemaining <= 0) {
      throw new ConflictException('ABILITY_NO_CHARGES')
    }

    const allowedTargets = this.parseTargets(
      owned.ability.allowedTargets,
    )

    const targets = await this.findTargets(
      source.id,
      source.role,
      source.gameId,
      targetPlayerId,
      allowedTargets,
    )

    // Apply all inflicted buffs to all targets in one transaction.
    await this.prisma.$transaction(async (tx) => {
      const now = new Date()

      for (const target of targets) {
        // Health changes accumulate locally so an ability that inflicts
        // multiple HEAL/HURT buffs applies each one on top of the last.
        let health = target.health
        let status = target.status

        for (const link of owned.ability.buffs) {
          const buff = link.buff

          if (buff.action === 'HEAL') {
            if (
              target.role !== PlayerRole.SURVIVOR ||
              health === null
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

            health = Math.min(
              maxHealth,
              health + this.getQuantity(buff.params),
            )
          }

          if (buff.action === 'HURT') {
            if (
              target.role !== PlayerRole.SURVIVOR ||
              health === null
            ) {
              throw new ConflictException('TARGET_CANNOT_TAKE_DAMAGE')
            }

            health = Math.max(0, health - this.getQuantity(buff.params))

            if (health === 0) {
              status = PlayerStatus.DEAD
            }
          }

          if (buff.action === 'INFO') {
            // Resolved duration: ability override ?? buff default.
            // Either null means the buff is permanent.
            const seconds = link.duration ?? buff.defaultDuration
            const expiresAt =
              seconds === null
                ? null
                : new Date(now.getTime() + seconds * 1000)

            await tx.activeBuff.create({
              data: {
                buffId: buff.id,
                sourcePlayerId: source.id,
                targetPlayerId: target.id,
                appliedAt: now,
                expiresAt,
              },
            })
          }

          if (
            buff.action !== 'HEAL' &&
            buff.action !== 'HURT' &&
            buff.action !== 'INFO'
          ) {
            throw new ConflictException('INVALID_BUFF_ACTION')
          }
        }

        if (health !== target.health || status !== target.status) {
          await tx.player.update({
            where: { id: target.id },
            data: { health, status },
          })
        }
      }

      // Consume one charge when the ability is limited. The where-guard
      // keeps chargesRemaining from going below zero if two uses race.
      const updated = await tx.playerAbility.updateMany({
        where: {
          id: owned.id,
          OR: [{ chargesRemaining: null }, { chargesRemaining: { gt: 0 } }],
        },
        data: {
          lastUsedAt: now,
          ...(owned.chargesRemaining !== null
            ? { chargesRemaining: { decrement: 1 } }
            : {}),
        },
      })

      if (updated.count === 0) {
        throw new ConflictException('ABILITY_NO_CHARGES')
      }
    })

    return true
  }

  // Manual self-application: the player enters a buff id (as instructed
  // during the physical game). The input is normalized before lookup and
  // the buff is applied to the entering player themselves.
  // INFO buffs use the buff's own defaultDuration (null = permanent);
  // HEAL/HURT resolve instantly with the same rules as ability use.
  async applyBuffToSelf(
    codeInput: string,
    buffIdInput: string,
    sessionToken: string,
  ) {
    const code = codeInput.toUpperCase()
    const buffId = this.normalizeBuffId(buffIdInput)

    if (!buffId) {
      throw new BadRequestException('BUFF_ID_REQUIRED')
    }

    const source = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: { game: true },
    })

    if (!source) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (source.game.code !== code) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (source.game.status === 'LOBBY') {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    if (source.status !== PlayerStatus.ALIVE) {
      throw new ConflictException('PLAYER_NOT_ACTIVE')
    }

    const buff = await this.prisma.buffDefinition.findUnique({
      where: { id: buffId },
    })

    if (!buff) {
      throw new NotFoundException('BUFF_NOT_FOUND')
    }

    if (buff.action === 'INFO') {
      const now = new Date()

      // Standard duration rule: manual application has no ability link,
      // so the duration comes from the buff itself (null = permanent).
      const expiresAt =
        buff.defaultDuration === null
          ? null
          : new Date(now.getTime() + buff.defaultDuration * 1000)

      // Re-applying an already-active buff refreshes it (restarts the
      // timer) instead of creating a duplicate row.
      const existing = await this.prisma.activeBuff.findFirst({
        where: {
          buffId: buff.id,
          targetPlayerId: source.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })

      if (existing) {
        await this.prisma.activeBuff.update({
          where: { id: existing.id },
          data: { appliedAt: now, expiresAt },
        })
        return true
      }

      await this.prisma.activeBuff.create({
        data: {
          buffId: buff.id,
          sourcePlayerId: source.id,
          targetPlayerId: source.id,
          appliedAt: now,
          expiresAt,
        },
      })
      return true
    }

    if (buff.action === 'HEAL') {
      if (source.role !== PlayerRole.SURVIVOR || source.health === null) {
        throw new ConflictException('TARGET_CANNOT_BE_HEALED')
      }

      const maxHealth = await this.getMaxHealth(
        this.prisma,
        source.characterTypeId,
      )

      if (maxHealth === null) {
        throw new ConflictException('TARGET_CANNOT_BE_HEALED')
      }

      const health = Math.min(
        maxHealth,
        source.health + this.getQuantity(buff.params),
      )

      await this.prisma.player.update({
        where: { id: source.id },
        data: { health },
      })
      return true
    }

    if (buff.action === 'HURT') {
      if (source.role !== PlayerRole.SURVIVOR || source.health === null) {
        throw new ConflictException('TARGET_CANNOT_TAKE_DAMAGE')
      }

      const health = Math.max(0, source.health - this.getQuantity(buff.params))

      await this.prisma.player.update({
        where: { id: source.id },
        data: {
          health,
          ...(health === 0 ? { status: PlayerStatus.DEAD } : {}),
        },
      })
      return true
    }

    throw new ConflictException('INVALID_BUFF_ACTION')
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
        throw new ForbiddenException('ONLY_KILLERS_CAN_USE_GROUP_ABILITIES')
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
      throw new BadRequestException('ABILITY_TARGET_REQUIRED')
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
      // Killer-targeting abilities (stun-killer, killer-breath) belong to
      // survivors. A killer must never be able to target another killer,
      // even if a config mistake links a killer to such an ability.
      if (sourceRole !== PlayerRole.SURVIVOR) {
        throw new ForbiddenException('KILLERS_CANNOT_TARGET_KILLERS')
      }
      return [target]
    }

    throw new ForbiddenException('INVALID_ABILITY_TARGET')
  }

  private parseTargets(value: string) {
    const parsed = JSON.parse(value)

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('INVALID_ABILITY_TARGETS')
    }

    return parsed as string[]
  }

  // Player-typed buff id: trim, lowercase, collapse whitespace to dashes
  // so "  Stay Still " matches the config id "stay-still".
  private normalizeBuffId(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-')
  }

  // HEAL/HURT strength comes from the buff's free-form params JSON,
  // e.g. {"quantity": 1}. config-sync validates it, this is a guard.
  private getQuantity(paramsJson: string) {
    const params = JSON.parse(paramsJson) as { quantity?: unknown }
    const quantity = Number(params.quantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ConflictException('INVALID_BUFF_PARAMS')
    }

    return quantity
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
