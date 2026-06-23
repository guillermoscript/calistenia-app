import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, BadgeCheck } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { pb } from '@calistenia/core/lib/pocketbase'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { ProgramMeta } from '@calistenia/core/types'
import i18n from 'i18next'

interface DayRow {
  dayId: string
  name: string
  focus: string
  type: string
  color: string
}

/** Mapea un registro de `programs` de PB a la forma mínima que pinta la pantalla. */
function toProgramMeta(p: any): ProgramMeta {
  const locale = i18n.language
  return {
    id:             p.id,
    name:           localize(p.name, locale),
    description:    localize(p.description, locale),
    duration_weeks: p.duration_weeks,
    created_by:     p.created_by || undefined,
    is_official:    p.is_official || false,
    is_featured:    p.is_featured || false,
    difficulty:     p.difficulty || undefined,
    discipline:     'calistenia', // se refina con los días cargados (ver useEffect)
    days_per_week:  typeof p.days_per_week === 'number' ? p.days_per_week : undefined,
  }
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { programs, activeProgram } = useWorkoutState()
  const { selectProgram } = useWorkoutActions()

  // El catálogo en memoria solo trae programas is_active y puede no estar
  // hidratado en cold-start. Como la web (getOne por id), buscamos primero en el
  // catálogo y, si no está, lo traemos directo de PB → la pantalla nunca queda
  // colgada en "cargando".
  const catalogProgram = programs.find(p => p.id === id) ?? null
  const [fetchedProgram, setFetchedProgram] = useState<ProgramMeta | null>(null)
  const program = catalogProgram ?? fetchedProgram
  const isActive = activeProgram?.id === id

  const [days, setDays] = useState<DayRow[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState('')

  // Trae el programa por id si el catálogo no lo tiene (programa inactivo,
  // catálogo aún sin hidratar, deep-link, etc.).
  useEffect(() => {
    if (!id || catalogProgram) return
    let cancelled = false
    pb.collection('programs').getOne(id, { $autoCancel: false })
      .then(rec => { if (!cancelled) setFetchedProgram(toProgramMeta(rec)) })
      .catch(() => { if (!cancelled) setNotFound(true) })
    return () => { cancelled = true }
  }, [id, catalogProgram])

  // Estructura semanal (fase 1) — se consulta directo a PB porque el catálogo
  // de usePrograms solo carga días/ejercicios del programa activo.
  // Los programas antiguos no tienen program_day_config → fallback a
  // program_exercises (mismo orden que usePrograms.buildWeekDays).
  useEffect(() => {
    if (!id) return
    let cancelled = false

    const toRows = (items: any[]): DayRow[] => {
      const locale = i18n.language
      const seen = new Map<string, DayRow>()
      items.forEach((r: any) => {
        if (!seen.has(r.day_id)) {
          seen.set(r.day_id, {
            dayId: r.day_id,
            name: localize(r.day_name, locale),
            focus: localize(r.day_focus, locale),
            type: r.day_type,
            color: r.day_color || '#888899',
          })
        }
      })
      return [...seen.values()]
    }

    const load = async () => {
      const filter = pb.filter('program = {:pid} && phase_number = 1', { pid: id })
      let rows: DayRow[] = []
      try {
        const dc = await pb.collection('program_day_config').getList(1, 50, {
          filter, sort: 'sort_order', $autoCancel: false,
        })
        rows = toRows(dc.items)
      } catch { /* colección puede no existir */ }
      if (rows.length === 0) {
        try {
          const ex = await pb.collection('program_exercises').getList(1, 500, {
            filter, sort: 'sort_order', fields: 'day_id,day_name,day_focus,day_type,day_color', $autoCancel: false,
          })
          rows = toRows(ex.items)
        } catch { /* sin datos */ }
      }
      if (cancelled) return
      setDays(rows)
      // Refina la disciplina del programa traído directo (el del catálogo ya la
      // trae): si todos los días no-descanso son yoga → 'yoga'.
      const nonRest = rows.filter(r => r.type !== 'rest')
      if (nonRest.length > 0 && nonRest.every(r => r.type === 'yoga')) {
        setFetchedProgram(prev => (prev && prev.discipline !== 'yoga' ? { ...prev, discipline: 'yoga' } : prev))
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const handleSelect = async () => {
    if (!id || selecting) return
    setSelecting(true)
    setError('')
    const ok = await selectProgram(id)
    setSelecting(false)
    if (ok) {
      router.dismissTo('/(tabs)')
    } else {
      setError(t('programs.switchError'))
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={20} color="hsl(0 0% 55%)" />
        </Pressable>
        <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
          {program?.name ?? ''}
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-8 gap-4">
        {!program ? (
          notFound ? (
            <Text className="py-10 text-center text-muted-foreground">{t('common.noResults')}</Text>
          ) : (
            <ActivityIndicator className="py-10" />
          )
        ) : (
          <>
            <Card>
              <CardContent className="gap-2 py-4">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="font-bebas text-3xl leading-none text-foreground">{program.name}</Text>
                  {program.is_official && <BadgeCheck size={16} color="hsl(74 90% 45%)" />}
                </View>
                <Text className="text-sm leading-5 text-muted-foreground">{program.description}</Text>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  <Chip label={`${program.duration_weeks} ${t('programs.weeks')}`} />
                  {program.difficulty && <Chip label={program.difficulty} />}
                  {!!program.days_per_week && (
                    <Chip label={`${program.days_per_week} d/sem`} />
                  )}
                  {program.discipline === 'yoga' && <Chip label="Yoga" />}
                </View>
              </CardContent>
            </Card>

            {/* Semana tipo */}
            <View className="gap-2">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('workout.trainingDay')}
              </Text>
              {days === null ? (
                <ActivityIndicator />
              ) : days.length === 0 ? (
                <Text className="text-sm text-muted-foreground">{t('common.noResults')}</Text>
              ) : (
                days.map(day => (
                  <View key={day.dayId} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <View className="size-2.5 rounded-full" style={{ backgroundColor: day.color }} />
                    <View className="flex-1">
                      <Text className="font-sans-medium text-foreground">{day.name}</Text>
                      <Text className="text-xs text-muted-foreground">{day.focus}</Text>
                    </View>
                    <Text className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{day.type}</Text>
                  </View>
                ))
              )}
            </View>

            {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}

            {isActive ? (
              <Button size="lg" variant="outline" onPress={() => router.dismissTo('/(tabs)')}>
                <Text>{t('programs.goToWorkout')}</Text>
              </Button>
            ) : (
              <Button size="lg" className={cn('bg-lime active:bg-lime/90')} onPress={handleSelect} disabled={selecting}>
                <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">
                  {selecting ? t('common.loading') : t('programs.useProgram')}
                </Text>
              </Button>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2.5 py-1">
      <Text className="font-mono text-[10px] capitalize tracking-wide text-muted-foreground">{label}</Text>
    </View>
  )
}
