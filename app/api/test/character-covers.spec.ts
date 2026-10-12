import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CharactersService } from '../src/characters.service'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { setupRunningGame } from './helpers'

describe('Character covers', () => {
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

  it('coverImage flows into the character list and game state', async () => {
    await prisma.characterType.update({
      where: { id: 'medic' },
      data: { coverImage: 'survivors/doc.jpg' },
    })

    const list = await charactersService.list()
    expect(
      list.find((character) => character.id === 'medic')!.coverImage,
    ).toBe('survivors/doc.jpg')
    expect(
      list.find((character) => character.id === 'stalker')!.coverImage,
    ).toBeNull()

    const { owner } = await setupRunningGame(ctx)
    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const me = state.players.find((p) => p.id === owner.playerId)!
    expect(me.characterType!.coverImage).toBe('survivors/doc.jpg')

    await prisma.characterType.update({
      where: { id: 'medic' },
      data: { coverImage: null },
    })
  })
})
