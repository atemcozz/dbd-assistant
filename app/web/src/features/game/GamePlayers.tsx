import { DoorOpen, Shield, Skull, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { HealthDisplay } from '@/components/shared/HealthDisplay'
import type { LobbyPlayer } from '@/gameStore'

// Player list during the game — killer sees attack buttons on alive survivors.
// Escaped players are shown with a door icon — killer can no longer touch them.
export function GamePlayers({
  players,
  isKiller,
  onDamage,
}: {
  players: LobbyPlayer[]
  isKiller: boolean
  onDamage: (playerId: string, playerName: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Игроки</CardTitle>
        <CardDescription>
          {isKiller ? 'Выберите выжившего для атаки.' : 'Статус команды.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex items-center gap-3 rounded-md border border-border p-3"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              {player.status === 'ESCAPED' ? (
                <DoorOpen className="size-4 text-success" />
              ) : player.role === 'KILLER' ? (
                <Skull className="size-4" />
              ) : (
                <Shield className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{player.name}</p>
              <p className="text-xs text-muted-foreground">
                {player.characterType?.name ?? 'Не назначен'} ·{' '}
                {player.status}

              </p>
            </div>
            <HealthDisplay
              health={player.health}
              maxHealth={player.characterType?.maxHealth ?? null}
            />
            {isKiller && player.status === 'ALIVE' && (
              <Button
                onClick={() => onDamage(player.id, player.name)}
                size="sm"
                variant="destructive"
              >
                <Swords className="size-4" />
                Атаковать
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
