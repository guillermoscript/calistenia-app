/**
 * Compatibilidad (#859): el historial era la pestaña `/history` y ahora es
 * Progreso (`/progress`). Los push ya enviados, los App Links y las versiones
 * instaladas siguen abriendo `/history`; esto los lleva a su sitio.
 *
 * Programas, Ejercicios, Calendario y Perfil no necesitan nada parecido:
 * pasaron de `(tabs)/` a la pila con el mismo nombre de fichero, y el grupo no
 * sale en la URL, así que `/programs`, `/library`, `/calendar` y `/profile`
 * siguen resolviendo.
 */
import { Redirect } from 'expo-router'

export default function HistoryRedirect() {
  return <Redirect href="/progress" />
}
