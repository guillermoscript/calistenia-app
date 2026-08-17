import { useEffect } from 'react'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

/**
 * Mantiene la pantalla encendida mientras `active` sea true.
 *
 * Equivalente nativo de `useWakeLock` de la web. Se usa el tag para que dos
 * pantallas que lo pidan a la vez (una sesión de cardio y una carrera) no se
 * desactiven la una a la otra al desmontarse.
 */
export function useKeepAwakeWhile(active: boolean, tag: string) {
  useEffect(() => {
    if (!active) return
    void activateKeepAwakeAsync(tag).catch(() => {})
    return () => { deactivateKeepAwake(tag) }
  }, [active, tag])
}
