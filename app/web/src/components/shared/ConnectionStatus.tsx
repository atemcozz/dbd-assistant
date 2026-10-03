import { Radio, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// Shows live / connecting / disconnected badge based on Socket.IO state.
export function ConnectionStatus({
  status,
}: {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected'
}) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  return (
    <Badge
      variant={
        connected ? 'default' : connecting ? 'secondary' : 'destructive'
      }
    >
      {connected ? <Radio className="size-3" /> : <WifiOff className="size-3" />}
      {connected
        ? 'Live connection'
        : connecting
          ? 'Connecting...'
          : 'Connection unavailable'}
    </Badge>
  )
}
