import { MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ChatMessage } from '@/gameStore'

// High-contrast nickname colors for the dark UI.
// Hash the player id so each person keeps a stable color.
const NICK_COLORS = [
  'hsl(20 70% 64%)',    // copper
  'hsl(349 65% 68%)',   // light crimson
  'hsl(150 35% 58%)',   // sage
  'hsl(32 75% 64%)',    // amber
  'hsl(320 45% 72%)',   // lilac
  'hsl(195 50% 62%)',   // muted cyan
  'hsl(45 70% 62%)',    // pale gold
  'hsl(265 40% 72%)',   // soft violet
] as const

function nickColor(playerId: string): string {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0
  }
  return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length]
}

// Survivor-only chat panel. Server enforces alive-survivor access;
// this UI is only shown to survivors and the input is for sending.
export function ChatSection({
  messages,
  onSend,
}: {
  messages: ChatMessage[]
  onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the bottom whenever new messages arrive.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-5" />
          Чат выживших
        </CardTitle>
        <CardDescription>
          Сообщения видят <em>только живые сюрвы</em>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          ref={scrollRef}
          className="max-h-80 space-y-3 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет сообщений</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide">
                  {message.playerStatus === 'DEAD' && (
                    <span className="mr-1 text-destructive">[УМЕР]</span>
                  )}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        message.playerStatus === 'DEAD'
                          ? 'hsl(340 12% 48%)'
                          : nickColor(message.playerId),
                    }}
                  >
                    {message.playerName}
                  </span>
                </p>
                <p className="mt-1 text-sm">{message.text}</p>
              </div>
            ))
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!text.trim()) return
            onSend(text.trim())
            setText('')
          }}
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Написать сообщение..."
            maxLength={500}
          />
          <Button type="submit">Отправить</Button>
        </form>
      </CardContent>
    </Card>
  )
}
