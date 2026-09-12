/**
 * Qué se hace un día concreto de un programa: calentamiento, bloque principal
 * y vuelta a la calma, con las series planificadas de cada ejercicio.
 *
 * Reutiliza `SessionDetailBody`, el mismo cuerpo que el detalle de una sesión
 * propia (`/session-detail`) o de un amigo (`/s/[id]`): la pauta del programa
 * se traduce a «series» en `program-day-breakdown` de core.
 *
 * Ruta: /program-day?id=<programa>&phase=1&day=lun
 */
import { useMemo } from 'react'
import { View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import SessionDetailBody from '@/components/session/SessionDetailBody'
import { useProgramDayBreakdown } from '@calistenia/core/hooks/useProgramDayBreakdown'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { circuitToSessionExercises, programDayToSessionExercises } from '@calistenia/core/lib/program-day-breakdown'

const MUTED = 'hsl(0 0% 55%)'

export default function ProgramDayScreen() {
  const { id = '', phase = '1', day = '' } = useLocalSearchParams<{ id: string; phase: string; day: string }>()
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const router = useRouter()

  const { detail, loading } = useProgramDayBreakdown(id || null)
  const key = `p${phase}_${day}`
  const workout = detail?.workoutsMap[key]
  const circuit = detail?.circuitDayConfigs[key]
  const phaseInfo = detail?.phases.find(p => String(p.id) === phase)

  const exercises = useMemo(() => {
    if (circuit && circuit.exercises.length > 0) return circuitToSessionExercises(circuit, locale)
    return programDayToSessionExercises(workout?.exercises ?? [])
  }, [circuit, workout, locale])

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header onBack={() => router.back()} backLabel={t('common.back')} />
        <View className="gap-4 px-4 pt-2">
          <View className="h-3 w-32 rounded bg-muted/60" />
          <View className="h-10 w-56 rounded bg-muted/60" />
          <View className="h-20 rounded-xl bg-muted/40" />
        </View>
      </SafeAreaView>
    )
  }

  if (exercises.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header onBack={() => router.back()} backLabel={t('common.back')} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-muted-foreground">{t('programDetail.noExercisesDesc')}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const kicker = [
    t('session.phase', { phase }),
    phaseInfo?.weeks ? t('programDetail.weeksLabel', { weeks: phaseInfo.weeks }) : '',
    t(`day.${day}`, { defaultValue: day }),
  ].filter(Boolean).join(' · ')

  // Duración ESTIMADA con el mismo cálculo que la web; el circuito no la lleva
  // porque sus tiempos van por ronda y no por serie.
  const minutes = !circuit && workout ? calculateWorkoutDuration(workout.exercises) : 0

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header onBack={() => router.back()} backLabel={t('common.back')} />
      <SessionDetailBody
        session={{ workoutKey: key, date: '', durationSeconds: minutes * 60 }}
        exercises={exercises}
        dateLabel={kicker}
        title={workout?.title || t(`day.${day}`, { defaultValue: day })}
        locale={locale}
        t={t}
        onOpenExercise={exId => router.push({ pathname: '/exercise/[id]', params: { id: exId } })}
      />
    </SafeAreaView>
  )
}

function Header({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable onPress={onBack} hitSlop={8} className="p-2" accessibilityRole="button" accessibilityLabel={backLabel}>
        <ArrowLeft size={20} color={MUTED} />
      </Pressable>
    </View>
  )
}
