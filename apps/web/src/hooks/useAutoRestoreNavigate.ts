import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Lleva a `path` la primera vez que `isActive` se pone a true, para reanudar
 * una sesión persistida (issue #488).
 *
 * Sustituye a `SessionRestoreNavigator` y `CircuitRestoreNavigator`, que eran
 * copia-pega el uno del otro salvo por un detalle que no era cosmético: el de
 * circuito declaraba `[]` como dependencias, así que solo evaluaba el redirect
 * al montar y **no navegaba si la sesión de circuito se activaba después**. El
 * de sesión sí dependía de `isActive`. Aquí solo hay una implementación, con
 * la dependencia correcta.
 *
 * `isActive` puede llegar tarde y de forma asíncrona (el servidor devuelve la
 * sesión al reanudar entre dispositivos), de ahí que no valga con mirarlo solo
 * en el montaje. El `ref` garantiza que la redirección ocurre una sola vez por
 * vida del componente: si el usuario sale de la pantalla a propósito, no se le
 * vuelve a arrastrar a ella.
 */
export function useAutoRestoreNavigate(isActive: boolean, path: string): void {
  const navigate = useNavigate()
  const location = useLocation()
  const hasNavigated = useRef(false)

  useEffect(() => {
    if (isActive && location.pathname !== path && !hasNavigated.current) {
      hasNavigated.current = true
      navigate(path, { replace: true })
    }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps
}
