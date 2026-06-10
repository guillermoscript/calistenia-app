'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { TodayWidget } from './TodayWidget'
import { CardioWidget } from './CardioWidget'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from '../lib/widget-snapshot'
import { CARDIO_WIDGET_SNAPSHOT_KEY, type CardioWidgetSnapshot } from '../lib/cardio-widget-snapshot'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
      } else {
        const snapshot = await readSnapshot<WidgetSnapshot>(WIDGET_SNAPSHOT_KEY)
        props.renderWidget(<TodayWidget snapshot={snapshot} today={localToday()} />)
      }
      break
    default:
      break
  }
}
