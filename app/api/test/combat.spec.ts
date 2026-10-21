import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { PlayerStatus } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { setupRunningGame } from './helpers'

describe('Attack / combat', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let combatService: CombatService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    combatService = ctx.combatService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  it('killer can attack a survivor', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // survivor is the killer, owner is the medic survivor.
    await combatService.attack(
      owner.state.code,
      owner.playerId,
      survivor.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2) // medic starts at 3, loses 1
    expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
  })

  it('attack removes exactly 1 HP', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    await combatService.attack(
      owner.state.code,
      owner.playerId,
      survivor.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2)
  })

  it('death occurs at 0 HP', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Attack 3 times (medic has 3 HP).
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(0)
    expect(ownerPlayer.status).toBe(PlayerStatus.DEAD)
  })

  it('non-killer cannot attack', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // owner is a survivor — should not be able to attack.
    await expect(
      combatService.attack(
        owner.state.code,
        survivor.playerId,
        owner.sessionToken,
      ),
    ).rejects.toThrow('ONLY_KILLERS_CAN_ATTACK')
  })

  it('dead survivor cannot be attacked', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Kill the owner first.
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

    // Try to attack again — should fail.
    await expect(
      combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })

  it('shielded survivor cannot be attacked while the buff is active', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Timed shield on the owner.
    await prisma.activeBuff.create({
      data: {
        buffId: 'adrenaline',
        sourcePlayerId: owner.playerId,
        targetPlayerId: owner.playerId,
        appliedAt: new Date(),
        expiresAt: new Date(Date.now() + 30_000),
      },
    })

    await expect(
      combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      ),
    ).rejects.toThrow('TARGET_INVINCIBLE')

    // Flag is visible in game state (killer UI shows the badge).
    const shielded = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const shieldedOwner = shielded.players.find((p) => p.id === owner.playerId)!
    expect(shieldedOwner.isInvincible).toBe(true)
    // Expiry is exposed so clients drop the badge without a refresh.
    const remainingMs =
      new Date(shieldedOwner.invincibleUntil!).getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(0)
    expect(remainingMs).toBeLessThanOrEqual(30_000)

    // After expiry the attack lands again and the flag clears.
    await prisma.activeBuff.updateMany({
      where: { targetPlayerId: owner.playerId, buffId: 'adrenaline' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await combatService.attack(
      owner.state.code,
      owner.playerId,
      survivor.sessionToken,
    )

    const exposed = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const ownerPlayer = exposed.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2)
    expect(ownerPlayer.isInvincible).toBe(false)
    expect(ownerPlayer.invincibleUntil).toBeNull()
  })
})
