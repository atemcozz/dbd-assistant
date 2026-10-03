import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { HealthDisplay } from '@/components/shared/HealthDisplay'
import type { LobbyPlayer } from '@/gameStore'

// Game status tab — shows the player's own role and HP.
export function GameStatusPanel({
  player,
  isKiller,
}: {
  player: LobbyPlayer
  isKiller: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Game status</CardTitle>
        <CardDescription>
          {isKiller
            ? 'Control the pressure and watch survivor status.'
            : 'Keep moving through the physical venue.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-md border border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Your role
          </p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {player.characterType?.name ?? player.role}
          </p>
          <div className="mt-3">
            <HealthDisplay
              health={player.health}
              maxHealth={player.characterType?.maxHealth ?? null}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
