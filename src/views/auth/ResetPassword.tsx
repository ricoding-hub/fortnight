import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconArrowLeft, IconLockCheck, IconAlertTriangle } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { authErrorMessage } from '@/lib/authErrors'
import { LONGITUD_MINIMA, validarPassword } from '@/lib/password'
import { Button } from '@/components/ui/Button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Card } from '@/components/ui/Card'

const esquema = z
  .object({
    password: z.string().min(1, 'Escribe tu contraseña nueva'),
    confirm: z.string().min(1, 'Repite tu contraseña'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Las dos contraseñas no coinciden',
    path: ['confirm'],
  })
type Valores = z.infer<typeof esquema>

/**
 * Pantalla de contraseña nueva, a la que lleva el enlace del correo.
 *
 * Vive en su propia ruta y no en /auth/callback a propósito: el enlace de
 * recuperación abre una sesión real, y callback manda a Inicio en cuanto la
 * detecta, así que esta pantalla nunca se vería. `isRecovery` distingue esa
 * sesión de un acceso normal.
 */
export function ResetPassword() {
  const { isRecovery, session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState('')

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { password: '', confirm: '' } })

  // useWatch en vez de watch(): watch() devuelve una función nueva en
  // cada render y el compilador de React se salta el componente entero.
  const password = useWatch({ control, name: 'password' })

  async function onSubmit(v: Valores) {
    setFormError('')
    const veredicto = validarPassword(v.password)
    if (!veredicto.ok) {
      setError('password', { message: veredicto.error })
      return
    }
    try {
      await updatePassword(v.password)
      navigate('/', { replace: true })
    } catch (err) {
      setFormError(authErrorMessage(err))
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-bg-secondary">
        <p className="text-sm text-text-secondary">Cargando…</p>
      </main>
    )
  }

  // Sin sesión de recuperación no hay nada que cambiar: el enlace venció, ya se
  // usó, o alguien llegó aquí a mano. Hoy AuthCallback redirige en silencio en
  // este caso; aquí se dice y se ofrece salida.
  const enlaceInvalido = !isRecovery && !session

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden gradient-mesh px-6 py-10">
      <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative w-full max-w-sm animate-[scale-in_400ms_cubic-bezier(0.34,1.56,0.64,1)]">
        {enlaceInvalido ? (
          <Card variant="glass" className="shadow-elevated">
            <div className="py-2 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-peach-soft">
                <IconAlertTriangle size={22} className="text-peach-deep" />
              </div>
              <p className="text-sm font-semibold text-text">Ese enlace ya no sirve</p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                Los enlaces de recuperación vencen en una hora y sólo se pueden
                usar una vez. Pide uno nuevo.
              </p>
              <Link
                to="/auth/forgot"
                className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
              >
                Pedir otro enlace
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <header className="mb-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft">
                <IconLockCheck size={22} className="text-primary-deep" />
              </div>
              <h1 className="font-display text-[26px] font-extrabold text-text">
                Elige tu contraseña nueva
              </h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                Al menos {LONGITUD_MINIMA} caracteres. Una frase que recuerdes
                sirve mejor que algo corto y raro.
              </p>
            </header>

            <Card variant="glass" className="shadow-elevated">
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <PasswordInput
                  label="Contraseña nueva"
                  autoComplete="new-password"
                  showStrength
                  strengthValue={password ?? ''}
                  error={errors.password?.message}
                  {...register('password')}
                />
                <PasswordInput
                  label="Repítela"
                  autoComplete="new-password"
                  error={errors.confirm?.message}
                  {...register('confirm')}
                />
                {formError && <p className="text-xs text-debt">{formError}</p>}
                <Button type="submit" loading={isSubmitting}>
                  Guardar y entrar
                </Button>
                <p className="text-center text-[11px] leading-snug text-text-tertiary">
                  Al cambiarla cerramos la sesión en los demás dispositivos.
                </p>
              </form>
            </Card>
          </>
        )}

        <Link
          to="/login"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
        >
          <IconArrowLeft size={14} /> Volver a entrar
        </Link>
      </div>
    </main>
  )
}
