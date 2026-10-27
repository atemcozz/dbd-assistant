import { Clock3, Info, Search, Sparkles, User, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { loadBuffDefinitions } from '@/gameStore'
import type {
  BuffDefinition,
  GameQuest,
  LobbyPlayer,
  PlayerAbility,
  PlayerBuff,
} from '@/gameStore'

// Effects tab panel — shows the viewer's active abilities (usable, with
// cooldown), passive abilities (display-only traits), active buffs with time
// remaining, and permanent buffs.
export function EffectsSection({
  abilities,
  buffs,
  players,
  quests,
  currentPlayerId,
  onUse,
  onApplyBuff,
}: {
  abilities: PlayerAbility[]
  buffs: PlayerBuff[]
  players: LobbyPlayer[]
  quests: GameQuest[]
  currentPlayerId: string
  onUse: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => void
  // Resolves true when the server applied the effect.
  onApplyBuff: (buffId: string) => Promise<boolean>
}) {
  // Effect search for instructed self-application. An empty query shows no
  // results on purpose — the player only searches when instructed in play.
  const [buffQuery, setBuffQuery] = useState('')
  const [buffDefinitions, setBuffDefinitions] = useState<BuffDefinition[]>([])
  const [buffLoadError, setBuffLoadError] = useState<string | null>(null)
  const [applyingBuffId, setApplyingBuffId] = useState<string | null>(null)
  // Active abilities — usable actions with cooldowns and targets.
  const activeAbilities = abilities.filter(
    (ability) => ability.type === 'ACTIVE',
  )
  // Passive abilities — display-only character traits, never usable.
  const passiveAbilities = abilities.filter(
    (ability) => ability.type === 'PASSIVE',
  )
  // Timed buffs currently affecting the player (with live countdowns).
  const timedBuffs = buffs.filter(
    (buff) =>
      buff.expiresAt !== null &&
      getRemainingSeconds(buff.expiresAt) > 0,
  )
  // Permanent buffs — always-on character stats (e.g. free-run).
  const permanentBuffs = buffs.filter((buff) => buff.expiresAt === null)

  // Load the searchable effect list when the effects panel opens. Buffs are
  // static config data, so one fetch per mount is enough.
  useEffect(() => {
    let cancelled = false
    void loadBuffDefinitions()
      .then((definitions) => {
        if (!cancelled) setBuffDefinitions(definitions)
      })
      .catch(() => {
        if (!cancelled) {
          setBuffLoadError('Не удалось загрузить список эффектов')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Empty/whitespace query yields no results by design.
  const normalizedQuery = normalizeSearch(buffQuery)
  const matchingBuffs =
    normalizedQuery === ''
      ? []
      : buffDefinitions.filter(
          (buff) =>
            normalizeSearch(buff.id).includes(normalizedQuery) ||
            normalizeSearch(buff.name).includes(normalizedQuery),
        )

  async function applyEffect(buffId: string) {
    setApplyingBuffId(buffId)
    try {
      // Clear the search once the server confirms the effect was applied.
      const applied = await onApplyBuff(buffId)
      if (applied) setBuffQuery('')
    } finally {
      setApplyingBuffId(null)
    }
  }

  return (
    <div className="grid gap-4">
      {/* Timed buffs currently affecting this player. */}
      {timedBuffs.length > 0 && (
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
            {timedBuffs.map((buff) => (
              <ActiveBuffCard key={buff.id} buff={buff} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active abilities the player can use. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            Твои абилки
          </CardTitle>
          <CardDescription>
            У абилок время перезарядки. Некоторые требуют выбора цели.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {activeAbilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Абилки не назначены
            </p>
          ) : (
            activeAbilities.map((ability) => (
              <AbilityCard
                key={ability.id}
                ability={ability}
                players={players}
                quests={quests}
                currentPlayerId={currentPlayerId}
                onUse={onUse}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Passive abilities — character traits, name + description only. */}
      {passiveAbilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5" />
              Пассивные способности
            </CardTitle>
            <CardDescription>
              Постоянные особенности персонажа. Их нельзя использовать —
              они действуют сами.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {passiveAbilities.map((ability) => (
              <div
                key={ability.id}
                className="rounded-md border border-border p-3"
              >
                <p className="text-sm font-medium">{ability.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ability.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Effect search for instructed self-application. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-5" />
            Поиск эффектов
          </CardTitle>
          <CardDescription>
            Используйте этот раздел только когда вас инструктируют в ходе
            игры. Начни вводить название или id эффекта.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <Input
              value={buffQuery}
              onChange={(event) => setBuffQuery(event.target.value)}
              placeholder="Название или id эффекта"
              className="flex-1"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Поиск эффектов"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setBuffQuery('')}
              disabled={buffQuery === ''}
              aria-label="Очистить поиск"
            >
              <X className="size-4" />
            </Button>
          </div>

          {buffLoadError && (
            <p className="text-sm text-destructive">{buffLoadError}</p>
          )}

          {normalizedQuery !== '' && matchingBuffs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Эффекты не найдены
            </p>
          )}

          {matchingBuffs.length > 0 && (
            <div className="grid gap-2">
              {matchingBuffs.map((buff) => (
                <div
                  key={buff.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{buff.name}</p>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          {buff.id}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {buff.description}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={applyingBuffId !== null}
                      onClick={() => void applyEffect(buff.id)}
                    >
                      {applyingBuffId === buff.id
                        ? 'Применяю…'
                        : 'Применить'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permanent buffs — always on, never activated. */}
      {permanentBuffs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-5" />
              Постоянные эффекты
            </CardTitle>
            <CardDescription>
              Эффекты, действующие на тебя постоянно
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {permanentBuffs.map((buff) => (
              <div
                key={buff.id}
                className="rounded-md border border-border p-3"
              >
                <p className="text-sm font-medium">{buff.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {buff.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Search normalization: case-insensitive, ё = е, and punctuation (including
// the dashes in ids) treated as spaces, so "Shock Therapy" matches both the
// name and the id "shock-therapy".
function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Helper: seconds remaining until an ISO timestamp.
function getRemainingSeconds(expiresAt: string | Date): number {
  const expiresAtMs = new Date(expiresAt).getTime()
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
}

// Helper: seconds until cooldown ends, or 0 if not on cooldown.
function getCooldownRemaining(ability: PlayerAbility): number {
  if (!ability.lastUsedAt || ability.cooldown <= 0) return 0
  const cooldownEnds =
    new Date(ability.lastUsedAt).getTime() + ability.cooldown * 1000
  return Math.max(0, Math.ceil((cooldownEnds - Date.now()) / 1000))
}

// Card showing a timed buff applied to the player with a live countdown.
function ActiveBuffCard({ buff }: { buff: PlayerBuff }) {
  const [now, setNow] = useState(() => Date.now())

  // Tick every second so the countdown stays accurate.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const expiresAtMs = buff.expiresAt ? new Date(buff.expiresAt).getTime() : 0
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000))

  // Hide when countdown reaches 0 — buff has expired.
  if (remainingSeconds <= 0) return null

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-warning">
              {buff.name}
            </p>
            {buff.sourcePlayerName && (
              <Badge variant="secondary" className="text-xs">
                <User className="mr-1 size-3" />
                {buff.sourcePlayerName}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm italic text-primary">
            {buff.description}
          </p>
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

// Individual ability row with optional target selector.
function AbilityCard({
  ability,
  players,
  quests,
  currentPlayerId,
  onUse,
}: {
  ability: PlayerAbility
  players: LobbyPlayer[]
  quests: GameQuest[]
  currentPlayerId: string
  onUse: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => void
}) {
  // Compute cooldown state.
  const cooldownRemaining = getCooldownRemaining(ability)
  // Limited ability with no charges left can no longer be used.
  const exhausted =
    ability.chargesRemaining !== null && ability.chargesRemaining <= 0
  const disabled = cooldownRemaining > 0 || exhausted

  // Quest-blocking abilities pick a quest by its physical marker number.
  const targetsQuest = ability.allowedTargets.includes('QUEST')

  // Decide whether this ability needs a target picker.
  const selfOnly =
    ability.allowedTargets.length === 1 &&
    ability.allowedTargets[0] === 'SELF'
  const supportsAllSurvivors = ability.allowedTargets.includes('ALL_SURVIVORS')

  // Build the list of valid targets based on allowedTargets roles.
  // Filter alive players whose role matches an allowed target category.
  const validTargets = buildValidTargets(
    ability.allowedTargets,
    players,
    currentPlayerId,
  )

  // Only available quests can be blocked (completed ones are rejected).
  // Blocked ones stay listed — re-blocking refreshes the timer.
  const validQuests = quests.filter((quest) => quest.status === 'AVAILABLE')

  const needsTargetPicker = !selfOnly && !supportsAllSurvivors && validTargets.length > 0

  if (targetsQuest) {
    return (
      <QuestAbilityRow
        ability={ability}
        validQuests={validQuests}
        disabled={disabled || validQuests.length === 0}
        cooldownRemaining={cooldownRemaining}
        onUse={onUse}
      />
    )
  }

  if (selfOnly) {
    return (
      <AbilityRowLayout ability={ability} cooldownRemaining={cooldownRemaining}>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onUse(ability.abilityId)}
        >
          Использовать
        </Button>
      </AbilityRowLayout>
    )
  }

  if (supportsAllSurvivors) {
    return (
      <AllSurvivorsAbilityRow
        ability={ability}
        disabled={disabled}
        cooldownRemaining={cooldownRemaining}
        onUse={onUse}
      />
    )
  }

  if (!needsTargetPicker) {
    return (
      <AbilityRowLayout ability={ability} cooldownRemaining={cooldownRemaining}>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onUse(ability.abilityId)}
        >
          Использовать
        </Button>
      </AbilityRowLayout>
    )
  }

  return (
    <TargetAbilityRow
      ability={ability}
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

// Badges shown on an ability row: remaining charges when the ability is
// limited, and cooldown (remaining time while on cooldown, otherwise the
// configured duration).
function AbilityBadges({
  ability,
  cooldownRemaining,
}: {
  ability: PlayerAbility
  cooldownRemaining: number
}) {
  const exhausted =
    ability.chargesRemaining !== null && ability.chargesRemaining <= 0

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {ability.chargesRemaining !== null && (
        <Badge
          variant="secondary"
          className={cn('text-xs', exhausted && 'text-destructive')}
        >
          Зарядов: {ability.chargesRemaining}
        </Badge>
      )}
      {cooldownRemaining > 0 ? (
        <Badge
          variant="outline"
          className="border-warning/40 text-xs text-warning"
        >
          <Clock3 className="mr-1 size-3" />
          К/д · {cooldownRemaining}с.
        </Badge>
      ) : (
        ability.cooldown > 0 && (
          <Badge
            variant="outline"
            className="border-border text-xs text-muted-foreground"
          >
            <Clock3 className="mr-1 size-3" />
            К/д {ability.cooldown}с.
          </Badge>
        )
      )}
    </div>
  )
}

// Shared layout for an ability row.
function AbilityRowLayout({
  ability,
  cooldownRemaining,
  children,
}: {
  ability: PlayerAbility
  cooldownRemaining: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{ability.name}</p>
        <p className="text-xs text-muted-foreground">
          {ability.description}
        </p>
        <AbilityBadges ability={ability} cooldownRemaining={cooldownRemaining} />
      </div>
      {children}
    </div>
  )
}

// Ability row for group abilities (ALL_SURVIVORS).
function AllSurvivorsAbilityRow({
  ability,
  disabled,
  cooldownRemaining,
  onUse,
}: {
  ability: PlayerAbility
  disabled: boolean
  cooldownRemaining: number
  onUse: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{ability.name}</p>
        <p className="text-xs text-muted-foreground">
          {ability.description}
        </p>
        <AbilityBadges ability={ability} cooldownRemaining={cooldownRemaining} />
      </div>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => onUse(ability.abilityId)}
      >
        Использовать
      </Button>
    </div>
  )
}

// Ability row that lets the player pick a target before using.
// validTargets is pre-filtered by allowedTargets roles.
function TargetAbilityRow({
  ability,
  validTargets,
  disabled,
  cooldownRemaining,
  onUse,
}: {
  ability: PlayerAbility
  validTargets: { id: string; label: string }[]
  disabled: boolean
  cooldownRemaining: number
  onUse: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => void
}) {
  const [selectedTarget, setSelectedTarget] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{ability.name}</p>
        <p className="text-xs text-muted-foreground">
          {ability.description}
        </p>
        <AbilityBadges ability={ability} cooldownRemaining={cooldownRemaining} />
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
        onClick={() => onUse(ability.abilityId, selectedTarget)}
      >
        Использовать
      </Button>
    </div>
  )
}

// Ability row that lets the killer pick a quest by its physical marker
// number before blocking it. validQuests is pre-filtered to available
// quests (completed ones are rejected by the server).
function QuestAbilityRow({
  ability,
  validQuests,
  disabled,
  cooldownRemaining,
  onUse,
}: {
  ability: PlayerAbility
  validQuests: GameQuest[]
  disabled: boolean
  cooldownRemaining: number
  onUse: (abilityId: string, targetPlayerId?: string, targetQuestNumber?: number) => void
}) {
  const [selectedQuest, setSelectedQuest] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 sm:gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium">{ability.name}</p>
        <p className="text-xs text-muted-foreground">
          {ability.description}
        </p>
        <AbilityBadges ability={ability} cooldownRemaining={cooldownRemaining} />
      </div>
      <Select value={selectedQuest} onValueChange={setSelectedQuest}>
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Квест" />
        </SelectTrigger>
        <SelectContent>
          {validQuests.map((quest) => (
            <SelectItem key={quest.id} value={String(quest.number)}>
              №{quest.number} · {quest.definition.name}
              {quest.blockedUntil !== null &&
              new Date(quest.blockedUntil).getTime() > Date.now()
                ? ' (заблокирован)'
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!selectedQuest || disabled}
        onClick={() => onUse(ability.abilityId, undefined, Number(selectedQuest))}
      >
        Использовать
      </Button>
    </div>
  )
}
