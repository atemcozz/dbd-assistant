import { Shield, Skull } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CharacterCover } from '@/components/shared/CharacterCover'
import { CharacterDetails } from '@/components/shared/CharacterDetails'
import type { QuestDefinition, WikiCharacter } from '@/gameStore'
import { cn } from '@/lib/utils'

// Wiki-only character card: cover + the same read-only kit rendered by
// lobby cards, plus a list of killer-specific quests on killer cards.
export function WikiCharacterCard({
  character,
}: {
  character: WikiCharacter
}) {
  const quests = character.quests ?? []
  const isKiller = character.role === 'KILLER'

  return (
    <Card className="relative overflow-hidden">
      <CharacterCover coverImage={character.coverImage} />
      <CardHeader className="relative flex-row items-start gap-3 space-y-0">
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full',
            isKiller
              ? 'bg-destructive/15 text-destructive'
              : 'bg-primary/15 text-primary',
          )}
        >
          {isKiller ? (
            <Skull className="size-5" />
          ) : (
            <Shield className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate">{character.name}</CardTitle>
          <CardDescription>
            {isKiller ? 'Ман' : 'Выживший'}
          </CardDescription>
        </div>
        {/* <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          {isKiller ? (
            <Badge variant="outline">Урон {character.damage}</Badge>
          ) : character.maxHealth !== null ? (
            <Badge variant="outline">HP {character.maxHealth}</Badge>
          ) : null}
        </div> */}
      </CardHeader>
      <CardContent className="relative grid gap-4">
        <CharacterDetails character={character} />
        <WikiQuestList quests={quests} title="Личные квесты" />
      </CardContent>
    </Card>
  )
}

export function WikiQuestList({
  quests,
  title,
}: {
  quests: QuestDefinition[]
  title: string
}) {
  if (quests.length === 0) return null

  return (
    <div className="grid gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="grid gap-2">
        {quests.map((quest) => (
          <li
            key={quest.id}
            className="rounded-md border border-border bg-background/50 p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{quest.name}</p>
              <Badge variant="outline" className="shrink-0 text-xs">
                {quest.cost} очк.
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {quest.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
