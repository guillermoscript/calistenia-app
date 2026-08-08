/**
 * Detalle de una sesión de fuerza por id de registro.
 *
 * Es la pantalla a la que enlazan el muro (`/social`) y la actividad reciente de
 * la home: funciona con la sesión de CUALQUIER usuario, reconstruida desde
 * PocketBase por `usePublicSessionDetail`. La hermana `/session-detail` solo
 * puede pintar el ProgressMap del usuario logueado.
 *
 * Ruta: /s/[id]
 */
import { useMemo } from 'react'
import { View, Pressable, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { CATALOG } from '@/lib/catalog'
import { useAuthUser } from '@/lib/use-auth-user'
import { WORKOUTS } from '@calistenia/core/data/workouts'
import { usePublicSessionDetail } from '@calistenia/core/hooks/usePublicSessionDetail'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import SessionDetailBody from '@/components/session/SessionDetailBody'

const MUTED = 'hsl(0 0% 55%)'

// Mismo catálogo empaquetado que usa /session-detail: CATALOG cubre la
// biblioteca completa y WORKOUTS añade lo que solo vive en un programa. Los
// nombres de slots de programa los resuelve el hook desde PB.
function buildExerciseCatalog(): Record<string, { name: TranslatableField; muscles: TranslatableField }> {
  const catalog: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
  for (const ex of CATALOG) {
    if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
  }
  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
    })
  })
  return catalog
}

const STATIC_CATALOG = buildExerciseCatalog()

function formatSessionDate(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function humanizeKey(key: string, t: TFunction): string {
  if (key.startsWith('free_') || key.startsWith('manual_')) return t('progress.freeSession')
  const m = /^p(\d+)_(\w+)$/.exec(key)
  if (m) return `${t('session.phase', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
  return key
}

export default function PublicSessionDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const router = useRouter()
  const me = useAuthUser()

  const catalog = useMemo(() => STATIC_CATALOG, [])
  const { session, exercises, owner, loading, notFound } = usePublicSessionDetail(id || null, catalog)

  const isOwn = !!owner && owner.id === me?.id

  const resolvedTitle = session
    ? (session.workoutKey.startsWith('free_') || session.workoutKey.startsWith('manual_')
        ? t('progress.freeSession')
        : (WORKOUTS[session.workoutKey]?.title as string) || humanizeKey(session.workoutKey, t))
    : ''

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header router={router} backLabel={t('common.back')} />
        <View className="gap-4 px-4 pt-2">
          <View className="h-3 w-32 rounded bg-muted/60" />
          <View className="h-10 w-56 rounded bg-muted/60" />
          <View className="h-20 rounded-xl bg-muted/40" />
        </View>
      </SafeAreaView>
    )
  }

  if (notFound || !session) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header router={router} backLabel={t('common.back')} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">🗂️</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">{t('session.notFound')}</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header router={router} backLabel={t('common.back')} />

      <SessionDetailBody
        session={session}
        exercises={exercises}
        dateLabel={formatSessionDate(session.date, locale)}
        title={resolvedTitle}
        locale={locale}
        t={t}
        onOpenExercise={(exId) => router.push({ pathname: '/exercise/[id]', params: { id: exId } })}
        authorHeader={owner && !isOwn ? (
          <Pressable
            onPress={() => router.push({ pathname: '/u/[id]', params: { id: owner.id } })}
            className="mt-1 flex-row items-center gap-2.5 active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={owner.displayName}
          >
            {owner.avatarUrl ? (
              <Image source={{ uri: owner.avatarUrl }} className="size-9 rounded-full" />
            ) : (
              <View className="size-9 items-center justify-center rounded-full bg-muted">
                <Text className="font-bebas text-base text-muted-foreground">
                  {owner.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text className="flex-1 font-sans-medium text-sm text-foreground" numberOfLines={1}>
              {owner.displayName}
            </Text>
            <ChevronRight size={16} color={MUTED} />
          </Pressable>
        ) : null}
      />
    </SafeAreaView>
  )
}

function Header({ router, backLabel }: { router: ReturnType<typeof useRouter>; backLabel: string }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityRole="button" accessibilityLabel={backLabel}>
        <ArrowLeft size={20} color={MUTED} />
      </Pressable>
    </View>
  )
}
