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

function isQuestConfig(value: unknown): value is QuestConfig {
  if (!value || typeof value !== 'object') return false
  const quest = value as Record<string, unknown>
  return typeof quest.id === 'string'
    && typeof quest.name === 'string'
    && typeof quest.description === 'string'
    && typeof quest.type === 'string'
    && (quest.radius === null || typeof quest.radius === 'number')
    && typeof quest.settings === 'object'
    && quest.settings !== null
    && (quest.killerCharacterTypeId === null || typeof quest.killerCharacterTypeId === 'string')
}

const configPath = resolve(process.cwd(), '../../config/quests.json')
async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8')) as unknown
  if (!Array.isArray(config) || !config.every(isQuestConfig)) {
    throw new Error(`Invalid quest configuration: ${configPath}`)
  }

  const prisma = new PrismaClient()
  try {
    await Promise.all(config.map((quest) => prisma.questDefinition.upsert({
      where: { id: quest.id },
      create: { ...quest, settings: JSON.stringify(quest.settings) },
      update: { ...quest, settings: JSON.stringify(quest.settings) },
    })))
    console.log(`Synced ${config.length} quest definitions.`)
  } finally {
    await prisma.$disconnect()
  }
}

void main()
