import {
  IconBuildingBank,
  IconPencil,
  IconChevronRight,
} from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { ComingSoonBadge } from '@/components/ComingSoonBadge'
import { BANK_LINKING_ENABLED } from '@/lib/features'
import type { AccountType } from '@/types'

interface AddAccountChooserModalProps {
  open: boolean
  type: AccountType
  onClose: () => void
  onPickBank: () => void
  onPickManual: () => void
}

/**
 * Two-way chooser shown when the user taps "Agregar cuenta". The bank path
 * opens the Syncfy widget (type-agnostic — the bank decides which accounts
 * land); the manual path opens the regular form pre-typed by section.
 */
export function AddAccountChooserModal({
  open,
  type,
  onClose,
  onPickBank,
  onPickManual,
}: AddAccountChooserModalProps) {
  const typeLabel = type === 'credit' ? 'crédito' : 'débito'
  return (
    <Modal open={open} onClose={onClose} title="Agregar cuenta">
      <div className="flex flex-col gap-3">
        <p className="-mt-1 text-[12.5px] text-text-secondary">
          ¿Cómo quieres agregar tu cuenta de {typeLabel}?
        </p>

        {BANK_LINKING_ENABLED ? (
          <button
            type="button"
            onClick={onPickBank}
            className="group flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-left transition-all hover:border-primary/40 hover:bg-primary/8 active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
              <IconBuildingBank size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-text">Vincular banco</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                Importa cuentas y movimientos automáticamente. Recomendado para
                bancos mexicanos compatibles.
              </span>
            </span>
            <IconChevronRight
              size={18}
              className="shrink-0 text-primary/60 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        ) : (
          // Locked, not hidden: the feature is coming and worth wanting, but
          // there is no production infrastructure behind it yet.
          <div
            aria-disabled="true"
            className="flex items-center gap-3 rounded-2xl border border-dashed border-lavender/40 bg-lavender-soft/40 p-3.5"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavender text-white shadow-[0_4px_12px_rgba(155,123,255,0.3)]">
              <IconBuildingBank size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-bold text-text">Vincular banco</span>
                <ComingSoonBadge />
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                Estamos afinando la conexión con bancos mexicanos para importar
                tus cuentas y movimientos solos. Mientras tanto, agrégala manual:
                toma menos de 10 segundos.
              </span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onPickManual}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-bg-secondary/40 p-3.5 text-left transition-all hover:border-border/80 hover:bg-bg-secondary/60 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-secondary shadow-sm">
            <IconPencil size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-text">
              Agregar manual
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
              Captura el saldo y los detalles tú mismo. Edita en segundos
              cuando tu balance cambie.
            </span>
          </span>
          <IconChevronRight
            size={18}
            className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </div>
    </Modal>
  )
}
