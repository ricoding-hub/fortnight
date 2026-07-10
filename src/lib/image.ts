/**
 * Downscale an image to `maxPx` on its longest side and re-encode as WebP.
 * Used for avatar and group-photo uploads — turns any large source into a
 * small (~10-30 KB) blob so storage never rejects it for size.
 */
export async function resizeImage(file: File, maxPx = 400): Promise<Blob> {
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
