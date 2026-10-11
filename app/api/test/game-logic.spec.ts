import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { AbilitiesService } from '../src/abilities.service'
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
  let abilitiesService: AbilitiesService
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
    abilitiesService = app.get(AbilitiesService)
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
    await prisma.activeBuff.deleteMany()
    await prisma.playerAbility.deleteMany()
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

    // Buff definitions — HEAL / HURT / INFO with free-form params.
    await prisma.buffDefinition.upsert({
      where: { id: 'field-dressing' },
      update: {},
      create: {
        id: 'field-dressing',
        name: 'Field Dressing',
        description: 'Your wounds are being treated.',
        action: 'HEAL',
        params: JSON.stringify({ quantity: 1 }),
        defaultDuration: null,
      },
    })

    // HURT buff — used by the attack ability.
    await prisma.buffDefinition.upsert({
      where: { id: 'attack-survivor' },
      update: {},
      create: {
        id: 'attack-survivor',
        name: 'Attack Survivor',
        description: 'You were attacked! You lose 1 HP.',
        action: 'HURT',
        params: JSON.stringify({ quantity: 1 }),
        defaultDuration: null,
      },
    })

    // INFO buff — physical-game instruction with a 30 second window.
    await prisma.buffDefinition.upsert({
      where: { id: 'stay-still' },
      update: {},
      create: {
        id: 'stay-still',
        name: 'Stay Still',
        description: "You are stunned! Don't move for 30 seconds.",
        action: 'INFO',
        defaultDuration: 30,
      },
    })

    // Permanent INFO buff — a starting character stat with no ability.
    await prisma.buffDefinition.upsert({
      where: { id: 'free-run' },
      update: {},
      create: {
        id: 'free-run',
        name: 'Free Run',
        description: 'You may run without restrictions.',
        action: 'INFO',
        defaultDuration: null,
      },
    })

    // Ability definitions — each inflicts one or more buffs when used.
    // Heal ability — SELF or another survivor, no cooldown.
    await prisma.abilityDefinition.upsert({
      where: { id: 'field-dressing' },
      update: {},
      create: {
        id: 'field-dressing',
        name: 'Field Dressing',
        description: 'Restore 1 HP.',
        type: 'ACTIVE',
        cooldown: 0,
        allowedTargets: JSON.stringify(['SELF', 'SURVIVOR']),
      },
    })

    // HURT ability — killer attacks a single survivor.
    await prisma.abilityDefinition.upsert({
      where: { id: 'attack-survivor' },
      update: {},
      create: {
        id: 'attack-survivor',
        name: 'Attack Survivor',
        description: 'Attack one survivor. Removes 1 HP.',
        type: 'ACTIVE',
        cooldown: 5,
        allowedTargets: JSON.stringify(['SURVIVOR']),
      },
    })

    // INFO ability — simple physical-game instruction sent to a survivor.
    await prisma.abilityDefinition.upsert({
      where: { id: 'stay-still' },
      update: {},
      create: {
        id: 'stay-still',
        name: 'Stay Still',
        description: "Don't move for 30 seconds.",
        type: 'ACTIVE',
        cooldown: 20,
        allowedTargets: JSON.stringify(['SURVIVOR']),
      },
    })

    // Same INFO buff, but with a 5-second duration override on the link.
    await prisma.abilityDefinition.upsert({
      where: { id: 'quick-stun' },
      update: {},
      create: {
        id: 'quick-stun',
        name: 'Quick Stun',
        description: "Don't move for 5 seconds.",
        type: 'ACTIVE',
        cooldown: 0,
        allowedTargets: JSON.stringify(['SURVIVOR']),
      },
    })

    // Combo ability — inflicts two buffs (HEAL + INFO) in one use.
    await prisma.abilityDefinition.upsert({
      where: { id: 'field-stay' },
      update: {},
      create: {
        id: 'field-stay',
        name: 'Field Dressing + Stay Still',
        description: 'Restore 1 HP and stun yourself briefly.',
        type: 'ACTIVE',
        cooldown: 0,
        allowedTargets: JSON.stringify(['SELF', 'SURVIVOR']),
      },
    })

    // Passive ability — display-only trait, no cooldown/targets/buffs.
    await prisma.abilityDefinition.upsert({
      where: { id: 'iron-skin' },
      update: {},
      create: {
        id: 'iron-skin',
        name: 'Iron Skin',
        description: 'Takes one less damage.',
        type: 'PASSIVE',
        cooldown: 0,
        allowedTargets: JSON.stringify([]),
      },
    })

    // Ability → buff links (duration null = inherit buff.defaultDuration).
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: {
          abilityId: 'field-dressing',
          buffId: 'field-dressing',
        },
      },
      update: {},
      create: { abilityId: 'field-dressing', buffId: 'field-dressing', duration: null },
    })
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: {
          abilityId: 'attack-survivor',
          buffId: 'attack-survivor',
        },
      },
      update: {},
      create: { abilityId: 'attack-survivor', buffId: 'attack-survivor', duration: null },
    })
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: { abilityId: 'stay-still', buffId: 'stay-still' },
      },
      update: {},
      create: { abilityId: 'stay-still', buffId: 'stay-still', duration: null },
    })
    // Duration override: 5s instead of the buff's default 30s.
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: { abilityId: 'quick-stun', buffId: 'stay-still' },
      },
      update: {},
      create: { abilityId: 'quick-stun', buffId: 'stay-still', duration: 5 },
    })
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: { abilityId: 'field-stay', buffId: 'field-dressing' },
      },
      update: {},
      create: { abilityId: 'field-stay', buffId: 'field-dressing', duration: null },
    })
    await prisma.abilityBuff.upsert({
      where: {
        abilityId_buffId: { abilityId: 'field-stay', buffId: 'stay-still' },
      },
      update: {},
      create: { abilityId: 'field-stay', buffId: 'stay-still', duration: null },
    })

    // Link medic → field-dressing and the combo ability.
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'medic',
          abilityId: 'field-dressing',
        },
      },
      update: {},
      create: { characterTypeId: 'medic', abilityId: 'field-dressing' },
    })
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'medic',
          abilityId: 'field-stay',
        },
      },
      update: {},
      create: { characterTypeId: 'medic', abilityId: 'field-stay' },
    })
    // Link medic → iron-skin passive trait (no buff links, no count).
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'medic',
          abilityId: 'iron-skin',
        },
      },
      update: {},
      create: { characterTypeId: 'medic', abilityId: 'iron-skin' },
    })

    // Link stalker → attack-survivor, stay-still and quick-stun.
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'stalker',
          abilityId: 'attack-survivor',
        },
      },
      update: {},
      create: { characterTypeId: 'stalker', abilityId: 'attack-survivor' },
    })
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'stalker',
          abilityId: 'stay-still',
        },
      },
      update: {},
      create: { characterTypeId: 'stalker', abilityId: 'stay-still' },
    })
    await prisma.characterAbility.upsert({
      where: {
        characterTypeId_abilityId: {
          characterTypeId: 'stalker',
          abilityId: 'quick-stun',
        },
      },
      // Limited ability: only one use per game (count: 1).
      update: { count: 1 },
      create: { characterTypeId: 'stalker', abilityId: 'quick-stun', count: 1 },
    })

    // Link stalker → free-run permanent starting buff.
    await prisma.characterStartBuff.upsert({
      where: {
        characterTypeId_buffId: {
          characterTypeId: 'stalker',
          buffId: 'free-run',
        },
      },
      update: {},
      create: {
        characterTypeId: 'stalker',
        buffId: 'free-run',
        duration: null,
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

  describe('Abilities and buffs', () => {
    it('heal restores HP but cannot exceed maxHealth', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Damage the owner to 2 HP.
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      // Use field-dressing (HEAL buff) on self.
      await abilitiesService.use(
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
      await abilitiesService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      )

      const state = await gamesService.getState(owner.state.code, owner.sessionToken)
      const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
      expect(ownerPlayer.health).toBe(3) // still capped at max
    })

    it('HURT ability reduces target HP by 1', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer (survivor player) uses attack-survivor on owner (medic).
      await abilitiesService.use(
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

    it('ability the player does not own is rejected', async () => {
      const { owner } = await setupRunningGame()

      // Owner (survivor) doesn't own attack-survivor (killer ability).
      await expect(
        abilitiesService.use(
          owner.state.code,
          'attack-survivor',
          undefined,
          owner.sessionToken,
        ),
      ).rejects.toThrow('ABILITY_NOT_AVAILABLE')
    })

    it('INFO ability creates ActiveBuff on target', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses stay-still on owner (survivor).
      await abilitiesService.use(
        owner.state.code,
        'stay-still',
        owner.playerId,
        survivor.sessionToken,
      )

      // Verify a timed buff was created on the owner.
      const activeBuffs = await prisma.activeBuff.findMany({
        where: { targetPlayerId: owner.playerId, buffId: 'stay-still' },
      })
      expect(activeBuffs.length).toBeGreaterThan(0)
      expect(activeBuffs[0].expiresAt).not.toBeNull()
    })

    it('ability on cooldown is rejected', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses attack-survivor (cooldown: 5s) on owner.
      await abilitiesService.use(
        owner.state.code,
        'attack-survivor',
        owner.playerId,
        survivor.sessionToken,
      )

      // Immediate second use should fail — still on cooldown.
      await expect(
        abilitiesService.use(
          owner.state.code,
          'attack-survivor',
          owner.playerId,
          survivor.sessionToken,
        ),
      ).rejects.toThrow('ABILITY_ON_COOLDOWN')
    })

    it('incoming buff shows the buff description', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer uses stay-still on owner.
      await abilitiesService.use(
        owner.state.code,
        'stay-still',
        owner.playerId,
        survivor.sessionToken,
      )

      // Owner's state should include the incoming buff with its description.
      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const incomingBuff = state.buffs.find(
        (b) => b.buffId === 'stay-still',
      )
      expect(incomingBuff).toBeDefined()
      expect(incomingBuff!.description).toBe(
        "You are stunned! Don't move for 30 seconds.",
      )
      expect(incomingBuff!.expiresAt).not.toBeNull()
    })

    it('invalid target is rejected', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Killer tries to use attack-survivor on themselves (killer) — invalid.
      await expect(
        abilitiesService.use(
          owner.state.code,
          'attack-survivor',
          survivor.playerId, // survivor is the killer — wrong role
          survivor.sessionToken,
        ),
      ).rejects.toThrow('INVALID_ABILITY_TARGET')
    })

    it('dead survivor cannot use abilities', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Kill the owner (medic has 3 HP).
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      await expect(
        abilitiesService.use(
          owner.state.code,
          'field-dressing',
          undefined,
          owner.sessionToken,
        ),
      ).rejects.toThrow('PLAYER_NOT_ACTIVE')
    })

    it('permanent starting buff is listed with expiresAt null', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Stalker starts with the free-run permanent buff.
      const state = await gamesService.getState(
        owner.state.code,
        survivor.sessionToken,
      )
      const permanent = state.buffs.find((b) => b.buffId === 'free-run')

      expect(permanent).toBeDefined()
      expect(permanent!.expiresAt).toBeNull()
      expect(permanent!.sourcePlayerName).toBeNull()
    })

    it('ability duration override beats buff default duration', async () => {
      const { owner, survivor } = await setupRunningGame()

      // quick-stun inflicts stay-still with a 5s override (buff default 30s).
      await abilitiesService.use(
        owner.state.code,
        'quick-stun',
        owner.playerId,
        survivor.sessionToken,
      )

      const active = await prisma.activeBuff.findFirst({
        where: { targetPlayerId: owner.playerId, buffId: 'stay-still' },
      })
      expect(active).not.toBeNull()

      const remainingMs = active!.expiresAt!.getTime() - Date.now()
      expect(remainingMs).toBeGreaterThan(0)
      expect(remainingMs).toBeLessThanOrEqual(5000) // 5s, not 30s
    })

    it('combo ability inflicts all its buffs', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Damage the owner to 2 HP, then use the combo (HEAL + INFO) on self.
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      await abilitiesService.use(
        owner.state.code,
        'field-stay',
        undefined,
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
      expect(ownerPlayer.health).toBe(3) // HEAL buff applied

      // INFO buff was created as a timed row on the same target.
      const infoBuff = state.buffs.find((b) => b.buffId === 'stay-still')
      expect(infoBuff).toBeDefined()
      expect(infoBuff!.expiresAt).not.toBeNull()
    })

    it('limited ability count is consumed and rejected when exhausted', async () => {
      const { owner, survivor } = await setupRunningGame()

      // quick-stun is seeded with count: 1 for the stalker.
      let state = await gamesService.getState(
        owner.state.code,
        survivor.sessionToken,
      )
      expect(
        state.abilities.find((a) => a.abilityId === 'quick-stun')!
          .chargesRemaining,
      ).toBe(1)

      await abilitiesService.use(
        owner.state.code,
        'quick-stun',
        owner.playerId,
        survivor.sessionToken,
      )

      state = await gamesService.getState(
        owner.state.code,
        survivor.sessionToken,
      )
      expect(
        state.abilities.find((a) => a.abilityId === 'quick-stun')!
          .chargesRemaining,
      ).toBe(0)

      // quick-stun has no cooldown — the only blocker is the spent charge.
      await expect(
        abilitiesService.use(
          owner.state.code,
          'quick-stun',
          owner.playerId,
          survivor.sessionToken,
        ),
      ).rejects.toThrow('ABILITY_NO_CHARGES')
    })

    it('ability without count has unlimited uses', async () => {
      const { owner } = await setupRunningGame()

      // field-dressing has no count — used twice in a row (cooldown 0).
      await abilitiesService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      )
      await abilitiesService.use(
        owner.state.code,
        'field-dressing',
        undefined,
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const ability = state.abilities.find(
        (a) => a.abilityId === 'field-dressing',
      )!
      expect(ability.chargesRemaining).toBeNull()
    })

    it('passive ability is listed with its type but cannot be used', async () => {
      const { owner } = await setupRunningGame()

      // Medic owns the iron-skin passive trait alongside active abilities.
      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const passive = state.abilities.find((a) => a.abilityId === 'iron-skin')!
      expect(passive).toBeDefined()
      expect(passive.type).toBe('PASSIVE')
      expect(passive.allowedTargets).toEqual([])

      const active = state.abilities.find(
        (a) => a.abilityId === 'field-dressing',
      )!
      expect(active.type).toBe('ACTIVE')

      // Using a passive is rejected — nothing is applied to anyone.
      await expect(
        abilitiesService.use(
          owner.state.code,
          'iron-skin',
          undefined,
          owner.sessionToken,
        ),
      ).rejects.toThrow('ABILITY_IS_PASSIVE')

      await expect(
        abilitiesService.use(
          owner.state.code,
          'iron-skin',
          owner.playerId,
          owner.sessionToken,
        ),
      ).rejects.toThrow('ABILITY_IS_PASSIVE')

      const rows = await prisma.activeBuff.findMany({
        where: { targetPlayerId: owner.playerId },
      })
      expect(rows).toHaveLength(0)
    })

    it('manual self-application creates a permanent buff with a normalized id', async () => {
      const { owner } = await setupRunningGame()

      // Typed with spaces and mixed case — normalized to "free-run".
      await abilitiesService.applyBuffToSelf(
        owner.state.code,
        '  Free Run  ',
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const buff = state.buffs.find((b) => b.buffId === 'free-run')
      expect(buff).toBeDefined()
      expect(buff!.expiresAt).toBeNull() // non-timed
      expect(buff!.sourcePlayerName).not.toBeNull() // source = self

      // Re-applying refreshes instead of duplicating the row.
      await abilitiesService.applyBuffToSelf(
        owner.state.code,
        'free-run',
        owner.sessionToken,
      )
      const rows = await prisma.activeBuff.findMany({
        where: { targetPlayerId: owner.playerId, buffId: 'free-run' },
      })
      expect(rows.length).toBe(1)
    })

    it('manual application respects the buff default duration', async () => {
      const { owner } = await setupRunningGame()

      // stay-still has defaultDuration 30 — manual application is timed.
      await abilitiesService.applyBuffToSelf(
        owner.state.code,
        'stay-still',
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const buff = state.buffs.find((b) => b.buffId === 'stay-still')
      expect(buff).toBeDefined()
      expect(buff!.expiresAt).not.toBeNull()

      const remainingMs = new Date(buff!.expiresAt!).getTime() - Date.now()
      expect(remainingMs).toBeGreaterThan(0)
      expect(remainingMs).toBeLessThanOrEqual(30000) // 30s from defaultDuration
    })

    it('manual HEAL buff restores HP without creating a buff row', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Damage the owner to 2 HP, then self-apply the HEAL buff.
      await combatService.attack(
        owner.state.code,
        owner.playerId,
        survivor.sessionToken,
      )
      await abilitiesService.applyBuffToSelf(
        owner.state.code,
        'field-dressing',
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
      expect(ownerPlayer.health).toBe(3)
      expect(
        state.buffs.find((b) => b.buffId === 'field-dressing'),
      ).toBeUndefined()
    })

    it('manual HURT buff reduces own HP', async () => {
      const { owner } = await setupRunningGame()

      await abilitiesService.applyBuffToSelf(
        owner.state.code,
        'attack-survivor',
        owner.sessionToken,
      )

      const state = await gamesService.getState(
        owner.state.code,
        owner.sessionToken,
      )
      const ownerPlayer = state.players.find((p) => p.id === owner.playerId)!
      expect(ownerPlayer.health).toBe(2)
      expect(ownerPlayer.status).toBe(PlayerStatus.ALIVE)
    })

    it('unknown or empty manual buff id is rejected', async () => {
      const { owner } = await setupRunningGame()

      await expect(
        abilitiesService.applyBuffToSelf(
          owner.state.code,
          'no-such-buff',
          owner.sessionToken,
        ),
      ).rejects.toThrow('BUFF_NOT_FOUND')

      await expect(
        abilitiesService.applyBuffToSelf(
          owner.state.code,
          '   ',
          owner.sessionToken,
        ),
      ).rejects.toThrow('BUFF_ID_REQUIRED')
    })

    it('dead survivor cannot apply a buff manually', async () => {
      const { owner, survivor } = await setupRunningGame()

      // Kill the owner (medic has 3 HP).
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)
      await combatService.attack(owner.state.code, owner.playerId, survivor.sessionToken)

      await expect(
        abilitiesService.applyBuffToSelf(
          owner.state.code,
          'free-run',
          owner.sessionToken,
        ),
      ).rejects.toThrow('PLAYER_NOT_ACTIVE')
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
