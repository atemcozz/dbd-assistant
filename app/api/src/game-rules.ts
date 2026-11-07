// Survivors win once at least half of the starting survivors have escaped.
// The threshold is rounded up: 5 survivors need 3 escapes, 7 need 4.
export function requiredEscapes(totalSurvivors: number): number {
  if (totalSurvivors <= 0) return 0
  return Math.ceil(totalSurvivors / 2)
}

export function hasEnoughEscapes(
  escapedSurvivors: number,
  totalSurvivors: number,
): boolean {
  return (
    totalSurvivors > 0 &&
    escapedSurvivors >= requiredEscapes(totalSurvivors)
  )
}
