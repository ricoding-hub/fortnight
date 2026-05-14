import { useState, type FormEvent } from 'react'
import { IconMailForward, IconCheck } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function Login() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

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
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Sin contraseña. Accede con un enlace seguro.
        </p>
      </div>
    </main>
  )
}
