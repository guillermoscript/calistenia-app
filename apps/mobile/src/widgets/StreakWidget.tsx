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
  es: { streak: 'RACHA', day: 'DÍA', days: 'DÍAS', stale: 'ABRE LA APP', none: 'SIN RACHA' },
  en: { streak: 'STREAK', day: 'DAY', days: 'DAYS', stale: 'OPEN THE APP', none: 'NO STREAK' },
}

const SHELL = {
  height: 'match_parent', width: 'match_parent', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center', backgroundColor: BG,
  borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
} as const

export function StreakWidget({ snapshot, today }: { snapshot: WidgetSnapshot | null; today: string }) {
  const tr = STRINGS[snapshot?.lang ?? 'es']

  // El proceso headless no corre setTimezone(): `today` llega recalculado en la
  // tz del snapshot para que este guard no salte en falso (ver widget-task-handler).
  if (!snapshot || snapshot.date !== today) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={SHELL}>
        <TextWidget text={tr.stale} style={{ fontSize: 12, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  // Lima solo si hoy ya cuenta. Una racha que se sostiene por la sesión de ayer
  // sigue viva (el número no baja) pero se pinta apagada: queda por entrenar.
  const alive = snapshot.streak > 0 && snapshot.streakToday
  const color = alive ? LIME : MUTED
  const kicker = snapshot.streak === 0
    ? tr.none
    : `${tr.streak} · ${snapshot.streak === 1 ? tr.day : tr.days}`

  return (
    <FlexWidget clickAction="OPEN_APP" style={SHELL}>
      <TextWidget
        text={String(snapshot.streak)}
        style={{ fontSize: 44, color, fontFamily: 'BebasNeue_400Regular' }}
      />
      <TextWidget
        text={kicker}
        style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.6, marginTop: 2 }}
      />

      {/* Semana del programa: mismo idioma visual que el TodayWidget */}
      <FlexWidget style={{ flexDirection: 'row', marginTop: 10 }}>
        {snapshot.week.map(d => (
          <TextWidget
            key={d.id}
            text={d.done ? '●' : d.type === 'rest' ? '·' : '○'}
            style={{ fontSize: 11, color: d.done ? LIME : MUTED, marginRight: 4, fontFamily: 'JetBrainsMono_700Bold' }}
          />
        ))}
      </FlexWidget>
    </FlexWidget>
  )
}
