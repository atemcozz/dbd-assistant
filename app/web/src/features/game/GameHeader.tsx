import { Clock3, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HealthDisplay } from '@/components/shared/HealthDisplay'
import type { LobbyPlayer, LobbyState } from '@/gameStore'
import { formatTime } from '@/lib/format'

// Sticky game header — shows game name, connection status, HP, timer, leave.
export function GameHeader({
  state,
  player,
  remainingSeconds,
  connectionStatus,
  onLeave,
}: {
  state: LobbyState
  player: LobbyPlayer
  remainingSeconds: number
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected'
  onLeave: () => void
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-16 lg:px-16">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm sm:text-lg font-semibold text-foreground">
            {state.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {player.role === 'KILLER' ? 'Ман' : 'Выживший'} ·{' '}
            {connectionStatus === 'connected'
              ? 'Онлайн'
              : 'Соединение потеряно, переподключение...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1"
            aria-label={`Здоровье: ${player.health} из ${player.characterType?.maxHealth ?? '?'}`}
          >
            <HealthDisplay
              health={player.health}
              maxHealth={player.characterType?.maxHealth ?? null}
              compact
            />
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold tabular-nums">
            <Clock3 className="size-4 text-primary" />
            {/* Timer text: live countdown, or "time is out" once the clock hits zero. */}
            {remainingSeconds <= 0 ? 'Время вышло' : formatTime(remainingSeconds)}
          </div>
          <Button
            aria-label="Покинуть игру"
            onClick={onLeave}
            size="icon"
            variant="ghost"
            title="Покинуть игру"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
