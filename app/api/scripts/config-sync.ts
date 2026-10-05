import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

type CharacterConfig = {
  id: string
  role: 'SURVIVOR' | 'KILLER'
  name: string
  description: string
  maxHealth: number | null
  // count is the optional starting use count for this ability
  // (integer >= 1); absent = unlimited uses.
  abilities: { abilityId: string; count?: number | null }[]
  startingBuffs?: { buffId: string; duration: number | null }[]
}

type AbilityConfig = {
  id: string
  name: string
  description: string
  cooldown: number
  allowedTargets: string[]
  buffs: { buffId: string; duration: number | null }[]
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
])
const VALID_BUFF_ACTIONS = new Set(['HEAL', 'HURT', 'INFO'])

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
  const questsJson = JSON.parse(
    await readFile(resolve(configPath, 'quests.json'), 'utf8'),
  ) as QuestConfig[]

  const survivorsJson = JSON.parse(
    await readFile(resolve(configPath, 'survivors.json'), 'utf8'),
  ) as CharacterConfig[]

  const killersJson = JSON.parse(
    await readFile(resolve(configPath, 'killers.json'), 'utf8'),
  ) as CharacterConfig[]

  const abilitiesJson = JSON.parse(
    await readFile(resolve(configPath, 'abilities.json'), 'utf8'),
  ) as AbilityConfig[]

  const buffsJson = JSON.parse(
    await readFile(resolve(configPath, 'buffs.json'), 'utf8'),
  ) as BuffConfig[]

  const exitsJson = JSON.parse(
    await readFile(resolve(configPath, 'exits.json'), 'utf8'),
  ) as ExitConfig[]

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

    if (!Array.isArray(ability.buffs) || ability.buffs.length === 0) {
      throw new Error(`Ability ${ability.id} must inflict at least one buff`)
    }
    for (const link of ability.buffs) {
      if (!buffIds.has(link.buffId)) {
        throw new Error(
          `Ability ${ability.id} references unknown buff ${link.buffId}`,
        )
      }
      validateDuration(link.duration, `Ability ${ability.id}`)
    }
  }

  for (const character of charactersJson) {
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

      // Killers must never own killer-targeting abilities (stun-killer,
      // killer-breath) — otherwise one killer could stun another killer.
      if (
        character.role === 'KILLER' &&
        ability.allowedTargets.includes('KILLER')
      ) {
        throw new Error(
          `Killer ${character.id} references killer-targeting ability ${item.abilityId}`,
        )
      }

      // Group abilities (ALL_SURVIVORS) are killer-only by server rule —
      // linking one to a survivor would just make it unusable.
      if (
        character.role === 'SURVIVOR' &&
        ability.allowedTargets.includes('ALL_SURVIVORS')
      ) {
        throw new Error(
          `Survivor ${character.id} references killer-only group ability ${item.abilityId}`,
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
          create: {
            id: ability.id,
            name: ability.name,
            description: ability.description,
            cooldown: ability.cooldown,
            allowedTargets: JSON.stringify(ability.allowedTargets),
          },
          update: {
            name: ability.name,
            description: ability.description,
            cooldown: ability.cooldown,
            allowedTargets: JSON.stringify(ability.allowedTargets),
          },
        }),
      ),
    )

    // Replace each ability's buff links so the DB matches the JSON exactly.
    for (const ability of abilitiesJson) {
      await prisma.$transaction(async (tx) => {
        await tx.abilityBuff.deleteMany({
          where: { abilityId: ability.id },
        })

        await tx.abilityBuff.createMany({
          data: ability.buffs.map((link) => ({
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
          },
          update: {
            role: character.role,
            name: character.name,
            description: character.description,
            maxHealth: character.maxHealth,
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
