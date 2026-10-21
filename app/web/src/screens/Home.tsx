import { useState, type FormEvent } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useGameStore } from '@/gameStore'

// Home screen — create a new game room or join an existing one by code.
export function Home() {
  const createGame = useGameStore((store) => store.createGame)
  const joinGame = useGameStore((store) => store.joinGame)
  const error = useGameStore((store) => store.error)
  const isLoading = useGameStore((store) => store.isLoading)
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [gameName, setGameName] = useState('Friday Night Trial')
  const [playerName, setPlayerName] = useState('')
  const [code, setCode] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'create') await createGame(gameName, playerName)
    else await joinGame(code, playerName)
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10 lg:px-16">
      <div className="mx-auto flex flex-col max-w-6xl items-center gap-10 lg:grid-cols-[1fr_26rem] lg:gap-20">
        <section className="max-w-2xl mt-10">
          <h1 className="flex items-center gap-3 mt-5 max-w-xl font-display text-5xl font-semibold leading-[.95] tracking-tight text-foreground sm:text-7xl">
            ДБД РИЛ ЛАЙФ ЕДИШОН V0.000001
          </h1>
          <div className="mt-8">
            <Button asChild variant="outline">
              <a href="?wiki">
                <BookOpen className="size-4" />
                Вики и правила
              </a>
            </Button>
          </div>
        </section>
        <Card className="w-full mt-10">
          <Tabs
            className=" p-2"
            value={mode}
            onValueChange={(value) => setMode(value as 'create' | 'join')}
          >
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="create">
                <span className="sm:hidden">[ Создать ]</span>
                <span className="hidden sm:inline">[ Создать комнату ]</span>
              </TabsTrigger>
              <TabsTrigger value="join">
                <span className="sm:hidden">[ Войти ]</span>
                <span className="hidden sm:inline">[ Присоединиться к игре ]</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <CardHeader>
            <CardTitle>
              {mode === 'create' ? 'Создать комнату' : 'Присоединиться к игре'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-5"
              onSubmit={(event) => void submit(event)}
            >
              <div className="grid gap-2">
                {mode === 'create' ? (
                  <>
                    <Label htmlFor="game-name">Имя комнаты</Label>
                    <Input
                      id="game-name"
                      value={gameName}
                      onChange={(event) => setGameName(event.target.value)}
                      maxLength={80}
                      placeholder="Введите имя комнаты"
                      required
                    />
                  </>
                ) : (
                  <>
                    <Label htmlFor="game-code">Код игры</Label>
                    <Input
                      id="game-code"
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.toUpperCase())
                      }
                      maxLength={6}
                      placeholder="A1B2C3"
                      required
                    />
                  </>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="player-name">Имя</Label>
                <Input
                  id="player-name"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  maxLength={80}
                  placeholder="Введите ваше имя"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button disabled={isLoading} type="submit">
                {isLoading
                  ? 'Подключение...'
                  : mode === 'create'
                    ? 'Создать комнату'
                    : 'Присоединиться'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      {/* Inconspicuous admin diagnostics entry — plain text, bottom corner. */}
      <div className="mx-auto max-w-6xl px-1 py-6 text-right">
        <a
          href="?debug"
          className="font-mono text-[11px] text-muted-foreground/40 hover:text-muted-foreground"
        >
          debug
        </a>
      </div>
    </main>
  )
}
