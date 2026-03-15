import { useState, useEffect } from 'react'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] transition-transform duration-300 ${
        isOffline ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="bg-amber-500/10 border-b border-amber-500 text-amber-400 text-center text-sm py-1.5 px-4">
        Sin conexion — los datos se guardan localmente
      </div>
    </div>
  )
}
