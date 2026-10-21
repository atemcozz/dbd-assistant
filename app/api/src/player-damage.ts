// Maximum number of knockouts a survivor can take. The next lethal hit kills.
export const MAX_KNOCKOUTS = 2

export type DamageResult = {
  health: number
  knockouts: number
  died: boolean
}

// Applies physical damage to a survivor. Lethal damage does not reduce the
// last HP until the survivor runs out of knockouts: the first MAX_KNOCKOUTS
// lethal hits leave them at 1 HP with one more knockout, the next kills.
export function applyDamage(
  health: number,
  knockouts: number,
  quantity: number,
): DamageResult {
  const remaining = health - quantity

  if (remaining > 0) {
    return { health: remaining, knockouts, died: false }
  }

  if (knockouts >= MAX_KNOCKOUTS) {
    return { health: 0, knockouts, died: true }
  }

  // Overkill still leaves the survivor at 1 HP — knocked out, not dead.
  return { health: 1, knockouts: knockouts + 1, died: false }
}
