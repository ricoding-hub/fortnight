import { useCallback, useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { IconZoomIn } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cropToBlob } from '@/lib/image'

interface ImageCropModalProps {
  open: boolean
  /** Object URL / data URL of the picked image. */
  imageSrc: string | null
  title?: string
  onCancel: () => void
  /** Receives the square cropped blob (WebP). */
  onCropped: (blob: Blob) => Promise<void> | void
}

/**
 * Square photo cropper (react-easy-crop): drag to reposition, slider or pinch
 * to zoom. Used before every avatar / group-photo upload so the stored image
 * is framed by the user, not blindly center-cropped by CSS.
 */
export function ImageCropModal({ open, imageSrc, title = 'Recortar foto', onCancel, onCropped }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPx, setAreaPx] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setAreaPx(null)
      setSaving(false)
    }
  }, [open, imageSrc])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setAreaPx(areaPixels)
  }, [])

  async function handleSave() {
    if (!imageSrc || !areaPx) return
    setSaving(true)
    try {
      const blob = await cropToBlob(imageSrc, areaPx)
      await onCropped(blob)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="flex flex-col gap-4">
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-[#1A1F36]">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <IconZoomIn size={18} className="shrink-0 text-text-tertiary" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-primary-soft accent-primary"
          />
        </div>

        <Button onClick={() => void handleSave()} loading={saving} disabled={!areaPx}>
          Guardar foto
        </Button>
      </div>
    </Modal>
  )
}
