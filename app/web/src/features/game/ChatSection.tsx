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
          Survivor chat
        </CardTitle>
        <CardDescription>
          Only alive survivors can send or read messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          ref={scrollRef}
          className="max-h-80 space-y-3 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-semibold">
                  {message.playerStatus === 'DEAD' ? '[DEAD] ' : ''}
                  {message.playerName}
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
            placeholder="Message survivors"
            maxLength={500}
          />
          <Button type="submit">Send</Button>
        </form>
      </CardContent>
    </Card>
  )
}
