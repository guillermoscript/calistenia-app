'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { WidgetSnapshot } from '../lib/widget-snapshot'

const BG = '#13110f' as const
const BORDER = '#2a2724' as const
const LIME = '#a3e635' as const
const EMERALD = '#10b981' as const
const MUTED = '#8a8782' as const
const FG = '#fafaf9' as const

const STRINGS = {
  es: { today: 'ENTRENAMIENTO DE HOY', done: 'COMPLETADO', rest: 'DÍA DE DESCANSO', none: 'ELIGE UN PROGRAMA', stale: 'ABRE LA APP PARA ACTUALIZAR', streak: 'RACHA' },
  en: { today: "TODAY'S WORKOUT", done: 'COMPLETED', rest: 'REST DAY', none: 'PICK A PROGRAM', stale: 'OPEN THE APP TO UPDATE', streak: 'STREAK' },
}

function label(snapshot: WidgetSnapshot | null, today: string) {
  const tr = STRINGS[snapshot?.lang ?? 'es']
  if (!snapshot || snapshot.date !== today) return { top: '', title: tr.stale, color: MUTED }
  const w = snapshot.workoutToday
  if (!w) return { top: '', title: tr.none, color: MUTED }
  if (w.done) return { top: tr.today, title: tr.done, color: EMERALD }
  if (w.type === 'rest') return { top: tr.today, title: tr.rest, color: MUTED }
  return { top: tr.today, title: w.title.toUpperCase() || tr.today, color: LIME }
}

export function TodayWidget({ snapshot, today }: { snapshot: WidgetSnapshot | null; today: string }) {
  const { top, title, color } = label(snapshot, today)
  const tr = STRINGS[snapshot?.lang ?? 'es']
  const fresh = snapshot && snapshot.date === today

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: BG, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {top !== '' && (
          <TextWidget text={top} style={{ fontSize: 9, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.3 }} />
        )}
        <TextWidget text={title} truncate="END" maxLines={1}
          style={{ fontSize: 30, color, fontFamily: 'BebasNeue_400Regular', marginTop: 2 }} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row' }}>
          {(fresh ? snapshot!.week : []).map(d => (
            <TextWidget
              key={d.id}
              text={d.done ? '●' : d.type === 'rest' ? '·' : '○'}
              style={{ fontSize: 13, color: d.done ? LIME : MUTED, marginRight: 6, fontFamily: 'JetBrainsMono_700Bold' }}
            />
          ))}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={fresh ? String(snapshot!.streak) : '–'}
            style={{ fontSize: 22, color: FG, fontFamily: 'BebasNeue_400Regular' }} />
          <TextWidget text={` ${tr.streak}`} style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
