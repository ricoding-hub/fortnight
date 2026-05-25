import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconBuildingBank, IconCheck } from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { BANK_PRESETS, bankLogoUrl } from '@/lib/banks'
import type { Account, AccountType } from '@/types'
import type { NewAccount, AccountPatch } from '@/hooks/useAccounts'

/**
 * Add a new account (`type` fixed by which section opened the form) or edit
 * an existing one's details. Balance is edited inline on the card, not here.
 */
export type AccountFormMode =
  | { kind: 'create'; type: AccountType }
  | { kind: 'edit'; account: Account }

interface AccountFormModalProps {
  mode: AccountFormMode
  onClose: () => void
  onCreate: (account: NewAccount) => Promise<void>
  onUpdate: (id: string, patch: AccountPatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const isDay = (v: string) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31
}

const isMoney = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0

const isGraceDays = (v: string) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 365
}

// The form holds raw strings; values are coerced to the schema's types on submit.
const accountSchema = z.object({
  name: z.string().trim().min(1, 'Escribe un nombre'),
  balance: z.string().refine(isMoney, 'Monto inválido'),
  credit_limit: z
    .string()
    .refine((v) => v === '' || isMoney(v), 'Monto inválido'),
  cut_day: z.string().refine((v) => v === '' || isDay(v), 'Día entre 1 y 31'),
  payment_due_day: z
    .string()
    .refine((v) => v === '' || isDay(v), 'Día entre 1 y 31'),
  payment_grace_days: z
    .string()
    .refine((v) => v === '' || isGraceDays(v), 'Entre 1 y 365 días'),
})

type AccountFormValues = z.infer<typeof accountSchema>

/** Accent color palette — matches Tailwind tokens used elsewhere in the app. */
const COLOR_SWATCHES: string[] = [
  '#6366F1', // primary indigo
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // rose
  '#F97316', // orange
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6B7194', // slate (default avatar bg)
  '#0F172A', // near-black
]

export function AccountFormModal({
  mode,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: AccountFormModalProps) {
  const toast = useToast()
  const isCreate = mode.kind === 'create'
  const type: AccountType = isCreate ? mode.type : mode.account.type
  const isCredit = type === 'credit'
  const isSynced = mode.kind === 'edit' && mode.account.source === 'syncfy'
  const [submitError, setSubmitError] = useState(false)

  const [color, setColor] = useState<string | null>(
    mode.kind === 'edit' ? mode.account.color : null,
  )
  const [logoDomain, setLogoDomain] = useState<string | null>(
    mode.kind === 'edit' ? mode.account.logo_domain : null,
  )

  // Due date mode: 'fixed_day' uses payment_due_day; 'grace_days' uses cut_day + payment_grace_days
  const [dueDateMode, setDueDateMode] = useState<'fixed_day' | 'grace_days'>(
    mode.kind === 'edit' && mode.account.payment_grace_days != null ? 'grace_days' : 'fixed_day',
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues:
      mode.kind === 'create'
        ? {
            name: '',
            balance: '',
            credit_limit: '',
            cut_day: '',
            payment_due_day: '',
            payment_grace_days: '',
          }
        : {
            name: mode.account.name,
            balance: String(mode.account.balance),
            credit_limit:
              mode.account.credit_limit != null
                ? String(mode.account.credit_limit)
                : '',
            cut_day:
              mode.account.cut_day != null ? String(mode.account.cut_day) : '',
            payment_due_day:
              mode.account.payment_due_day != null
                ? String(mode.account.payment_due_day)
                : '',
            payment_grace_days:
              mode.account.payment_grace_days != null
                ? String(mode.account.payment_grace_days)
                : '',
          },
  })

  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  async function onSubmit(values: AccountFormValues) {
    setSubmitError(false)
    const creditFields = {
      credit_limit: isCredit ? num(values.credit_limit) : null,
      cut_day: isCredit ? num(values.cut_day) : null,
      payment_due_day: isCredit && dueDateMode === 'fixed_day' ? num(values.payment_due_day) : null,
      payment_grace_days: isCredit && dueDateMode === 'grace_days' ? num(values.payment_grace_days) : null,
    }
    try {
      if (mode.kind === 'create') {
        await onCreate({
          name: values.name.trim(),
          type,
          balance: Number(values.balance),
          color,
          logo_domain: logoDomain,
          ...creditFields,
        })
        toast.success('Cuenta creada', `La cuenta ${values.name.trim()} fue creada`)
      } else {
        await onUpdate(mode.account.id, {
          name: values.name.trim(),
          color,
          logo_domain: logoDomain,
          ...creditFields,
        })
        toast.success('Cuenta actualizada', 'Los cambios han sido guardados')
      }
      onClose()
    } catch {
      setSubmitError(true)
      toast.error('Error al guardar', 'Hubo un problema al guardar la cuenta')
    }
  }

  async function handleDelete() {
    if (mode.kind !== 'edit') return
    if (!window.confirm(`¿Eliminar ${mode.account.name}?`)) return
    setSubmitError(false)
    try {
      await onDelete(mode.account.id)
      toast.success('Cuenta eliminada', `La cuenta ${mode.account.name} fue eliminada`)
      onClose()
    } catch {
      setSubmitError(true)
      toast.error('Error al eliminar', 'Hubo un problema al eliminar la cuenta')
    }
  }

  const title = isCreate
    ? `Nueva cuenta de ${isCredit ? 'crédito' : 'débito'}`
    : 'Editar cuenta'

  return (
    <Modal open title={title} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        {isSynced && mode.kind === 'edit' && mode.account.institution_name && (
          <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3">
            <IconBuildingBank size={16} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-[12px] leading-snug text-text-secondary">
              Esta cuenta se sincroniza con <b>{mode.account.institution_name}</b>.
              Puedes ajustar nombre, color y logo; en la próxima sincronización
              algunos datos del banco prevalecen.
            </p>
          </div>
        )}

        <Input
          label="Nombre"
          placeholder={isCredit ? 'Tarjeta Nu' : 'Cuenta de débito'}
          error={errors.name?.message}
          {...register('name')}
        />

        {isCreate && (
          <Input
            label={isCredit ? 'Deuda actual' : 'Saldo'}
            inputMode="decimal"
            placeholder="0"
            error={errors.balance?.message}
            {...register('balance')}
          />
        )}

        {/* Logo picker */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">
            Logo del banco
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            <button
              type="button"
              onClick={() => setLogoDomain(null)}
              aria-label="Sin logo"
              className={clsx(
                'flex aspect-square items-center justify-center rounded-xl border-2 text-[10px] font-bold transition-all',
                logoDomain === null
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-transparent bg-bg-secondary text-text-tertiary',
              )}
            >
              Ninguno
            </button>
            {BANK_PRESETS.map((bank) => {
              const active = logoDomain === bank.domain
              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => {
                    setLogoDomain(bank.domain)
                    if (!color) setColor(bank.color)
                  }}
                  aria-label={bank.name}
                  title={bank.name}
                  className={clsx(
                    'relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 bg-white transition-all',
                    active
                      ? 'border-primary shadow-[0_2px_8px_rgba(99,102,241,0.2)]'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <img
                    src={bankLogoUrl(bank.domain)}
                    alt={bank.name}
                    className="h-7 w-7 object-contain"
                    loading="lazy"
                  />
                  {active && (
                    <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-white">
                      <IconCheck size={9} stroke={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">
            Color de acento
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_SWATCHES.map((swatch) => {
              const active = color === swatch
              return (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Color ${swatch}`}
                  className={clsx(
                    'h-8 w-8 rounded-full border-2 transition-transform active:scale-95',
                    active ? 'border-text shadow-[0_2px_6px_rgba(0,0,0,0.15)]' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              )
            })}
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-label="Sin color"
              className={clsx(
                'h-8 rounded-full border-2 px-3 text-[11px] font-bold transition-all',
                color === null
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-border text-text-secondary',
              )}
            >
              Default
            </button>
          </div>
        </div>

        {isCredit && (
          <>
            <Input
              label="Límite de crédito"
              inputMode="decimal"
              placeholder="Opcional"
              error={errors.credit_limit?.message}
              {...register('credit_limit')}
            />
            <Input
              label="Día de corte"
              inputMode="numeric"
              placeholder="1–31"
              error={errors.cut_day?.message}
              {...register('cut_day')}
            />

            {/* Due date mode selector */}
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">
                Fecha límite de pago
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['fixed_day', 'grace_days'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDueDateMode(m)}
                    className={
                      'rounded-xl py-2.5 text-[12px] font-bold transition-all ' +
                      (dueDateMode === m
                        ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.3)]'
                        : 'bg-bg-secondary text-text-secondary')
                    }
                  >
                    {m === 'fixed_day' ? 'Día fijo' : 'Días de gracia'}
                  </button>
                ))}
              </div>
            </div>

            {dueDateMode === 'fixed_day' ? (
              <Input
                label="Día del mes (1–31)"
                inputMode="numeric"
                placeholder="Ej: 25"
                error={errors.payment_due_day?.message}
                {...register('payment_due_day')}
              />
            ) : (
              <Input
                label="Días desde el corte"
                inputMode="numeric"
                placeholder="Ej: 60 para Plata Card"
                error={errors.payment_grace_days?.message}
                {...register('payment_grace_days')}
              />
            )}
          </>
        )}

        {submitError && (
          <p className="text-xs text-debt">
            No se pudo guardar. Intenta de nuevo.
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isCreate ? 'Crear cuenta' : 'Guardar cambios'}
        </Button>

        {mode.kind === 'edit' && !isSynced && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="py-2 text-sm font-semibold text-debt"
          >
            Eliminar cuenta
          </button>
        )}
      </form>
    </Modal>
  )
}
