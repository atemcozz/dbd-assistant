import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PlayerRole } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CombatService } from '../src/combat.service'
import { AbilitiesService } from '../src/abilities.service'
import { QuestsService } from '../src/quests.service'
import { ExitsService } from '../src/exits.service'
import { CharactersService } from '../src/characters.service'

// Integration tests share one SQLite file, so every spec file gets a
// fresh module registry but the same database. That is why each file has
// its own beforeAll/beforeEach/afterAll calling the functions below, the
// suite runs with --runInBand (serial), and the db file is deleted once
// in global-teardown.js instead of per file.

// Set DATABASE_URL before importing AppModule so Prisma connects to the test DB.
process.env.DATABASE_URL = 'file:./test-game.db'

export type TestContext = {
  app: INestApplication
  prisma: PrismaService
  gamesService: GamesService
  combatService: CombatService
  abilitiesService: AbilitiesService
  questsService: QuestsService
  exitsService: ExitsService
  charactersService: CharactersService
}

export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  await app.init()

  return {
    app,
    prisma: app.get(PrismaService),
    gamesService: app.get(GamesService),
    combatService: app.get(CombatService),
    abilitiesService: app.get(AbilitiesService),
    questsService: app.get(QuestsService),
    exitsService: app.get(ExitsService),
    charactersService: app.get(CharactersService),
  }
}

export async function clearRuntimeData(prisma: PrismaService) {
  // Clean runtime state between tests but keep config data.
  await prisma.activeBuff.deleteMany()
  await prisma.playerAbility.deleteMany()
  await prisma.chatMessage.deleteMany()
  await prisma.gameQuest.deleteMany()
  await prisma.gameExit.deleteMany()
  await prisma.player.deleteMany()
  await prisma.game.deleteMany()
}

export async function closeTestContext(ctx: TestContext) {
  await ctx.app.close()
}

// Seed minimal config data needed for tests.
export async function seedTestData(prisma: PrismaService) {
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

  // Second survivor type — join/roll tests need two types to observe
  // the no-repeat rule deterministically, regardless of file order.
  await prisma.characterType.upsert({
    where: { id: 'scout-test' },
    update: {},
    create: {
      id: 'scout-test',
      role: PlayerRole.SURVIVOR,
      name: 'Scout',
      description: 'Test scout.',
      maxHealth: 3,
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

  // Timed invincibility buff — blocks killer attacks while active.
  await prisma.buffDefinition.upsert({
    where: { id: 'shield' },
    update: {},
    create: {
      id: 'shield',
      name: 'Shield',
      description: 'You are invincible for 30 seconds.',
      action: 'INFO',
      defaultDuration: 30,
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

  // Quest-blocking ability — killer locks a chosen quest number.
  await prisma.abilityDefinition.upsert({
    where: { id: 'seal-quest' },
    update: {},
    create: {
      id: 'seal-quest',
      name: 'Seal Quest',
      description: 'Block a quest for 60 seconds.',
      type: 'ACTIVE',
      cooldown: 0,
      allowedTargets: JSON.stringify(['QUEST']),
      blockDurationSeconds: 60,
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
  // Link stalker → seal-quest block ability (unlimited uses).
  await prisma.characterAbility.upsert({
    where: {
      characterTypeId_abilityId: {
        characterTypeId: 'stalker',
        abilityId: 'seal-quest',
      },
    },
    update: {},
    create: { characterTypeId: 'stalker', abilityId: 'seal-quest' },
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
