/**
 * Perfil público de usuario — port móvil mínimo de apps/web/src/pages/UserProfilePage.tsx.
 * Ruta: /u/[id] (la usa friends.tsx al tocar un usuario).
 */
import { useState } from 'react'
import { View, ScrollView, Image, ActivityIndicator, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { X, MoreVertical, UserX, Flag, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { OptionSheet } from '@/components/ui/option-sheet'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { useReports } from '@calistenia/core/hooks/useReports'
import { ReportReasonSheet } from '@/components/social/ReportReasonSheet'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { usePublicProfile } from '@calistenia/core/hooks/usePublicProfile'
import type { ProfilePRs } from '@calistenia/core/lib/public-profile'
import { todayStr } from '@calistenia/core/lib/dateUtils'

const PR_DEFS: { key: keyof ProfilePRs; label: string; unit: string; accent: string }[] = [
  { key: 'pr_pullups', label: 'Pull-ups', unit: 'reps', accent: 'text-sky-500' },
  { key: 'pr_pushups', label: 'Push-ups', unit: 'reps', accent: 'text-lime' },
  { key: 'pr_lsit', label: 'L-sit', unit: 's', accent: 'text-amber-400' },
  { key: 'pr_pistol', label: 'Pistol Squat', unit: 'reps', accent: 'text-pink-500' },
  { key: 'pr_handstand', label: 'Handstand', unit: 's', accent: 'text-red-500' },
]

function StatBox({ label, value, accent, unit }: { label: string; value: number; accent: string; unit?: string }) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-card p-4">
      <Text className={cn('font-bebas text-3xl leading-none', accent)}>
        {value}
        {unit ? <Text className="font-bebas text-lg text-muted-foreground"> {unit}</Text> : null}
      </Text>
      <Text className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Text>
    </View>
  )
}

export default function UserProfileScreen() {
  const { id: userId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const l = useLocalize()
  const me = useAuthUser()
  const currentUserId = me?.id ?? null
  const isOwnProfile = currentUserId === userId

  const { isFollowing, follow, unfollow } = useFollows(currentUserId)
  const { isBlocked, block, unblock } = useBlocks(currentUserId)
  const [followLoading, setFollowLoading] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Denuncia de usuario (#220): menú ⋯ → selector de motivo → content_reports
  const { report } = useReports(currentUserId)
  const [reportOpen, setReportOpen] = useState(false)

  // Los datos del perfil viven en core (#473): la pantalla solo pinta. Los
  // textos llegan crudos (`TranslatableField`) y se localizan con `l()` al
  // renderizar, para que cambiar de idioma no relance las consultas.
  const { profile, loading } = usePublicProfile(userId ?? null)

  const blocked = userId ? isBlocked(userId) : false
  const canAct = !isOwnProfile && !!currentUserId && !!userId

  const confirmBlock = () => {
    Alert.alert(t('blocks.confirmTitle'), t('blocks.confirmBody'), [
      { text: t('blocks.cancel'), style: 'cancel' },
      {
        text: t('blocks.confirmAction'),
        style: 'destructive',
        onPress: async () => {
          if (!userId) return
          setBlockLoading(true)
          try {
            const ok = await block(userId)
            if (!ok) Alert.alert(t('blocks.error'))
          } finally { setBlockLoading(false) }
        },
      },
    ])
  }

  const doUnblock = async () => {
    if (!userId) return
    setBlockLoading(true)
    try {
      const ok = await unblock(userId)
      if (!ok) Alert.alert(t('blocks.error'))
    } finally { setBlockLoading(false) }
  }

  const doReport = async (reason: Parameters<typeof report>[0]['reason']) => {
    if (!userId) return
    setReportOpen(false)
    const ok = await report({ targetType: 'user', targetUserId: userId, reason })
    if (ok) Alert.alert(t('reports.successTitle'), t('reports.success'))
    else Alert.alert(t('reports.error'))
  }

  const Header = (
    <View className="flex-row items-start justify-between px-4 pt-2 pb-3">
      <View>
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">SOCIAL</Text>
        <Text className="font-bebas text-4xl leading-none text-foreground">Perfil</Text>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        {canAct ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            className="rounded-full bg-muted/60 p-2 active:opacity-70"
            accessibilityLabel={t('blocks.menuKicker')}
            hitSlop={6}
          >
            <MoreVertical size={18} color="#888899" />
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.back()} className="rounded-full bg-muted/60 p-2 active:opacity-70" hitSlop={6}>
          <X size={18} color="#888899" />
        </Pressable>
      </View>
    </View>
  )

  const Menu = canAct ? (
    <>
      <OptionSheet
        visible={menuOpen}
        kicker={t('blocks.menuKicker')}
        title={profile?.displayName || t('blocks.menuKicker')}
        cancelLabel={t('blocks.cancel')}
        onClose={() => setMenuOpen(false)}
        options={[
          { key: 'report', label: t('reports.menuReport'), icon: Flag, destructive: true, onPress: () => setReportOpen(true) },
          blocked
            ? { key: 'unblock', label: t('blocks.menuUnblock'), icon: UserX, onPress: () => { void doUnblock() } }
            : { key: 'block', label: t('blocks.menuBlock'), icon: UserX, destructive: true, onPress: confirmBlock },
        ]}
      />
      <ReportReasonSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onPick={reason => { void doReport(reason) }}
      />
    </>
  ) : null

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        {Header}
        {Menu}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#888899" />
        </View>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        {Header}
        {Menu}
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">🚫</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">No se pudo cargar el perfil.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const today = todayStr()
  // El hook deja el nombre vacío si el usuario no tiene ni display_name ni email.
  const displayName = profile.displayName || '?'
  const initial = displayName[0]?.toUpperCase() ?? '?'
  const following = userId ? isFollowing(userId) : false

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {Header}
      {Menu}
      <ScrollView contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
        {/* Cabecera de usuario */}
        <View className="mb-6 flex-row items-center gap-4">
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} className="size-16 rounded-full" accessibilityLabel={displayName} />
          ) : (
            <View className="size-16 items-center justify-center rounded-full bg-accent">
              <Text className="font-bebas text-2xl text-foreground">{initial}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="font-bebas text-3xl leading-none text-foreground" numberOfLines={1}>{displayName}</Text>
            <Text className="mt-1 font-mono text-[11px] text-muted-foreground">
              Miembro desde {profile.memberSince} · Fase {profile.phase}
            </Text>
          </View>
        </View>

        {/* Seguir / dejar de seguir (el bloqueo vive en el menú ⋯ del header) */}
        {canAct && !blocked ? (
          <View className="mb-6 self-start">
            <Button
              variant={following ? 'outline' : 'default'}
              size="sm"
              disabled={followLoading}
              onPress={async () => {
                setFollowLoading(true)
                try {
                  if (following) await unfollow(userId!)
                  else await follow(userId!)
                } finally {
                  setFollowLoading(false)
                }
              }}
              className={cn('self-start', !following && 'bg-lime')}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={following ? '#888899' : '#000'} />
              ) : (
                <Text className={cn('font-mono text-[11px] tracking-widest', following ? 'text-foreground' : 'text-black')}>
                  {following ? 'SIGUIENDO' : 'SEGUIR'}
                </Text>
              )}
            </Button>
          </View>
        ) : null}

        {/* Estado bloqueado — banner spec-sheet con acción clara de deshacer */}
        {canAct && blocked ? (
          <View className="mb-6 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <View className="flex-row items-center gap-2">
              <UserX size={16} color="#ef4444" />
              <Text className="font-bebas text-xl leading-none text-red-500">{t('blocks.blockedState')}</Text>
            </View>
            <Text className="mt-1.5 font-mono text-[11px] leading-4 text-muted-foreground">
              {t('blocks.blockedNote')}
            </Text>
            <Button
              variant="danger"
              size="sm"
              disabled={blockLoading}
              onPress={() => { void doUnblock() }}
              className="mt-3 self-start"
            >
              {blockLoading ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text className="font-mono text-[11px] tracking-widest">{t('blocks.unblockBtn')}</Text>
              )}
            </Button>
          </View>
        ) : null}

        {/* Con bloqueo activo el servidor filtra sessions/stats: mostraríamos
            ceros que parecen datos reales. Se oculta el contenido (patrón
            Instagram: shell del perfil + banner, sin grid). */}
        {!blocked ? (<>

        {/* Stats */}
        <View className="mb-6 flex-row gap-2">
          <StatBox label="Sesiones" value={profile.totalSessions} accent="text-lime" />
          <StatBox label="Racha" value={profile.currentStreak} accent="text-sky-500" unit="d" />
          <StatBox label="Mejor" value={profile.bestStreak} accent="text-amber-400" unit="d" />
          <StatBox label="Nivel" value={profile.level} accent="text-pink-500" />
        </View>

        {/* Programa actual */}
        {profile.activeProgram ? (
          <View className="mb-6 rounded-xl border border-border bg-card p-4">
            <Text className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Programa actual</Text>
            <Text className="font-sans-medium text-foreground">{l(profile.activeProgram.name)}</Text>
            <Text className="font-mono text-[11px] text-muted-foreground">Fase {profile.phase}</Text>
          </View>
        ) : null}

        {/* PRs */}
        <View className="mb-6 rounded-xl border border-border bg-card p-4">
          <Text className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Records personales</Text>
          <View className="gap-2.5">
            {PR_DEFS.map((pr) => (
              <View key={pr.key} className="flex-row items-center justify-between">
                <Text className="text-sm text-foreground">{pr.label}</Text>
                <Text className={cn('font-sans-medium text-sm', pr.accent)}>
                  {profile.prs[pr.key] || 0}{pr.unit}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Calendario de actividad */}
        <View className="mb-6">
          <Text className="mb-3 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">Actividad este mes</Text>
          <View className="flex-row flex-wrap gap-1">
            {Object.entries(profile.monthActivity).map(([date, active]) => (
              <View
                key={date}
                className={cn(
                  'size-6 rounded',
                  active ? 'bg-lime' : date === today ? 'border border-lime/40 bg-lime/15' : 'bg-muted',
                )}
              />
            ))}
          </View>
        </View>

        {/* Sesiones recientes */}
        {profile.recentSessions.length > 0 ? (
          <View>
            <Text className="mb-3 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">Sesiones recientes</Text>
            <View className="gap-1.5">
              {profile.recentSessions.map((s) => {
                const d = new Date(s.completedAt.replace(' ', 'T'))
                const fdate = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
                // Título y nota llegan crudos del hook: se localizan aquí.
                const workoutTitle = l(s.workoutTitle)
                const note = l(s.note)
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push({ pathname: '/s/[id]', params: { id: s.id } })}
                    className="rounded-md border border-border border-l-[3px] border-l-lime bg-card px-3 py-2.5 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={workoutTitle}
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 font-sans-medium text-sm text-foreground" numberOfLines={1}>{workoutTitle}</Text>
                      <ChevronRight size={15} color="hsl(0 0% 40%)" />
                    </View>
                    <View className="mt-0.5 flex-row items-center gap-2">
                      {s.phase > 0 && (
                        <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Fase {s.phase}</Text>
                      )}
                      <Text className="text-[10px] text-muted-foreground">{fdate}</Text>
                    </View>
                    {note ? (
                      <Text className="mt-1.5 border-t border-border/50 pt-1.5 text-[11px] italic text-muted-foreground" numberOfLines={1}>
                        &quot;{note}&quot;
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        </>) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
