import { Clock3, Info, Sparkles, User } from 'lucide-react'
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
  currentPlayerId,
  onUse,
}: {
  effects: PlayerEffect[]
  players: LobbyPlayer[]
  currentPlayerId: string
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  // Split into owned abilities and incoming active effects.
  const ownedEffects = effects.filter((effect) => effect.owned)
  // Passive effects are always-on character stats: no use button,
  // no charges, no cooldown — just name + description.
  const passiveEffects = ownedEffects.filter(
    (effect) => effect.action === 'PASSIVE',
  )
  const usableEffects = ownedEffects.filter(
    (effect) => effect.action !== 'PASSIVE',
  )
  // Only show active effects that haven't expired yet (remaining > 0).
  const activeEffects = effects.filter(
    (effect) =>
      !effect.owned &&
      effect.expiresAt !== null &&
      getRemainingSeconds(effect.expiresAt) > 0,
  )

  return (
    <div className="grid gap-4">
      {/* Active effects currently affecting this player. */}
      {activeEffects.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Clock3 className="size-5" />
              Активные эффекты
            </CardTitle>
            <CardDescription>
              Активные эффекты. Обратите внимание на оставшееся время.
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
            Твои абилки
          </CardTitle>
          <CardDescription>
            У абилок ограниченые заряды и время перезарядки. Некоторые требуют выбора цели.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {usableEffects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Абилки не назначены
            </p>
          ) : (
            usableEffects.map((effect) => (
              <EffectCard
                key={effect.id}
                effect={effect}
                players={players}
                currentPlayerId={currentPlayerId}
                onUse={onUse}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Passive character stats — always on, never activated. */}
      {passiveEffects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-5" />
              Пассивные
            </CardTitle>
            <CardDescription>
              Постоянные характеристики персонажа
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {passiveEffects.map((effect) => (
              <div
                key={effect.id}
                className="rounded-md border border-border p-3"
              >
                <p className="text-sm font-medium">{effect.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {effect.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Helper: seconds remaining until an ISO timestamp.
function getRemainingSeconds(expiresAt: string | Date): number {
  const expiresAtMs = new Date(expiresAt).getTime()
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
}

// Helper: seconds until cooldown ends, or 0 if not on cooldown.
function getCooldownRemaining(effect: PlayerEffect): number {
  if (!effect.lastUsedAt || effect.cooldown <= 0) return 0
  const cooldownEnds =
    new Date(effect.lastUsedAt).getTime() + effect.cooldown * 1000
  return Math.max(0, Math.ceil((cooldownEnds - Date.now()) / 1000))
}

// Card showing an active effect applied to the player with a live countdown.
// Uses targetDescription when available — what THIS player sees.
function ActiveEffectCard({ effect }: { effect: PlayerEffect }) {
  const [now, setNow] = useState(() => Date.now())

  // Tick every second so the countdown stays accurate.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const expiresAtMs = effect.expiresAt ? new Date(effect.expiresAt).getTime() : 0
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000))

  // Hide when countdown reaches 0 — effect has expired.
  if (remainingSeconds <= 0) return null

  // For incoming effects, show targetDescription — the target's perspective.
  const displayText =
    effect.targetDescription ?? effect.description

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-warning">
              {effect.name}
            </p>
            {effect.sourcePlayerName && (
              <Badge variant="secondary" className="text-xs">
                <User className="mr-1 size-3" />
                {effect.sourcePlayerName}
              </Badge>
            )}
          </div>
          {/* <p className="mt-1 text-sm text-muted-foreground">
            {effect.description}
          </p> */}
          {effect.instruction && (
            <p className="mt-1 text-sm italic text-primary">
              {displayText}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Осталось
          </p>
          <p
            className={cn(
              'font-display text-2xl font-bold tabular-nums',
              remainingSeconds <= 5 ? 'text-destructive' : 'text-warning',
            )}
          >
            {remainingSeconds}с.
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
  currentPlayerId,
  onUse,
}: {
  effect: PlayerEffect
  players: LobbyPlayer[]
  currentPlayerId: string
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  // Compute cooldown state.
  const cooldownRemaining = getCooldownRemaining(effect)
  const onCooldown = cooldownRemaining > 0

  // Disable Use when charges are exhausted OR on cooldown.
  const outOfCharges = effect.charges !== null && effect.charges <= 0
  const disabled = outOfCharges || onCooldown

  // Decide whether this effect needs a target picker.
  const selfOnly =
    effect.allowedTargets.length === 1 &&
    effect.allowedTargets[0] === 'SELF'
  const supportsAllSurvivors = effect.allowedTargets.includes('ALL_SURVIVORS')

  // Build the list of valid targets based on allowedTargets roles.
  // Filter alive players whose role matches an allowed target category.
  const validTargets = buildValidTargets(
    effect.allowedTargets,
    players,
    currentPlayerId,
  )

  const needsTargetPicker = !selfOnly && !supportsAllSurvivors && validTargets.length > 0

  if (selfOnly) {
    return (
      <EffectRowLayout effect={effect} cooldownRemaining={cooldownRemaining}>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onUse(effect.effectId)}
        >
          Использовать
        </Button>
      </EffectRowLayout>
    )
  }

  if (supportsAllSurvivors) {
    return (
      <AllSurvivorsEffectRow
        effect={effect}
        disabled={disabled}
        cooldownRemaining={cooldownRemaining}
        onUse={onUse}
      />
    )
  }

  if (!needsTargetPicker) {
    return (
      <EffectRowLayout effect={effect} cooldownRemaining={cooldownRemaining}>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onUse(effect.effectId)}
        >
          Использовать
        </Button>
      </EffectRowLayout>
    )
  }

  return (
    <TargetEffectRow
      effect={effect}
      validTargets={validTargets}
      disabled={disabled}
      cooldownRemaining={cooldownRemaining}
      onUse={onUse}
    />
  )
}

// Build the list of valid target options based on allowedTargets.
// Returns players with a displayLabel ("Yourself" for the current player when SELF is allowed).
function buildValidTargets(
  allowedTargets: string[],
  players: LobbyPlayer[],
  currentPlayerId: string,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = []
  const selfAllowed = allowedTargets.includes('SELF')
  const survivorAllowed = allowedTargets.includes('SURVIVOR')
  const killerAllowed = allowedTargets.includes('KILLER')

  for (const player of players) {
    if (player.status !== 'ALIVE') continue

    // Check if this player's role matches an allowed target category.
    const isSelf = player.id === currentPlayerId
    const matchesSurvivor = survivorAllowed && player.role === 'SURVIVOR'
    const matchesKiller = killerAllowed && player.role === 'KILLER'
    const matchesSelf = selfAllowed && isSelf

    if (!matchesSelf && !matchesSurvivor && !matchesKiller) continue

    // Label "Yourself" for the current player when SELF is allowed.
    const label = matchesSelf ? 'На себя' : player.name
    result.push({ id: player.id, label })
  }

  return result
}

// Shared layout for an owned-effect row.
function EffectRowLayout({
  effect,
  cooldownRemaining,
  children,
}: {
  effect: PlayerEffect
  cooldownRemaining: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{effect.name}</p>
        <p className="text-xs text-muted-foreground">
          {effect.description}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
          Осталось: {effect.charges ?? '∞'}
        </p>
        {cooldownRemaining > 0 && (
          <Badge variant="outline" className="mt-1 text-xs text-warning border-warning/40">
            <Clock3 className="mr-1 size-3" />
            К/д · {cooldownRemaining}с.
          </Badge>
        )}
        {effect.expiresAt && (
          <ActiveBadge expiresAt={effect.expiresAt} />
        )}
      </div>
      {children}
    </div>
  )
}

// Badge showing time remaining for an active effect on an owned ability.
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
      Активно · {remainingSeconds}с осталось
    </Badge>
  )
}

// Effect row for group effects (ALL_SURVIVORS).
function AllSurvivorsEffectRow({
  effect,
  disabled,
  cooldownRemaining,
  onUse,
}: {
  effect: PlayerEffect
  disabled: boolean
  cooldownRemaining: number
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{effect.name}</p>
        <p className="text-xs text-muted-foreground">
          {effect.description}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
          Осталось: {effect.charges ?? '∞'}
        </p>
        {cooldownRemaining > 0 && (
          <Badge variant="outline" className="mt-1 text-xs text-warning border-warning/40">
            <Clock3 className="mr-1 size-3" />
            К/д · {cooldownRemaining}с.
          </Badge>
        )}
      </div>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => onUse(effect.effectId)}
      >
        Использовать
      </Button>
    </div>
  )
}

// Effect row that lets the player pick a target before using.
// validTargets is pre-filtered by allowedTargets roles.
function TargetEffectRow({
  effect,
  validTargets,
  disabled,
  cooldownRemaining,
  onUse,
}: {
  effect: PlayerEffect
  validTargets: { id: string; label: string }[]
  disabled: boolean
  cooldownRemaining: number
  onUse: (effectId: string, targetPlayerId?: string) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{effect.name}</p>
        <p className="text-xs text-muted-foreground">
          {effect.description}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
          Осталось: {effect.charges ?? '∞'}
        </p>
        {cooldownRemaining > 0 && (
          <Badge variant="outline" className="mt-1 text-xs text-warning border-warning/40">
            <Clock3 className="mr-1 size-3" />
            К/д · {cooldownRemaining}с.
          </Badge>
        )}
      </div>
      <Select value={selectedTarget} onValueChange={setSelectedTarget}>
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Цель" />
        </SelectTrigger>
        <SelectContent>
          {validTargets.map((target) => (
            <SelectItem key={target.id} value={target.id}>
              {target.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!selectedTarget || disabled}
        onClick={() => onUse(effect.effectId, selectedTarget)}
      >
        Использовать
      </Button>
    </div>
  )
}
