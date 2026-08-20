'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { ColorProp } from 'react-native-android-widget'
import type { NutritionWidgetSnapshot } from '../lib/nutrition-widget-snapshot'

const BG: ColorProp = '#13110f'
const BORDER: ColorProp = '#2a2724'
const SKY: ColorProp = '#38bdf8'
const MUTED: ColorProp = '#8a8782'

const STRINGS = {
  es: { water: 'AGUA', goal: '/ OBJ L', stale: 'ABRE LA APP' },
  en: { water: 'WATER', goal: '/ GOAL L', stale: 'OPEN THE APP' },
}

function barWeights(value: number, goal: number): { filled: number; empty: number } {
  if (goal <= 0) return { filled: 0, empty: 100 }
  const pct = Math.min(Math.max(value / goal, 0), 1)
  const filled = Math.round(pct * 100)
  return { filled, empty: 100 - filled }
}

const SHELL = {
  height: 'match_parent', width: 'match_parent', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center', backgroundColor: BG,
  borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
} as const

/**
 * Agua consumida hoy / meta, en litros. Deep-link al tab de nutrición
 * (WaterTracker vive ahí), igual que NutritionRingWidget/NutritionWidget.
 *
 * "+1 vaso" desde el propio widget: evaluado y descartado a propósito. El
 * bridge de react-native-android-widget SÍ soporta un `clickAction` propio
 * (`WIDGET_CLICK` en `widgetTaskHandler`, sin código nativo), pero persistir
 * ese tap contra PocketBase de forma offline-safe exigiría o bien importar
 * `pb`/la cola offline al proceso headless (hoy deliberadamente mínimo: solo
 * AsyncStorage + Sentry, ver widget-task-handler.tsx) o un mecanismo nuevo de
 * "pendiente" que la app drene al abrir — un camino widget→app que no existe
 * en ningún otro widget y que no se puede verificar sin dispositivo. El propio
 * spec de widgets (docs/superpowers/specs/2026-06-10-mobile-widgets-design.md)
 * deja "widgets interactivos" fuera de scope explícitamente. Se deja como
 * lectura + deep-link; la acción rápida queda para una iteración con QA real.
 */
export function WaterWidget({ snapshot, today }: { snapshot: NutritionWidgetSnapshot | null; today: string }) {
  const tr = STRINGS[snapshot?.lang ?? 'es']

  if (!snapshot || snapshot.date !== today) {
    return (
      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'calistenia://nutrition' }} style={SHELL}>
        <TextWidget text={tr.stale} style={{ fontSize: 12, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      </FlexWidget>
    )
  }

  const ml = snapshot.waterMl ?? 0
  const goalMl = snapshot.waterGoalMl ?? 0
  const liters = (ml / 1000).toFixed(1)
  const goalLiters = (goalMl / 1000).toFixed(1)
  const { filled, empty } = barWeights(ml, goalMl)

  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'calistenia://nutrition' }} style={SHELL}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <TextWidget text={liters} style={{ fontSize: 34, color: SKY, fontFamily: 'BebasNeue_400Regular' }} />
        <TextWidget text=" L" style={{ fontSize: 12, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', marginBottom: 4 }} />
      </FlexWidget>
      <TextWidget
        text={goalMl > 0 ? `${tr.goal} ${goalLiters}` : tr.water}
        style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', marginTop: 2 }}
      />

      {/* Barra de progreso: mismo lenguaje visual que NutritionRingWidget */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 6, backgroundColor: BORDER, borderRadius: 3, marginTop: 8 }}>
        {filled > 0 && (
          <FlexWidget style={{ flex: filled, height: 'match_parent', backgroundColor: SKY, borderRadius: 3 }} />
        )}
        {empty > 0 && (
          <FlexWidget style={{ flex: empty, height: 'match_parent' }} />
        )}
      </FlexWidget>
    </FlexWidget>
  )
}
