import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/BrandLogo'
import { SUBSCRIPTION_BRANDS, BRANDS, type Brand } from '@/lib/brands'
import { useToast } from '@/hooks/useToast'
import { useAccounts } from '@/hooks/useAccounts'
import type { Subscription, NewSubscription, SubscriptionFrequency } from '@/types'

const isDay = (v: string) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 }
const isMoney = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0

const schema = z.object({
  name:       z.string().trim().min(1, 'Escribe un nombre'),
  amount:     z.string().refine(isMoney, 'Monto inválido'),
  frequency:  z.enum(['mensual', 'trimestral', 'anual']),
  charge_day: z.string().refine(isDay, 'Día entre 1 y 31'),
  account_id: z.string().optional(),
  notes:      z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export type SubFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; sub: Subscription }

interface Props {
  mode: SubFormMode
  onClose: () => void
  onCreate: (sub: NewSubscription) => Promise<void>
  onUpdate: (id: string, sub: Partial<NewSubscription>) => Promise<void>
}

export function SubscriptionFormModal({ mode, onClose, onCreate, onUpdate }: Props) {
  const toast = useToast()
  const { data: accounts } = useAccounts()
  const isCreate = mode.kind === 'create'

  const existing = mode.kind === 'edit' ? mode.sub : null
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(
    existing?.brand_id ? (BRANDS.find((b) => b.id === existing.brand_id) ?? null) : null
  )
  const [freq, setFreq] = useState<SubscriptionFrequency>(existing?.frequency ?? 'mensual')
  const [search, setSearch] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       existing?.name ?? '',
      amount:     existing?.amount != null ? String(existing.amount) : '',
      frequency:  existing?.frequency ?? 'mensual',
      charge_day: existing?.charge_day != null ? String(existing.charge_day) : '',
      account_id: existing?.account_id ?? '',
      notes:      existing?.notes ?? '',
    },
  })

  function pickBrand(b: Brand) {
    setSelectedBrand(b)
    setValue('name', b.name, { shouldValidate: true })
  }

  async function onSubmit(values: FormValues) {
    const payload: NewSubscription = {
      name:       values.name.trim(),
      amount:     Number(values.amount),
      frequency:  freq,
      charge_day: Number(values.charge_day),
      account_id: values.account_id || null,
      brand_id:   selectedBrand?.id ?? null,
      color:      selectedBrand?.color ?? null,
      category_id: null,
      notes:      values.notes?.trim() || null,
      active:     true,
    }
    try {
      if (isCreate) {
        await onCreate(payload)
        toast.success('Suscripción guardada', payload.name)
      } else {
        await onUpdate(existing!.id, payload)
        toast.success('Suscripción actualizada', payload.name)
      }
      onClose()
    } catch {
      toast.error('Error al guardar', 'Intenta de nuevo')
    }
  }

  const filtered = search
    ? SUBSCRIPTION_BRANDS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : SUBSCRIPTION_BRANDS

  const FREQS: { value: SubscriptionFrequency; label: string }[] = [
    { value: 'mensual',     label: 'Mensual' },
    { value: 'trimestral',  label: 'Trimestral' },
    { value: 'anual',       label: 'Anual' },
  ]

  return (
    <Modal open title={isCreate ? 'Nueva suscripción' : 'Editar suscripción'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">

        {/* Brand picker */}
        <div>
          <p className="mb-2 text-[12px] font-semibold text-text-secondary">Servicio</p>
          <input
            type="text"
            placeholder="Buscar servicio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((b) => {
              const sel = selectedBrand?.id === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pickBrand(b)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-bold transition-all"
                  style={
                    sel
                      ? { background: b.color, color: '#fff', boxShadow: `0 4px 10px ${b.color}55` }
                      : { background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }
                  }
                >
                  <BrandLogo brandId={b.id} name={b.name} size={16} />
                  {b.name}
                </button>
              )
            })}
          </div>
        </div>

        <Input
          label="Nombre"
          placeholder="Netflix, Gimnasio…"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Monto"
          inputMode="decimal"
          placeholder="0.00"
          error={errors.amount?.message}
          {...register('amount')}
        />

        {/* Frequency */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Frecuencia</p>
          <div className="grid grid-cols-3 gap-1">
            {FREQS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setFreq(value); setValue('frequency', value) }}
                className={
                  'rounded-xl py-2.5 text-[12px] font-bold transition-all ' +
                  (freq === value
                    ? 'bg-primary text-white shadow-[0_4px_10px_rgba(99,102,241,0.3)]'
                    : 'bg-bg-secondary text-text-secondary')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Día de cobro"
          inputMode="numeric"
          placeholder="1–31"
          error={errors.charge_day?.message}
          {...register('charge_day')}
        />

        {/* Account selector */}
        {accounts.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Cuenta de cargo (opcional)</p>
            <select
              {...register('account_id')}
              className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Sin cuenta específica</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isCreate ? 'Guardar suscripción' : 'Guardar cambios'}
        </Button>
      </form>
    </Modal>
  )
}
