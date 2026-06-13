'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { todayStrInTz } from '@calistenia/core/lib/dateUtils'
import { TodayWidget } from './TodayWidget'
import { CardioWidget } from './CardioWidget'
import { NutritionWidget } from './NutritionWidget'
import { NutritionRingWidget } from './NutritionRingWidget'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from '../lib/widget-snapshot'
import { CARDIO_WIDGET_SNAPSHOT_KEY, type CardioWidgetSnapshot } from '../lib/cardio-widget-snapshot'
import { NUTRITION_WIDGET_SNAPSHOT_KEY, rolloverSnapshot, type NutritionWidgetSnapshot } from '../lib/nutrition-widget-snapshot'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Hoy" en la tz indicada (la que usó el escritor del snapshot). El proceso
 * headless del widget no ejecuta setTimezone(), así que su reloj local puede
 * estar en otra tz que el proceso app → mismatch de fecha → widget "stale"
 * permanente. Recalcular en la tz del snapshot elimina ese desfase.
 */
function todayInTz(tz: string | undefined): string {
  return tz ? todayStrInTz(tz) : localToday()
}

async function readSnapshot<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      if (props.widgetInfo.widgetName === 'CardioWidget') {
        const snapshot = await readSnapshot<CardioWidgetSnapshot>(CARDIO_WIDGET_SNAPSHOT_KEY)
        props.renderWidget(<CardioWidget snapshot={snapshot} />)
      } else if (props.widgetInfo.widgetName === 'NutritionWidget') {
        const raw = await readSnapshot<NutritionWidgetSnapshot>(NUTRITION_WIDGET_SNAPSHOT_KEY)
        const today = todayInTz(raw?.tz)
        props.renderWidget(<NutritionWidget snapshot={rolloverSnapshot(raw, today)} today={today} />)
      } else if (props.widgetInfo.widgetName === 'NutritionRingWidget') {
        const raw = await readSnapshot<NutritionWidgetSnapshot>(NUTRITION_WIDGET_SNAPSHOT_KEY)
        const today = todayInTz(raw?.tz)
        props.renderWidget(<NutritionRingWidget snapshot={rolloverSnapshot(raw, today)} today={today} />)
      } else {
        const snapshot = await readSnapshot<WidgetSnapshot>(WIDGET_SNAPSHOT_KEY)
        props.renderWidget(<TodayWidget snapshot={snapshot} today={todayInTz(snapshot?.tz)} />)
      }
      break
    default:
      break
  }
}
