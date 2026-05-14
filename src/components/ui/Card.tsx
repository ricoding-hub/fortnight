import { type HTMLAttributes } from 'react'
import clsx from 'clsx'

type CardVariant = 'default' | 'glass' | 'gradient' | 'stat'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /** Adds a subtle glow border on hover — used for stat cards. */
  glow?: 'primary' | 'asset' | 'debt' | 'accent'
}

const variantClasses: Record<CardVariant, string> = {
  default:
    'bg-bg-elevated border border-border shadow-card',
  glass:
    'glass shadow-card',
  gradient:
    'gradient-hero text-text-inverse border-0',
  stat:
    'bg-bg-elevated border border-border shadow-card hover:shadow-elevated',
}

const glowClasses: Record<string, string> = {
  primary: 'hover:shadow-glow-primary',
  asset: 'hover:shadow-glow-asset',
  debt: 'hover:shadow-glow-debt',
  accent: 'hover:shadow-glow-accent',
}

export function Card({
  variant = 'default',
  glow,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl p-4 transition-shadow duration-[--duration-normal]',
        variantClasses[variant],
        glow && glowClasses[glow],
        className,
      )}
      {...props}
    />
  )
}
