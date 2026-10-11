import { ChevronDown, ChevronUp, Shield, Skull } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CharacterCover } from '@/components/shared/CharacterCover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CharacterType, LobbyPlayer, Role } from '@/gameStore'

// Lobby player card — shows role/character info.
// When a character is assigned, shows the character's description and
// read-only starting abilities so everyone knows what each player can do.
// When isOwner=true, also renders role and character selects for configuration.
export function PlayerCard({
  player,
  isOwner,
  characterTypes,
  onRoleChange,
  onCharacterChange,
}: {
  player: LobbyPlayer
  isOwner: boolean
  characterTypes: CharacterType[]
  onRoleChange: (role: Role) => void
  onCharacterChange: (id: string) => void
}) {
  // Only show character options matching the player's current role.
  const availableCharacters = characterTypes.filter(
    (character) => character.role === player.role,
  )

  const character = player.characterType
  const abilities = character?.abilities ?? []
  const startingBuffs = character?.startingBuffs ?? []
  // Abilities list starts expanded; collapsible to keep long kits compact.
  const [abilitiesExpanded, setAbilitiesExpanded] = useState(true)

  return (
    <Card className="relative overflow-hidden">
      <CharacterCover coverImage={character?.coverImage ?? null} />
      <CardHeader className="relative flex-row items-start gap-3 space-y-0">
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full',
            player.role === 'KILLER'
              ? 'bg-destructive/15 text-destructive'
              : 'bg-primary/15 text-primary',
          )}
        >
          {player.role === 'KILLER' ? (
            <Skull className="size-5" />
          ) : (
            <Shield className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate">{player.name}</CardTitle>
          <CardDescription>
            {character?.name ?? 'Пока никто'}
          </CardDescription>
        </div>
        {player.characterType && player.role && (
          <Badge className="ml-auto shrink-0">К бою готов</Badge>
        )}
      </CardHeader>
      <CardContent className="relative grid gap-4">
        {isOwner && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${player.id}-role`}>Роль</Label>
              <Select
                value={player.role}
                onValueChange={(value) => onRoleChange(value as Role)}
              >
                <SelectTrigger id={`${player.id}-role`}>
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SURVIVOR">Сюрв</SelectItem>
                  <SelectItem value="KILLER">Ман</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${player.id}-character`}>Персонаж</Label>
              <Select
                value={player.characterTypeId ?? undefined}
                onValueChange={onCharacterChange}
              >
                <SelectTrigger id={`${player.id}-character`}>
                  <SelectValue placeholder="Выберите персонажа" />
                </SelectTrigger>
                <SelectContent>
                  {availableCharacters.map((available) => (
                    <SelectItem key={available.id} value={available.id}>
                      {available.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Character info — shown to everyone once a character is assigned. */}
        {character ? (
          <div className="grid gap-3">
            <p className="text-sm leading-6 text-muted-foreground">
              {character.description}
            </p>
            {(abilities.length > 0 || startingBuffs.length > 0) && (
              <div>
                <button
                  type="button"
                  aria-label={abilitiesExpanded ? 'Свернуть абилки' : 'Раскрыть абилки'}
                  onClick={() => setAbilitiesExpanded((value) => !value)}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Абилки
                  </p>
                  {abilitiesExpanded ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </button>
                {abilitiesExpanded && (
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
                              {ability.duration}с.
                            </Badge>
                          )}
                          {ability.cooldown > 0 && (
                            <Badge variant="outline" className="text-xs">
                              К/д {ability.cooldown}с.
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
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Ждем выбора персонажа...
          </p>
        )}
      </CardContent>
    </Card>
  )
}
