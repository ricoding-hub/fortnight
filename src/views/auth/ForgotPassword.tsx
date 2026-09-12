import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconArrowLeft, IconMailForward } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { authErrorMessage } from '@/lib/authErrors'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

const esquema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo').email('Ese correo no parece válido'),
})
type Valores = z.infer<typeof esquema>

/**
 * Solicitud de recuperación.
 *
 * Responde siempre lo mismo, exista la cuenta o no. Decir "no hay ninguna
 * cuenta con ese correo" convierte esta pantalla en un detector de usuarios
 * registrados, que es justo lo que quiere quien va a probar credenciales.
 * Incluso un fallo real se muestra como éxito, salvo los de conexión, que el
 * usuario sí puede resolver.
 */
export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [enviado, setEnviado] = useState(false)
  const [formError, setFormError] = useState('')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { email: '' } })

  // useWatch en vez de watch(): watch() devuelve una función nueva en
  // cada render y el compilador de React se salta el componente entero.
  const email = useWatch({ control, name: 'email' })

  async function onSubmit(v: Valores) {
    setFormError('')
    try {
      await requestPasswordReset(v.email)
    } catch (err) {
      // Sólo los errores que el usuario puede resolver se muestran; el resto
      // se traga a propósito para no filtrar qué correos existen.
      const msg = authErrorMessage(err)
      if (/Sin conexión|tardó demasiado|Demasiados/.test(msg)) {
        setFormError(msg)
        return
      }
    }
    setEnviado(true)
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden gradient-mesh px-6 py-10">
      <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative w-full max-w-sm animate-[scale-in_400ms_cubic-bezier(0.34,1.56,0.64,1)]">
        <header className="mb-6 text-center">
          <h1 className="font-display text-[26px] font-extrabold text-text">Recupera tu acceso</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Te mandamos un enlace para elegir una contraseña nueva.
          </p>
        </header>

        <Card variant="glass" className="shadow-elevated">
          {enviado ? (
            <div className="animate-[scale-in_300ms_ease-out] py-2 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-asset/12">
                <IconMailForward size={22} className="text-asset" />
              </div>
              <p className="text-sm font-semibold text-asset">Revisa tu correo</p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                Si hay una cuenta con <strong className="text-text">{email}</strong>, ahí
                está el enlace. Vence en una hora.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tucorreo@ejemplo.com"
                error={errors.email?.message}
                {...register('email')}
              />
              {formError && <p className="text-xs text-debt">{formError}</p>}
              <Button type="submit" loading={isSubmitting}>
                Enviar enlace
              </Button>
            </form>
          )}
        </Card>

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
