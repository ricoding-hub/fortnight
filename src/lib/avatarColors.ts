/** Deterministic tinted avatar palette for people initials. */
const AVATAR_COLORS = [
  'bg-primary/15 text-primary-deep',
  'bg-asset/15 text-asset-deep',
  'bg-[#F59E0B]/15 text-[#B45309]',
  'bg-[#EC4899]/15 text-[#BE185D]',
  'bg-[#06B6D4]/15 text-[#0E7490]',
] as const

export function nameColorClass(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[Math.abs(hash)]
}
