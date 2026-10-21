import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import type { CharacterType } from '@/gameStore'

// Read-only character description + kit. Shared by the lobby player card
// and the public wiki so both show exactly the same abilities.
export function CharacterDetails({
  character,
  defaultExpanded = true,
}: {
  character: CharacterType
  defaultExpanded?: boolean
}) {
  const abilities = character.abilities ?? []
  const startingBuffs = character.startingBuffs ?? []
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-6 text-muted-foreground">
        {character.description}
      </p>
      {(abilities.length > 0 || startingBuffs.length > 0) && (
        <div>
          <button
            type="button"
            aria-label={expanded ? 'Свернуть абилки' : 'Раскрыть абилки'}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-2"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Абилки
            </p>
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
          {expanded && (
            <ul className="mt-2 grid gap-2">
              {abilities.map((ability) => (
                <li
                  key={ability.abilityId}
                  className="rounded-md border border-border bg-background/50 p-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">{ability.name}</p>
                    <div className="flex gap-1 flex-wrap">
                      {ability.duration !== null && (
                        <Badge variant="outline" className="text-xs">
                          {ability.duration}с.
                        </Badge>
                      )}
                      {ability.cooldown > 0 && (
                        <Badge variant="outline" className="text-xs">
                          к/д {ability.cooldown}с.
                        </Badge>
                      )}
                      {ability.count !== null && (
                        <Badge variant="outline" className="text-xs">
                          {ability.count} заряда
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
  )
}
