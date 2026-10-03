import { DoorOpen, Lock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { GameExit } from '@/gameStore'

// In-game exits tab — visible to all players.
// Only alive survivors see the escape button, and only when exits are unlocked.
// Escaping marks the player as escaped: killer can no longer touch them.
export function GameExits({
  exits,
  isSurvivor,
  isAlive,
  exitsUnlocked,
  onEscape,
}: {
  exits: GameExit[]
  isSurvivor: boolean
  isAlive: boolean
  // True when enough quest points have been gathered to open the exits.
  exitsUnlocked: boolean
  onEscape: (exitDefinitionId: string, exitName: string) => void
}) {
  if (exits.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Выходы не назначены
        </CardContent>
      </Card>
    )
  }

  const canEscape = isSurvivor && isAlive && exitsUnlocked

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Выходы</CardTitle>
            <CardDescription>
              {exitsUnlocked
                ? 'Выходы открыты — выжившие могут сбежать.'
                : 'Выходы пока закрыты до набора достаточного количества очков квестов.'}
            </CardDescription>
          </div>
          <Badge variant={exitsUnlocked ? 'default' : 'secondary'}>
            {exitsUnlocked ? 'Открыто' : 'Закрыто'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!exitsUnlocked && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            Завершите больше квестов, чтобы открыть выходы.
          </div>
        )}
        {exits.map((exit) => (
          <ExitCard
            key={exit.id}
            exit={exit}
            canEscape={canEscape}
            onEscape={onEscape}
          />
        ))}
      </CardContent>
    </Card>
  )
}

// Single exit card — name, description, and escape button for eligible survivors.
function ExitCard({
  exit,
  canEscape,
  onEscape,
}: {
  exit: GameExit
  canEscape: boolean
  onEscape: (exitDefinitionId: string, exitName: string) => void
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <DoorOpen className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">
              {exit.definition.name}
            </h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {exit.definition.description}
          </p>
          {canEscape && (
            <Button
              className="mt-3"
              onClick={() => onEscape(exit.definition.id, exit.definition.name)}
              size="sm"
            >
              <Sparkles className="size-4" />
              Сбежать
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
