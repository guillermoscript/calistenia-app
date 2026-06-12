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
const FG: ColorProp = '#fafaf9'

const STRINGS = {
  es: {
    kcalGoal: '/ OBJ KCAL',
    consumed: 'CONSUMIDAS',
    stale: 'ABRE LA APP',
  },
  en: {
    kcalGoal: '/ GOAL KCAL',
    consumed: 'CONSUMED',
    stale: 'OPEN THE APP',
  },
}

function barWeights(value: number, goal: number): { filled: number; empty: number } {
  if (goal <= 0) return { filled: 0, empty: 100 }
  const pct = Math.min(Math.max(value / goal, 0), 1)
  const filled = Math.round(pct * 100)
  return { filled, empty: 100 - filled }
}

export function NutritionRingWidget({ snapshot, today }: { snapshot: NutritionWidgetSnapshot | null; today: string }) {
  const lang = snapshot?.lang ?? 'es'
  const tr = STRINGS[lang]

  // Stale guard
  if (!snapshot || snapshot.date !== today) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'calistenia://nutrition' }}
        style={{
          height: 'match_parent', width: 'match_parent', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', backgroundColor: BG,
          borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
        }}
      >
        <TextWidget text={tr.stale} style={{ fontSize: 12, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  const { calories, calorieGoal } = snapshot
  const remaining = calorieGoal > 0 ? Math.max(calorieGoal - calories, 0) : calories
  const { filled, empty } = barWeights(calories, calorieGoal)
  const displayNumber = calorieGoal > 0 ? remaining : calories
  const label = calorieGoal > 0
    ? `${tr.kcalGoal} ${Math.round(calorieGoal)}`
    : `KCAL ${tr.consumed}`

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'calistenia://nutrition' }}
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', backgroundColor: BG,
        borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
      }}
    >
      {/* Big remaining/consumed number */}
      <TextWidget
        text={String(Math.round(displayNumber))}
        style={{ fontSize: 38, color: LIME, fontFamily: 'BebasNeue_400Regular' }}
      />
      <TextWidget
        text={label}
        style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', marginTop: 2 }}
      />

      {/* Calorie progress bar */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 6, backgroundColor: BORDER, borderRadius: 3, marginTop: 8 }}>
        {filled > 0 && (
          <FlexWidget style={{ flex: filled, height: 'match_parent', backgroundColor: LIME, borderRadius: 3 }} />
        )}
        {empty > 0 && (
          <FlexWidget style={{ flex: empty, height: 'match_parent' }} />
        )}
      </FlexWidget>
    </FlexWidget>
  )
}
