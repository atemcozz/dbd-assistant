import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Simple confirm/info modal used for quest completion and effect use.
// Deliberately minimal — no portal library needed for a single fixed overlay.
export function Modal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirmLabel?: string
  onConfirm?: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-primary" />
              {title}
            </CardTitle>
            <Button
              aria-label="Close modal"
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          {onConfirm && (
            <Button onClick={onConfirm} variant="destructive">
              {confirmLabel ?? 'OK'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Modal that requires waiting for a countdown before it can be closed.
// Used for damage notifications and effect-applied popups so players
// don't accidentally dismiss important game information.
export function TimedModal({
  title,
  body,
  seconds = 5,
  onClose,
}: {
  title: string
  body: string
  seconds?: number
  onClose: () => void
}) {
  const [remaining, setRemaining] = useState(seconds)

  // Tick down every second until the countdown reaches zero.
  useEffect(() => {
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining])

  const canClose = remaining <= 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-primary" />
              {title}
            </CardTitle>
            <Button
              aria-label="Close modal"
              onClick={onClose}
              disabled={!canClose}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2">
          {/* Countdown indicator — shows how long until the modal can be closed. */}
          <span className="text-sm tabular-nums text-muted-foreground">
            {canClose ? 'You can close this now.' : `Close in ${remaining}s...`}
          </span>
          <Button onClick={onClose} disabled={!canClose}>
            {canClose ? 'Close' : `${remaining}s`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
