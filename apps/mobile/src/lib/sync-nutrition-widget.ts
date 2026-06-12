/**
 * Sincroniza los widgets de nutrición: escribe el snapshot en AsyncStorage
 * y fuerza el refresh de NutritionWidget + NutritionRingWidget.
 * Best-effort: nunca lanza (un fallo de widget no rompe la app).
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import i18n from 'i18next'
import { todayStr, getTimezone } from '@calistenia/core/lib/dateUtils'
import { NUTRITION_WIDGET_SNAPSHOT_KEY, type NutritionWidgetSnapshot } from './nutrition-widget-snapshot'
import type { DailyTotals, NutritionGoal } from '@calistenia/core/types'

let lastJson: string | null = null

export async function syncNutritionWidget(totals: DailyTotals, goals: NutritionGoal | null): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    const snapshot: NutritionWidgetSnapshot = {
      date: todayStr(),
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      calorieGoal: goals?.dailyCalories ?? 0,
      proteinGoal: goals?.dailyProtein ?? 0,
      carbsGoal: goals?.dailyCarbs ?? 0,
      fatGoal: goals?.dailyFat ?? 0,
      lang: i18n.language?.startsWith('en') ? 'en' : 'es',
      tz: getTimezone(),
    }

    const json = JSON.stringify(snapshot)
    if (json === lastJson) return
    lastJson = json

    await AsyncStorage.setItem(NUTRITION_WIDGET_SNAPSHOT_KEY, json)
    const { requestWidgetUpdate } = await import('react-native-android-widget')
    const React = await import('react')
    const { NutritionWidget } = await import('../widgets/NutritionWidget')
    const { NutritionRingWidget } = await import('../widgets/NutritionRingWidget')

    await requestWidgetUpdate({
      widgetName: 'NutritionWidget',
      renderWidget: () => React.createElement(NutritionWidget, { snapshot, today: todayStr() }),
      widgetNotFound: () => {},
    })
    await requestWidgetUpdate({
      widgetName: 'NutritionRingWidget',
      renderWidget: () => React.createElement(NutritionRingWidget, { snapshot, today: todayStr() }),
      widgetNotFound: () => {},
    })
  } catch (e) {
    Sentry.captureException(e)
  }
}
