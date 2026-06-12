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

// Macro colors from MealLoggerSheet (sky-500, amber-400, pink-500)
const PROTEIN_COLOR: ColorProp = '#0ea5e9'
const CARBS_COLOR: ColorProp = '#fbbf24'
const FAT_COLOR: ColorProp = '#ec4899'

const STRINGS = {
  es: {
    kcalGoal: '/ OBJETIVO KCAL',
    remaining: 'RESTANTES',
    consumed: 'CONSUMIDAS',
    prot: 'PROT',
    carb: 'CARB',
    gras: 'GRAS',
    camera: '\u{1F4F7}  FOTO',
    text: '✍️  TEXTO',
    stale: 'ABRE LA APP',
  },
  en: {
    kcalGoal: '/ GOAL KCAL',
    remaining: 'REMAINING',
    consumed: 'CONSUMED',
    prot: 'PROT',
    carb: 'CARB',
    gras: 'FAT',
    camera: '\u{1F4F7}  PHOTO',
    text: '✍️  TEXT',
    stale: 'OPEN THE APP',
  },
}

/** Returns filled flex weight (0–100) and remaining flex weight */
function barWeights(value: number, goal: number): { filled: number; empty: number } {
  if (goal <= 0) return { filled: 0, empty: 100 }
  const pct = Math.min(Math.max(value / goal, 0), 1)
  const filled = Math.round(pct * 100)
  return { filled, empty: 100 - filled }
}

interface ProgressBarProps {
  value: number
  goal: number
  color: ColorProp
  height: number
}

function ProgressBar({ value, goal, color, height }: ProgressBarProps) {
  const { filled, empty } = barWeights(value, goal)
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height, backgroundColor: BORDER, borderRadius: 3 }}>
      {filled > 0 && (
        <FlexWidget style={{ flex: filled, height: 'match_parent', backgroundColor: color, borderRadius: 3 }} />
      )}
      {empty > 0 && (
        <FlexWidget style={{ flex: empty, height: 'match_parent' }} />
      )}
    </FlexWidget>
  )
}

interface MacroRowProps {
  label: string
  value: number
  goal: number
  color: ColorProp
}

function MacroRow({ label, value, goal, color }: MacroRowProps) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 3 }}>
      <TextWidget
        text={label}
        style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', width: 30 }}
      />
      <TextWidget
        text={`${Math.round(value)}/${Math.round(goal)}g`}
        style={{ fontSize: 8, color: FG, fontFamily: 'JetBrainsMono_400Regular', width: 70 }}
      />
      <FlexWidget style={{ flex: 1, height: 4 }}>
        <ProgressBar value={value} goal={goal} color={color} height={4} />
      </FlexWidget>
    </FlexWidget>
  )
}

export function NutritionWidget({ snapshot, today }: { snapshot: NutritionWidgetSnapshot | null; today: string }) {
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
        <TextWidget text={tr.stale} style={{ fontSize: 14, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  const { calories, protein, carbs, fat, calorieGoal, proteinGoal, carbsGoal, fatGoal } = snapshot
  const remaining = calorieGoal > 0 ? Math.max(calorieGoal - calories, 0) : 0

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'calistenia://nutrition' }}
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: BG, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 14,
      }}
    >
      {/* Header row: calorie number + remaining */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <TextWidget
            text={String(Math.round(calories))}
            style={{ fontSize: 30, color: LIME, fontFamily: 'BebasNeue_400Regular' }}
          />
          {calorieGoal > 0 && (
            <TextWidget
              text={` ${tr.kcalGoal} ${Math.round(calorieGoal)}`}
              style={{ fontSize: 9, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', marginBottom: 4 }}
            />
          )}
        </FlexWidget>
        {calorieGoal > 0 && (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget
              text={String(Math.round(remaining))}
              style={{ fontSize: 16, color: FG, fontFamily: 'BebasNeue_400Regular' }}
            />
            <TextWidget
              text={tr.remaining}
              style={{ fontSize: 7, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* Calorie progress bar */}
      <FlexWidget style={{ width: 'match_parent', marginVertical: 4 }}>
        <ProgressBar value={calories} goal={calorieGoal} color={LIME} height={6} />
      </FlexWidget>

      {/* Macro rows */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginVertical: 2 }}>
        <MacroRow label={tr.prot} value={protein} goal={proteinGoal} color={PROTEIN_COLOR} />
        <MacroRow label={tr.carb} value={carbs} goal={carbsGoal} color={CARBS_COLOR} />
        <MacroRow label={tr.gras} value={fat} goal={fatGoal} color={FAT_COLOR} />
      </FlexWidget>

      {/* Quick-add zones */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'calistenia://nutrition?action=camera' }}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: BORDER, borderRadius: 10, padding: 8, marginRight: 3,
          }}
        >
          <TextWidget
            text={tr.camera}
            style={{ fontSize: 10, color: FG, fontFamily: 'JetBrainsMono_400Regular' }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'calistenia://nutrition?action=text' }}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: BORDER, borderRadius: 10, padding: 8, marginLeft: 3,
          }}
        >
          <TextWidget
            text={tr.text}
            style={{ fontSize: 10, color: FG, fontFamily: 'JetBrainsMono_400Regular' }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
