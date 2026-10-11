import { Check, ChevronDown, ChevronUp, Lock, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import type { GameQuest } from '@/gameStore'

// In-game quest list — shows point progress and expandable quest cards.
// When exits are unlocked, available quests are hidden and a completion
// message is shown instead.
export function GameQuests({
  quests,
  isSurvivor,
  requiredQuestPoints,
  completedQuestPoints,
  exitsUnlocked,
  onComplete,
}: {
  quests: GameQuest[]
  isSurvivor: boolean
  // Total quest points needed to unlock the exits.
  requiredQuestPoints: number
  // Sum of costs of completed quests so far.
  completedQuestPoints: number
  // True when enough points have been gathered to open the exits.
  exitsUnlocked: boolean
  onComplete: (questId: string) => void
}) {
  const completedCount = quests.filter(
    (quest) => quest.status === 'COMPLETED',
  ).length

  // Progress toward the exit requirement — e.g. "400/500 points".
  const pointsProgress = `${Math.min(completedQuestPoints, requiredQuestPoints)}/${requiredQuestPoints}`

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Квесты</CardTitle>
            <CardDescription>
              {completedCount} завершено
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-nowrap">
            {pointsProgress} очков
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* When exits are unlocked, show a completion message instead of remaining quests. */}
        {exitsUnlocked ? (
          <div className="rounded-md border border-primary/60 bg-primary/10 p-6 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-display text-lg font-semibold text-primary">
              Квесты завершены!
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Достаточно очков собрано. Выходы открыты — выжившие могут сбежать.
            </p>
          </div>
        ) : (
          quests.map((quest) => (
            <GameQuestCard
              key={quest.id}
              quest={quest}
              isSurvivor={isSurvivor}
              onComplete={onComplete}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

// Single expandable quest card with marker number and point cost.
function GameQuestCard({
  quest,
  isSurvivor,
  onComplete,
}: {
  quest: GameQuest
  isSurvivor: boolean
  onComplete: (questId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const completed = quest.status === 'COMPLETED'
  // Killer block countdown — ticks every second while a block is set so
  // the badge and the button state stay accurate without a broadcast.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (quest.blockedUntil === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [quest.blockedUntil])

  const blockedRemaining =
    quest.blockedUntil === null
      ? 0
      : Math.max(
          0,
          Math.ceil((new Date(quest.blockedUntil).getTime() - now) / 1000),
        )
  const blocked = blockedRemaining > 0

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors',
        completed
          ? 'border-primary/60 bg-primary/10'
          : blocked
            ? 'border-warning/40 bg-card'
            : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-md font-display font-bold sm:size-9',
            completed
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-primary',
          )}
        >
          {completed ? <Check className="size-4" /> : quest.number}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {quest.definition.name}
        </p>
        {blocked && (
          <Badge
            variant="outline"
            className="shrink-0 border-warning/40 text-xs text-warning"
          >
            <Lock className="mr-1 size-3" />
            {blockedRemaining}с.
          </Badge>
        )}
        <Badge variant="secondary" className="shrink-0 text-xs hidden sm:flex">
          {quest.definition.cost} очков
        </Badge>
        <Button
          aria-label="Развернуть квест"
          onClick={() => setExpanded((value) => !value)}
          size="icon"
          variant="ghost"
          title={expanded ? 'Свернуть квест' : 'Раскрыть квест'}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
           <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {quest.definition.name}
        </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {quest.definition.description}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {quest.definition.cost} очков
            </Badge>
          </div>
          {isSurvivor && !completed && !blocked && (
            <Button onClick={() => onComplete(quest.id)} size="sm">
              <Check className="size-4" />
              Завершить квест
            </Button>
          )}
          {isSurvivor && !completed && blocked && (
            <div className="grid gap-2">
              <Button disabled size="sm">
                <Lock className="size-4" />
                Заблокирован · {blockedRemaining}с.
              </Button>
              <p className="text-xs text-muted-foreground">
                Маньяк заблокировал этот квест. Дождись окончания блокировки.
              </p>
            </div>
          )}
          {completed && <Badge>Завершено</Badge>}
        </div>
      )}
    </div>
  )
}
