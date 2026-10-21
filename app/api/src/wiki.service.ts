import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { PlayerRole, type ExitDefinition, type QuestDefinition } from '@prisma/client'
import { parse as parseYaml } from 'yaml'
import { CharactersService } from './characters.service'
import { PrismaService } from './prisma.service'

const CONFIG_DIR = join(__dirname, '..', '..', '..', 'config')
const DOCS_DIR = join(CONFIG_DIR, 'docs')

const WIKI_SECTION_TYPES = [
  'survivors',
  'killers',
  'exits',
  'markdown',
] as const

type WikiSectionType = (typeof WIKI_SECTION_TYPES)[number]

type WikiSectionConfig = {
  id: string
  title: string
  type: WikiSectionType
  file?: string
}

type WikiConfig = {
  sections: WikiSectionConfig[]
}

type WikiCharacter = Awaited<
  ReturnType<CharactersService['list']>
>[number] & {
  quests?: QuestDefinition[]
}

export type WikiSection =
  | {
      id: string
      title: string
      type: 'survivors'
      characters: WikiCharacter[]
    }
  | {
      id: string
      title: string
      type: 'killers'
      characters: WikiCharacter[]
      universalQuests: QuestDefinition[]
    }
  | {
      id: string
      title: string
      type: 'exits'
      exits: ExitDefinition[]
    }
  | {
      id: string
      title: string
      type: 'markdown'
      markdown: string
    }

function isWikiSectionType(value: unknown): value is WikiSectionType {
  return (
    typeof value === 'string' &&
    (WIKI_SECTION_TYPES as readonly string[]).includes(value)
  )
}

// Public wiki data. Generated sections reuse the same character data as
// the lobby cards; Markdown sections live in config/docs and are read on
// every request so editing a file only needs a browser refresh.
@Injectable()
export class WikiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charactersService: CharactersService,
  ) {}

  async getWiki() {
    const config = await this.readConfig()

    const [survivors, killers, quests, exits] = await Promise.all([
      this.charactersService.list(PlayerRole.SURVIVOR),
      this.charactersService.list(PlayerRole.KILLER),
      this.prisma.questDefinition.findMany({
        where: { type: { not: 'EXIT' } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.exitDefinition.findMany({
        orderBy: { id: 'asc' },
      }),
    ])

    // Killer-specific quests are grouped by killer type. Everything else
    // is universal and shown once after the killer cards.
    const killerQuests = new Map<string, typeof quests>()
    const universalQuests: typeof quests = []

    for (const quest of quests) {
      if (quest.killerCharacterTypeId === null) {
        universalQuests.push(quest)
        continue
      }

      const list = killerQuests.get(quest.killerCharacterTypeId) ?? []
      list.push(quest)
      killerQuests.set(quest.killerCharacterTypeId, list)
    }

    const sections: WikiSection[] = []

    for (const section of config.sections) {
      if (section.type === 'survivors') {
        sections.push({
          id: section.id,
          title: section.title,
          type: section.type,
          characters: survivors,
        })
        continue
      }

      if (section.type === 'killers') {
        sections.push({
          id: section.id,
          title: section.title,
          type: section.type,
          characters: killers.map((killer) => ({
            ...killer,
            quests: killerQuests.get(killer.id) ?? [],
          })),
          universalQuests,
        })
        continue
      }

      if (section.type === 'exits') {
        sections.push({
          id: section.id,
          title: section.title,
          type: section.type,
          exits,
        })
        continue
      }

      sections.push({
        id: section.id,
        title: section.title,
        type: section.type,
        markdown: await this.readMarkdown(section.file ?? ''),
      })
    }

    return { sections }
  }

  private async readConfig(): Promise<WikiConfig> {
    const path = join(CONFIG_DIR, 'wiki.yaml')

    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      throw new InternalServerErrorException(
        `Wiki config not found: ${path}`,
      )
    }

    let parsed: unknown
    try {
      parsed = parseYaml(raw)
    } catch (error) {
      throw new InternalServerErrorException(
        `Wiki config is invalid YAML: ${String(error)}`,
      )
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as WikiConfig).sections)
    ) {
      throw new InternalServerErrorException(
        'Wiki config must contain a sections list',
      )
    }

    const config = parsed as WikiConfig
    const ids = new Set<string>()

    for (const section of config.sections) {
      if (
        typeof section.id !== 'string' ||
        section.id.length === 0 ||
        typeof section.title !== 'string' ||
        section.title.length === 0
      ) {
        throw new InternalServerErrorException(
          'Wiki sections need a non-empty id and title',
        )
      }

      if (!isWikiSectionType(section.type)) {
        throw new InternalServerErrorException(
          `Unknown wiki section type: ${String(section.type)}`,
        )
      }

      if (ids.has(section.id)) {
        throw new InternalServerErrorException(
          `Duplicate wiki section id: ${section.id}`,
        )
      }
      ids.add(section.id)
    }

    return config
  }

  private async readMarkdown(file: string): Promise<string> {
    const resolved = resolve(CONFIG_DIR, file)
    const relativePath = relative(DOCS_DIR, resolved)

    if (
      file.length === 0 ||
      isAbsolute(relativePath) ||
      relativePath.startsWith('..') ||
      !resolved.endsWith('.md')
    ) {
      throw new InternalServerErrorException(
        `Wiki markdown must live under config/docs: ${file}`,
      )
    }

    try {
      return await readFile(resolved, 'utf8')
    } catch {
      throw new InternalServerErrorException(
        `Wiki markdown not found: ${file}`,
      )
    }
  }
}
