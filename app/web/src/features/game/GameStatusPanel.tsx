import { Skull, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HealthDisplay } from '@/components/shared/HealthDisplay'
import type { CharacterAbilityInfo, CharacterStartBuffInfo, LobbyPlayer } from '@/gameStore'

// Game status tab — shows the player's own role and HP.
// Survivors see killer intel; killers see survivor intel.
// Each entry lists the character's starting abilities (read-only).
export function GameStatusPanel({
  player,
  players,
  isKiller,
}: {
  player: LobbyPlayer
  players: LobbyPlayer[]
  isKiller: boolean
}) {
  const killers = players.filter((p) => p.role === 'KILLER')
  const survivors = players.filter((p) => p.role === 'SURVIVOR')

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Статус игры</CardTitle>
          {/* <CardDescription>
            {isKiller
              ? 'Control the pressure and watch survivor status.'
              : 'Keep moving through the physical venue.'}
          </CardDescription> */}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-border p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Твоя роль
            </p>
            <p className="mt-1 uppercase text-2xl font-semibold">
              {player.characterType?.name ?? player.role}
            </p>

             

            <div className="mt-3">
              <HealthDisplay
                health={player.health}
                maxHealth={player.characterType?.maxHealth ?? null}
              />
            </div>
              <p className="mt-1">
              {player.characterType?.description ?? ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Killer intel — only visible to survivors. */}
      {!isKiller && killers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skull className="size-5 text-destructive" />
              Маны в текущей игре
            </CardTitle>
            {/* <CardDescription>
              Know who you're up against. These are the killer's starting abilities.
            </CardDescription> */}
          </CardHeader>
          <CardContent className="grid gap-4">
            {killers.map((killer) => (
              <CharacterIntelCard
                key={killer.id}
                target={killer}
                variant="killer"
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Survivor intel — only visible to killers. */}
      {isKiller && survivors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              Выжившие в текущей игре
            </CardTitle>
            {/* <CardDescription>
              Track who's still in play. These are each survivor's starting abilities.
            </CardDescription> */}
          </CardHeader>
          <CardContent className="grid gap-4">
            {survivors.map((survivor) => (
              <CharacterIntelCard
                key={survivor.id}
                target={survivor}
                variant="survivor"
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Shared card for a single character (killer or survivor) —
// character name, player name, status, description, HP (survivors), and effects.
function CharacterIntelCard({
  target,
  variant,
}: {
  target: LobbyPlayer
  variant: 'killer' | 'survivor'
}) {
  const character = target.characterType
  const abilities: CharacterAbilityInfo[] = character?.abilities ?? []
  const startingBuffs: CharacterStartBuffInfo[] = character?.startingBuffs ?? []

  return (
    <div
      className={
        variant === 'killer'
          ? 'rounded-md border border-destructive/30 bg-destructive/5 p-4'
          : 'rounded-md border border-primary/30 bg-primary/5 p-4'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-lg font-semibold">
              {character?.name ?? (variant === 'killer' ? 'Неизвестный ман' : 'Неизвестный выживший')}
            </p>
            <Badge variant="secondary" className="text-xs">
              {target.name}
            </Badge>
            {target.status !== 'ALIVE' && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {target.status}
              </Badge>
            )}
          </div>
          {character?.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {character.description}
            </p>
          )}
          {/* Show HP for survivors — killers track who's still healthy. */}
          {variant === 'survivor' && (
            <div className="mt-2">
              <HealthDisplay
                health={target.health}
                maxHealth={character?.maxHealth ?? null}
              />
            </div>
          )}
        </div>
      </div>

      {/* Read-only list of the character's abilities and permanent buffs. */}
      {(abilities.length > 0 || startingBuffs.length > 0) && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Абилки персонажа
          </p>
          <ul className="mt-2 grid gap-2">
            {abilities.map((ability) => (
              <li
                key={ability.abilityId}
                className="rounded-md border border-border bg-background/50 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{ability.name}</p>
                  <div className="flex shrink-0 gap-1">
                    {ability.duration !== null && (
                      <Badge variant="outline" className="text-xs">
                        {ability.duration}с
                      </Badge>
                    )}
                    {ability.cooldown > 0 && (
                      <Badge variant="outline" className="text-xs">
                        К/д {ability.cooldown}с
                      </Badge>
                    )}
                    {ability.count !== null && (
                      <Badge variant="outline" className="text-xs">
                        Зарядов {ability.count}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ability.description}
                </p>
              </li>
            ))}
            {/* Permanent starting buffs — name + description only. */}
            {startingBuffs.map((buff) => (
              <li
                key={buff.buffId}
                className="rounded-md border border-border bg-background/50 p-2"
              >
                <p className="text-sm font-medium">{buff.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {buff.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
