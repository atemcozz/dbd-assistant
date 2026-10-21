import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'

describe('Wiki', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestContext()
    await seedTestData(ctx.prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(ctx.prisma)
  })

  it('returns generated survivor, killer, and exit sections', async () => {
    const wiki = await ctx.wikiService.getWiki()

    const survivors = wiki.sections.find(
      (section) => section.type === 'survivors',
    )
    expect(survivors?.characters.map((character) => character.id)).toEqual(
      expect.arrayContaining(['medic', 'scout-test']),
    )

    const killers = wiki.sections.find(
      (section) => section.type === 'killers',
    )
    expect(killers?.characters.map((character) => character.id)).toEqual(
      expect.arrayContaining(['stalker', 'hunter', 'king']),
    )

    const exits = wiki.sections.find((section) => section.type === 'exits')
    expect(exits?.exits.map((exit) => exit.id)).toEqual(
      expect.arrayContaining(['main-gate', 'side-door']),
    )
  })

  it('groups killer-specific quests and separates universal quests', async () => {
    const wiki = await ctx.wikiService.getWiki()
    const killers = wiki.sections.find(
      (section) => section.type === 'killers',
    )!

    const stalker = killers.characters.find(
      (character) => character.id === 'stalker',
    )!
    expect(stalker.quests?.map((quest) => quest.id)).toEqual([
      'stalker-quest',
    ])

    const hunter = killers.characters.find(
      (character) => character.id === 'hunter',
    )!
    expect(hunter.quests?.map((quest) => quest.id)).toEqual(['hunter-quest'])

    expect(
      killers.universalQuests.map((quest) => quest.id),
    ).toEqual(expect.arrayContaining(['universal-quest', 'expensive-quest']))
  })

  it('includes character kits and loads markdown sections', async () => {
    const wiki = await ctx.wikiService.getWiki()
    const survivors = wiki.sections.find(
      (section) => section.type === 'survivors',
    )!
    const medic = survivors.characters.find(
      (character) => character.id === 'medic',
    )!

    expect(medic.abilities?.map((ability) => ability.abilityId)).toEqual(
      expect.arrayContaining(['field-dressing', 'field-stay', 'iron-skin']),
    )

    const markdownSections = wiki.sections.filter(
      (section) => section.type === 'markdown',
    )
    expect(markdownSections.length).toBeGreaterThan(0)
    for (const section of markdownSections) {
      expect(section.markdown.trim().length).toBeGreaterThan(0)
    }
  })
})
