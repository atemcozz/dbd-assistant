import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { AbilitiesService } from '../src/abilities.service'
import { QuestsService } from '../src/quests.service'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { setupLobbyGame } from './helpers'

describe('Quest blocking', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let abilitiesService: AbilitiesService
  let questsService: QuestsService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    abilitiesService = ctx.abilitiesService
    questsService = ctx.questsService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  async function setupGameWithQuest() {
    const { owner, survivor } = await setupLobbyGame(ctx)
    await questsService.select(owner.state.code, owner.sessionToken, [
      'universal-quest',
    ])
    await gamesService.startGame(owner.state.code, owner.sessionToken)
    return { owner, survivor }
  }

  it('killer blocks a quest and completion is rejected while blocked', async () => {
    const { owner, survivor } = await setupGameWithQuest()

    // Killer (stalker) blocks quest #1 for 60s.
    const result = await abilitiesService.use(
      owner.state.code,
      'seal-quest',
      undefined,
      survivor.sessionToken,
      1,
    )
    expect(result.appliedEffects).toHaveLength(0)
    expect(result.appliedQuestBlocks).toHaveLength(1)
    expect(result.appliedQuestBlocks[0]).toMatchObject({
      questNumber: 1,
      questName: 'Universal Quest',
    })

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const quest = state.quests[0]
    expect(quest.blockedUntil).not.toBeNull()
    const remainingMs =
      new Date(quest.blockedUntil!).getTime() - Date.now()
    expect(remainingMs).toBeGreaterThan(0)
    expect(remainingMs).toBeLessThanOrEqual(60_000)

    // Survivor completion is rejected while blocked.
    await expect(
      questsService.complete(owner.state.code, quest.id, owner.sessionToken),
    ).rejects.toThrow('QUEST_BLOCKED')
  })

  it('blocked quest can be completed after the block expires', async () => {
    const { owner, survivor } = await setupGameWithQuest()

    await abilitiesService.use(
      owner.state.code,
      'seal-quest',
      undefined,
      survivor.sessionToken,
      1,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const quest = state.quests[0]

    // Move the block into the past — expiry is a lazy timestamp check.
    await prisma.gameQuest.update({
      where: { id: quest.id },
      data: { blockedUntil: new Date(Date.now() - 1000) },
    })

    await questsService.complete(
      owner.state.code,
      quest.id,
      owner.sessionToken,
    )

    const done = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(done.quests[0].status).toBe('COMPLETED')
  })

  it('re-blocking refreshes the timer', async () => {
    const { owner, survivor } = await setupGameWithQuest()

    await abilitiesService.use(
      owner.state.code,
      'seal-quest',
      undefined,
      survivor.sessionToken,
      1,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )

    // Let the block lapse, then block again.
    await prisma.gameQuest.update({
      where: { id: state.quests[0].id },
      data: { blockedUntil: new Date(Date.now() - 1000) },
    })
    await abilitiesService.use(
      owner.state.code,
      'seal-quest',
      undefined,
      survivor.sessionToken,
      1,
    )

    const refreshed = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(
      new Date(refreshed.quests[0].blockedUntil!).getTime(),
    ).toBeGreaterThan(Date.now())

    await expect(
      questsService.complete(
        owner.state.code,
        state.quests[0].id,
        owner.sessionToken,
      ),
    ).rejects.toThrow('QUEST_BLOCKED')
  })

  it('blocking a completed quest is rejected', async () => {
    const { owner, survivor } = await setupGameWithQuest()

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    await questsService.complete(
      owner.state.code,
      state.quests[0].id,
      owner.sessionToken,
    )

    await expect(
      abilitiesService.use(
        owner.state.code,
        'seal-quest',
        undefined,
        survivor.sessionToken,
        1,
      ),
    ).rejects.toThrow('QUEST_ALREADY_COMPLETED')
  })

  it('blocking requires a quest number from this game', async () => {
    const { owner, survivor } = await setupGameWithQuest()

    await expect(
      abilitiesService.use(
        owner.state.code,
        'seal-quest',
        undefined,
        survivor.sessionToken,
        undefined,
      ),
    ).rejects.toThrow('QUEST_TARGET_REQUIRED')

    await expect(
      abilitiesService.use(
        owner.state.code,
        'seal-quest',
        undefined,
        survivor.sessionToken,
        99,
      ),
    ).rejects.toThrow('QUEST_NOT_FOUND')
  })

  it('survivor cannot block quests', async () => {
    const { owner } = await setupGameWithQuest()

    // Not owned through the kit at all.
    await expect(
      abilitiesService.use(
        owner.state.code,
        'seal-quest',
        undefined,
        owner.sessionToken,
        1,
      ),
    ).rejects.toThrow('ABILITY_NOT_AVAILABLE')

    // Even when owning it directly (config validation would never allow
    // this kit link — defense in depth).
    await prisma.playerAbility.create({
      data: { playerId: owner.playerId, abilityId: 'seal-quest' },
    })

    await expect(
      abilitiesService.use(
        owner.state.code,
        'seal-quest',
        undefined,
        owner.sessionToken,
        1,
      ),
    ).rejects.toThrow('ONLY_KILLERS_CAN_BLOCK_QUESTS')
  })
})
