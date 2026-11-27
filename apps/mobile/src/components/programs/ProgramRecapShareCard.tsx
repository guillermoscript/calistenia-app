/**
 * Tarjeta del resumen de programa para compartir (#941). Vistas RN puras para
 * que react-native-view-shot la capture; paridad visual con la de la web
 * (`ProgramRecapShareButton`): kicker mono, título Bebas, cifras y la primera
 * semana frente a la última, separados por líneas finas.
 *
 * Las líneas son `View` con fondo, no bordes: en Android view-shot pierde a
 * veces los bordes finos (ver `CardioShareCard`).
 */
import React, { memo } from 'react'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { formatRecapNumber, type ProgramRecap } from '@calistenia/core/lib/programRecap'

const LIME = '#c6f42f'
const RULE = 'rgba(245,245,244,0.14)'

export interface ProgramRecapShareCardProps {
  width: number
  height: number
  title: string
  userName?: string
  stats: { value: string; label: string }[]
  recap: ProgramRecap
  labels: { kicker: string; compareTitle: string; units: Record<'reps' | 's' | 'kg', string> }
}

function Rule() {
  return <View style={{ height: 1, backgroundColor: RULE }} />
}

function ProgramRecapShareCard({ width, height, title, userName, stats, recap, labels }: ProgramRecapShareCardProps) {
  return (
    <View style={{ width, height, backgroundColor: '#0a0a0b', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: LIME }} />
      <Text className="font-mono text-[10px] uppercase tracking-[3px]" style={{ color: LIME }}>{labels.kicker}</Text>
      <Text className="mt-2 font-bebas text-[44px] uppercase leading-[42px] text-[#f5f5f4]" numberOfLines={3}>{title}</Text>
      {userName ? <Text className="mt-2 font-sans text-xs text-[#f5f5f4]/60">{userName}</Text> : null}

      <View style={{ marginTop: 24 }}>
        <Rule />
        <View className="flex-row py-4">
          {stats.map(s => (
            <View key={s.label} className="flex-1 gap-1">
              <Text className="font-bebas text-[34px] leading-[34px] text-[#f5f5f4]">{s.value}</Text>
              <Text className="font-mono text-[8px] uppercase tracking-[2px] text-[#f5f5f4]/40">{s.label}</Text>
            </View>
          ))}
        </View>
        <Rule />
      </View>

      {recap.comparisons.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text className="mb-2 font-mono text-[9px] uppercase tracking-[3px] text-[#f5f5f4]/60">{labels.compareTitle}</Text>
          {recap.comparisons.map(c => (
            <View key={c.key}>
              <View className="flex-row items-center justify-between gap-3 py-3">
                <Text className="flex-1 font-sans-medium text-sm text-[#f5f5f4]" numberOfLines={1}>{c.name}</Text>
                <Text className="font-bebas text-2xl text-[#f5f5f4]/40">
                  {formatRecapNumber(c.first)} →{' '}
                  {/* Lima solo si mejoró, igual que en la pantalla. */}
                  <Text className="font-bebas text-2xl" style={{ color: c.delta > 0 ? LIME : '#f5f5f4' }}>{formatRecapNumber(c.last)} {labels.units[c.unit]}</Text>
                </Text>
              </View>
              <Rule />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 24 }}>
        <Rule />
        <Text className="mt-3 font-mono text-[10px] uppercase tracking-[2px] text-[#f5f5f4]/60">Calistenia</Text>
      </View>
    </View>
  )
}

export default memo(ProgramRecapShareCard)
