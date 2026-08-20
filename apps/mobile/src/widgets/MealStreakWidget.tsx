'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { ColorProp } from 'react-native-android-widget'
import type { NutritionWidgetSnapshot } from '../lib/nutrition-widget-snapshot'

const BG: ColorProp = '#13110f'
const BORDER: ColorProp = '#2a2724'
const LIME: ColorProp = '#a3e635'
const MUTED: ColorProp = '#8a8782'

const STRINGS = {
  es: { streak: 'RACHA COMIDAS', day: 'DÍA', days: 'DÍAS', stale: 'ABRE LA APP', none: 'SIN RACHA' },
  en: { streak: 'MEAL STREAK', day: 'DAY', days: 'DAYS', stale: 'OPEN THE APP', none: 'NO STREAK' },
}

const SHELL = {
  height: 'match_parent', width: 'match_parent', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center', backgroundColor: BG,
  borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
} as const

/**
 * Racha de días seguidos con score de calidad A/B (misma racha de los badges
 * `streak_3/7/30`). Deep-link a nutrición como el resto de widgets de esta
 * familia (NutritionWidget/NutritionRingWidget), no OPEN_APP: aquí no hay
 * "hoy" de entreno al que volver, el destino natural es el tab de nutrición.
 */
export function MealStreakWidget({ snapshot, today }: { snapshot: NutritionWidgetSnapshot | null; today: string }) {
  const tr = STRINGS[snapshot?.lang ?? 'es']

  // El proceso headless no corre setTimezone(): `today` llega recalculado en la
  // tz del snapshot para que este guard no salte en falso (ver widget-task-handler).
  if (!snapshot || snapshot.date !== today) {
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'calistenia://nutrition' }} style={SHELL}>
        <TextWidget text={tr.stale} style={{ fontSize: 12, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  const streak = snapshot.mealStreak ?? 0
  // Lima solo si hoy ya cuenta como A/B. Una racha sostenida por ayer sigue
  // viva (el número no baja) pero se pinta apagada: queda por confirmar hoy.
  const alive = streak > 0 && snapshot.mealStreakToday
  const color = alive ? LIME : MUTED
  const kicker = streak === 0
    ? tr.none
    : `${tr.streak} · ${streak === 1 ? tr.day : tr.days}`

  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'calistenia://nutrition' }} style={SHELL}>
      <TextWidget
        text={String(streak)}
        style={{ fontSize: 44, color, fontFamily: 'BebasNeue_400Regular' }}
      />
      <TextWidget
        text={kicker}
        style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.6, marginTop: 2 }}
      />
    </FlexWidget>
  )
}
