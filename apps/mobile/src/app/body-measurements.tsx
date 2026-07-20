/**
 * Medidas corporales + % grasa corporal (método US Navy) — issue #227.
 * Port nativo del BodyMeasurementsTracker web: form de medidas (cm), panel de
 * composición (BF% + categoría + masa magra + tendencia) e historial.
 */
import { useMemo, useState } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import Svg, { Path, Circle } from 'react-native-svg'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { cn } from '@/lib/utils'
import { todayStr, addDays } from '@calistenia/core/lib/dateUtils'
import { useBodyMeasurements, type BodyMeasurement } from '@calistenia/core/hooks/useBodyMeasurements'
import { useBodyProfile } from '@calistenia/core/hooks/useBodyProfile'
import {
  bodyFatSeries,
  bodyFatCategoryKey,
  bodyFatColorClass,
  leanMassKg,
} from '@calistenia/core/lib/body-composition'

const FIELDS: { key: keyof BodyMeasurement; labelKey: string; shortKey: string }[] = [
  { key: 'chest', labelKey: 'progress.bodyMeasurements.chest', shortKey: 'progress.bodyMeasurements.chestShort' },
  { key: 'waist', labelKey: 'progress.bodyMeasurements.waist', shortKey: 'progress.bodyMeasurements.waistShort' },
  { key: 'neck', labelKey: 'progress.bodyMeasurements.neck', shortKey: 'progress.bodyMeasurements.neckShort' },
  { key: 'hips', labelKey: 'progress.bodyMeasurements.hips', shortKey: 'progress.bodyMeasurements.hipsShort' },
  { key: 'arm_left', labelKey: 'progress.bodyMeasurements.armLeft', shortKey: 'progress.bodyMeasurements.armLeftShort' },
  { key: 'arm_right', labelKey: 'progress.bodyMeasurements.armRight', shortKey: 'progress.bodyMeasurements.armRightShort' },
  { key: 'thigh_left', labelKey: 'progress.bodyMeasurements.thighLeft', shortKey: 'progress.bodyMeasurements.thighLeftShort' },
  { key: 'thigh_right', labelKey: 'progress.bodyMeasurements.thighRight', shortKey: 'progress.bodyMeasurements.thighRightShort' },
]

/** Acepta coma o punto como separador decimal. */
const parseCm = (s: string): number | undefined => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function TrendLine({ values, color }: { values: number[]; color: string }) {
  const [width, setWidth] = useState(0)
  const height = 72
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1) // mínimo 1 punto de % para no ampliar ruido plano
  const pad = 6
  const toX = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const toY = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2)
  let d = `M ${toX(0)} ${toY(values[0])}`
  for (let i = 1; i < values.length; i++) d += ` L ${toX(i)} ${toY(values[i])}`
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r={3.5} fill={color} />
        </Svg>
      )}
    </View>
  )
}

export default function BodyMeasurementsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const LIME = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'
  const MUTED = 'rgba(255,255,255,0.45)'

  const user = useAuthUser()
  const userId = user?.id ?? null
  const { measurements, isReady, saveMeasurement } = useBodyMeasurements(userId)
  const { profile, isReady: profileReady } = useBodyProfile(userId)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(() => todayStr())
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const series = useMemo(() => bodyFatSeries(measurements, profile), [measurements, profile])

  const hasAnyValue = FIELDS.some((f) => parseCm(values[f.key] || '') !== undefined)

  const handleSave = async () => {
    if (!hasAnyValue || saving) return
    setSaving(true)
    try {
      await saveMeasurement({
        date,
        chest: parseCm(values.chest || ''),
        waist: parseCm(values.waist || ''),
        neck: parseCm(values.neck || ''),
        hips: parseCm(values.hips || ''),
        arm_left: parseCm(values.arm_left || ''),
        arm_right: parseCm(values.arm_right || ''),
        thigh_left: parseCm(values.thigh_left || ''),
        thigh_right: parseCm(values.thigh_right || ''),
        note: note.trim(),
      })
      haptics.success()
      setShowForm(false)
      setValues({})
      setNote('')
      setDate(todayStr())
    } finally {
      setSaving(false)
    }
  }

  const latest = measurements[0]
  const prev = measurements[1]

  const bfLatest = series.length > 0 ? series[series.length - 1] : null
  const bfPrev = series.length > 1 ? series[series.length - 2] : null
  const bfDelta = bfLatest && bfPrev ? Number((bfLatest.pct - bfPrev.pct).toFixed(1)) : null
  const category = bfLatest && profile.sex ? bodyFatCategoryKey(bfLatest.pct, profile.sex) : null
  const lean = bfLatest ? leanMassKg(profile.weightKg ?? null, bfLatest.pct) : null
  const missingProfile = !profile.sex || !profile.heightCm

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: back + mono kicker + Bebas title */}
        <Pressable
          onPress={() => {
            haptics.selection()
            router.back()
          }}
          hitSlop={8}
          className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
        >
          <ChevronLeft size={24} color={MUTED} />
        </Pressable>
        <View className="flex-row items-end justify-between pb-4">
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('progress.bodyFat.kicker')}
            </Text>
            <Text className="font-bebas text-4xl text-foreground">
              {t('progress.bodyMeasurements.title')}
            </Text>
          </View>
          <Button size="sm" variant={showForm ? 'outline' : 'default'} onPress={() => { haptics.selection(); setShowForm((s) => !s) }}>
            <Text className={cn('font-mono text-[11px] uppercase tracking-wide', showForm ? 'text-foreground' : 'text-primary-foreground')}>
              {showForm ? t('progress.bodyMeasurements.cancel') : t('progress.bodyMeasurements.measure')}
            </Text>
          </Button>
        </View>

        {/* Form */}
        {showForm && (
          <Card className="mb-4">
            <CardContent className="gap-3 py-4">
              {/* Fecha: ± 1 día, tope hoy */}
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('progress.bodyMeasurements.date')}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable hitSlop={8} onPress={() => setDate((d) => addDays(d, -1))}>
                    <ChevronLeft size={18} color={MUTED} />
                  </Pressable>
                  <Text className="font-mono text-[13px] text-foreground">{date}</Text>
                  <Pressable
                    hitSlop={8}
                    disabled={date >= todayStr()}
                    onPress={() => setDate((d) => (d < todayStr() ? addDays(d, 1) : d))}
                  >
                    <ChevronRight size={18} color={date >= todayStr() ? 'rgba(255,255,255,0.15)' : MUTED} />
                  </Pressable>
                </View>
              </View>

              <View className="flex-row flex-wrap justify-between">
                {FIELDS.map((f) => (
                  <View key={f.key} className="mb-3 w-[48%]">
                    <Text className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(f.labelKey)} (cm)
                    </Text>
                    <Input
                      keyboardType="decimal-pad"
                      value={values[f.key] || ''}
                      onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                      placeholder="cm"
                    />
                  </View>
                ))}
              </View>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder={t('progress.bodyMeasurements.optionalNote')}
              />
              <Button onPress={handleSave} disabled={saving || !hasAnyValue}>
                <Text className="font-mono text-[11px] uppercase tracking-wide text-primary-foreground">
                  {saving ? '...' : t('progress.bodyMeasurements.save')}
                </Text>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* % grasa corporal (Navy) */}
        <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('progress.bodyFat.title')}
        </Text>
        <Card className="mb-4">
          <CardContent className="py-4">
            {!isReady || !profileReady ? null : missingProfile ? (
              <Text className="py-4 text-center font-sans text-sm text-muted-foreground">
                {t('progress.bodyFat.hintMissingProfile')}
              </Text>
            ) : !bfLatest ? (
              <Text className="py-4 text-center font-sans text-sm text-muted-foreground">
                {profile.sex === 'female'
                  ? t('progress.bodyFat.hintMissingMeasurementFemale')
                  : t('progress.bodyFat.hintMissingMeasurement')}
              </Text>
            ) : (
              <View className="gap-3">
                <View className="flex-row items-end gap-6">
                  <View>
                    <Text className={cn('font-bebas text-5xl leading-none', category ? bodyFatColorClass(category) : 'text-foreground')}>
                      {bfLatest.pct}%
                    </Text>
                    {category && (
                      <Text className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t(`progress.bodyFat.${category}`)}
                      </Text>
                    )}
                  </View>
                  {bfDelta !== null && (
                    <View className="items-center">
                      <Text className={cn(
                        'font-bebas text-2xl leading-none',
                        bfDelta > 0 ? 'text-amber-400' : bfDelta < 0 ? 'text-emerald-500' : 'text-muted-foreground',
                      )}>
                        {bfDelta > 0 ? '+' : ''}{bfDelta}
                      </Text>
                      <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        {t('progress.bodyFat.sinceLast')}
                      </Text>
                    </View>
                  )}
                  {lean !== null && (
                    <View className="items-center">
                      <Text className="font-bebas text-2xl leading-none text-sky-500">{lean} kg</Text>
                      <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        {t('progress.bodyFat.leanMass')}
                      </Text>
                    </View>
                  )}
                </View>
                <TrendLine values={series.map((p) => p.pct)} color={LIME} />
                <Text className="border-t border-border pt-2 font-mono text-[9px] tracking-wide text-muted-foreground">
                  {t('progress.bodyFat.disclaimer')}
                </Text>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Última medición vs anterior */}
        {latest && (
          <>
            <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('progress.bodyMeasurements.lastMeasurement')}
            </Text>
            <Card className="mb-4">
              <CardContent className="gap-1 py-4">
                {FIELDS.map((f) => {
                  const cur = latest[f.key] as number | undefined
                  if (!cur) return null
                  const prv = prev?.[f.key] as number | undefined
                  const diff = prv ? Number((cur - prv).toFixed(1)) : null
                  return (
                    <View key={f.key} className="flex-row items-center gap-3 py-1">
                      <Text className="w-24 font-sans text-[12px] text-muted-foreground">{t(f.labelKey)}</Text>
                      <Text className="font-mono text-[13px] text-foreground">{cur} cm</Text>
                      {diff !== null && (
                        <Text className={cn(
                          'font-mono text-[10px]',
                          diff > 0 ? 'text-amber-400' : diff < 0 ? 'text-emerald-500' : 'text-muted-foreground',
                        )}>
                          {diff > 0 ? '+' : ''}{diff}
                        </Text>
                      )}
                    </View>
                  )
                })}
                <Text className="mt-1 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                  {latest.date}{latest.note ? ` — ${latest.note}` : ''}
                </Text>
              </CardContent>
            </Card>
          </>
        )}

        {/* Historial */}
        {measurements.length > 1 && (
          <>
            <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('progress.bodyMeasurements.history')}
            </Text>
            <View className="gap-2">
              {measurements.slice(1, 11).map((m) => (
                <Card key={m.id}>
                  <CardContent className="gap-1.5 py-3">
                    <Text className="font-mono text-[10px] text-sky-400">{m.date}</Text>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                      {FIELDS.map((f) => {
                        const v = m[f.key] as number | undefined
                        if (!v) return null
                        return (
                          <Text key={f.key} className="font-mono text-[11px] text-foreground">
                            <Text className="font-mono text-[9px] uppercase text-muted-foreground">{t(f.shortKey)} </Text>
                            {v}
                          </Text>
                        )
                      })}
                    </View>
                  </CardContent>
                </Card>
              ))}
            </View>
          </>
        )}

        {isReady && measurements.length === 0 && !showForm && (
          <Text className="py-6 text-center font-sans text-sm text-muted-foreground">
            {t('progress.bodyMeasurements.noRecords')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
