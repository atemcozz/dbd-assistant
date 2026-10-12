import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole, PlayerStatus } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { createGameWithOwner, joinSurvivor } from './helpers'

describe('Roll survivors', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let charactersService: CharactersService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    charactersService = ctx.charactersService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  it('assigns random survivors to everyone except the owner', async () => {
    const owner = await createGameWithOwner(ctx)
    await joinSurvivor(ctx, owner.state.code, 'A')
    const b = await joinSurvivor(ctx, owner.state.code, 'B')

    // B starts as a killer — the roll must convert them too.
    await charactersService.assignRole(
      owner.state.code,
      b.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )

    await charactersService.rollSurvivors(
      owner.state.code,
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const others = state.players.filter((p) => p.id !== owner.playerId)
    expect(others).toHaveLength(2)

    for (const player of others) {
      expect(player.role).toBe(PlayerRole.SURVIVOR)
      expect(player.characterTypeId).not.toBeNull()
      expect(player.health).not.toBeNull()
      expect(player.status).toBe(PlayerStatus.ALIVE)
    }

    // Two players, two types — no repeats while supply lasts.
    const types = others.map((p) => p.characterTypeId)
    expect(new Set(types).size).toBe(2)

    // Owner is untouched.
    const me = state.players.find((p) => p.id === owner.playerId)!
    expect(me.characterTypeId).toBeNull()
  })

  it('non-owner cannot roll survivors', async () => {
    const owner = await createGameWithOwner(ctx)
    const other = await joinSurvivor(ctx, owner.state.code, 'Other')

    await expect(
      charactersService.rollSurvivors(
        owner.state.code,
        other.sessionToken,
      ),
    ).rejects.toThrow('NOT_GAME_OWNER')
  })
})
