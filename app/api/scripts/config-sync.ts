import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { PrismaClient } from '@prisma/client'

type CharacterConfig = {
  id: string
  role: 'SURVIVOR' | 'KILLER'
  name: string
  description: string
  maxHealth: number | null
  // Basic-attack damage. Optional, killers only, default 1.
  // 999 is the overkill value that always knocks out in one hit.
  damage?: number
  // Cover art path relative to config/images/ (e.g. killers/king.jpg).
  // Null/absent = no cover. Served by the API under /static/images/.
  coverImage?: string | null
  // count is the optional starting use count for this ability
  // (integer >= 1); absent = unlimited uses.
  abilities: { abilityId: string; count?: number | null }[]
  startingBuffs?: { buffId: string; duration: number | null }[]
}

type AbilityConfig = {
  id: string
  name: string
  description: string
  // ACTIVE = usable action; PASSIVE = display-only trait (name + description).
  type: 'ACTIVE' | 'PASSIVE'
  cooldown?: number
  allowedTargets?: string[]
  buffs?: { buffId: string; duration: number | null }[]
  // Quest-block length in seconds — only for QUEST-target abilities.
  blockDurationSeconds?: number
}

type BuffConfig = {
  id: string
  name: string
  description: string
  action: string
  params?: Record<string, unknown>
  defaultDuration: number | null
}

type QuestConfig = {
  id: string
  name: string
  description: string
  type: string
  radius: number | null
  cost: number
  killerCharacterTypeId: string | null
}

type ExitConfig = {
  id: string
  name: string
  description: string
}

const configPath = resolve(process.cwd(), '../../config')

const VALID_TARGETS = new Set([
  'SELF',
  'SURVIVOR',
  'KILLER',
  'ALL_SURVIVORS',
  'QUEST',
])
const VALID_BUFF_ACTIONS = new Set(['HEAL', 'HURT', 'INFO'])
const VALID_ABILITY_TYPES = new Set(['ACTIVE', 'PASSIVE'])

// Duration override rule: explicit number, or null to inherit
// (buff.defaultDuration — itself null for permanent buffs).
function validateDuration(
  duration: number | null,
  context: string,
): void {
  if (duration !== null && (!Number.isInteger(duration) || duration < 1)) {
    throw new Error(`${context} has invalid duration: ${duration}`)
  }
}

async function main() {
  // Game content lives in YAML under config/ — validated here, then
  // upserted into SQLite (the runtime source of truth).
  // Print resolved locations first: sync writes exactly one DB file, and
  // a stale server or a second environment (e.g. docker's /data/game.db)
  // silently reading another file is the classic "sync did nothing" bug.
  console.log(`Config: ${configPath}`)

  const readConfig = async <T>(name: string): Promise<T> =>
    parseYaml(await readFile(resolve(configPath, `${name}.yaml`), 'utf8')) as T

  const questsJson = await readConfig<QuestConfig[]>('quests')

  const survivorsJson = await readConfig<CharacterConfig[]>('survivors')

  const killersJson = await readConfig<CharacterConfig[]>('killers')

  const abilitiesJson = await readConfig<AbilityConfig[]>('abilities')

  const buffsJson = await readConfig<BuffConfig[]>('buffs')

  const exitsJson = await readConfig<ExitConfig[]>('exits')

  const charactersJson = [...survivorsJson, ...killersJson]

  // Fail fast on config mistakes — silent defaults hide broken game content.
  const abilityIds = new Set(abilitiesJson.map((a) => a.id))
  const buffIds = new Set(buffsJson.map((b) => b.id))
  const characterIds = new Set(charactersJson.map((c) => c.id))

  for (const buff of buffsJson) {
    if (!buff.id || !buff.name || !buff.description || !buff.action) {
      throw new Error(`Buff missing required fields: ${JSON.stringify(buff)}`)
    }
    if (!VALID_BUFF_ACTIONS.has(buff.action)) {
      throw new Error(`Buff ${buff.id} has unknown action ${buff.action}`)
    }
    validateDuration(buff.defaultDuration, `Buff ${buff.id}`)

    const params = buff.params ?? {}

    // HEAL/HURT strength lives in the free-form params JSON and is
    // interpreted by server code per action.
    if (buff.action === 'HEAL' || buff.action === 'HURT') {
      const quantity = (params as { quantity?: unknown }).quantity
      if (typeof quantity !== 'number' || quantity <= 0) {
        throw new Error(
          `Buff ${buff.id} (${buff.action}) needs params.quantity > 0`,
        )
      }
    }
  }

  for (const ability of abilitiesJson) {
    if (!ability.id || !ability.name || !ability.description) {
      throw new Error(
        `Ability missing required fields: ${JSON.stringify(ability)}`,
      )
    }
    if (!VALID_ABILITY_TYPES.has(ability.type)) {
      throw new Error(
        `Ability ${ability.id} has unknown type ${ability.type}`,
      )
    }

    // Passive abilities are display-only traits — name + description.
    // They carry no cooldown, targets, or buffs and can never be used.
    if (ability.type === 'PASSIVE') {
      if (
        ability.cooldown !== undefined ||
        ability.allowedTargets !== undefined ||
        ability.buffs !== undefined
      ) {
        throw new Error(
          `Passive ability ${ability.id} must only define name and description`,
        )
      }
      continue
    }

    if (
      typeof ability.cooldown !== 'number' ||
      ability.cooldown < 0
    ) {
      throw new Error(`Ability ${ability.id} has invalid cooldown`)
    }
    if (
      !Array.isArray(ability.allowedTargets) ||
      ability.allowedTargets.length === 0
    ) {
      throw new Error(`Ability ${ability.id} has invalid allowedTargets`)
    }
    for (const target of ability.allowedTargets) {
      if (!VALID_TARGETS.has(target)) {
        throw new Error(
          `Ability ${ability.id} has unknown target type ${target}`,
        )
      }
    }

    // Quest-blocking abilities lock a chosen quest instead of inflicting
    // buffs — a block is game-quest state, not a buff on a player.
    if (ability.allowedTargets.includes('QUEST')) {
      if (ability.buffs !== undefined) {
        throw new Error(
          `Quest-blocking ability ${ability.id} must not inflict buffs`,
        )
      }
      if (
        typeof ability.blockDurationSeconds !== 'number' ||
        !Number.isInteger(ability.blockDurationSeconds) ||
        ability.blockDurationSeconds < 1
      ) {
        throw new Error(
          `Quest-blocking ability ${ability.id} needs blockDurationSeconds >= 1`,
        )
      }
      continue
    }

    if (ability.blockDurationSeconds !== undefined) {
      throw new Error(
        `Ability ${ability.id} defines blockDurationSeconds without a QUEST target`,
      )
    }

    if ((!Array.isArray(ability.buffs) || ability.buffs.length === 0) && ability.type === 'ACTIVE') {
      throw new Error(`Ability ${ability.id} must inflict at least one buff`)
    }
    if (ability.buffs) {
      for (const link of ability.buffs) {
        if (!buffIds.has(link.buffId)) {
          throw new Error(
            `Ability ${ability.id} references unknown buff ${link.buffId}`,
          )
        }
        validateDuration(link.duration, `Ability ${ability.id}`)
      }
    }
  }

  for (const character of charactersJson) {
    if (character.damage !== undefined) {
      if (character.role !== 'KILLER') {
        throw new Error(
          `Character ${character.id} defines damage but is not a killer`,
        )
      }

      if (!Number.isInteger(character.damage) || character.damage < 1) {
        throw new Error(
          `Character ${character.id} has invalid damage: ${character.damage}`,
        )
      }
    }

    // Cover art must stay inside config/images/ and point at a real file.
    if (
      character.coverImage !== undefined &&
      character.coverImage !== null
    ) {
      const imagesDir = resolve(configPath, 'images')
      const resolved = resolve(imagesDir, character.coverImage)

      if (
        character.coverImage.length === 0 ||
        !resolved.startsWith(imagesDir + sep) ||
        !existsSync(resolved)
      ) {
        throw new Error(
          `Character ${character.id} references unknown cover image ${character.coverImage}`,
        )
      }

      const sizeBytes = statSync(resolved).size

      if (sizeBytes > 500 * 1024) {
        console.warn(
          `Cover ${character.coverImage} is ${Math.round(sizeBytes / 1024)} KB — phones on LAN load it on every view, keep covers small (JPEG/WebP, ~800 px).`,
        )
      }
    }

    for (const item of character.abilities) {
      if (!abilityIds.has(item.abilityId)) {
        throw new Error(
          `Character ${character.id} references unknown ability ${item.abilityId}`,
        )
      }

      if (
        item.count !== undefined &&
        item.count !== null &&
        (!Number.isInteger(item.count) || item.count < 1)
      ) {
        throw new Error(
          `Character ${character.id} ability ${item.abilityId} has invalid count: ${item.count}`,
        )
      }

      const ability = abilitiesJson.find((a) => a.id === item.abilityId)!

      // Passive abilities are always-on traits — a use count is meaningless.
      if (
        ability.type === 'PASSIVE' &&
        item.count !== undefined &&
        item.count !== null
      ) {
        throw new Error(
          `Character ${character.id} passive ability ${item.abilityId} must not define count`,
        )
      }

      // Killers must never own killer-targeting abilities (stun-killer,
      // killer-breath) — otherwise one killer could stun another killer.
      if (
        ability.type === 'ACTIVE' &&
        character.role === 'KILLER' &&
        ability.allowedTargets!.includes('KILLER')
      ) {
        throw new Error(
          `Killer ${character.id} references killer-targeting ability ${item.abilityId}`,
        )
      }

      // Group abilities (ALL_SURVIVORS) are killer-only by server rule —
      // linking one to a survivor would just make it unusable.
      if (
        ability.type === 'ACTIVE' &&
        character.role === 'SURVIVOR' &&
        ability.allowedTargets!.includes('ALL_SURVIVORS')
      ) {
        throw new Error(
          `Survivor ${character.id} references killer-only group ability ${item.abilityId}`,
        )
      }

      // Quest-blocking abilities are killer-only by server rule.
      if (
        ability.type === 'ACTIVE' &&
        character.role === 'SURVIVOR' &&
        ability.allowedTargets!.includes('QUEST')
      ) {
        throw new Error(
          `Survivor ${character.id} references killer-only quest-blocking ability ${item.abilityId}`,
        )
      }
    }

    for (const item of character.startingBuffs ?? []) {
      if (!buffIds.has(item.buffId)) {
        throw new Error(
          `Character ${character.id} references unknown starting buff ${item.buffId}`,
        )
      }
      validateDuration(item.duration, `Character ${character.id} starting buff`)
    }
  }

  for (const quest of questsJson) {
    if (typeof quest.cost !== 'number' || quest.cost < 0) {
      throw new Error(
        `Quest ${quest.id} must define a non-negative numeric cost`,
      )
    }
    if (quest.killerCharacterTypeId && !characterIds.has(quest.killerCharacterTypeId)) {
      throw new Error(
        `Quest ${quest.id} references unknown killer ${quest.killerCharacterTypeId}`,
      )
    }
  }

  const prisma = new PrismaClient()

  // The actual SQLite file, resolved the same way the app resolves it —
  // not the raw URL string, which may be relative.
  const dbList = (await prisma.$queryRaw`
    SELECT file FROM pragma_database_list WHERE name = 'main'
  `) as { file: string }[]
  console.log(`Database: ${dbList[0]?.file ?? '(unknown)'}`)

  try {
    await Promise.all(
      buffsJson.map((buff) =>
        prisma.buffDefinition.upsert({
          where: { id: buff.id },
          create: {
            id: buff.id,
            name: buff.name,
            description: buff.description,
            action: buff.action,
            params: JSON.stringify(buff.params ?? {}),
            defaultDuration: buff.defaultDuration,
          },
          update: {
            name: buff.name,
            description: buff.description,
            action: buff.action,
            params: JSON.stringify(buff.params ?? {}),
            defaultDuration: buff.defaultDuration,
          },
        }),
      ),
    )

    await Promise.all(
      abilitiesJson.map((ability) =>
        prisma.abilityDefinition.upsert({
          where: { id: ability.id },
          // Passive abilities carry no cooldown, targets, or buff links —
          // store neutral values so readers never have to branch on nulls.
          // Quest-blocking abilities carry a block duration instead of buffs.
          create: {
            id: ability.id,
            name: ability.name,
            description: ability.description,
            type: ability.type,
            cooldown: ability.type === 'ACTIVE' ? ability.cooldown! : 0,
            allowedTargets: JSON.stringify(
              ability.type === 'ACTIVE' ? ability.allowedTargets! : [],
            ),
            blockDurationSeconds: ability.blockDurationSeconds ?? null,
          },
          update: {
            name: ability.name,
            description: ability.description,
            type: ability.type,
            cooldown: ability.type === 'ACTIVE' ? ability.cooldown! : 0,
            allowedTargets: JSON.stringify(
              ability.type === 'ACTIVE' ? ability.allowedTargets! : [],
            ),
            blockDurationSeconds: ability.blockDurationSeconds ?? null,
          },
        }),
      ),
    )

    // Replace each ability's buff links so the DB matches the YAML exactly.
    // Passive and quest-blocking abilities inflict no buffs — their links
    // are just cleared.
    for (const ability of abilitiesJson) {
      await prisma.$transaction(async (tx) => {
        await tx.abilityBuff.deleteMany({
          where: { abilityId: ability.id },
        })

        if (
          ability.type !== 'ACTIVE' ||
          ability.allowedTargets!.includes('QUEST')
        ) {
          return
        }

        await tx.abilityBuff.createMany({
          data: ability.buffs!.map((link) => ({
            abilityId: ability.id,
            buffId: link.buffId,
            duration: link.duration,
          })),
        })
      })
    }

    for (const character of charactersJson) {
      await prisma.$transaction(async (tx) => {
        await tx.characterType.upsert({
          where: {
            id: character.id,
          },
          create: {
            id: character.id,
            role: character.role,
            name: character.name,
            description: character.description,
            maxHealth: character.maxHealth,
            damage: character.damage ?? 1,
            coverImage: character.coverImage ?? null,
          },
          update: {
            role: character.role,
            name: character.name,
            description: character.description,
            maxHealth: character.maxHealth,
            damage: character.damage ?? 1,
            coverImage: character.coverImage ?? null,
          },
        })

        await tx.characterAbility.deleteMany({
          where: { characterTypeId: character.id },
        })

        if (character.abilities.length > 0) {
          await tx.characterAbility.createMany({
            data: character.abilities.map((item) => ({
              characterTypeId: character.id,
              abilityId: item.abilityId,
              count: item.count ?? null,
            })),
          })
        }

        await tx.characterStartBuff.deleteMany({
          where: { characterTypeId: character.id },
        })

        const startingBuffs = character.startingBuffs ?? []

        if (startingBuffs.length > 0) {
          await tx.characterStartBuff.createMany({
            data: startingBuffs.map((item) => ({
              characterTypeId: character.id,
              buffId: item.buffId,
              duration: item.duration,
            })),
          })
        }
      })
    }
    await Promise.all(
      questsJson.map((quest) =>
        prisma.questDefinition.upsert({
          where: {
            id: quest.id,
          },
          create: {
            id: quest.id,
            name: quest.name,
            description: quest.description,
            type: quest.type,
            radius: quest.radius,
            cost: quest.cost,
            killerCharacterTypeId: quest.killerCharacterTypeId,
          },
          update: {
            name: quest.name,
            description: quest.description,
            type: quest.type,
            radius: quest.radius,
            cost: quest.cost,
            killerCharacterTypeId: quest.killerCharacterTypeId,
          },
        }),
      ),
    )

    await Promise.all(
      exitsJson.map((exit) =>
        prisma.exitDefinition.upsert({
          where: {
            id: exit.id,
          },
          create: {
            id: exit.id,
            name: exit.name,
            description: exit.description,
          },
          update: {
            name: exit.name,
            description: exit.description,
          },
        }),
      ),
    )

    console.log(`Synced ${questsJson.length} quest definitions.`)
    console.log(`Synced ${exitsJson.length} exit definitions.`)
    console.log(`Synced ${survivorsJson.length} survivor definitions.`)
    console.log(`Synced ${killersJson.length} killer definitions.`)
    console.log(`Synced ${abilitiesJson.length} ability definitions.`)
    console.log(`Synced ${buffsJson.length} buff definitions.`)
  } finally {
    await prisma.$disconnect()
  }
}

void main()
