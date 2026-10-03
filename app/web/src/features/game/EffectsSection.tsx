import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LobbyPlayer, PlayerEffect } from '@/gameStore'

// Effects panel — lists the viewer's effects with charges.
// If an effect can target other players, shows a target picker before Use.
export function EffectsSection({
  effects,
  players,
  onUse,
}: {
  effects: PlayerEffect[]
  players: LobbyPlayer[]
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5" />
          Effects
        </CardTitle>
        <CardDescription>
          Short, deliberate abilities for the physical trial.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {effects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No effects assigned.</p>
        ) : (
          effects.map((effect) => (
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
  )
}

// Individual effect row with optional target selector.
function EffectCard({
  effect,
  players,
  onUse,
}: {
  effect: PlayerEffect
  players: LobbyPlayer[]
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  // Heuristic: if the effect description mentions targeting someone other
  // than self, show a picker. Effects with SELF-only targets skip this.
  const needsTargetPicker =
    effect.effectId !== 'calm-instruction' &&
    effect.effectId !== 'quick-step'

  // Alive survivors the effect could target (excluding self for picker simplicity).
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
            <p className="mt-1 text-xs italic text-primary">{effect.instruction}</p>
          )}
        </div>
        <Button size="sm" onClick={() => onUse(effect.effectId)}>
          Use
        </Button>
      </div>
    )
  }

  return <TargetEffectRow effect={effect} players={targetablePlayers} onUse={onUse} />
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
          <p className="mt-1 text-xs italic text-primary">{effect.instruction}</p>
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
