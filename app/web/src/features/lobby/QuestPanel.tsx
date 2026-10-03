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
// The owner's definition browser only lists killer-specific quests for
// types currently assigned to players (avoids selecting orphans).
// Selected quest lists are shown in full for everyone — orphaned killer
// quests are deleted on the server when a killer type is swapped.
export function QuestPanel({
  quests,
  definitions,
  killerLabels,
  assignedKillerTypes,
  isOwner,
  requiredQuestPoints,
  selectedQuestIds,
  onToggle,
  onMove,
}: {
  quests: GameQuest[]
  definitions: QuestDefinition[]
  killerLabels: Record<string, string | null | undefined>
  // Killer character type IDs that players are currently assigned to.
  // Killer-specific quests for unassigned types are hidden in the lobby.
  assignedKillerTypes: Set<string>
  isOwner: boolean
  // Total quest points needed to unlock the exits.
  requiredQuestPoints: number
  selectedQuestIds: string[]
  onToggle: (id: string) => void
  onMove: (id: string, direction: number) => void
}) {
  // Owner definition browser: only list killer-specific quests for types
  // currently assigned (so the owner can't select orphans). Selected quests
  // are shown in full — orphans are removed server-side on type swap.
  const killerDefinitions = definitions.filter(
    (definition) =>
      definition.killerCharacterTypeId &&
      assignedKillerTypes.has(definition.killerCharacterTypeId),
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

  // Sum of costs of all selected quests — the total points available in this game.
  const totalPoints = quests.reduce(
    (sum, quest) => sum + quest.definition.cost,
    0,
  )
  const hasEnoughPoints = totalPoints >= requiredQuestPoints

  return (
    <div className="grid gap-8">
      {/* Points summary — visible contrast so the owner notices at a glance. */}
      <div
        className={cn(
          'flex items-center justify-between rounded-md border-2 p-4',
          hasEnoughPoints
            ? 'border-success/60 bg-success/10'
            : 'border-warning/60 bg-warning/10',
        )}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
            Очки квестов
          </p>
          <p
            className={cn(
              'font-display text-2xl font-bold tabular-nums',
              hasEnoughPoints ? 'text-success' : 'text-warning',
            )}
          >
            {totalPoints}
            <span className="text-muted-foreground"> / {requiredQuestPoints}</span>
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-sm font-semibold',
            hasEnoughPoints
              ? 'border-success/60 text-success'
              : 'border-warning/60 text-warning',
          )}
        >
          {hasEnoughPoints
            ? 'Достаточно очков'
            : `Нужно еще хотя бы ${requiredQuestPoints - totalPoints} очков`}
        </Badge>
      </div>

      {/* Pinned quests — physical marker cards players will look for. */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
              Квесты
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              Выбранные квесты
            </h2>
          </div>
          <Badge variant="secondary">{quests.length} выбрано</Badge>
        </div>
        {quests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Квесты еще не выбраны
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <SelectedQuestGroup
              title="Квесты манов"
              quests={killerQuests}
              total={quests.length}
              killerLabels={killerLabels}
              isOwner={isOwner}
              onMove={onMove}
            />
            <SelectedQuestGroup
              title="Универсальные квесты"
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
            <CardTitle>Выбор квестов</CardTitle>
            <CardDescription>
              Выберите квесты, которые будут использоваться в игре. Игроки смогут завершить эти квесты, чтобы открыть выходы.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-7">
            <QuestDefinitionGroup
              title="Квесты манов"
              definitions={killerDefinitions}
              killerLabels={killerLabels}
              selectedQuestIds={selectedQuestIds}
              onToggle={onToggle}
            />
            <QuestDefinitionGroup
              title="Универсальные квесты"
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
      <div className="flex flex-col gap-4 sm:grid-cols-2">
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
          В этой категории нет квестов
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
            {/* <Badge variant="outline">{definition.type}</Badge> */}
            <Badge variant="default">{definition.cost} очков</Badge>
            {killerLabel && (
              <Badge variant="outline">Ман: {killerLabel}</Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          aria-label={
            selected ? `Убрать квест ${definition.name}` : `Добавить квест ${definition.name}`
          }
          onClick={() => onToggle(definition.id)}
          size="icon"
          variant={selected ? 'secondary' : 'outline'}
          title={selected ? 'Удалить квест' : 'Добавить квест'}
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
            expanded ? `Свернуть квест ${definition.name}` : `Развернуть квест ${definition.name}`
          }
          onClick={() => setExpanded((value) => !value)}
          size="icon"
          variant="ghost"
          title={expanded ? 'Свернуть' : 'Развернуть'}
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
            <Badge variant="outline">{definition.cost} очков</Badge>
            {killerLabel && (
              <Badge variant="outline">Ман: {killerLabel}</Badge>
            )}
            {/* {definition.radius !== null && (
              <Badge variant="outline">Радиус: {definition.radius}m</Badge>
            )} */}
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
      <div className="flex min-h-24 sm:min-h-32">
        {/* Big number panel — corresponds to a physical prop in the venue. */}
        <div className="grid w-16 shrink-0 place-items-center bg-primary px-2 text-center text-primary-foreground sm:w-24 sm:px-3">
          <span className="text-[10px] font-bold uppercase tracking-[.18em] sm:text-xs">
            Квест
          </span>
          <strong className="font-display text-3xl leading-none sm:text-5xl">
            {quest.number}
          </strong>
        </div>
        <CardContent className="grid min-w-0 flex-1 content-center gap-2 p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{quest.definition.cost} очков</Badge>
            {/* <Badge
              variant={
                quest.status === 'COMPLETED' ? 'secondary' : 'default'
              }
            >
              {quest.status}
            </Badge> */}
            {killerLabel && (
              <Badge variant="secondary">Ман: {killerLabel}</Badge>
            )}
            {isOwner && (
              <span className="ml-auto flex gap-1">
                <Button
                  type="button"
                  aria-label="Переместить квест выше"
                  disabled={quest.number === 1}
                  onClick={() => onMove(quest.definition.id, -1)}
                  size="icon"
                  variant="ghost"
                  title="Выше"
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  aria-label="Переместить квест ниже"
                  disabled={quest.number === total}
                  onClick={() => onMove(quest.definition.id, 1)}
                  size="icon"
                  variant="ghost"
                  title="Ниже"
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
