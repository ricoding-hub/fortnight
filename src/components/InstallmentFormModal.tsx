import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { InstallmentFields } from '@/components/add/InstallmentFields'
import { useAccounts } from '@/hooks/useAccounts'
import type { NewInstallment, InstallmentPatch } from '@/hooks/useInstallments'
import type { MovEdc } from '@/lib/estadoDeCuenta'
import type { InstallmentVivo } from '@/lib/msi'
import type { SemillaMeses } from '@/store/uiStore'

interface InstallmentFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: NewInstallment) => Promise<void>
  editingInstallment?: InstallmentVivo
  onUpdate?: (id: string, patch: InstallmentPatch) => Promise<unknown>
  /** Un gasto que se convierte a meses (o una compra ya escrita). */
  semilla?: SemillaMeses
  /** Movimientos recientes de las tarjetas, para el aviso de compra repetida. */
  movimientos?: MovEdc[]
}

/**
 * Crear o editar un plan a meses desde Cuentas.
 *
 * Los campos viven en `InstallmentFields`, que comparte con la hoja «Agregar».
 * Antes este archivo tenía 394 líneas con todo adentro, y el «Agregar» global no
 * podía registrar una compra a meses sin duplicarlas.
 */
export function InstallmentFormModal({
  open,
  onClose,
  onSubmit,
  editingInstallment,
  onUpdate,
  semilla,
  movimientos,
}: InstallmentFormModalProps) {
  const { data: accounts } = useAccounts()
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingInstallment ? 'Editar plan a meses' : semilla?.txId ? 'Convertir a meses' : 'Nueva compra a meses'}
      footer={<div ref={setFooterEl} />}
    >
      {/* El Modal desmonta su contenido al cerrarse, así que el formulario nace
          limpio en cada apertura; la `key` cubre el cambio de un plan a otro. */}
      <InstallmentFields
        key={editingInstallment?.id ?? semilla?.txId ?? 'nuevo'}
        formId="plan-meses-form"
        accounts={accounts}
        footerTarget={footerEl}
        editingInstallment={editingInstallment}
        onSubmit={onSubmit}
        onUpdate={onUpdate}
        onDone={onClose}
        semilla={semilla}
        movimientos={movimientos}
      />
    </Modal>
  )
}
