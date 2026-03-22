import { useEffect, useRef } from 'react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  scanning: boolean
}

export default function BarcodeScanner({ onScan, onClose, scanning }: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scanning || !containerRef.current) return

    let cancelled = false

    ;(async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return

      const scanner = new Html5Qrcode('barcode-reader')
      scannerRef.current = scanner

      scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0,
      },
      (decodedText) => {
        // Only accept numeric barcodes (EAN/UPC)
        if (/^\d{8,14}$/.test(decodedText)) {
          scanner.stop().catch(() => {})
          onScan(decodedText)
        }
      },
      () => { /* ignore scan failures */ }
    ).catch((err: unknown) => {
      console.warn('Barcode scanner error:', err)
    })
    })()

    return () => {
      cancelled = true
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [scanning, onScan])

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
        {/* Viewfinder overlay */}
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
      </div>

      <div className="text-white/40 text-xs mt-4">
        EAN-13 · EAN-8 · UPC-A · UPC-E
      </div>
    </div>
  )
}
