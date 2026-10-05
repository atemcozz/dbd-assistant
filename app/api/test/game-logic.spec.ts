import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { EffectsService } from '../src/effects.service'
import { QuestsService } from '../src/quests.service'
import { ExitsService } from '../src/exits.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole, PlayerStatus, GameStatus } from '@prisma/client'

// Integration tests for core game logic using a real SQLite database.
// Set DATABASE_URL before importing AppModule so Prisma connects to the test DB.
process.env.DATABASE_URL = 'file:./test-game.db'

describe('Game logic', () => {
  let app: INestApplication
  let prisma: PrismaService
  let gamesService: GamesService
  let combatService: CombatService
  let effectsService: EffectsService
  let questsService: QuestsService
  let exitsService: ExitsService
  let charactersService: CharactersService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    prisma = app.get(PrismaService)
    gamesService = app.get(GamesService)
    combatService = app.get(CombatService)
    effectsService = app.get(EffectsService)
    questsService = app.get(QuestsService)
    exitsService = app.get(ExitsService)
    charactersService = app.get(CharactersService)

    // Seed minimal config data needed for tests.
    await seedTestData()
  })

  afterAll(async () => {
    await app.close()
    // Clean up test database file (Prisma resolves file: URLs relative to prisma/).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dbPath = path.resolve(__dirname, '../prisma/test-game.db')
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  beforeEach(async () => {
    // Clean runtime state between tests but keep config data.
    await prisma.activeEffect.deleteMany()
    await prisma.playerEffect.deleteMany()
    await prisma.chatMessage.deleteMany()
    await prisma.gameQuest.deleteMany()
    await prisma.gameExit.deleteMany()
    await prisma.player.deleteMany()
    await prisma.game.deleteMany()
  })

  async function seedTestData() {
    // Create character types.
    await prisma.characterType.upsert({
      where: { id: 'medic' },
      update: {},
      create: {
        id: 'medic',
        role: PlayerRole.SURVIVOR,
        name: 'Medic',
        description: 'Can heal allies.',
        maxHealth: 3,
      },
    })

    await prisma.characterType.upsert({
      where: { id: 'stalker' },
      update: {},
      create: {
        id: 'stalker',
        role: PlayerRole.KILLER,
        name: 'Stalker',
        description: 'Focuses on pressure.',
        maxHealth: null,
      },
    })

    // Second killer type — used to test killer-specific quest filtering
    // and auto-removal when a player's killer type changes.
    await prisma.characterType.upsert({
      where: { id: 'hunter' },
      update: {},
      create: {
        id: 'hunter',
        role: PlayerRole.KILLER,
        name: 'Hunter',
        description: 'Direct attacks.',
        maxHealth: null,
      },
    })

    // Create effect definitions — HEAL type.
    await prisma.effectDefinition.upsert({
      where: { id: 'field-dressing' },
      update: {},
      create: {
        id: 'field-dressing',
        name: 'Field Dressing',
        description: 'Restore 1 HP.',
        targetDescription: 'Your wounds are being treated.',
        action: 'HEAL',
        quantity: 1,
        duration: null,
        cooldown: 0,
        allowedTargets: JSON.stringify(['SELF', 'SURVIVOR']),
      },
    })

    // DAMAGE effect — killer attack on a single survivor.
    await prisma.effectDefinition.upsert({
      where: { id: 'attack-survivor' },
      update: {},
      create: {
        id: 'attack-survivor',
        name: 'Attack Survivor',
        description: 'Attack one survivor. Removes 1 HP.',
        targetDescription: 'You were attacked! You lose 1 HP.',
        action: 'DAMAGE',
        quantity: 1,
        duration: null,
        cooldown: 5,
        allowedTargets: JSON.stringify(['SURVIVOR']),
      },
    })

    // TEXT effect — simple physical-game instruction sent to a survivor.
    await prisma.effectDefinition.upsert({
      where: { id: 'stay-still' },
      update: {},
      create: {
        id: 'stay-still',
        name: 'Stay Still',
        description: "Don't move for 30 seconds.",
        targetDescription: 'You are stunned! Don\'t move for 30 seconds.',
        action: 'TEXT',
        quantity: 1,
        duration: 30,
        cooldown: 20,
        allowedTargets: JSON.stringify(['SURVIVOR']),
      },
    })

    // PASSIVE effect — an always-on character stat that is never activated.
    await prisma.effectDefinition.upsert({
      where: { id: 'free-run' },
      update: {},
      create: {
        id: 'free-run',
        name: 'Free Run',
        description: 'You may run without restrictions.',
        targetDescription: null,
        action: 'PASSIVE',
        quantity: 0,
        duration: null,
        cooldown: 0,
        allowedTargets: JSON.stringify([]),
      },
    })

    // Link medic → field-dressing effect with 3 charges.
    await prisma.characterEffect.upsert({
      where: {
        characterTypeId_effectId: {
          characterTypeId: 'medic',
          effectId: 'field-dressing',
        },
      },
      update: {},
      create: {
        characterTypeId: 'medic',
        effectId: 'field-dressing',
        charges: 3,
      },
    })

    // Link stalker → attack-survivor effect with 5 charges.
    await prisma.characterEffect.upsert({
      where: {
        characterTypeId_effectId: {
          characterTypeId: 'stalker',
          effectId: 'attack-survivor',
        },
      },
      update: {},
      create: {
        characterTypeId: 'stalker',
        effectId: 'attack-survivor',
        charges: 5,
      },
    })

    // Link stalker → stay-still TEXT effect with 2 charges.
    await prisma.characterEffect.upsert({
      where: {
        characterTypeId_effectId: {
          characterTypeId: 'stalker',
          effectId: 'stay-still',
        },
      },
      update: {},
      create: {
        characterTypeId: 'stalker',
        effectId: 'stay-still',
        charges: 2,
      },
    })

    // Link stalker → free-run PASSIVE stat (no charges to manage).
    await prisma.characterEffect.upsert({
      where: {
        characterTypeId_effectId: {
          characterTypeId: 'stalker',
          effectId: 'free-run',
        },
      },
      update: {},
      create: {
        characterTypeId: 'stalker',
        effectId: 'free-run',
        charges: null,
      },
    })

    // Create quest definitions.
    await prisma.questDefinition.upsert({
      where: { id: 'universal-quest' },
      update: {},
      create: {
        id: 'universal-quest',
        name: 'Universal Quest',
        description: 'A quest visible to all killers.',
        type: 'EXPLORATION',
        radius: null,
        cost: 100,
        killerCharacterTypeId: null,
      },
    })

    await prisma.questDefinition.upsert({
      where: { id: 'stalker-quest' },
      update: {},
      create: {
        id: 'stalker-quest',
        name: 'Stalker Quest',
        description: 'A quest specific to the stalker.',
        type: 'SURVIVOR_OBJECTIVE',
        radius: null,
        cost: 200,
        killerCharacterTypeId: 'stalker',
      },
    })

    await prisma.questDefinition.upsert({
      where: { id: 'hunter-quest' },
      update: {},
      create: {
        id: 'hunter-quest',
        name: 'Hunter Quest',
        description: 'A quest specific to the hunter.',
        type: 'SURVIVOR_OBJECTIVE',
        radius: null,
        cost: 150,
        killerCharacterTypeId: 'hunter',
      },
    })

    await prisma.questDefinition.upsert({
      where: { id: 'expensive-quest' },
      update: {},
      create: {
        id: 'expensive-quest',
        name: 'Expensive Quest',
        description: 'A high-value quest.',
        type: 'PUZZLE',
        radius: null,
        cost: 500,
        killerCharacterTypeId: null,
      },
    })

    // Exit definitions — physical escape routes.
    await prisma.exitDefinition.upsert({
      where: { id: 'main-gate' },
      update: {},
      create: {
        id: 'main-gate',
        name: 'Main Gate',
        description: 'The main entrance gate.',
      },
    })

    await prisma.exitDefinition.upsert({
      where: { id: 'side-door' },
      update: {},
      create: {
        id: 'side-door',
        name: 'Side Door',
        description: 'A quiet side door.',
      },
    })
  }

  // Helper: create a game with an owner (survivor) and return session info.
  async function createGameWithOwner() {
    const result = await gamesService.createGame('Test Game', 'Owner')
    return result
  }

  // Helper: join a second player as survivor.
  async function joinSurvivor(code: string, name: string) {
    return gamesService.joinGame(code, name)
  }

  // Helper: create a lobby-ready game with owner + survivor and characters assigned.
  // Does NOT start the game — quest/exit selection must happen in LOBBY status.
  // Selects one exit (startGame requires at least one) and sets requiredQuestPoints
  // to 1 so exits stay locked (0 completed points < 1) while still allowing
  // startGame with any selected quest. Point-system tests override this value.
  async function setupLobbyGame() {
    const owner = await createGameWithOwner()
    const survivor = await joinSurvivor(owner.state.code, 'Survivor')

    // Keep exits locked but don't gate startGame on expensive quest selection.
    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      1,
    )

    // At least one exit is required to start the game.
    await exitsService.select(
      owner.state.code,
      owner.sessionToken,
      ['main-gate'],
    )

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
      survivor.playerId,
      owner.sessionToken,
      PlayerRole.KILLER,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      survivor.playerId,
      owner.sessionToken,
      'stalker',
    )

    return { owner, survivor }
  }

  // Helper: start a game after assigning characters to all players.
  // Sets requiredQuestPoints to 0 — combat/effects tests don't select quests
  // and don't care about the exits gate.
  async function setupRunningGame() {
    const { owner, survivor } = await setupLobbyGame()
    await gamesService.updateSettings(
      owner.state.code,
      owner.sessionToken,
      3600,
      0,
    )
    await gamesService.startGame(owner.state.code, owner.sessionToken)
    return { owner, survivor }
  }

  describe('Attack / combat', () => {
    it('killer can attack a survivor', async () => {
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
  })

  describe('Effects', () => {
    it('heal restores HP but cannot exceed maxHealth', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Damage the owner to 2 HP.
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      // Use field-dressing (heal) effect on self.
      await effectsService.use(
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
      const { owner } = await setupRunningGame()

      // Owner is at full HP (3). Heal should cap at 3.
      await effectsService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      )

      const state = await gamesService.getState(owner.state.code, owner.sessionToken)
      const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
      expect(ownerPlayer.health).toBe(3) // still capped at max
    })

    it('effect consumes a charge', async () => {
      const { owner } = await setupRunningGame()

      // Medic has 3 field-dressing charges.
      const stateBefore = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const healBefore = stateBefore.effects.find((e) => e.effectId === 'field-dressing')!
      expect(healBefore.charges).toBe(3)

      await effectsService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      )

      const stateAfter = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const healAfter = stateAfter.effects.find((e) => e.effectId === 'field-dressing')!
      expect(healAfter.charges).toBe(2)
    })

    it('effect with no charges is rejected', async () => {
      const { owner } = await setupRunningGame()

      // Use field-dressing 3 times to exhaust charges.
      await effectsService.use(owner.state.code, 'field-dressing', undefined, owner.sessionToken)
      await effectsService.use(owner.state.code, 'field-dressing', undefined, owner.sessionToken)
      await effectsService.use(owner.state.code, 'field-dressing', undefined, owner.sessionToken)

      // 4th use should fail — no charges left.
      await expect(
        effectsService.use(owner.state.code, 'field-dressing', undefined, owner.sessionToken),
      ).rejects.toThrow('NO_EFFECT_CHARGES')
    })

    it('DAMAGE effect reduces target HP by 1', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer (survivor player) uses attack-survivor on owner (medic).
      await effectsService.use(
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

    it('DAMAGE effect on self reduces own HP', async () => {
      const { owner } = await setupRunningGame()

      // Owner (medic, survivor) doesn't have self-attack in test seed —
      // verify attack-survivor cannot target self (killer-only).
      await expect(
        effectsService.use(
          owner.state.code,
          'attack-survivor',
          undefined,
          owner.sessionToken,
        ),
      ).rejects.toThrow('EFFECT_NOT_AVAILABLE')
    })

    it('TEXT effect creates ActiveEffect on target', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses stay-still on owner (survivor).
      await effectsService.use(
        owner.state.code,
        'stay-still',
        owner.playerId,
        survivor.sessionToken,
      )

      // Verify an active effect was created on the owner.
      const activeEffects = await prisma.activeEffect.findMany({
        where: { targetPlayerId: owner.playerId },
      })
      expect(activeEffects.length).toBeGreaterThan(0)
    })

    it('effect on cooldown is rejected', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses attack-survivor (cooldown: 5s) on owner.
      await effectsService.use(
        owner.state.code,
        'attack-survivor',
        owner.playerId,
        survivor.sessionToken,
      )

      // Immediate second use should fail — still on cooldown.
      await expect(
        effectsService.use(
          owner.state.code,
          'attack-survivor',
          owner.playerId,
          survivor.sessionToken,
        ),
      ).rejects.toThrow('EFFECT_ON_COOLDOWN')
    })

    it('targetDescription is returned for incoming effects', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses stay-still on owner.
      await effectsService.use(
        owner.state.code,
        'stay-still',
        owner.playerId,
        survivor.sessionToken,
      )

      // Owner's state should include the incoming effect with targetDescription.
      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const incomingEffect = state.effects.find(
        (e) => e.effectId === 'stay-still' && !e.owned,
      )
      expect(incomingEffect).toBeDefined()
      expect(incomingEffect!.targetDescription).toBe(
        "You are stunned! Don't move for 30 seconds.",
      )
    })

    it('invalid target is rejected', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer tries to use attack-survivor on themselves (killer) — invalid.
      await expect(
        effectsService.use(
          owner.state.code,
          'attack-survivor',
          survivor.playerId, // survivor is the killer — wrong role
          survivor.sessionToken,
        ),
      ).rejects.toThrow('INVALID_EFFECT_TARGET')
    })

    it('passive effect cannot be used', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Stalker owns the free-run passive — stats are never activatable.
      await expect(
        effectsService.use(
          owner.state.code,
          'free-run',
          undefined,
          survivor.sessionToken,
        ),
      ).rejects.toThrow('EFFECT_NOT_USABLE')
    })

    it('passive effect is listed as owned with action PASSIVE', async () => {
      const { owner, survivor } = await setupRunningGame()

      const state = await gamesService.getState(
        owner.state.code,
        survivor.sessionToken,
      )
      const passive = state.effects.find((e) => e.effectId === 'free-run')

      expect(passive).toBeDefined()
      expect(passive!.owned).toBe(true)
      expect(passive!.action).toBe('PASSIVE')
      expect(passive!.allowedTargets).toEqual([])
    })
  })

  describe('Quests', () => {
    it('completed quest cannot be completed twice', async () => {
      const { owner } = await setupLobbyGame()

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
      const owner = await createGameWithOwner()
      const killerPlayer = await joinSurvivor(owner.state.code, 'Killer')
      const survivorPlayer = await joinSurvivor(owner.state.code, 'Mate')

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
      const { owner } = await setupLobbyGame()

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
      const { owner, survivor } = await setupLobbyGame()

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
      const { owner, survivor } = await setupLobbyGame()

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
      const { owner, survivor } = await setupLobbyGame()

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
      const owner = await createGameWithOwner()
      const playerA = await joinSurvivor(owner.state.code, 'Player A')
      const playerB = await joinSurvivor(owner.state.code, 'Player B')

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
      const { owner, survivor } = await setupLobbyGame()

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
      const { owner, survivor } = await setupLobbyGame()

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
      const { owner, survivor } = await setupLobbyGame()

      await questsService.select(
        owner.state.code,
        owner.sessionToken,
        ['universal-quest'],
      )
      await gamesService.startGame(owner.state.code, owner.sessionToken)

      // Kill the owner.
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

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
      const { owner } = await setupLobbyGame()

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
      const { owner } = await setupLobbyGame()

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
      const { owner } = await setupLobbyGame()

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
      const { owner } = await setupLobbyGame()

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

  describe('Exits', () => {
    // Helper: running game with exits unlocked.
    // requiredQuestPoints stays at 1 from setupLobbyGame; completing
    // universal-quest (cost 100) pushes completed points over the threshold.
    async function setupGameWithUnlockedExits() {
      const { owner, survivor } = await setupLobbyGame()
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
      const { owner, survivor } = await setupLobbyGame()

      // Add a second survivor so the game keeps running after one escapes.
      const second = await joinSurvivor(owner.state.code, 'Second')
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

      // Kill the owner (medic, 3 HP).
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      await expect(
        exitsService.use(
          owner.state.code,
          'main-gate',
          owner.sessionToken,
        ),
      ).rejects.toThrow('PLAYER_NOT_ACTIVE')
    })

    it('escape is rejected while exits are locked', async () => {
      const { owner } = await setupLobbyGame()

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
      const { owner } = await setupLobbyGame()

      // Add a third player as survivor so not everyone escapes at once.
      const third = await joinSurvivor(owner.state.code, 'Third')
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

  describe('Game end conditions', () => {
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
      const { owner } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

      // Owner is the only survivor (medic, 3 HP). Killer attacks three times.
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )

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
      const { owner, survivor } = await setupRunningGame()

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
      const { owner, survivor } = await setupRunningGame()

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

  describe('Game session', () => {
    it('create returns sessionToken, playerId, and state', async () => {
      const result = await gamesService.createGame('Test', 'Player1')
      expect(result.sessionToken).toBeTruthy()
      expect(result.playerId).toBeTruthy()
      expect(result.state.code).toBeTruthy()
      expect(result.state.status).toBe(GameStatus.LOBBY)
    })

    it('join returns sessionToken, playerId, and state', async () => {
      const owner = await createGameWithOwner()
      const joiner = await joinSurvivor(owner.state.code, 'Player2')
      expect(joiner.sessionToken).toBeTruthy()
      expect(joiner.playerId).toBeTruthy()
      expect(joiner.state.code).toBe(owner.state.code)
    })

    it('game requires all players to have characters before starting', async () => {
      const owner = await createGameWithOwner()
      // Second player joins but is never assigned a character.
      await joinSurvivor(owner.state.code, 'Player2')

      // Assign owner a character but not the other player.
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

      // Starting should fail — the other player has no character.
      await expect(
        gamesService.startGame(owner.state.code, owner.sessionToken),
      ).rejects.toThrow('ALL_PLAYERS_NEED_CHARACTER')
    })
  })
})
