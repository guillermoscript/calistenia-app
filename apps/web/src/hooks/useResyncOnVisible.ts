/**
 * Vuelve a mirar el reloj al recuperar la pestaña.
 *
 * Las cuentas atrás de core ya cuentan contra un instante de fin, así que volver de
 * segundo plano nunca las descuadra — pero el navegador estrangula el intervalo, así
 * que el número mostrado puede tardar hasta un segundo en ponerse al día. Esto lo
 * corrige al instante, que es lo que hacían a mano `RestTimer` y `RestScreen`.
 */
import { useEffect } from 'react'

export function useResyncOnVisible(resync: () => void): void {
  useEffect(() => {
    const onVisible = (): void => {
      if (!document.hidden) resync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [resync])
}
