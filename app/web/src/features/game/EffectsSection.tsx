import { Clock3, Sparkles, User } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { LobbyPlayer, PlayerEffect } from '@/gameStore'

// Effects panel — shows the viewer's owned abilities and active effects
// applied to them (e.g. stun from the killer) with time remaining.
export function EffectsSection({
  effects,
  players,
  onUse,
}: {
  effects: PlayerEffect[]
  players: LobbyPlayer[]
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  // Split into owned abilities and incoming active effects.
  const ownedEffects = effects.filter((effect) => effect.owned)
  const activeEffects = effects.filter(
    (effect) => !effect.owned && effect.expiresAt !== null,
  )

  return (
    <div className="grid gap-4">
      {/* Active effects currently affecting this player. */}
      {activeEffects.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <Clock3 className="size-5" />
              Active effects
            </CardTitle>
            <CardDescription>
              These effects are currently active on you. Pay attention to the
              time remaining.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {activeEffects.map((effect) => (
              <ActiveEffectCard key={effect.id} effect={effect} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Owned abilities the player can use. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            Your abilities
          </CardTitle>
          <CardDescription>
            Short, deliberate abilities for the physical trial.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {ownedEffects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No effects assigned.
            </p>
          ) : (
            ownedEffects.map((effect) => (
              <EffectCard
                key={effect.id}
                effect={effect}
                players={players}
                onUse={onUse}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Card showing an active effect applied to the player with a live countdown.
function ActiveEffectCard({ effect }: { effect: PlayerEffect }) {
  const [now, setNow] = useState(() => Date.now())

  // Tick every second so the countdown stays accurate.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const expiresAtMs = effect.expiresAt ? new Date(effect.expiresAt).getTime() : 0
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000))

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-400">
              {effect.name}
            </p>
            {effect.sourcePlayerName && (
              <Badge variant="secondary" className="text-xs">
                <User className="mr-1 size-3" />
                {effect.sourcePlayerName}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {effect.description}
          </p>
          {effect.instruction && (
            <p className="mt-1 text-sm italic text-primary">
              {effect.instruction}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Remaining
          </p>
          <p
            className={cn(
              'font-display text-2xl font-bold tabular-nums',
              remainingSeconds <= 5 ? 'text-red-400' : 'text-amber-400',
            )}
          >
            {remainingSeconds}s
          </p>
        </div>
      </div>
    </div>
  )
}

// Individual owned-effect row with optional target selector.
function EffectCard({
  effect,
  players,
  onUse,
}: {
  effect: PlayerEffect
  players: LobbyPlayer[]
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  // Show target picker for effects that can target others.
  // SELF-only effects don't need a picker.
  const selfOnlyEffectIds = ['quick-step', 'calm-instruction', 'hidden-note', 'adrenaline-rush']
  const needsTargetPicker = !selfOnlyEffectIds.includes(effect.effectId)

  // Alive players the effect could target.
  const targetablePlayers = players.filter(
    (player) => player.status === 'ALIVE',
  )

  if (!needsTargetPicker || targetablePlayers.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{effect.name}</p>
          <p className="text-xs text-muted-foreground">
            {effect.description} · charges: {effect.charges ?? '∞'}
          </p>
          {effect.instruction && (
            <p className="mt-1 text-xs italic text-primary">
              {effect.instruction}
            </p>
          )}
          {/* Show active expiry on owned effects too (e.g. quick-step). */}
          {effect.expiresAt && (
            <ActiveBadge expiresAt={effect.expiresAt} />
          )}
        </div>
        <Button size="sm" onClick={() => onUse(effect.effectId)}>
          Use
        </Button>
      </div>
    )
  }

  return (
    <TargetEffectRow effect={effect} players={targetablePlayers} onUse={onUse} />
  )
}

// Badge showing time remaining for an active effect.
function ActiveBadge({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const expiresAtMs = new Date(expiresAt).getTime()
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000))

  if (remainingSeconds <= 0) return null

  return (
    <Badge variant="outline" className="mt-1 text-xs">
      <Clock3 className="mr-1 size-3" />
      Active · {remainingSeconds}s left
    </Badge>
  )
}

// Effect row that lets the player pick a target before using.
function TargetEffectRow({
  effect,
  players,
  onUse,
}: {
  effect: PlayerEffect
  players: LobbyPlayer[]
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState('')

  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{effect.name}</p>
        <p className="text-xs text-muted-foreground">
          {effect.description} · charges: {effect.charges ?? '∞'}
        </p>
        {effect.instruction && (
          <p className="mt-1 text-xs italic text-primary">
            {effect.instruction}
          </p>
        )}
      </div>
      <Select value={selectedTarget} onValueChange={setSelectedTarget}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Target" />
        </SelectTrigger>
        <SelectContent>
          {players.map((player) => (
            <SelectItem key={player.id} value={player.id}>
              {player.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!selectedTarget}
        onClick={() => onUse(effect.effectId, selectedTarget)}
      >
        Use
      </Button>
    </div>
  )
}
