import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
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
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-[13px] leading-relaxed text-text-secondary">{message}</p>
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
