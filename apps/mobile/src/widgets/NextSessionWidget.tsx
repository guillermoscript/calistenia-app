'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { ColorProp } from 'react-native-android-widget'
import type { WidgetSnapshot } from '../lib/widget-snapshot'

const BG: ColorProp = '#13110f'
const BORDER: ColorProp = '#2a2724'
const LIME: ColorProp = '#a3e635'
const MUTED: ColorProp = '#8a8782'

const STRINGS = {
  es: { tomorrow: 'MAÑANA', rest: 'DESCANSO', none: 'ELIGE UN PROGRAMA', stale: 'ABRE LA APP', ex: 'EJ' },
  en: { tomorrow: 'TOMORROW', rest: 'REST DAY', none: 'PICK A PROGRAM', stale: 'OPEN THE APP', ex: 'EX' },
}

const SHELL = {
  height: 'match_parent', width: 'match_parent', flexDirection: 'row',
  alignItems: 'center', backgroundColor: BG, borderRadius: 16,
  borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14,
} as const

/**
 * Franja fina 4x1: qué toca mañana, para planear antes de que llegue el día
 * (mismo dato de `getWorkout`, un día adelantado — ver sync-widget-snapshot.ts).
 * Tap → OPEN_APP, como TodayWidget/StreakWidget (no hay pantalla propia de
 * "mañana" a la que deep-linkear).
 */
export function NextSessionWidget({ snapshot, today }: { snapshot: WidgetSnapshot | null; today: string }) {
  const tr = STRINGS[snapshot?.lang ?? 'es']
  // El proceso headless no corre setTimezone(): `today` llega recalculado en la
  // tz del snapshot para que este guard no salte en falso (ver widget-task-handler).
  const fresh = !!snapshot && snapshot.date === today

  if (!fresh) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={SHELL}>
        <TextWidget text={tr.stale} style={{ fontSize: 11, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  const w = snapshot!.workoutTomorrow
  const isRest = !!w && w.type === 'rest'
  const title = !w ? tr.none : isRest ? tr.rest : (w.title.toUpperCase() || tr.tomorrow)
  const color = !w || isRest ? MUTED : LIME
  const showCount = !!w && !isRest && w.exerciseCount > 0

  return (
    <FlexWidget clickAction="OPEN_APP" style={SHELL}>
      <TextWidget
        text={`${tr.tomorrow} · `}
        style={{ fontSize: 10, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.3 }}
      />
      <TextWidget
        text={title}
        truncate="END"
        maxLines={1}
        style={{ fontSize: 14, color, fontFamily: 'BebasNeue_400Regular' }}
      />
      {showCount && (
        <TextWidget
          text={` · ${w!.exerciseCount} ${tr.ex}`}
          style={{ fontSize: 9, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }}
        />
      )}
    </FlexWidget>
  )
}
