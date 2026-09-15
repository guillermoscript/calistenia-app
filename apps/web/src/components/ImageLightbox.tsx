import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

interface ImageLightboxProps {
  /** `null` cierra el visor. */
  src: string | null
  alt: string
  onClose: () => void
}

/**
 * Visor de imagen a pantalla completa (portada de programa, media de ejercicio).
 *
 * La imagen va con `object-contain` para verse ENTERA: el recorte ya lo hace la
 * miniatura desde la que se abre. Cierra con Escape, clic fuera o la ✕ del
 * `Dialog`.
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-auto max-w-[96vw] border-border bg-background p-2 sm:p-3"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[88vh] w-auto max-w-full rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
