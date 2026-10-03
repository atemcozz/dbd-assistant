import { Shield, Skull } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
  const effects = character?.characterEffects ?? []

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
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
            {character?.name ?? 'Character unassigned'}
          </CardDescription>
        </div>
        {player.status === 'ALIVE' && (
          <Badge className="ml-auto shrink-0">Ready</Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {isOwner && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${player.id}-role`}>Role</Label>
              <Select
                value={player.role}
                onValueChange={(value) => onRoleChange(value as Role)}
              >
                <SelectTrigger id={`${player.id}-role`}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SURVIVOR">Survivor</SelectItem>
                  <SelectItem value="KILLER">Killer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${player.id}-character`}>Character</Label>
              <Select
                value={player.characterTypeId ?? undefined}
                onValueChange={onCharacterChange}
              >
                <SelectTrigger id={`${player.id}-character`}>
                  <SelectValue placeholder="Select type" />
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
            {effects.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Abilities
                </p>
                <ul className="mt-2 grid gap-2">
                  {effects.map((effect) => (
                    <li
                      key={effect.effectId}
                      className="rounded-md border border-border bg-background/50 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{effect.name}</p>
                        <div className="flex shrink-0 gap-1">
                          {effect.duration !== null && (
                            <Badge variant="outline" className="text-xs">
                              {effect.duration}s
                            </Badge>
                          )}
                          {effect.cooldown > 0 && (
                            <Badge variant="outline" className="text-xs">
                              CD {effect.cooldown}s
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {effect.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Waiting for the owner to assign a character.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
