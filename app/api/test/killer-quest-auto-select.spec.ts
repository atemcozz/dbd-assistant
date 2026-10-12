import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { QuestsService } from '../src/quests.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { createGameWithOwner, joinSurvivor } from './helpers'

describe('Killer quest auto-select', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let questsService: QuestsService
  let charactersService: CharactersService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    questsService = ctx.questsService
    charactersService = ctx.charactersService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  async function assignKiller(code: string, token: string, playerId: string, type: string) {
    await charactersService.assignRole(code, playerId, token, PlayerRole.KILLER)
    await charactersService.assignCharacter(code, playerId, token, type)
  }

  it("assigning a killer auto-selects their type's quests after existing ones", async () => {
    const owner = await createGameWithOwner(ctx)
    const killer = await joinSurvivor(ctx, owner.state.code, 'Killer')

    await questsService.select(owner.state.code, owner.sessionToken, [
      'universal-quest',
    ])
    await assignKiller(owner.state.code, owner.sessionToken, killer.playerId, 'stalker')

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.quests.map((q) => q.definition.id)).toEqual([
      'universal-quest',
      'stalker-quest',
    ])
    expect(state.quests.map((q) => q.number)).toEqual([1, 2])
  })

  it('does not duplicate on re-assign or a second killer of the same type', async () => {
    const owner = await createGameWithOwner(ctx)
    const first = await joinSurvivor(ctx, owner.state.code, 'First')
    const second = await joinSurvivor(ctx, owner.state.code, 'Second')

    await assignKiller(owner.state.code, owner.sessionToken, first.playerId, 'stalker')
    await assignKiller(owner.state.code, owner.sessionToken, second.playerId, 'stalker')
    // Re-assign the same character again.
    await charactersService.assignCharacter(
      owner.state.code,
      first.playerId,
      owner.sessionToken,
      'stalker',
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.quests.map((q) => q.definition.id)).toEqual([
      'stalker-quest',
    ])
  })

  it('switching killer type swaps the auto-selected quests', async () => {
    const owner = await createGameWithOwner(ctx)
    const killer = await joinSurvivor(ctx, owner.state.code, 'Killer')

    await assignKiller(owner.state.code, owner.sessionToken, killer.playerId, 'stalker')
    await charactersService.assignCharacter(
      owner.state.code,
      killer.playerId,
      owner.sessionToken,
      'hunter',
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.quests.map((q) => q.definition.id)).toEqual(['hunter-quest'])
  })

  it('assigning a survivor adds no quests', async () => {
    const owner = await createGameWithOwner(ctx)
    const other = await joinSurvivor(ctx, owner.state.code, 'Other')

    await charactersService.assignRole(
      owner.state.code,
      other.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      other.playerId,
      owner.sessionToken,
      'medic',
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.quests).toHaveLength(0)
  })
})
