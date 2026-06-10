'use no memo'
// React Compiler inyecta useMemoCache y rompe el renderer headless de react-native-android-widget
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { CardioWidgetSnapshot } from '../lib/cardio-widget-snapshot'

const BG = '#13110f' as const
const BORDER = '#2a2724' as const
const LIME = '#a3e635' as const
const SKY = '#38bdf8' as const
const MUTED = '#8a8782' as const
const FG = '#fafaf9' as const

const ICONS: Record<string, string> = { running: '🏃', walking: '🚶', cycling: '🚴' }

const STRINGS = {
  es: { title: 'CARDIO', week: 'ESTA SEMANA', sessions: 'SESIONES', last: 'ÚLTIMA', none: 'SIN SESIONES AÚN', open: 'TOCA PARA EMPEZAR' },
  en: { title: 'CARDIO', week: 'THIS WEEK', sessions: 'SESSIONS', last: 'LAST', none: 'NO SESSIONS YET', open: 'TAP TO START' },
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '--:--'
  let mins = Math.floor(minPerKm)
  let secs = Math.round((minPerKm - mins) * 60)
  if (secs >= 60) { mins++; secs = 0 }
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function CardioWidget({ snapshot }: { snapshot: CardioWidgetSnapshot | null }) {
  const tr = STRINGS[snapshot?.lang ?? 'es']
  const last = snapshot?.lastSession ?? null

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'calistenia://cardio' }}
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: BG, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 14,
      }}
    >
      {/* Cabecera: semana */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center' }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={`${tr.title} · ${tr.week}`} style={{ fontSize: 9, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.3 }} />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
            <TextWidget text={snapshot ? snapshot.weekKm.toFixed(1) : '–'} style={{ fontSize: 30, color: LIME, fontFamily: 'BebasNeue_400Regular' }} />
            <TextWidget text=" KM" style={{ fontSize: 11, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <TextWidget text={snapshot ? String(snapshot.weekSessions) : '–'} style={{ fontSize: 22, color: FG, fontFamily: 'BebasNeue_400Regular' }} />
          <TextWidget text={tr.sessions} style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
        </FlexWidget>
      </FlexWidget>

      {/* Última sesión */}
      {last ? (
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center' }}>
          <TextWidget
            text={`${ICONS[last.activity] ?? '🏃'} ${last.distanceKm.toFixed(2)} km · ${fmtDuration(last.durationSeconds)}`}
            style={{ fontSize: 12, color: FG, fontFamily: 'JetBrainsMono_400Regular' }}
          />
          <TextWidget text={`${fmtPace(last.paceMinKm)} /km`} style={{ fontSize: 12, color: SKY, fontFamily: 'JetBrainsMono_700Bold' }} />
        </FlexWidget>
      ) : (
        <TextWidget text={snapshot ? `${tr.none} · ${tr.open}` : tr.open} style={{ fontSize: 10, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
      )}
    </FlexWidget>
  )
}
