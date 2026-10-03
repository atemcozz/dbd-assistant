import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shows HP as hearts for small maxHealth (≤6), otherwise as "X/Y".
// Killers have maxHealth null, so this returns null for them.
export function HealthDisplay({
  health,
  maxHealth,
  compact = false,
}: {
  health: number | null
  maxHealth: number | null
  compact?: boolean
}) {
  if (health === null || maxHealth === null) {
    return null
  }

  if (maxHealth <= 6) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold">
        {Array.from({ length: maxHealth }, (_, index) => (
          <Heart
            key={index}
            className={cn(
              'size-4',
              index < health
                ? 'fill-destructive text-destructive'
                : 'text-muted-foreground',
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
    <span className="inline-flex items-center gap-1 text-sm font-semibold">
      {health}/{maxHealth}
      <Heart className="size-4 fill-destructive text-destructive" />
    </span>
  )
}
