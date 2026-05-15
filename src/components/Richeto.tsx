import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAccounts } from '@/hooks/useAccounts'
import { calculateScore } from '@/lib/score'

// ── Contextual comment bank ──────────────────────────────────

interface Comment {
  text: string
  emoji: string
}

const SCORE_COMMENTS: Record<string, Comment[]> = {
  high: [
    { text: '¡Vas increíble! Sigue así', emoji: '🔥' },
    { text: '¡Finanzas de campeón!', emoji: '🏆' },
    { text: 'Richeto está orgulloso de ti', emoji: '🥹' },
  ],
  medium: [
    { text: 'Buen camino, ¡casi llegas!', emoji: '💪' },
    { text: 'Un poco más y llegas al top', emoji: '📈' },
    { text: 'Vas bien, no bajes la guardia', emoji: '🛡️' },
  ],
  low: [
    { text: 'Ánimo, puedes mejorar', emoji: '💪' },
    { text: 'Cada peso cuenta, ¡tú puedes!', emoji: '✨' },
    { text: 'Revisa tus gastos, yo te apoyo', emoji: '🤝' },
  ],
}

const MODULE_COMMENTS: Record<string, Comment[]> = {
  '/': [
    { text: 'Tu panorama financiero', emoji: '📊' },
    { text: '¡Hola! Revisemos tus finanzas', emoji: '👋' },
  ],
  '/cuentas': [
    { text: 'Aquí controlas tu dinero', emoji: '💰' },
    { text: 'Mantén tus cuentas al día', emoji: '🏦' },
  ],
  '/movimientos': [
    { text: 'Registra todo, no olvides nada', emoji: '📝' },
    { text: 'Cada movimiento importa', emoji: '🔍' },
  ],
  '/proyeccion': [
    { text: 'Veamos tu futuro financiero', emoji: '🔮' },
    { text: 'Planifica y conquista', emoji: '🚀' },
  ],
  '/prestamos': [
    { text: '¿Quién te debe? Richeto no olvida', emoji: '🧐' },
    { text: 'Tus préstamos bajo control', emoji: '📋' },
  ],
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getComment(path: string, score: number): Comment {
  // On the Resumen page, blend score-based comments
  if (path === '/') {
    const tier = score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low'
    // 60% chance of score comment, 40% module comment
    if (Math.random() < 0.6) {
      return pickRandom(SCORE_COMMENTS[tier])
    }
  }

  const moduleComments = MODULE_COMMENTS[path]
  if (moduleComments) return pickRandom(moduleComments)

  return { text: '¿En qué te ayudo?', emoji: '💡' }
}

// ── Component ────────────────────────────────────────────────

export function Richeto() {
  const location = useLocation()
  const { data: accounts } = useAccounts()
  const score = calculateScore(accounts)

  const [bubble, setBubble] = useState<Comment | null>(null)
  const [visible, setVisible] = useState(false)

  // Show a new comment when the module changes
  const showComment = useCallback(() => {
    const comment = getComment(location.pathname, score)
    setBubble(comment)
    setVisible(true)
  }, [location.pathname, score])

  useEffect(() => {
    showComment()
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [showComment])

  function handleTap() {
    if (visible) {
      setVisible(false)
    } else {
      showComment()
      const timer = setTimeout(() => setVisible(false), 4000)
      return () => clearTimeout(timer)
    }
  }

  return (
    <div
      className="fixed z-40 lg:bottom-6 lg:right-6"
      style={{
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        right: '1rem',
      }}
    >
      {/* Speech bubble */}
      {bubble && (
        <div
          className="absolute bottom-full right-0 mb-2 w-max max-w-52 transition-all duration-300"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.95)',
            pointerEvents: visible ? 'auto' : 'none',
          }}
        >
          <div className="rounded-2xl rounded-br-md bg-bg-elevated px-4 py-2.5 shadow-elevated border border-border">
            <p className="text-xs font-medium text-text leading-relaxed">
              {bubble.emoji} {bubble.text}
            </p>
          </div>
        </div>
      )}

      {/* Richeto avatar */}
      <button
        type="button"
        onClick={handleTap}
        aria-label="Richeto, tu asistente financiero"
        className="relative h-12 w-12 rounded-2xl shadow-elevated transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{
          animation: 'richeto-breathe 3s ease-in-out infinite',
          willChange: 'transform',
        }}
      >
        <img
          src="/richeto.png"
          alt="Richeto"
          width={48}
          height={48}
          className="h-12 w-12 rounded-2xl object-cover"
          loading="eager"
        />
      </button>
    </div>
  )
}
