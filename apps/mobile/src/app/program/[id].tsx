import { useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, BadgeCheck, CalendarDays } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useProgramDetail } from '@calistenia/core/hooks/useProgramDetail'

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
  const isActive = activeProgram?.id === id

  // El programa y su semana tipo (fase 1) los resuelve core (#473): si el
  // catálogo ya trae el programa no se pide por red, solo sus días. `days` es
  // `null` mientras carga y `[]` cuando el programa no define ninguno; ya vienen
  // localizados.
  const { program, days, notFound } = useProgramDetail(id ?? null, { knownProgram: catalogProgram })

  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState('')

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
                <EmptyState
                  icon={CalendarDays}
                  title={t('programDetail.emptyTitle')}
                  body={t('programDetail.emptyBody')}
                />
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
