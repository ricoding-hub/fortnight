import { useState, type FormEvent } from 'react'
import { IconMailForward, IconCheck } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/** Inline Google "G" logo – avoids external image dependency. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.7 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function Login() {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError('')
    try {
      await signInWithEmail(email.trim())
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Algo salió mal')
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setGoogleLoading(false)
      setError(err instanceof Error ? err.message : 'No se pudo conectar con Google')
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden gradient-mesh px-6">
      {/* Decorative blurred circles */}
      <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-asset/8 blur-3xl" />

      <div className="relative w-full max-w-sm animate-[scale-in_500ms_cubic-bezier(0.34,1.56,0.64,1)]">
        {/* Brand header */}
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-glow-primary">
            <span className="text-2xl font-extrabold text-white">F</span>
          </div>
          <h1 className="text-3xl font-bold text-text">Fortnight</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Conoce tu quincena. Controla tu futuro.
          </p>
        </header>

        <Card variant="glass" className="shadow-elevated">
          {status === 'sent' ? (
            <div className="text-center py-2 animate-[scale-in_300ms_ease-out]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-asset/12">
                <IconCheck size={24} className="text-asset" />
              </div>
              <p className="text-sm font-semibold text-asset">
                Revisa tu correo
              </p>
              <p className="mt-1.5 text-sm text-text-secondary">
                Te enviamos un enlace de acceso a{' '}
                <strong className="text-text">{email}</strong>.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Google sign-in */}
              <button
                type="button"
                onClick={() => void handleGoogle()}
                disabled={googleLoading}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-bg-elevated font-medium text-sm text-text shadow-sm transition-all duration-[--duration-fast] ease-[--ease-spring] hover:shadow-card hover:border-border-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {googleLoading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
                    Conectando…
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Continuar con Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-tertiary">o</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Magic link form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  label="Correo electrónico"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={status === 'error' ? error : undefined}
                />
                <Button type="submit" loading={status === 'sending'}>
                  <IconMailForward size={18} />
                  Enviar enlace de acceso
                </Button>
              </form>

              {/* Google-level error */}
              {error && status !== 'error' && (
                <p className="text-center text-xs text-debt">{error}</p>
              )}
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Sin contraseña. Accede con Google o con un enlace seguro.
        </p>
      </div>
    </main>
  )
}
