import { useCallback, useMemo, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, BadgeCheck, CalendarDays, Copy, LogOut, MoreVertical, Pencil, Trash2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { OptionSheet, type OptionSheetOption } from '@/components/ui/option-sheet'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useProgramDetail } from '@calistenia/core/hooks/useProgramDetail'

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { programs, activeProgram } = useWorkoutState()
  const { selectProgram, abandonProgram, duplicateProgram, deleteProgram } = useWorkoutActions()
  const user = useAuthUser()

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
  const [busy, setBusy] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [error, setError] = useState('')

  // Mismo criterio que web (`ProgramDetailPage.tsx:149,560`): el dueño del
  // programa, o quien tiene rol de edición, puede modificarlo y borrarlo.
  const canManage = useMemo(() => {
    if (!program || !user) return false
    return program.created_by === user.id || user.role === 'admin' || user.role === 'editor'
  }, [program, user])

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

  const handleEdit = useCallback(() => {
    if (!id) return
    router.push({ pathname: '/program-editor', params: { id } })
  }, [id, router])

  const handleDuplicate = useCallback(async () => {
    if (!id || busy) return
    setBusy(true)
    const newId = await duplicateProgram(id)
    setBusy(false)
    if (newId) {
      haptics.success()
      // Igual que web: la copia se abre directamente en el editor, que es lo
      // que se quiere hacer justo después de duplicar.
      router.push({ pathname: '/program-editor', params: { id: newId } })
    } else {
      haptics.error()
      Alert.alert(t('programDetail.duplicateError'))
    }
  }, [id, busy, duplicateProgram, router, t])

  const handleAbandon = useCallback(() => {
    if (!id) return
    // Confirmación NATIVA (#345): en móvil `window.confirm` no existe.
    Alert.alert(t('programDetail.abandonProgram'), t('programDetail.abandonConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('programDetail.abandonConfirmLabel'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          const ok = await abandonProgram(id)
          setBusy(false)
          if (ok) {
            haptics.success()
            router.replace('/(tabs)/programs')
          } else {
            haptics.error()
            Alert.alert(t('programDetail.abandonError'))
          }
        },
      },
    ])
  }, [id, abandonProgram, router, t])

  const handleDelete = useCallback(() => {
    if (!id) return
    Alert.alert(t('programs.deleteProgram'), t('programs.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          const ok = await deleteProgram(id)
          setBusy(false)
          if (ok) {
            haptics.success()
            router.replace('/(tabs)/programs')
          } else {
            haptics.error()
            Alert.alert(t('programs.deleteError'))
          }
        },
      },
    ])
  }, [id, deleteProgram, router, t])

  // El menú es un OptionSheet y no un Alert de opciones a propósito: el
  // `Alert.alert` de Android admite tres botones como mucho y descarta los
  // demás en silencio, y aquí puede haber cuatro entradas más cancelar.
  const actions = useMemo<OptionSheetOption[]>(() => {
    const opts: OptionSheetOption[] = []
    if (canManage) {
      opts.push({ key: 'edit', label: t('common.edit'), icon: Pencil, onPress: handleEdit })
    }
    opts.push({ key: 'duplicate', label: t('programDetail.duplicate'), icon: Copy, onPress: handleDuplicate })
    if (isActive) {
      opts.push({
        key: 'abandon',
        label: t('programDetail.abandonProgram'),
        icon: LogOut,
        destructive: true,
        onPress: handleAbandon,
      })
    }
    if (canManage) {
      opts.push({
        key: 'delete',
        label: t('programs.deleteLabel'),
        icon: Trash2,
        destructive: true,
        onPress: handleDelete,
      })
    }
    return opts
  }, [canManage, isActive, t, handleEdit, handleDuplicate, handleAbandon, handleDelete])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={20} color="hsl(0 0% 55%)" />
        </Pressable>
        {/* flex-1 + shrink-0 en el icono: en RN el shrink por defecto es 0, así
            que sin esto un nombre largo empuja el botón de acciones fuera. */}
        <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
          {program?.name ?? ''}
        </Text>
        {program && actions.length > 0 && (
          <Pressable
            onPress={() => { haptics.light(); setShowActions(true) }}
            hitSlop={8}
            className="shrink-0 p-2"
            accessibilityLabel={t('programDetail.actions')}
            accessibilityRole="button"
          >
            <MoreVertical size={20} color="hsl(0 0% 55%)" />
          </Pressable>
        )}
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
            {!!program.cover_image_url && (
              <View className="h-40 overflow-hidden rounded-xl border border-border bg-card">
                <Image
                  source={{ uri: program.cover_image_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={program.id}
                  accessibilityLabel={program.name}
                />
              </View>
            )}

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
              <Kicker>
                {t('workout.trainingDay')}
              </Kicker>
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

            {canManage && (
              <Button size="lg" variant="outline" onPress={handleEdit} disabled={busy}>
                <Text>{t('common.edit')}</Text>
              </Button>
            )}

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

      {program && (
        <OptionSheet
          visible={showActions}
          kicker={t('programDetail.actions')}
          title={program.name}
          options={actions}
          cancelLabel={t('common.cancel')}
          onClose={() => setShowActions(false)}
        />
      )}
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
