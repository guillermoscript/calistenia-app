import { useEffect, useRef, useState } from 'react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  scanning: boolean
}

export default function BarcodeScanner({ onScan, onClose, scanning }: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const stoppedRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Lock body scroll while scanner is open
  useEffect(() => {
    if (!scanning) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [scanning])

  useEffect(() => {
    if (!scanning || !containerRef.current) return

    let cancelled = false
    stoppedRef.current = false
    setCameraError(null)

    ;(async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return

      const scanner = new Html5Qrcode('barcode-reader')
      scannerRef.current = scanner

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Only accept numeric barcodes (EAN/UPC)
            if (!/^\d{8,14}$/.test(decodedText)) return
            if (stoppedRef.current) return
            stoppedRef.current = true

            scanner.stop().then(() => {
              try { scanner.clear() } catch {}
              onScanRef.current(decodedText)
            }).catch(() => {
              try { scanner.clear() } catch {}
              onScanRef.current(decodedText)
            })
          },
          () => { /* ignore scan failures */ }
        )
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setCameraError('Permiso de cámara denegado. Actívalo en los ajustes del navegador.')
        } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound') || msg.includes('Requested device not found')) {
          setCameraError('No se encontró ninguna cámara en este dispositivo.')
        } else {
          setCameraError('No se pudo iniciar la cámara. Intenta cerrar otras apps que la usen.')
        }
      }
    })()

    return () => {
      cancelled = true
      if (!stoppedRef.current && scannerRef.current) {
        stoppedRef.current = true
        scannerRef.current.stop().then(() => {
          try { scannerRef.current?.clear() } catch {}
        }).catch(() => {})
      }
      scannerRef.current = null
    }
  }, [scanning])

  if (!scanning) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 size-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        aria-label="Cerrar escáner"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Scanner label */}
      <div className="text-white/70 text-sm font-mono tracking-widest mb-4 uppercase">
        Apunta al código de barras
      </div>

      {/* Scanner viewport */}
      <div className="relative w-[300px] h-[300px] rounded-2xl overflow-hidden">
        <div id="barcode-reader" ref={containerRef} className="w-full h-full" />

        {/* Camera error state */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <svg className="size-10 text-red-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
            </svg>
            <p className="text-sm text-white/80">{cameraError}</p>
            <button
              onClick={onClose}
              className="mt-1 px-4 py-2 rounded-lg bg-white/10 text-sm text-white hover:bg-white/20 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Viewfinder overlay */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[150px] border-2 border-lime-400/60 rounded-lg">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-lime-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-lime-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-lime-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-lime-400 rounded-br-lg" />
            </div>
            {/* Scanning line animation */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[1px] bg-lime-400/80 animate-pulse" />
          </div>
        )}
      </div>

      <div className="text-white/40 text-xs mt-4">
        EAN-13 · EAN-8 · UPC-A · UPC-E
      </div>
    </div>
  )
}
