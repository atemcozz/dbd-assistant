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
  killerCharacterTypeId: string | null
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

  const charactersJson = [...survivorsJson, ...killersJson]

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
            action: effect.action,
            quantity: effect.quantity,
            duration: effect.duration,
            cooldown: effect.cooldown,
            allowedTargets: JSON.stringify(effect.allowedTargets),
          },
          update: {
            name: effect.name,
            description: effect.description,
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
            killerCharacterTypeId: quest.killerCharacterTypeId,
          },
          update: {
            name: quest.name,
            description: quest.description,
            type: quest.type,
            radius: quest.radius,
            killerCharacterTypeId: quest.killerCharacterTypeId,
          },
        }),
      ),
    )

    console.log(`Synced ${questsJson.length} quest definitions.`)
    console.log(`Synced ${survivorsJson.length} survivor definitions.`)
    console.log(`Synced ${killersJson.length} killer definitions.`)
    console.log(`Synced ${effectsJson.length} effect definitions.`)
  } finally {
    await prisma.$disconnect()
  }
}

void main()