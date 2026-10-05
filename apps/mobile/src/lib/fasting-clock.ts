/** Adaptador nativo del reloj: no mantener intervalos mientras la app está oculta. */
export interface FastingClockAppState {
  currentState: string | null
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void }
}

export function subscribeFastingClock(appState: FastingClockAppState, onNow: (now: number) => void): () => void {
  let timer: ReturnType<typeof setInterval> | null = null
  let disposed = false
  const stop = () => {
    if (timer !== null) clearInterval(timer)
    timer = null
  }
  const update = () => {
    if (!disposed) onNow(Date.now())
  }
  const onStateChange = (state: string) => {
    if (disposed) return
    if (state !== 'active') { stop(); return }
    // Recuperar el tiempo real, incluso tras horas en segundo plano.
    update()
    if (timer === null) timer = setInterval(update, 1000)
  }
  const subscription = appState.addEventListener('change', onStateChange)
  if (appState.currentState !== null) onStateChange(appState.currentState)
  return () => {
    if (disposed) return
    disposed = true
    stop()
    subscription.remove()
  }
}
