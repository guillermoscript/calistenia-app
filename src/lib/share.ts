/**
 * Share an image blob via Web Share API with proper canShare check,
 * falling back to download if file sharing is not supported.
 */
export async function shareImage(blob: Blob, filename: string, title?: string, text?: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })

  // Check if the browser supports sharing files specifically
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Fallback: download the image
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Convert a canvas to blob (promisified).
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

/** Cached logo for share cards */
let _logoCache: HTMLImageElement | null = null

/**
 * Load the app logo image for use in share card canvases.
 * Caches after first load.
 */
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (_logoCache) return Promise.resolve(_logoCache)
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { _logoCache = img; resolve(img) }
    img.onerror = () => resolve(null)
    img.src = '/logo.png'
  })
}
