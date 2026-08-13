import { useRef, type MutableRefObject } from 'react'

/**
 * Una ref que siempre apunta al último valor recibido.
 *
 * Sirve para leer un callback "de ahora" desde dentro de un efecto que no queremos
 * volver a montar cuando ese callback cambia de identidad — el caso típico es un
 * `setInterval` que debe seguir corriendo mientras el `onSkip` del padre se recrea en
 * cada render. Antes cada componente se escribía su propio `ref.current = fn`.
 *
 * Se asigna en render a propósito: en un efecto llegaría tarde para cualquier
 * callback que se dispare antes de que React los ejecute.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
