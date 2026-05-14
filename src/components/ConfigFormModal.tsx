import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { UserConfig } from '@/types'
import type { ConfigPatch } from '@/hooks/useConfig'

interface ConfigFormModalProps {
  config: UserConfig | null
  onClose: () => void
  onSave: (patch: ConfigPatch) => Promise<void>
}

const money = z
  .string()
  .refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0,
    'Monto inválido',
  )

const configSchema = z.object({
  catorcena: money,
  vales: money,
  fixed_monthly: money,
  variable_monthly: money,
})

type ConfigFormValues = z.infer<typeof configSchema>

const asString = (n: number | null | undefined) =>
  n != null ? String(n) : ''

/** Edits the projection assumptions (catorcena, vales, monthly expenses). */
export function ConfigFormModal({
  config,
  onClose,
  onSave,
}: ConfigFormModalProps) {
  const [submitError, setSubmitError] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      catorcena: asString(config?.catorcena),
      vales: asString(config?.vales),
      fixed_monthly: asString(config?.fixed_monthly),
      variable_monthly: asString(config?.variable_monthly),
    },
  })

  async function onSubmit(values: ConfigFormValues) {
    setSubmitError(false)
    try {
      await onSave({
        catorcena: Number(values.catorcena),
        vales: Number(values.vales),
        fixed_monthly: Number(values.fixed_monthly),
        variable_monthly: Number(values.variable_monthly),
      })
      onClose()
    } catch {
      setSubmitError(true)
    }
  }

  return (
    <Modal open title="Editar supuestos" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <Input
          label="Catorcena (pago neto)"
          inputMode="decimal"
          placeholder="0"
          autoFocus
          error={errors.catorcena?.message}
          {...register('catorcena')}
        />
        <Input
          label="Vales por catorcena"
          inputMode="decimal"
          placeholder="0"
          error={errors.vales?.message}
          {...register('vales')}
        />
        <Input
          label="Gastos fijos mensuales"
          inputMode="decimal"
          placeholder="0"
          error={errors.fixed_monthly?.message}
          {...register('fixed_monthly')}
        />
        <Input
          label="Gastos variables mensuales"
          inputMode="decimal"
          placeholder="0"
          error={errors.variable_monthly?.message}
          {...register('variable_monthly')}
        />

        {submitError && (
          <p className="text-xs text-debt">
            No se pudo guardar. Intenta de nuevo.
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-1">
          Guardar supuestos
        </Button>
      </form>
    </Modal>
  )
}
