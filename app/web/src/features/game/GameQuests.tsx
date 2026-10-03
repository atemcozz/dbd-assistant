import { Check, ChevronDown, ChevronUp } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { GameQuest } from '@/gameStore'

// In-game quest list — shows completed count and expandable quest cards.
export function GameQuests({
  quests,
  isSurvivor,
  onComplete,
}: {
  quests: GameQuest[]
  isSurvivor: boolean
  onComplete: (questId: string) => void
}) {
  const completed = quests.filter((quest) => quest.status === 'COMPLETED').length
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Quests</CardTitle>
            <CardDescription>
              {completed} of {quests.length} completed
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {completed}/{quests.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {quests.map((quest) => (
          <GameQuestCard
            key={quest.id}
            quest={quest}
            isSurvivor={isSurvivor}
            onComplete={onComplete}
          />
        ))}
      </CardContent>
    </Card>
  )
}

// Single expandable quest card with marker number.
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
  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors',
        completed
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-md font-display font-bold',
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
        <Button
          aria-label="Expand quest"
          onClick={() => setExpanded((value) => !value)}
          size="icon"
          variant="ghost"
          title={expanded ? 'Collapse quest' : 'Expand quest'}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          <p className="text-sm leading-6 text-muted-foreground">
            {quest.definition.description}
          </p>
          {isSurvivor && !completed && (
            <Button onClick={() => onComplete(quest.id)} size="sm">
              <Check className="size-4" />
              Mark completed
            </Button>
          )}
          {completed && <Badge>Completed</Badge>}
        </div>
      )}
    </div>
  )
}
