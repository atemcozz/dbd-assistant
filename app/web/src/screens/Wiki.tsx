import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Markdown } from '@/components/shared/Markdown'
import {
  WikiCharacterCard,
  WikiQuestList,
} from '@/features/wiki/WikiCharacterCard'
import { loadWiki, type Wiki, type WikiSection } from '@/gameStore'

// Public reference screen. Reachable at ?wiki without joining a game.
export function Wiki() {
  const [wiki, setWiki] = useState<Wiki | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('')

  const load = useCallback(async () => {
    setWiki(null)
    setError(null)

    try {
      const result = await loadWiki()
      setWiki(result)
      setActiveSection(result.sections[0]?.id ?? '')
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить вики',
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10 lg:px-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Справочник
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Вики
            </h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="?">
              <ArrowLeft className="size-4" />
              На главную
            </a>
          </Button>
        </header>

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Вики недоступна</CardTitle>
            </CardHeader>
            <CardContent className="grid justify-start gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" onClick={() => void load()}>
                Повторить
              </Button>
            </CardContent>
          </Card>
        ) : wiki === null ? (
          <Card>
            <CardContent className="pt-4 sm:pt-6">
              <p className="text-sm text-muted-foreground">Загрузка вики...</p>
            </CardContent>
          </Card>
        ) : wiki.sections.length === 0 ? (
          <EmptyWiki />
        ) : (
          <Tabs
            value={activeSection}
            onValueChange={setActiveSection}
            className="grid gap-4"
          >
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList className="flex h-auto w-max min-w-full justify-start">
                {wiki.sections.map((section) => (
                  <TabsTrigger key={section.id} value={section.id}>
                    {section.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {wiki.sections.map((section) => (
              <TabsContent key={section.id} value={section.id}>
                <WikiSectionContent section={section} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </main>
  )
}

function WikiSectionContent({ section }: { section: WikiSection }) {
  if (section.type === 'survivors') {
    if (section.characters.length === 0) return <EmptyWiki />

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {section.characters.map((character) => (
          <WikiCharacterCard key={character.id} character={character} />
        ))}
      </div>
    )
  }

  if (section.type === 'killers') {
    return (
      <div className="grid gap-4">
        {section.characters.length === 0 ? (
          <EmptyWiki />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {section.characters.map((character) => (
              <WikiCharacterCard key={character.id} character={character} />
            ))}
          </div>
        )}

        {section.universalQuests.length > 0 && (
          <Card>
            <CardContent className="pt-4 sm:pt-6">
              <WikiQuestList
                quests={section.universalQuests}
                title="Общие квесты"
              />
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  if (section.type === 'exits') {
    if (section.exits.length === 0) return <EmptyWiki />

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {section.exits.map((exit) => (
          <Card key={exit.id}>
            <CardHeader>
              <CardTitle>{exit.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {exit.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <Markdown>{section.markdown}</Markdown>
      </CardContent>
    </Card>
  )
}

function EmptyWiki() {
  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <p className="text-sm text-muted-foreground">Пока здесь ничего нет.</p>
      </CardContent>
    </Card>
  )
}
