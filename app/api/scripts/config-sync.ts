import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

type QuestConfig = {
  id: string
  name: string
  description: string
  type: string
  radius: number | null
  settings: Record<string, unknown>
  killerCharacterTypeId: string | null
}
type CharacterConfig = { id: string; role: 'SURVIVOR' | 'KILLER'; name: string; description: string; maxHealth: number; startingEffects?: unknown }
type EffectConfig = { id: string; name: string; description: string; action: string; quantity: number; duration: number | null; cooldown: number; allowedTargets: string[] }

const configPath = resolve(process.cwd(), '../../config')

async function main() {
  const questsJson = JSON.parse(await readFile(resolve(configPath, 'quests.json'), 'utf8')) as QuestConfig[]
  const survivorsJson = JSON.parse(await readFile(resolve(configPath, 'survivors.json'), 'utf8')) as CharacterConfig[]
  const killersJson = JSON.parse(await readFile(resolve(configPath, 'killers.json'), 'utf8')) as CharacterConfig[]
  const effectsJson = JSON.parse(await readFile(resolve(configPath, 'effects.json'), 'utf8')) as EffectConfig[]

  const charactersJson = survivorsJson.concat(killersJson)

  const prisma = new PrismaClient()
  try {

    await Promise.all(questsJson.map((quest) => prisma.questDefinition.upsert({
      where: { id: quest.id },
      create: { ...quest, settings: JSON.stringify(quest.settings) },
      update: { ...quest, settings: JSON.stringify(quest.settings) },
    })))
    await Promise.all(charactersJson.map(({ startingEffects: _startingEffects, ...character }) => prisma.characterType.upsert({
      where: { id: character.id },
      create: character,
      update: character
    })))

    await Promise.all(effectsJson.map((effect) => prisma.effectDefinition.upsert({
      where: { id: effect.id },
      create: { ...effect, allowedTargets: JSON.stringify(effect.allowedTargets) },
      update: { ...effect, allowedTargets: JSON.stringify(effect.allowedTargets) }
    }
    )))

    console.log(`Synced ${questsJson.length} quest definitions.`)
    console.log(`Synced ${survivorsJson.length} survivor definitions.`)
    console.log(`Synced ${killersJson.length} killer definitions.`)
    console.log(`Synced ${effectsJson.length} effect definitions.`)
    
  } finally {
    await prisma.$disconnect()
  }
}

void main()
