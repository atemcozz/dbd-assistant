import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

type CharacterConfig = {
  id: string
  role: 'SURVIVOR' | 'KILLER'
  name: string
  description: string
  maxHealth: number | null
  effects: {
    effectId: string
    charges: number | null
  }[]
}

type EffectConfig = {
  id: string
  name: string
  description: string
  targetDescription?: string | null
  action: string
  quantity: number
  duration: number | null
  cooldown: number
  allowedTargets: string[]
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

  const effectsJson = JSON.parse(
    await readFile(resolve(configPath, 'effects.json'), 'utf8'),
  ) as EffectConfig[]

  const exitsJson = JSON.parse(
    await readFile(resolve(configPath, 'exits.json'), 'utf8'),
  ) as ExitConfig[]

  const charactersJson = [...survivorsJson, ...killersJson]

  // Fail fast on config mistakes — silent defaults hide broken game content.
  const effectIds = new Set(effectsJson.map((e) => e.id))
  const characterIds = new Set(charactersJson.map((c) => c.id))

  for (const effect of effectsJson) {
    if (!effect.id || !effect.name || !effect.action) {
      throw new Error(`Effect missing required fields: ${JSON.stringify(effect)}`)
    }
    if (!Array.isArray(effect.allowedTargets) || effect.allowedTargets.length === 0) {
      throw new Error(`Effect ${effect.id} has invalid allowedTargets`)
    }
  }

  for (const character of charactersJson) {
    for (const item of character.effects) {
      if (!effectIds.has(item.effectId)) {
        throw new Error(
          `Character ${character.id} references unknown effect ${item.effectId}`,
        )
      }

      const effect = effectsJson.find((e) => e.id === item.effectId)!

      // Killers must never own killer-targeting effects (stun-killer,
      // killer-breath) — otherwise one killer could stun another killer.
      if (
        character.role === 'KILLER' &&
        effect.allowedTargets.includes('KILLER')
      ) {
        throw new Error(
          `Killer ${character.id} references killer-targeting effect ${item.effectId}`,
        )
      }

      // Group effects (ALL_SURVIVORS) are killer-only by server rule —
      // linking one to a survivor would just make it unusable.
      if (
        character.role === 'SURVIVOR' &&
        effect.allowedTargets.includes('ALL_SURVIVORS')
      ) {
        throw new Error(
          `Survivor ${character.id} references killer-only group effect ${item.effectId}`,
        )
      }
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
      effectsJson.map((effect) =>
        prisma.effectDefinition.upsert({
          where: {
            id: effect.id,
          },
          create: {
            id: effect.id,
            name: effect.name,
            description: effect.description,
            targetDescription: effect.targetDescription ?? null,
            action: effect.action,
            quantity: effect.quantity,
            duration: effect.duration,
            cooldown: effect.cooldown,
            allowedTargets: JSON.stringify(effect.allowedTargets),
          },
          update: {
            name: effect.name,
            description: effect.description,
            targetDescription: effect.targetDescription ?? null,
            action: effect.action,
            quantity: effect.quantity,
            duration: effect.duration,
            cooldown: effect.cooldown,
            allowedTargets: JSON.stringify(effect.allowedTargets),
          },
        }),
      ),
    )

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

        await tx.characterEffect.deleteMany({
          where: {
            characterTypeId: character.id,
          },
        })

        if (character.effects.length > 0) {
          await tx.characterEffect.createMany({
            data: character.effects.map((effect) => ({
              characterTypeId: character.id,
              effectId: effect.effectId,
              charges: effect.charges,
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
    console.log(`Synced ${effectsJson.length} effect definitions.`)
  } finally {
    await prisma.$disconnect()
  }
}

void main()