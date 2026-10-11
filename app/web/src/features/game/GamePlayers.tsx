import { DoorOpen, Shield, Skull, Swords } from 'lucide-react'
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
  // Tick while any shield is counting down so an expired shield drops its
  // badge (and restores the attack button) without a state refresh.
  const [now, setNow] = useState(() => Date.now())
  const needsTick = players.some(
    (player) => player.isInvincible && player.invincibleUntil !== null,
  )

  useEffect(() => {
    if (!needsTick) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [needsTick])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Игроки</CardTitle>
        <CardDescription>
          {isKiller ? 'Выберите выжившего для атаки.' : 'Статус команды.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {players.map((player) => {
          const shielded = isShielded(player, now)
          return (
          <div
            key={player.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary sm:size-9">
              {player.status === 'ESCAPED' ? (
                <DoorOpen className="size-4 text-success" />
              ) : player.role === 'KILLER' ? (
                <Skull className="size-4" />
              ) : (
                <Shield className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1 basis-32">
              <p className="truncate text-sm font-medium">{player.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {player.characterType?.name ?? 'Не назначен'} ·{' '}
                {player.status}

              </p>
            </div>
            {shielded && player.status === 'ALIVE' && (
              <Badge
                variant="outline"
                className="shrink-0 border-primary/40 text-xs text-primary"
              >
                <Shield className="mr-1 size-3" />
                Неуязвим
              </Badge>
            )}
            <HealthDisplay
              health={player.health}
              maxHealth={player.characterType?.maxHealth ?? null}
            />
            {isKiller && player.status === 'ALIVE' && !shielded && (
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
          )
        })}
      </CardContent>
    </Card>
  )
}

// Live shield state: the server snapshot (isInvincible) combined with the
// exposed expiry, so an expired shield disappears without a state fetch.
// A null expiry means a permanent shield — it never lapses.
function isShielded(player: LobbyPlayer, now: number): boolean {
  if (!player.isInvincible) return false
  if (player.invincibleUntil === null) return true
  return new Date(player.invincibleUntil).getTime() > now
}
