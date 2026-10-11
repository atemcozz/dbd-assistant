import { coverImageUrl } from '@/lib/covers'

// Character cover rendered as a card background — portrait art dimmed
// under a readability gradient (readability wins over full visibility).
// Renders nothing without a cover. The parent must be relative +
// overflow-hidden; content stacked above needs relative positioning.
export function CharacterCover({ coverImage }: { coverImage: string | null }) {
  if (!coverImage) return null

  return (
    <>
      <img
        src={coverImageUrl(coverImage)}
        alt=""
        aria-hidden
        loading="lazy"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background"
      />
    </>
  )
}
