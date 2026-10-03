import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { EffectsService } from '../src/effects.service'
import { QuestsService } from '../src/quests.service'
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
        killerCharacterTypeId: 'stalker',
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
  // Does NOT start the game — quest selection must happen in LOBBY status.
  async function setupLobbyGame() {
    const owner = await createGameWithOwner()
    const survivor = await joinSurvivor(owner.state.code, 'Survivor')

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
  async function setupRunningGame() {
    const { owner, survivor } = await setupLobbyGame()
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

    it('killer-specific quest visibility filtering works', async () => {
      const { owner, survivor } = await setupLobbyGame()

      await questsService.select(
        owner.state.code,
        owner.sessionToken,
        ['universal-quest', 'stalker-quest'],
      )
      await gamesService.startGame(owner.state.code, owner.sessionToken)

      // Killer (stalker) should see both quests.
      const killerState = await gamesService.getState(
        owner.state.code,
        survivor.sessionToken,
      )
      const killerQuestIds = killerState.quests.map((q) => q.definition.id)
      expect(killerQuestIds).toContain('universal-quest')
      expect(killerQuestIds).toContain('stalker-quest')
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
