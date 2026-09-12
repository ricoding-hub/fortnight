import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconCheck, IconMailForward } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { authErrorMessage } from '@/lib/authErrors'
import { validarPassword } from '@/lib/password'
import { isIOS, isStandalone } from '@/lib/platform'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Card } from '@/components/ui/Card'

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


type Modo = 'entrar' | 'crear'

const esquema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo').email('Ese correo no parece válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})
type Valores = z.infer<typeof esquema>

export function Login() {
  const { signInWithEmail, signInWithGoogle, signInWithPassword, signUpWithPassword } = useAuth()
  // El enlace mágico abre en Safari, que una app instalada en iOS no ve.
  const showIosNote = isIOS() && !isStandalone()

  const [modo, setModo] = useState<Modo>('entrar')
  const [formError, setFormError] = useState('')
  const [avisoCorreo, setAvisoCorreo] = useState<'magico' | 'confirmar' | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', password: '' },
  })

  // useWatch en vez de watch(): watch() devuelve una función nueva en
  // cada render y el compilador de React se salta el componente entero.
  const email = useWatch({ control, name: 'email' })
  // useWatch en vez de watch(): watch() devuelve una función nueva en
  // cada render y el compilador de React se salta el componente entero.
  const password = useWatch({ control, name: 'password' })

  async function onSubmit(v: Valores) {
    setFormError('')
    try {
      if (modo === 'crear') {
        // La política vive en lib/password: el esquema sólo exige "no vacío"
        // para que al ENTRAR no se rechace la contraseña de alguien que se
        // registró bajo otras reglas.
        const veredicto = validarPassword(v.password)
        if (!veredicto.ok) {
          setError('password', { message: veredicto.error })
          return
        }
        const { needsConfirmation } = await signUpWithPassword(v.email, v.password)
        if (needsConfirmation) setAvisoCorreo('confirmar')
        return
      }
      await signInWithPassword(v.email, v.password)
    } catch (err) {
      setFormError(authErrorMessage(err))
    }
  }

  async function enviarEnlace() {
    const correo = email?.trim()
    if (!correo) {
      setError('email', { message: 'Escribe tu correo para enviarte el enlace' })
      return
    }
    setMagicLoading(true)
    setFormError('')
    try {
      await signInWithEmail(correo)
      setAvisoCorreo('magico')
    } catch (err) {
      setFormError(authErrorMessage(err))
    } finally {
      setMagicLoading(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setFormError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setGoogleLoading(false)
      setFormError(authErrorMessage(err))
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden gradient-mesh px-6 py-10">
      <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-asset/8 blur-3xl" />

      <div className="relative w-full max-w-sm animate-[scale-in_500ms_cubic-bezier(0.34,1.56,0.64,1)]">
        <header className="mb-8 text-center">
          <img
            src="/icons/icon-192.png"
            alt="Fortnight"
            className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-glow-primary"
          />
          <h1 className="text-3xl font-bold text-text">Fortnight</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Conoce tu quincena. Controla tu futuro.
          </p>
        </header>

        <Card variant="glass" className="shadow-elevated">
          {avisoCorreo ? (
            <div className="animate-[scale-in_300ms_ease-out] py-2 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-asset/12">
                <IconCheck size={24} className="text-asset" />
              </div>
              <p className="text-sm font-semibold text-asset">Revisa tu correo</p>
              <p className="mt-1.5 text-sm text-text-secondary">
                {avisoCorreo === 'magico' ? (
                  <>Te enviamos un enlace de acceso a <strong className="text-text">{email}</strong>.</>
                ) : (
                  <>Te enviamos un enlace para confirmar <strong className="text-text">{email}</strong>. Ábrelo y ya podrás entrar.</>
                )}
              </p>
              <button
                type="button"
                onClick={() => setAvisoCorreo(null)}
                className="mt-4 text-xs font-bold text-primary transition-colors hover:text-primary-deep"
              >
                Volver
              </button>
            </div>
          ) : (
            <>
              {/* Entrar / Crear cuenta */}
              <div className="mb-4 flex overflow-hidden rounded-xl border border-border" role="tablist">
                {(['entrar', 'crear'] as Modo[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={modo === m}
                    onClick={() => { setModo(m); setFormError('') }}
                    className={
                      'flex-1 py-2.5 text-[13px] font-bold transition-colors ' +
                      (modo === m ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:bg-primary/5')
                    }
                  >
                    {m === 'entrar' ? 'Entrar' : 'Crear cuenta'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <Input
                  label="Correo electrónico"
                  type="email"
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  error={errors.email?.message}
                  {...register('email')}
                />

                <PasswordInput
                  label="Contraseña"
                  // current-password al entrar y new-password al crear: es lo
                  // que hace que un gestor guarde o rellene lo correcto.
                  autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                  placeholder={modo === 'crear' ? 'Al menos 10 caracteres' : '••••••••••'}
                  showStrength={modo === 'crear'}
                  strengthValue={password ?? ''}
                  error={errors.password?.message}
                  {...register('password')}
                />

                {modo === 'entrar' && (
                  <Link
                    to="/auth/forgot"
                    className="-mt-1 self-end text-xs font-semibold text-primary transition-colors hover:text-primary-deep"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                )}

                {formError && <p className="text-xs text-debt">{formError}</p>}

                <Button type="submit" loading={isSubmitting}>
                  {modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
                </Button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold text-text-tertiary">o</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleGoogle()}
                  disabled={googleLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-elevated text-sm font-semibold text-text transition-all hover:border-border-strong active:scale-[0.99] disabled:opacity-60"
                >
                  <GoogleIcon />
                  {googleLoading ? 'Conectando…' : 'Continuar con Google'}
                </button>

                <button
                  type="button"
                  onClick={() => void enviarEnlace()}
                  disabled={magicLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-elevated text-sm font-semibold text-text transition-all hover:border-border-strong active:scale-[0.99] disabled:opacity-60"
                >
                  <IconMailForward size={18} />
                  {magicLoading ? 'Enviando…' : 'Enviarme un enlace de acceso'}
                </button>
              </div>

              {showIosNote && (
                <p className="mt-3 rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[11.5px] leading-snug text-text-secondary">
                  En iPhone el enlace de acceso abre en Safari, fuera de la app
                  instalada. Entra con tu contraseña para quedarte dentro.
                </p>
              )}
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Tus datos viajan cifrados y sólo tú puedes verlos.
        </p>
      </div>
    </main>
  )
}
