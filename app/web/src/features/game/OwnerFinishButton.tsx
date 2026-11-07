import { Flag } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'

// Owner-only control to end the current game early. The API accepts this
// only while the game is RUNNING; the parent decides when to render it.
export function OwnerFinishButton({
  onFinish,
  compact = true,
}: {
  onFinish: () => void
  compact?: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        aria-label="Завершить игру"
        onClick={() => setConfirmOpen(true)}
        size={compact ? 'icon' : 'default'}
        variant="outline"
        title="Завершить игру"
      >
        <Flag className="size-4" />
        {!compact && 'Завершить игру'}
      </Button>
      {confirmOpen && (
        <Modal
          title="Завершить игру?"
          body="Игра будет остановлена для всех участников. Победитель не будет назначен автоматически."
          confirmLabel="Завершить игру"
          onConfirm={() => {
            setConfirmOpen(false)
            onFinish()
          }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  )
}
