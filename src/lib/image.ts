/**
 * Downscale an image to `maxPx` on its longest side and re-encode as WebP.
 * Used for avatar and group-photo uploads — turns any large source into a
 * small (~10-30 KB) blob so storage never rejects it for size.
 * Accepts a File or a Blob (e.g. the cropped output of `cropToBlob`).
 */
export async function resizeImage(file: Blob, maxPx = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/webp',
        0.85,
      )
    }
    img.onerror = reject
    img.src = url
  })
}

/** Pixel rectangle to crop out of the source image (react-easy-crop's `croppedAreaPixels`). */
export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Crop `imageSrc` (an object URL or data URL) to the given pixel rectangle and
 * return a square WebP blob. Paired with react-easy-crop: the modal reports the
 * crop area, this renders it to a canvas. Output is fed to `resizeImage` before
 * upload, so we keep quality high (0.92) and let resize do the downscale.
 */
export async function cropToBlob(imageSrc: string, area: CropArea): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = Math.max(1, Math.round(Math.min(area.width, area.height)))
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.drawImage(
        img,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        size,
        size,
      )
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/webp',
        0.92,
      )
    }
    img.onerror = reject
    img.src = imageSrc
  })
}
