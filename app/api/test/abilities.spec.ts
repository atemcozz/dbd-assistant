import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { AbilitiesService } from '../src/abilities.service'
import { PlayerStatus } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { setupLobbyGame, setupRunningGame } from './helpers'

describe('Abilities and buffs', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let combatService: CombatService
  let abilitiesService: AbilitiesService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    combatService = ctx.combatService
    abilitiesService = ctx.abilitiesService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  it('heal restores HP but cannot exceed maxHealth', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Damage the owner to 2 HP.
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    // Use field-dressing (HEAL buff) on self.
    await abilitiesService.use(
      owner.state.code,
      'field-dressing',
      undefined,
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(3) // healed back to max
  })

  it('heal cannot exceed maxHealth even at full HP', async () => {
    const { owner } = await setupRunningGame(ctx)

    // Owner is at full HP (3). Heal should cap at 3.
    await abilitiesService.use(
      owner.state.code,
      'field-dressing',
      undefined,
      owner.sessionToken,
    )

    const state = await gamesService.getState(owner.state.code, owner.sessionToken)
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(3) // still capped at max
  })

  it('HURT ability reduces target HP by 1', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Killer (survivor player) uses attack-survivor on owner (medic).
    await abilitiesService.use(
      owner.state.code,
      'attack-survivor',
      owner.playerId,
      survivor.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2) // 3 - 1 = 2
    expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
  })

  it('lethal HURT buff knocks the target out instead of killing', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Drop the owner to 1 HP, then hit with the HURT ability.
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    await abilitiesService.use(
      owner.state.code,
      'attack-survivor',
      owner.playerId,
      survivor.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(1)
    expect(ownerPlayer.knockouts).toBe(1)
    expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
  })

  it('ability the player does not own is rejected', async () => {
    const { owner } = await setupRunningGame(ctx)

    // Owner (survivor) doesn't own attack-survivor (killer ability).
    await expect(
      abilitiesService.use(
        owner.state.code,
        'attack-survivor',
        undefined,
        owner.sessionToken,
      ),
    ).rejects.toThrow('ABILITY_NOT_AVAILABLE')
  })

  it('INFO ability creates ActiveBuff on target', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Killer uses stay-still on owner (survivor).
    await abilitiesService.use(
      owner.state.code,
      'stay-still',
      owner.playerId,
      survivor.sessionToken,
    )

    // Verify a timed buff was created on the owner.
    const activeBuffs = await prisma.activeBuff.findMany({
      where: { targetPlayerId: owner.playerId, buffId: 'stay-still' },
    })
    expect(activeBuffs.length).toBeGreaterThan(0)
    expect(activeBuffs[0].expiresAt).not.toBeNull()
  })

  it('ability on cooldown is rejected', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Killer uses attack-survivor (cooldown: 5s) on owner.
    await abilitiesService.use(
      owner.state.code,
      'attack-survivor',
      owner.playerId,
      survivor.sessionToken,
    )

    // Immediate second use should fail — still on cooldown.
    await expect(
      abilitiesService.use(
        owner.state.code,
        'attack-survivor',
        owner.playerId,
        survivor.sessionToken,
      ),
    ).rejects.toThrow('ABILITY_ON_COOLDOWN')
  })

  it('incoming buff shows the buff description', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Killer uses stay-still on owner.
    await abilitiesService.use(
      owner.state.code,
      'stay-still',
      owner.playerId,
      survivor.sessionToken,
    )

    // Owner's state should include the incoming buff with its description.
    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const incomingBuff = state.buffs.find(
      (b) => b.buffId === 'stay-still',
    )
    expect(incomingBuff).toBeDefined()
    expect(incomingBuff!.description).toBe(
      "You are stunned! Don't move for 30 seconds.",
    )
    expect(incomingBuff!.expiresAt).not.toBeNull()
  })

  it('invalid target is rejected', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Killer tries to use attack-survivor on themselves (killer) — invalid.
    await expect(
      abilitiesService.use(
        owner.state.code,
        'attack-survivor',
        survivor.playerId, // survivor is the killer — wrong role
        survivor.sessionToken,
      ),
    ).rejects.toThrow('INVALID_ABILITY_TARGET')
  })

  it('dead survivor cannot use abilities', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Kill the owner: medic 3 HP + 2 knockouts = 5 lethal hits.
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    }

    await expect(
      abilitiesService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })

  it('permanent starting buff is listed with expiresAt null', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Stalker starts with the free-run permanent buff.
    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const permanent = state.buffs.find((b) => b.buffId === 'free-run')

    expect(permanent).toBeDefined()
    expect(permanent!.expiresAt).toBeNull()
    expect(permanent!.sourcePlayerName).toBeNull()
  })

  it('ability duration override beats buff default duration', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // quick-stun inflicts stay-still with a 5s override (buff default 30s).
    await abilitiesService.use(
      owner.state.code,
      'quick-stun',
      owner.playerId,
      survivor.sessionToken,
    )

    const active = await prisma.activeBuff.findFirst({
      where: { targetPlayerId: owner.playerId, buffId: 'stay-still' },
    })
    expect(active).not.toBeNull()

    const remainingMs = active!.expiresAt!.getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(0)
    expect(remainingMs).toBeLessThanOrEqual(5000) // 5s, not 30s
  })

  it('combo ability inflicts all its buffs', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Damage the owner to 2 HP, then use the combo (HEAL + INFO) on self.
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    await abilitiesService.use(
      owner.state.code,
      'field-stay',
      undefined,
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(3) // HEAL buff applied

    // INFO buff was created as a timed row on the same target.
    const infoBuff = state.buffs.find((b) => b.buffId === 'stay-still')
    expect(infoBuff).toBeDefined()
    expect(infoBuff!.expiresAt).not.toBeNull()
  })

  it('limited ability count is consumed and rejected when exhausted', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // quick-stun is seeded with count: 1 for the stalker.
    let state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    expect(
      state.abilities.find((a) => a.abilityId === 'quick-stun')!
        .chargesRemaining,
    ).toBe(1)

    await abilitiesService.use(
      owner.state.code,
      'quick-stun',
      owner.playerId,
      survivor.sessionToken,
    )

    state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    expect(
      state.abilities.find((a) => a.abilityId === 'quick-stun')!
        .chargesRemaining,
    ).toBe(0)

    // quick-stun has no cooldown — the only blocker is the spent charge.
    await expect(
      abilitiesService.use(
        owner.state.code,
        'quick-stun',
        owner.playerId,
        survivor.sessionToken,
      ),
    ).rejects.toThrow('ABILITY_NO_CHARGES')
  })

  it('ability without count has unlimited uses', async () => {
    const { owner } = await setupRunningGame(ctx)

    // field-dressing has no count — used twice in a row (cooldown 0).
    await abilitiesService.use(
      owner.state.code,
      'field-dressing',
      undefined,
      owner.sessionToken,
    )
    await abilitiesService.use(
      owner.state.code,
      'field-dressing',
      undefined,
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ability = state.abilities.find(
      (a) => a.abilityId === 'field-dressing',
    )!
    expect(ability.chargesRemaining).toBeNull()
  })

  it('passive ability is listed with its type but cannot be used', async () => {
    const { owner } = await setupRunningGame(ctx)

    // Medic owns the iron-skin passive trait alongside active abilities.
    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const passive = state.abilities.find((a) => a.abilityId === 'iron-skin')!
    expect(passive).toBeDefined()
    expect(passive.type).toBe('PASSIVE')
    expect(passive.allowedTargets).toEqual([])

    const active = state.abilities.find(
      (a) => a.abilityId === 'field-dressing',
    )!
    expect(active.type).toBe('ACTIVE')

    // Using a passive is rejected — nothing is applied to anyone.
    await expect(
      abilitiesService.use(
        owner.state.code,
        'iron-skin',
        undefined,
        owner.sessionToken,
      ),
    ).rejects.toThrow('ABILITY_IS_PASSIVE')

    await expect(
      abilitiesService.use(
        owner.state.code,
        'iron-skin',
        owner.playerId,
        owner.sessionToken,
      ),
    ).rejects.toThrow('ABILITY_IS_PASSIVE')

    const rows = await prisma.activeBuff.findMany({
      where: { targetPlayerId: owner.playerId },
    })
    expect(rows).toHaveLength(0)
  })

  it('ability use returns instant effects for the feedback modal', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // HEAL on self returns the applied buff info (name/description).
    const applied = await abilitiesService.use(
      owner.state.code,
      'field-dressing',
      undefined,
      owner.sessionToken,
    )
    expect(applied.appliedEffects).toHaveLength(1)
    expect(applied.appliedEffects[0]).toMatchObject({
      buffId: 'field-dressing',
      name: 'Field Dressing',
      targetPlayerId: owner.playerId,
      targetPlayerName: 'Owner',
    })
    expect(applied.appliedEffects[0].description).toContain('wounds')
    expect(applied.appliedQuestBlocks).toHaveLength(0)

    // HURT on another player names that target.
    const hurt = await abilitiesService.use(
      owner.state.code,
      'attack-survivor',
      owner.playerId,
      survivor.sessionToken,
    )
    expect(hurt.appliedEffects).toHaveLength(1)
    expect(hurt.appliedEffects[0]).toMatchObject({
      buffId: 'attack-survivor',
      targetPlayerId: owner.playerId,
      targetPlayerName: 'Owner',
    })

    // INFO-only ability returns no instant effects —
    // its modal comes from the created buff row instead.
    const none = await abilitiesService.use(
      owner.state.code,
      'stay-still',
      owner.playerId,
      survivor.sessionToken,
    )
    expect(none.appliedEffects).toHaveLength(0)
    expect(none.appliedQuestBlocks).toHaveLength(0)
  })

  it('manual self-application creates a permanent buff with a normalized id', async () => {
    const { owner } = await setupRunningGame(ctx)

    // Typed with spaces and mixed case — normalized to "free-run".
    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      '  Free Run  ',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const buff = state.buffs.find((b) => b.buffId === 'free-run')
    expect(buff).toBeDefined()
    expect(buff!.expiresAt).toBeNull() // non-timed
    expect(buff!.sourcePlayerName).not.toBeNull() // source = self

    // Re-applying refreshes instead of duplicating the row.
    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      'free-run',
      owner.sessionToken,
    )
    const rows = await prisma.activeBuff.findMany({
      where: { targetPlayerId: owner.playerId, buffId: 'free-run' },
    })
    expect(rows.length).toBe(1)
  })

  it('manual application respects the buff default duration', async () => {
    const { owner } = await setupRunningGame(ctx)

    // stay-still has defaultDuration 30 — manual application is timed.
    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      'stay-still',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const buff = state.buffs.find((b) => b.buffId === 'stay-still')
    expect(buff).toBeDefined()
    expect(buff!.expiresAt).not.toBeNull()

    const remainingMs = new Date(buff!.expiresAt!).getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(0)
    expect(remainingMs).toBeLessThanOrEqual(30000) // 30s from defaultDuration
  })

  it('manual HEAL buff restores HP without creating a buff row', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Damage the owner to 2 HP, then self-apply the HEAL buff.
    await combatService.attack(
      owner.state.code,
      owner.playerId,
      survivor.sessionToken,
    )
    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      'field-dressing',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(3)
    expect(
      state.buffs.find((b) => b.buffId === 'field-dressing'),
    ).toBeUndefined()
  })

  it('manual HURT buff reduces own HP', async () => {
    const { owner } = await setupRunningGame(ctx)

    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      'attack-survivor',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2)
    expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
  })

  it('manual lethal HURT buff knocks the player out', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Drop the owner to 1 HP, then self-apply the HURT buff.
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    await abilitiesService.applyBuffToSelf(
      owner.state.code,
      'attack-survivor',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(1)
    expect(ownerPlayer.knockouts).toBe(1)
    expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
  })

  it('unknown or empty manual buff id is rejected', async () => {
    const { owner } = await setupRunningGame(ctx)

    await expect(
      abilitiesService.applyBuffToSelf(
        owner.state.code,
        'no-such-buff',
        owner.sessionToken,
      ),
    ).rejects.toThrow('BUFF_NOT_FOUND')

    await expect(
      abilitiesService.applyBuffToSelf(
        owner.state.code,
        '   ',
        owner.sessionToken,
      ),
    ).rejects.toThrow('BUFF_ID_REQUIRED')
  })

  it('lists buff definitions for the in-game effect search', async () => {
    const { owner } = await setupRunningGame(ctx)

    const definitions = await abilitiesService.listDefinitions(
      owner.state.code,
      owner.sessionToken,
    )

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'field-dressing',
          name: 'Field Dressing',
          action: 'HEAL',
        }),
        expect.objectContaining({
          id: 'attack-survivor',
          action: 'HURT',
        }),
        expect.objectContaining({
          id: 'stay-still',
          action: 'INFO',
        }),
      ]),
    )
  })

  it('hides the effect search outside a running game or from dead players', async () => {
    const lobby = await setupLobbyGame(ctx)

    await expect(
      abilitiesService.listDefinitions(
        lobby.owner.state.code,
        lobby.owner.sessionToken,
      ),
    ).rejects.toThrow('GAME_NOT_RUNNING')

    const { owner, survivor } = await setupRunningGame(ctx)

    // Kill the owner: medic 3 HP + 2 knockouts = 5 lethal hits.
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )
    }

    await expect(
      abilitiesService.listDefinitions(
        owner.state.code,
        owner.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })

  it('dead survivor cannot apply a buff manually', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Kill the owner: medic 3 HP + 2 knockouts = 5 lethal hits.
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    }

    await expect(
      abilitiesService.applyBuffToSelf(
        owner.state.code,
        'free-run',
        owner.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })
})
