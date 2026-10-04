import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { InstallmentFields } from '@/components/add/InstallmentFields'
import { useAccounts } from '@/hooks/useAccounts'
import type { NewInstallment, InstallmentPatch } from '@/hooks/useInstallments'
import type { Installment } from '@/types'

interface InstallmentFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: NewInstallment) => Promise<void>
  editingInstallment?: Installment
  onUpdate?: (id: string, patch: InstallmentPatch) => Promise<void>
}

/**
 * Crear o editar un plan a meses desde Cuentas.
 *
 * Los campos viven en `InstallmentFields`, que comparte con la hoja «Agregar».
 * Antes este archivo tenía 394 líneas con todo adentro, y el «Agregar» global no
 * podía registrar una compra a meses sin duplicarlas.
 */
export function InstallmentFormModal({ open, onClose, onSubmit, editingInstallment, onUpdate }: InstallmentFormModalProps) {
  const { data: accounts } = useAccounts()
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingInstallment ? 'Editar plan a meses' : 'Nueva compra a meses'}
      footer={<div ref={setFooterEl} />}
    >
      {/* El Modal desmonta su contenido al cerrarse, así que el formulario nace
          limpio en cada apertura; la `key` cubre el cambio de un plan a otro. */}
      <InstallmentFields
        key={editingInstallment?.id ?? 'nuevo'}
        formId="plan-meses-form"
        accounts={accounts}
        footerTarget={footerEl}
        editingInstallment={editingInstallment}
        onSubmit={onSubmit}
        onUpdate={onUpdate}
        onDone={onClose}
      />
    </Modal>
  )
}
