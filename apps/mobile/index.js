// Entry custom: init-core DEBE evaluarse antes que cualquier módulo de rutas.
// expo-router carga todos los archivos de src/app via require.context y
// "(tabs)/_layout" ordena antes que "_layout", así que el import de init-core
// en el _layout raíz no basta.
import './src/lib/instrument'
import './src/lib/init-core'
import 'expo-router/entry'

// Widget Android: el task handler corre también en headless JS (sin UI).
import { Platform } from 'react-native'
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget')
    const { widgetTaskHandler } = require('./src/widgets/widget-task-handler')
    registerWidgetTaskHandler(widgetTaskHandler)

    const notifee = require('@notifee/react-native').default
    const { EventType } = require('@notifee/react-native')
    // El service vive mientras la notificación ongoing exista
    notifee.registerForegroundService(() => new Promise(() => {}))

    // Botones de la notificación de sesión → avanzar serie / saltar descanso
    const { dispatchLiveSessionAction } = require('./src/lib/live-session')
    const onNotifeeEvent = ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        dispatchLiveSessionAction(detail.pressAction.id)
      }
    }
    notifee.onForegroundEvent(onNotifeeEvent)
    notifee.onBackgroundEvent(async (event) => onNotifeeEvent(event))
  } catch { /* Expo Go: lib nativa ausente */ }
}
