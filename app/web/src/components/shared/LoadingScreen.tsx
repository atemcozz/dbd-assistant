// Shown while the app restores a saved session on page load.
export function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <p className="font-display text-xl font-semibold text-white">
          DBD Assistant
        </p>
        <p className="mt-2 text-sm text-slate-400">Восстановление сессии...</p>
      </div>
    </main>
  )
}
