import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  KeyRound,
  MapPin,
  Plus,
  Puzzle,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { GameQuest, QuestDefinition } from '@/gameStore'

// Lobby quest panel — shows pinned quests (marker cards) and, for the owner,
// the full definition list to add/remove/reorder.
export function QuestPanel({
  quests,
  definitions,
  killerLabels,
  isOwner,
  selectedQuestIds,
  onToggle,
  onMove,
}: {
  quests: GameQuest[]
  definitions: QuestDefinition[]
  killerLabels: Record<string, string | null | undefined>
  isOwner: boolean
  selectedQuestIds: string[]
  onToggle: (id: string) => void
  onMove: (id: string, direction: number) => void
}) {
  // Split definitions and quests into killer-specific vs universal groups.
  const killerDefinitions = definitions.filter(
    (definition) => definition.killerCharacterTypeId,
  )
  const universalDefinitions = definitions.filter(
    (definition) => !definition.killerCharacterTypeId,
  )
  const killerQuests = quests.filter(
    (quest) => quest.definition.killerCharacterTypeId,
  )
  const universalQuests = quests.filter(
    (quest) => !quest.definition.killerCharacterTypeId,
  )

  return (
    <div className="grid gap-8">
      {/* Pinned quests — physical marker cards players will look for. */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
              Pinned quests
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              Physical markers
            </h2>
          </div>
          <Badge variant="secondary">{quests.length} selected</Badge>
        </div>
        {quests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No quests selected yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <SelectedQuestGroup
              title="Killer-specific quests"
              quests={killerQuests}
              total={quests.length}
              killerLabels={killerLabels}
              isOwner={isOwner}
              onMove={onMove}
            />
            <SelectedQuestGroup
              title="Universal quests"
              quests={universalQuests}
              total={quests.length}
              killerLabels={killerLabels}
              isOwner={isOwner}
              onMove={onMove}
            />
          </div>
        )}
      </section>

      {/* Owner-only: browse and toggle quest definitions. */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Quest selection</CardTitle>
            <CardDescription>
              Choose objectives before the game starts. Adding or removing a
              quest pins it immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-7">
            <QuestDefinitionGroup
              title="Killer-specific quests"
              definitions={killerDefinitions}
              killerLabels={killerLabels}
              selectedQuestIds={selectedQuestIds}
              onToggle={onToggle}
            />
            <QuestDefinitionGroup
              title="Universal quests"
              definitions={universalDefinitions}
              killerLabels={killerLabels}
              selectedQuestIds={selectedQuestIds}
              onToggle={onToggle}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Group of selected quest marker cards.
function SelectedQuestGroup({
  title,
  quests,
  total,
  killerLabels,
  isOwner,
  onMove,
}: {
  title: string
  quests: GameQuest[]
  total: number
  killerLabels: Record<string, string | null | undefined>
  isOwner: boolean
  onMove: (id: string, direction: number) => void
}) {
  if (quests.length === 0) return null
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Separator className="flex-1" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {quests.map((quest) => (
          <QuestCard
            key={quest.id}
            quest={quest}
            total={total}
            killerLabels={killerLabels}
            isOwner={isOwner}
            onMove={onMove}
          />
        ))}
      </div>
    </section>
  )
}

// Group of quest definition cards for owner selection.
function QuestDefinitionGroup({
  title,
  definitions,
  killerLabels,
  selectedQuestIds,
  onToggle,
}: {
  title: string
  definitions: QuestDefinition[]
  killerLabels: Record<string, string | null | undefined>
  selectedQuestIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Separator className="flex-1" />
      </div>
      {definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No quests in this category.
        </p>
      ) : (
        <div className="grid gap-3">
          {definitions.map((definition) => (
            <QuestDefinitionCard
              key={definition.id}
              definition={definition}
              killerLabel={
                definition.killerCharacterTypeId
                  ? (killerLabels[definition.killerCharacterTypeId] ??
                    definition.killerCharacterTypeId)
                  : undefined
              }
              selected={selectedQuestIds.includes(definition.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// Expandable quest definition card with add/remove toggle.
function QuestDefinitionCard({
  definition,
  killerLabel,
  selected,
  onToggle,
}: {
  definition: QuestDefinition
  killerLabel?: string
  selected: boolean
  onToggle: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = questIcon(definition.type)
  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        selected && 'border-primary/60 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{definition.name}</p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{definition.type}</Badge>
            {killerLabel && (
              <Badge variant="secondary">Killer: {killerLabel}</Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          aria-label={
            selected ? `Remove ${definition.name}` : `Add ${definition.name}`
          }
          onClick={() => onToggle(definition.id)}
          size="icon"
          variant={selected ? 'secondary' : 'outline'}
          title={selected ? 'Remove quest' : 'Add quest'}
        >
          {selected ? (
            <span className="text-xs font-bold">✓</span>
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          aria-label={
            expanded ? `Collapse ${definition.name}` : `Expand ${definition.name}`
          }
          onClick={() => setExpanded((value) => !value)}
          size="icon"
          variant="ghost"
          title={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>
      {expanded && (
        <CardContent className="border-t border-border bg-muted/30 pt-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {definition.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {killerLabel && (
              <Badge variant="secondary">Killer: {killerLabel}</Badge>
            )}
            {definition.radius !== null && (
              <Badge variant="outline">Radius: {definition.radius}m</Badge>
            )}
            <Badge variant="outline">ID: {definition.id}</Badge>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// Big physical marker card — shows the number players will find in the building.
function QuestCard({
  quest,
  total,
  killerLabels,
  isOwner,
  onMove,
}: {
  quest: GameQuest
  total: number
  killerLabels: Record<string, string | null | undefined>
  isOwner: boolean
  onMove: (id: string, direction: number) => void
}) {
  const killerLabel = quest.definition.killerCharacterTypeId
    ? (killerLabels[quest.definition.killerCharacterTypeId] ??
      quest.definition.killerCharacterTypeId)
    : undefined

  return (
    <Card className="overflow-hidden border-primary/40 bg-card shadow-md shadow-primary/5">
      <div className="flex min-h-32">
        {/* Big number panel — corresponds to a physical prop in the venue. */}
        <div className="grid w-24 shrink-0 place-items-center bg-primary px-3 text-center text-primary-foreground">
          <span className="text-xs font-bold uppercase tracking-[.18em]">
            Marker
          </span>
          <strong className="font-display text-5xl leading-none">
            {quest.number}
          </strong>
        </div>
        <CardContent className="grid min-w-0 flex-1 content-center gap-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Quest {quest.number}</Badge>
            <Badge
              variant={
                quest.status === 'COMPLETED' ? 'secondary' : 'default'
              }
            >
              {quest.status}
            </Badge>
            {killerLabel && (
              <Badge variant="secondary">Killer: {killerLabel}</Badge>
            )}
            {isOwner && (
              <span className="ml-auto flex gap-1">
                <Button
                  type="button"
                  aria-label="Move quest up"
                  disabled={quest.number === 1}
                  onClick={() => onMove(quest.definition.id, -1)}
                  size="icon"
                  variant="ghost"
                  title="Move up"
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  aria-label="Move quest down"
                  disabled={quest.number === total}
                  onClick={() => onMove(quest.definition.id, 1)}
                  size="icon"
                  variant="ghost"
                  title="Move down"
                >
                  <ArrowDown className="size-3" />
                </Button>
              </span>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold">
            {quest.definition.name}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {quest.definition.description}
          </p>
        </CardContent>
      </div>
    </Card>
  )
}

// Pick an icon based on quest type string.
function questIcon(type: string) {
  if (type.includes('EXPLORATION')) return MapPin
  if (type.includes('PUZZLE')) return Puzzle
  if (type.includes('KEY')) return KeyRound
  return ClipboardList
}

// Re-export Check so screens can use it without extra imports if needed.
export { Check }
