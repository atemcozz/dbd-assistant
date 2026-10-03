import { DoorOpen, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ExitDefinition, GameExit } from '@/gameStore'

// Lobby exit panel — mirrors the quest panel pattern.
// Shows selected exits for everyone who can see the tab;
// the owner can add/remove exits from the definition list.
// At least one exit is required to start the game.
export function ExitPanel({
  exits,
  definitions,
  isOwner,
  selectedExitIds,
  onToggle,
}: {
  exits: GameExit[]
  definitions: ExitDefinition[]
  isOwner: boolean
  selectedExitIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="grid gap-8">
      {/* Selected exits — physical escape routes players will use in-game. */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
              Выбранные выходы
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              Точки отхода
            </h2>
          </div>
          <Badge variant="secondary">{exits.length} выбрано</Badge>
        </div>
        {exits.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Выходы не выбраны — владелец должен выбрать хотя бы один, чтобы начать игру.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4 sm:grid-cols-2">
            {exits.map((exit) => (
              <ExitCard key={exit.id} exit={exit} />
            ))}
          </div>
        )}
      </section>

      {/* Owner-only: browse and toggle exit definitions. */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Выбор выходов</CardTitle>
            <CardDescription>
              Выберите точки выхода, которые будут использоваться в игре.
              Игроки смогут сбежать через эти выходы после набора достаточного количества очков квестов.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {definitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет выходов
              </p>
            ) : (
              definitions.map((definition) => (
                <ExitDefinitionCard
                  key={definition.id}
                  definition={definition}
                  selected={selectedExitIds.includes(definition.id)}
                  onToggle={onToggle}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Card for a selected exit — name + description.
function ExitCard({ exit }: { exit: GameExit }) {
  return (
    <Card className="overflow-hidden border-primary/40 bg-card shadow-md shadow-primary/5">
      <div className="flex items-start gap-4 p-5">
        <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
          <DoorOpen className="size-6" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold">
            {exit.definition.name}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {exit.definition.description}
          </p>
        </div>
      </div>
    </Card>
  )
}

// Expandable definition card with add/remove toggle — same pattern as quests.
function ExitDefinitionCard({
  definition,
  selected,
  onToggle,
}: {
  definition: ExitDefinition
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        selected && 'border-primary/60 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-primary">
          <DoorOpen className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{definition.name}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {definition.description}
          </p>
        </div>
        <Button
          type="button"
          aria-label={
            selected ? `Убрать выход ${definition.name}` : `Добавить выход ${definition.name}`
          }
          onClick={() => onToggle(definition.id)}
          size="icon"
          variant={selected ? 'secondary' : 'outline'}
          title={selected ? 'Убрать выход' : 'Добавить выход'}
        >
          {selected ? (
            <span className="text-xs font-bold">✓</span>
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
      </div>
    </Card>
  )
}
