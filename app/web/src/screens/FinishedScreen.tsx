import { Button } from '@/components/ui/button'
import { useGameStore } from '@/gameStore'

// Shown when the game has finished (timer expired or owner ended it).
export function FinishedScreen() {
  const state = useGameStore((store) => store.state)
  const clearSession = useGameStore((store) => store.clearSession)

  const completedQuests = state?.quests.filter(
    (quest) => quest.status === 'COMPLETED',
  ).length ?? 0
  const totalQuests = state?.quests.length ?? 0

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-5xl font-semibold text-foreground">
          Игра окончена
        </h1>
        <p className="mt-4 text-muted-foreground">
          Игра завершена. Спасибо за игру!
        </p>
        {state && (
          <div className="mt-6 rounded-md border border-border p-4 text-sm text-slate-400">
            <p>
              Квесты завершены: {completedQuests}/{totalQuests}
            </p>
          </div>
        )}
        <Button className="mt-8" onClick={clearSession} variant="outline">
          Ливнуть
        </Button>
      </div>
    </main>
  )
}
