import { API_URL } from '@/gameStore'

// Absolute URL for a character cover served by the API under /static/images/.
// The stored path is relative to config/images/ (e.g. killers/king.jpg).
export function coverImageUrl(coverImage: string): string {
  const path = coverImage
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .map(encodeURIComponent)
    .join('/')
  return `${API_URL}/static/images/${path}`
}
