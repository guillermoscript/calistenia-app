import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { TodayWidget } from './TodayWidget'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from '../lib/widget-snapshot'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  let snapshot: WidgetSnapshot | null = null
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY)
    snapshot = raw ? (JSON.parse(raw) as WidgetSnapshot) : null
  } catch { /* snapshot null → estado neutro */ }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<TodayWidget snapshot={snapshot} today={localToday()} />)
      break
    default:
      break
  }
}
