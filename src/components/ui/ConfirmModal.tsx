import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: ReactNode
  /** Opciones extra entre el mensaje y los botones (p. ej. «quitar también el cargo»). */
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Continuar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="mb-5 flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-text-secondary">{message}</p>
        {children}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={onClose}
          className="flex-1"
        >
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className="flex-1"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
