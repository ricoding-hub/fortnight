import { findBrand } from '@/lib/brands'
import type { Brand } from '@/lib/brands'

interface Props {
  brandId?: string | null
  name?: string
  color?: string | null
  size?: number
  className?: string
}

export function BrandLogo({ brandId, name = '', color, size = 40, className }: Props) {
  const brand: Brand | undefined = brandId
    ? findBrand(brandId)
    : name ? findBrand(name) : undefined

  const bg = brand?.color ?? color ?? '#6B7194'
  const label = brand?.initials ?? (name ? name.slice(0, 2).toUpperCase() : '?')
  const fontSize = size * 0.35

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: size * 0.3,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {label}
    </div>
  )
}
