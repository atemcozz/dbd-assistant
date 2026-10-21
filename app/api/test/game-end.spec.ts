import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { ExitsService } from '../src/exits.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole, PlayerStatus, GameStatus } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { setupRunningGame } from './helpers'

describe('Game end conditions', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let combatService: CombatService
  let exitsService: ExitsService
  let charactersService: CharactersService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    combatService = ctx.combatService
    exitsService = ctx.exitsService
    charactersService = ctx.charactersService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  it('startGame with no survivors starts normally (no instant killer win)', async () => {
    const owner = await gamesService.createGame('No Survivors', 'KillerOnly')

    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      0,
    )
    await exitsService.select(
      owner.state.code,
      owner.sessionToken,
      ['main-gate'],
    )
    await charactersService.assignRole(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      'stalker',
    )

    const state = await gamesService.startGame(
      owner.state.code,
      owner.sessionToken,
    )

    // Killer wins only when every survivor is dead — a game with no
    // survivors at all is a misconfigured lobby, not a win.
    expect(state.status).toBe(GameStatus.RUNNING)
    expect(state.winner).toBeNull()
  })

  it('timeout with survivors still alive is a draw — both lose', async () => {
    const { owner } = await setupRunningGame(ctx)

    // Backdate startedAt so the 3600s timer is already expired.
    // Owner is still ALIVE — nobody secured a win.
    const game = await prisma.game.findUnique({
      where: { code: owner.state.code },
    })
    await prisma.game.update({
      where: { id: game!.id },
      data: {
        startedAt: new Date(Date.now() - 4000 * 1000),
      },
    })

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )

    expect(state.status).toBe(GameStatus.FINISHED)
    expect(state.winner).toBe('DRAW')
  })

  it('timeout after all survivors dead is a killer win', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Kill the only survivor, then let the clock run out.
    await prisma.player.update({
      where: { id: owner.playerId },
      data: { status: PlayerStatus.DEAD, health: 0 },
    })
    const game = await prisma.game.findUnique({
      where: { code: owner.state.code },
    })
    await prisma.game.update({
      where: { id: game!.id },
      data: {
        startedAt: new Date(Date.now() - 4000 * 1000),
      },
    })

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )

    expect(state.status).toBe(GameStatus.FINISHED)
    expect(state.winner).toBe('KILLER')
  })

  it('all killers dead finishes the game with survivors win', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Remove the killer from the room — survivors win by elimination.
    await prisma.player.update({
      where: { id: survivor.playerId },
      data: { status: PlayerStatus.DEAD },
    })

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )

    expect(state.status).toBe(GameStatus.FINISHED)
    expect(state.winner).toBe('SURVIVORS')
  })

  it('killing the last survivor finishes the game with killer win', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Owner is the only survivor (medic, 3 HP + 2 knockouts = 5 hits).
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )
    }

    // getState runs finishIfDecided — killing the last survivor ends the game.
    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )

    expect(state.status).toBe(GameStatus.FINISHED)
    expect(state.winner).toBe('KILLER')

    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)
    expect(ownerPlayer?.status).toBe(PlayerStatus.DEAD)
  })

  it('survivor disconnect does not win the game for the killer', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    await prisma.player.update({
      where: { id: owner.playerId },
      data: { status: PlayerStatus.DISCONNECTED },
    })

    const state = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )

    // Killer wins only when every survivor is DEAD — a disconnect
    // (phone reload, bad signal) must not decide the game.
    expect(state.status).toBe(GameStatus.RUNNING)
    expect(state.winner).toBeNull()
  })

  it('actions still work after the game officially finishes', async () => {
    const { owner, survivor } = await setupRunningGame(ctx)

    // Finish via timeout (draw — owner still alive).
    const game = await prisma.game.findUnique({
      where: { code: owner.state.code },
    })
    await prisma.game.update({
      where: { id: game!.id },
      data: {
        startedAt: new Date(Date.now() - 4000 * 1000),
      },
    })
    const finished = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(finished.winner).toBe('DRAW')

    // Informal continue-play: killer can still attack an alive survivor.
    await combatService.attack(
      owner.state.code,
      owner.playerId,
      survivor.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe(GameStatus.FINISHED)
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
    expect(ownerPlayer.health).toBe(2) // medic 3 → 2 after attack
  })
})
