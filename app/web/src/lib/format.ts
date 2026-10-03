// Small formatting helpers shared across screens.

// Compute remaining game time from start timestamp + duration.
// Used by both the lobby preview and the live countdown timer.
export function getRemainingSeconds(
  startedAt: string | null,
  durationSeconds: number,
) {
  if (!startedAt) return durationSeconds
  return Math.max(
    0,
    durationSeconds -
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  )
}

// Format seconds as MM:SS for the countdown display.
export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}
