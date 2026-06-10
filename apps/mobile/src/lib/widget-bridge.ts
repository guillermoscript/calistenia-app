/**
 * Escribe el snapshot para los widgets y fuerza su refresh.
 * iOS: App Group UserDefaults (módulo nativo). Android: AsyncStorage, que el
 * widget task handler lee en headless JS. Web/Expo Go: no-op.
 * Nunca lanza: un fallo de widget no puede romper la app.
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from './widget-snapshot'
import { getWidgetBridge } from '../../modules/widget-bridge'

let lastJson: string | null = null

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  try {
    const json = JSON.stringify(snapshot)
    if (json === lastJson) return // evita refresh redundante por re-renders
    lastJson = json

    if (Platform.OS === 'ios') {
      getWidgetBridge()?.setSnapshot(json)
    } else if (Platform.OS === 'android') {
      // En este task solo persistimos; el refresh del widget (requestWidgetUpdate)
      // se añade en el Task 5, que es quien crea TodayWidget.
      await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, json)
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}
