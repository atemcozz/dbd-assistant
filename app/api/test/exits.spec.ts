import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { QuestsService } from '../src/quests.service'
import { ExitsService } from '../src/exits.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { joinSurvivor, setupLobbyGame } from './helpers'

describe('Exits', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let combatService: CombatService
  let questsService: QuestsService
  let exitsService: ExitsService
  let charactersService: CharactersService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    combatService = ctx.combatService
    questsService = ctx.questsService
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

  // Helper: running game with exits unlocked.
  // requiredQuestPoints stays at 1 from setupLobbyGame; completing
  // universal-quest (cost 100) pushes completed points over the threshold.
  async function setupGameWithUnlockedExits() {
    const { owner, survivor } = await setupLobbyGame(ctx)
    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    // Complete the quest so completed points meet the requirement.
    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    await questsService.complete(
      owner.state.code,
      state.quests[0].id,
      owner.sessionToken,
    )

    return { owner, survivor }
  }

  it('selected exits appear in game state', async () => {
    const { owner } = await setupGameWithUnlockedExits()

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )

    expect(state.exits.length).toBe(1)
    expect(state.exits[0].definition.id).toBe('main-gate')
    expect(state.exits[0].definition.name).toBe('Main Gate')
  })

  it('survivor can escape through an exit when points are met', async () => {
    const { owner } = await setupGameWithUnlockedExits()

    const beforeState = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(beforeState.exitsUnlocked).toBe(true)

    await exitsService.use(
      owner.state.code,
      'main-gate',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)
    expect(ownerPlayer?.status).toBe('ESCAPED')
  })

  it('escaped player cannot be attacked by the killer', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    // Add a second survivor so the game keeps running after one escapes.
    const second = await joinSurvivor(ctx, owner.state.code, 'Second')
    await charactersService.assignRole(
      owner.state.code,
      second.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      second.playerId,
      owner.sessionToken,
      'medic',
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    const startedState = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    await questsService.complete(
      owner.state.code,
      startedState.quests[0].id,
      owner.sessionToken,
    )

    await exitsService.use(
      owner.state.code,
      'main-gate',
      owner.sessionToken,
    )

    await expect(
      combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })

  it('escaped player cannot complete quests', async () => {
    const { owner } = await setupGameWithUnlockedExits()

    // Grab the game quest id directly — available quests are hidden once
    // exits unlock, so we can't rely on state.quests here.
    const game = await prisma.game.findUnique({
      where: { code: owner.state.code },
    })
    const gameQuest = await prisma.gameQuest.findFirst({
      where: { gameId: game!.id },
    })

    await exitsService.use(
      owner.state.code,
      'main-gate',
      owner.sessionToken,
    )

    await expect(
      questsService.complete(
        owner.state.code,
        gameQuest!.id,
        owner.sessionToken,
      ),
    ).rejects.toThrow('ONLY_ACTIVE_SURVIVORS')
  })

  it('all survivors escaped ends the game with survivors winning', async () => {
    const { owner } = await setupGameWithUnlockedExits()

    // Owner is the only survivor — escaping ends the game.
    await exitsService.use(
      owner.state.code,
      'main-gate',
      owner.sessionToken,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe('FINISHED')
    expect(state.winner).toBe('SURVIVORS')
  })

  it('killer cannot escape through an exit', async () => {
    const { owner, survivor } = await setupGameWithUnlockedExits()

    await expect(
      exitsService.use(
        owner.state.code,
        'main-gate',
        survivor.sessionToken,
      ),
    ).rejects.toThrow('ONLY_SURVIVORS_CAN_ESCAPE')
  })

  it('dead survivor cannot escape', async () => {
    const { owner, survivor } = await setupGameWithUnlockedExits()

    // Kill the owner (medic 3 HP + 2 knockouts = 5 lethal hits).
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    }

    await expect(
      exitsService.use(
        owner.state.code,
        'main-gate',
        owner.sessionToken,
      ),
    ).rejects.toThrow('PLAYER_NOT_ACTIVE')
  })

  it('escape is rejected while exits are locked', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Select expensive-quest (cost 500) so startGame passes the points check,
    // but don't complete it — exits stay locked (0 completed < 500 required).
    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      500,
    )
    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['expensive-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    await expect(
      exitsService.use(
        owner.state.code,
        'main-gate',
        owner.sessionToken,
      ),
    ).rejects.toThrow('EXITS_LOCKED')
  })

  it('escape through an exit not selected for the game is rejected', async () => {
    const { owner } = await setupGameWithUnlockedExits()

    // side-door was not selected — only main-gate is in the game.
    await expect(
      exitsService.use(
        owner.state.code,
        'side-door',
        owner.sessionToken,
      ),
    ).rejects.toThrow('EXIT_NOT_IN_GAME')
  })

  it('partially escaped team keeps playing until timeout or full escape', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Add a third player as survivor so not everyone escapes at once.
    const third = await joinSurvivor(ctx, owner.state.code, 'Third')
    await charactersService.assignRole(
      owner.state.code,
      third.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      third.playerId,
      owner.sessionToken,
      'medic',
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    // Complete the quest so exits unlock (required points = 1, quest cost = 100).
    const startedState = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    await questsService.complete(
      owner.state.code,
      startedState.quests[0].id,
      owner.sessionToken,
    )

    // Owner escapes — game should still be running (Third has not escaped).
    await exitsService.use(
      owner.state.code,
      'main-gate',
      owner.sessionToken,
    )

    let state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe('RUNNING')
    expect(state.winner).toBeNull()

    const ownerPlayer = state.players.find((p) => p.id === owner.playerId)
    expect(ownerPlayer?.status).toBe('ESCAPED')

    // Third escapes — now both survivors have escaped → game ends.
    await exitsService.use(
      owner.state.code,
      'main-gate',
      third.sessionToken,
    )

    state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe('FINISHED')
    expect(state.winner).toBe('SURVIVORS')
  })
})
