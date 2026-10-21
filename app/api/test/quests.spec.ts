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
import { createGameWithOwner, joinSurvivor, setupLobbyGame } from './helpers'

describe('Quests', () => {
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

  it('completed quest cannot be completed twice', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Select quests in lobby, then start the game.
    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const quest = state.quests[0]
    expect(quest).toBeDefined()

    // Complete the quest as the owner (survivor).
    await questsService.complete(
      owner.state.code,
      quest.id,
      owner.sessionToken,
    )

    // Try to complete again — should fail.
    await expect(
      questsService.complete(owner.state.code, quest.id, owner.sessionToken),
    ).rejects.toThrow('QUEST_ALREADY_COMPLETED')
  })

  it('in-game quest list is visible to every player regardless of killer type', async () => {
    const owner = await createGameWithOwner(ctx)
    const killerPlayer = await joinSurvivor(ctx, owner.state.code, 'Killer')
    const survivorPlayer = await joinSurvivor(ctx, owner.state.code, 'Mate')

    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      1,
    )
    await exitsService.select(owner.state.code, owner.sessionToken, ['main-gate'])

    await charactersService.assignRole(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      'medic',
    )
    await charactersService.assignRole(
      owner.state.code,
      survivorPlayer.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      survivorPlayer.playerId,
      owner.sessionToken,
      'medic',
    )
    await charactersService.assignRole(
      owner.state.code,
      killerPlayer.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )
    // Killer is stalker — quests for hunter must still be visible in-game.
    await charactersService.assignCharacter(
      owner.state.code,
      killerPlayer.playerId,
      owner.sessionToken,
      'stalker',
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest', 'hunter-quest'],
    )

    // Lobby and in-game: every player who can see quests gets the full list.
    // Type-specific hiding is not applied — orphans are removed on swap instead.
    const lobbyKillerState = await gamesService.getState(
      owner.state.code,
      killerPlayer.sessionToken,
    )
    const lobbyIds = lobbyKillerState.quests.map((q) => q.definition.id)
    expect(lobbyIds).toContain('universal-quest')
    expect(lobbyIds).toContain('stalker-quest')
    expect(lobbyIds).toContain('hunter-quest')

    await gamesService.startGame(owner.state.code, owner.sessionToken)

    const killerState = await gamesService.getState(
      owner.state.code,
      killerPlayer.sessionToken,
    )
    const killerQuestIds = killerState.quests.map((q) => q.definition.id)
    expect(killerQuestIds).toContain('universal-quest')
    expect(killerQuestIds).toContain('stalker-quest')
    expect(killerQuestIds).toContain('hunter-quest')

    const survivorState = await gamesService.getState(
      owner.state.code,
      survivorPlayer.sessionToken,
    )
    const survivorQuestIds = survivorState.quests.map((q) => q.definition.id)
    expect(survivorQuestIds).toContain('universal-quest')
    expect(survivorQuestIds).toContain('stalker-quest')
    expect(survivorQuestIds).toContain('hunter-quest')

    const definitions = await questsService.listDefinitions(
      owner.state.code,
      killerPlayer.sessionToken,
    )
    const definitionIds = definitions.map((q) => q.id)
    expect(definitionIds).toContain('hunter-quest')
    expect(definitionIds).toContain('stalker-quest')
  })

  it('owner receives all quest definitions regardless of own role', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Owner is a survivor — still must see every definition.
    const asSurvivor = await questsService.listDefinitions(
      owner.state.code,
      owner.sessionToken,
    )
    const survivorIds = asSurvivor.map((q) => q.id)
    expect(survivorIds).toContain('universal-quest')
    expect(survivorIds).toContain('stalker-quest')
    expect(survivorIds).toContain('hunter-quest')

    // Owner becomes the killer — definitions list must not shrink.
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

    const asKiller = await questsService.listDefinitions(
      owner.state.code,
      owner.sessionToken,
    )
    const killerIds = asKiller.map((q) => q.id)
    expect(killerIds).toContain('universal-quest')
    expect(killerIds).toContain('stalker-quest')
    expect(killerIds).toContain('hunter-quest')
  })

  it('ordinary killer receives all quest definitions', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    const definitions = await questsService.listDefinitions(
      owner.state.code,
      survivor.sessionToken,
    )
    const ids = definitions.map((q) => q.id)

    expect(ids).toContain('universal-quest')
    expect(ids).toContain('stalker-quest')
    expect(ids).toContain('hunter-quest')
  })

  it('every killer sees all selected quests in the lobby', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    // Owner becomes a stalker first, then selects quests.
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

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest', 'hunter-quest'],
    )

    const ownerState = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const ownerQuestIds = ownerState.quests.map((q) => q.definition.id)
    expect(ownerQuestIds).toContain('universal-quest')
    expect(ownerQuestIds).toContain('stalker-quest')
    expect(ownerQuestIds).toContain('hunter-quest')

    // Non-owner killer also sees the full selected list.
    const killerState = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const killerQuestIds = killerState.quests.map((q) => q.definition.id)
    expect(killerQuestIds).toContain('universal-quest')
    expect(killerQuestIds).toContain('stalker-quest')
    expect(killerQuestIds).toContain('hunter-quest')
  })

  it('changing killer character type removes orphaned killer-specific quests', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest', 'hunter-quest'],
    )

    // Survivor player is stalker; change them to hunter.
    // stalker-quest has no remaining stalker → must be removed.
    await charactersService.assignCharacter(
      owner.state.code,
      survivor.playerId,
      owner.sessionToken,
      'hunter',
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const questIds = state.quests.map((q) => q.definition.id)
    expect(questIds).toContain('universal-quest')
    expect(questIds).toContain('hunter-quest')
    expect(questIds).not.toContain('stalker-quest')

    // Remaining quests renumber from 1 without gaps.
    const numbers = state.quests.map((q) => q.number).sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2])
  })

  it('killer-specific quests stay while another killer still has that type', async () => {
    const owner = await createGameWithOwner(ctx)
    const playerA = await joinSurvivor(ctx, owner.state.code, 'Player A')
    const playerB = await joinSurvivor(ctx, owner.state.code, 'Player B')

    await charactersService.assignRole(
      owner.state.code,
      playerA.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      playerA.playerId,
      owner.sessionToken,
      'stalker',
    )
    await charactersService.assignRole(
      owner.state.code,
      playerB.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      playerB.playerId,
      owner.sessionToken,
      'hunter',
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest', 'hunter-quest'],
    )

    // Change A from stalker to hunter — no stalker left → stalker-quest goes.
    // hunter-quest stays because B is still a hunter.
    await charactersService.assignCharacter(
      owner.state.code,
      playerA.playerId,
      owner.sessionToken,
      'hunter',
    )

    let state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    let questIds = state.quests.map((q) => q.definition.id)
    expect(questIds).not.toContain('stalker-quest')
    expect(questIds).toContain('hunter-quest')
    expect(questIds).toContain('universal-quest')

    // Put A back as stalker and restore both killer quests.
    await charactersService.assignCharacter(
      owner.state.code,
      playerA.playerId,
      owner.sessionToken,
      'stalker',
    )
    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest', 'hunter-quest'],
    )

    // Change B from hunter to stalker — no hunter left → hunter-quest goes.
    // stalker-quest stays because A is still a stalker.
    await charactersService.assignCharacter(
      owner.state.code,
      playerB.playerId,
      owner.sessionToken,
      'stalker',
    )

    state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    questIds = state.quests.map((q) => q.definition.id)
    expect(questIds).toContain('stalker-quest')
    expect(questIds).not.toContain('hunter-quest')
  })

  it('changing role away from killer removes orphaned killer quests', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest'],
    )

    // Only stalker in the room leaves the killer role → stalker-quest removed.
    await charactersService.assignRole(
      owner.state.code,
      survivor.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const questIds = state.quests.map((q) => q.definition.id)
    expect(questIds).toContain('universal-quest')
    expect(questIds).not.toContain('stalker-quest')
  })

  it('universal quests are visible to all killers', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    const killerState = await gamesService.getState(
      owner.state.code,
      survivor.sessionToken,
    )
    const killerQuestIds = killerState.quests.map((q) => q.definition.id)
    expect(killerQuestIds).toContain('universal-quest')
  })

  it('dead survivor cannot complete quests', async () => {
    const { owner, survivor } = await setupLobbyGame(ctx)

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    // Kill the owner: 3 HP + 2 knockouts = 5 lethal hits.
    for (let hit = 0; hit < 5; hit++) {
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
    }

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const quest = state.quests[0]

    // Dead survivor cannot complete quests.
    await expect(
      questsService.complete(owner.state.code, quest.id, owner.sessionToken),
    ).rejects.toThrow('ONLY_ACTIVE_SURVIVORS')
  })

  it('quest points sum toward requiredQuestPoints and unlock exits', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Set required points to 300 — enough for universal-quest (100) + stalker-quest (200).
    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      300,
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest', 'stalker-quest'],
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)

    // Before completing any quests — exits should not be unlocked.
    let state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.exitsUnlocked).toBe(false)
    expect(state.completedQuestPoints).toBe(0)
    expect(state.requiredQuestPoints).toBe(300)

    // Complete universal-quest (cost 100).
    const universalQuest = state.quests.find(
      (q) => q.definition.id === 'universal-quest',
    )!
    await questsService.complete(
      owner.state.code,
      universalQuest.id,
      owner.sessionToken,
    )

    state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.completedQuestPoints).toBe(100)
    expect(state.exitsUnlocked).toBe(false)

    // Complete stalker-quest (cost 200) — total 300, exits should unlock.
    const stalkerQuest = state.quests.find(
      (q) => q.definition.id === 'stalker-quest',
    )!
    await questsService.complete(
      owner.state.code,
      stalkerQuest.id,
      owner.sessionToken,
    )

    state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.completedQuestPoints).toBe(300)
    expect(state.exitsUnlocked).toBe(true)

    // Available quests are hidden when exits are unlocked — only completed remain.
    const availableQuests = state.quests.filter(
      (q) => q.status === 'AVAILABLE',
    )
    expect(availableQuests.length).toBe(0)
  })

  it('exits unlock when a single expensive quest meets the requirement', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Set required points to 500 — matches expensive-quest cost exactly.
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

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    const quest = state.quests[0]
    expect(quest.definition.cost).toBe(500)

    await questsService.complete(
      owner.state.code,
      quest.id,
      owner.sessionToken,
    )

    const afterState = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(afterState.completedQuestPoints).toBe(500)
    expect(afterState.exitsUnlocked).toBe(true)
  })

  it('game cannot start when selected quests do not meet required points', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Set required points to 500 — universal-quest alone only gives 100.
    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      500,
    )

    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )

    await expect(
      gamesService.startGame(owner.state.code, owner.sessionToken),
    ).rejects.toThrow('NOT_ENOUGH_QUEST_POINTS')

    // Game should still be in lobby.
    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe('LOBBY')
  })

  it('game cannot start without at least one exit', async () => {
    const { owner } = await setupLobbyGame(ctx)

    // Remove the exit selected by setupLobbyGame.
    await exitsService.select(owner.state.code, owner.sessionToken, [])

    // Select a quest so the points check passes — failure should be about exits.
    await questsService.select(
      owner.state.code,
      owner.sessionToken,
      ['universal-quest'],
    )

    await expect(
      gamesService.startGame(owner.state.code, owner.sessionToken),
    ).rejects.toThrow('NO_EXITS_SELECTED')

    const state = await gamesService.getState(
      owner.state.code,
      owner.sessionToken,
    )
    expect(state.status).toBe('LOBBY')
  })
})
