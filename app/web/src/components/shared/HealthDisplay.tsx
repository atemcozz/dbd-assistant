import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

// Must match MAX_KNOCKOUTS in the API (app/api/src/player-damage.ts).
// Repeated here only to label the count; colors cap at 2 knockouts.
const MAX_KNOCKOUTS = 2

// Heart color encodes how many knockouts the survivor has taken:
// 0 = green (healthy), 1 = yellow, 2 = red (one lethal hit from death).
function knockoutTone(knockouts: number) {
  if (knockouts >= MAX_KNOCKOUTS) {
    return {
      heart: 'fill-destructive text-destructive',
      text: 'text-destructive',
    }
  }

  if (knockouts === 1) {
    return {
      heart: 'fill-warning text-warning',
      text: 'text-warning',
    }
  }

  return {
    heart: 'fill-success text-success',
    text: 'text-success',
  }
}

// Shows HP as hearts for small maxHealth (≤6), otherwise as "X/Y".
// Killers have maxHealth null, so this returns null for them.
export function HealthDisplay({
  health,
  maxHealth,
  knockouts,
  compact = false,
}: {
  health: number | null
  maxHealth: number | null
  knockouts: number
  compact?: boolean
}) {
  if (health === null || maxHealth === null) {
    return null
  }

  const tone = knockoutTone(knockouts)
  const label = `Нокауты: ${knockouts} из ${MAX_KNOCKOUTS}`

  if (maxHealth <= 6) {
    return (
      <span
        className="inline-flex items-center gap-1 text-sm font-semibold"
        title={label}
      >
        {Array.from({ length: maxHealth }, (_, index) => (
          <Heart
            key={index}
            className={cn(
              'size-4',
              index < health ? tone.heart : 'text-muted-foreground',
            )}
          />
        ))}
        {compact && (
          <span className="sr-only">
            {health}/{maxHealth}
          </span>
        )}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-semibold"
      title={label}
    >
      <span className={tone.text}>
        {health}/{maxHealth}
      </span>
      <Heart className={cn('size-4', tone.heart)} />
    </span>
  )
}
