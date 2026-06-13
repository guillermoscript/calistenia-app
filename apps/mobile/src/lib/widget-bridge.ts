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
      await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, json)
      const { requestWidgetUpdate } = await import('react-native-android-widget')
      const React = await import('react')
      const { TodayWidget } = await import('../widgets/TodayWidget')
      await requestWidgetUpdate({
        widgetName: 'TodayWidget',
        renderWidget: () => React.createElement(TodayWidget, { snapshot, today: snapshot.date }),
        widgetNotFound: () => {},
      })
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}
