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

// Human-readable end-of-game announcement shown in the shared end modal.
// Reasons cover: timeout draw, all escaped, all dead/left, no killers left,
// no survivors at start, and owner-forced finish (winner null).
export function describeGameEnd(state: {
  winner: string | null
  players: {
    role: 'SURVIVOR' | 'KILLER'
    status: 'ALIVE' | 'DEAD' | 'DISCONNECTED' | 'ESCAPED'
  }[]
}): string {
  if (state.winner === 'SURVIVORS') {
    const survivors = state.players.filter((p) => p.role === 'SURVIVOR')
    const killersInRoom = state.players.filter(
      (p) => p.role === 'KILLER' && p.status === 'ALIVE',
    )
    const allEscaped =
      survivors.length > 0 && survivors.every((s) => s.status === 'ESCAPED')

    if (allEscaped) {
      return 'Победители — выжившие. Все сбежали. Можно продолжать играть, если нужно.'
    }
    if (killersInRoom.length === 0) {
      return 'Победители — выжившие. В комнате не осталось манов. Можно продолжать играть, если нужно.'
    }
    return 'Победители — выжившие. Можно продолжать играть, если нужно.'
  }

  if (state.winner === 'KILLER') {
    const survivors = state.players.filter((p) => p.role === 'SURVIVOR')
    if (survivors.length === 0) {
      return 'Победители — маны. В игре не было выживших. Можно продолжать играть, если нужно.'
    }
    const survivorsInRoom = survivors.filter(
      (s) => s.status === 'ALIVE' || s.status === 'ESCAPED',
    )
    if (survivorsInRoom.length === 0) {
      return 'Победители — маны. Все выжившие погибли или покинули комнату. Можно продолжать играть, если нужно.'
    }
    return 'Победители — маны. Можно продолжать играть, если нужно.'
  }

  if (state.winner === 'DRAW') {
    return 'Ничья. Время вышло, но выжившие ещё были в игре и не сбежали. Обе стороны проиграли. Можно продолжать играть, если нужно.'
  }

  return 'Игра окончена. Можно продолжать играть, если нужно.'
}
