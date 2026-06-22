/**
 * Pantalla de detalle de una sesión de cardio — accesible desde el feed de amigos
 * o desde el historial propio. Carga la sesión completa (incluyendo gps_points)
 * desde PocketBase y renderiza el mapa + stats + splits + nota + botón de compartir.
 *
 * Ruta: /cardio/[id]
 */
import { useState, useEffect } from 'react'
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { pb } from '@calistenia/core/lib/pocketbase'
import { formatPace, formatDuration, formatSpeed } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import RouteMap from '@/components/cardio/RouteMap'
import ElevationProfile from '@/components/cardio/ElevationProfile'
import SplitsTable from '@/components/cardio/SplitsTable'
import CardioShareButton from '@/components/share/CardioShareButton'
import type { CardioSession } from '@calistenia/core/types'

const LIME = 'hsl(74 90% 45%)'

/** Convert a raw PocketBase record to CardioSession shape. */
function toCardioSession(raw: Record<string, unknown>): CardioSession {
  return {
    id: raw.id as string,
    user: raw.user as string | undefined,
    activity_type: (raw.activity_type as CardioSession['activity_type']) ?? 'running',
    gps_points: Array.isArray(raw.gps_points) ? (raw.gps_points as CardioSession['gps_points']) : [],
    distance_km: (raw.distance_km as number) ?? 0,
    duration_seconds: (raw.duration_seconds as number) ?? 0,
    avg_pace: (raw.avg_pace as number) ?? 0,
    elevation_gain: (raw.elevation_gain as number) ?? 0,
    started_at: (raw.started_at as string) ?? '',
    finished_at: (raw.finished_at as string) ?? '',
    note: raw.note as string | undefined,
    calories_burned: raw.calories_burned as number | undefined,
    max_pace: raw.max_pace as number | undefined,
    avg_speed_kmh: raw.avg_speed_kmh as number | undefined,
    max_speed_kmh: raw.max_speed_kmh as number | undefined,
    splits: Array.isArray(raw.splits) ? (raw.splits as CardioSession['splits']) : [],
  }
}

export default function CardioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const me = useAuthUser()

  const [session, setSession] = useState<CardioSession | null>(null)
  const [authorName, setAuthorName] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const raw = await pb.collection('cardio_sessions').getOne(id, {
          expand: 'user',
          $autoCancel: false,
        })
        if (cancelled) return

        const cs = toCardioSession(raw as unknown as Record<string, unknown>)
        setSession(cs)

        // Pull author display name from expand or fallback
        const expandedUser = (raw as any).expand?.user
        if (expandedUser) {
          setAuthorName(
            expandedUser.display_name ||
              expandedUser.email?.split('@')[0] ||
              undefined,
          )
        }
      } catch (e) {
        if (!cancelled) setError('No se pudo cargar la sesión.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id])

  const isOwnSession = !!me && !!session?.user && me.id === session.user
  const shareUserName = authorName
  const shareReferralCode = isOwnSession
    ? ((me as any)?.referral_code as string | undefined) ?? null
    : null

  const isCycling = session?.activity_type === 'cycling'
  const hasRoute = (session?.gps_points.length ?? 0) > 1
  const activityIcon = session ? (CARDIO_ACTIVITY[session.activity_type ?? 'running']?.icon ?? '') : ''

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={LIME} />
        </View>
      </SafeAreaView>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !session) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">😕</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {error ?? 'Sesión no encontrada.'}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const activity = session.activity_type
  const activityLabel = activity.charAt(0).toUpperCase() + activity.slice(1)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Header
        router={router}
        title={`${activityIcon} ${activityLabel.toUpperCase()}`}
      />

      <ScrollView
        contentContainerClassName="px-4 pb-12 gap-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Author + date subtitle */}
        <View className="pt-1">
          {authorName ? (
            <Text className="font-sans-medium text-foreground text-base" numberOfLines={1}>
              {authorName}
            </Text>
          ) : null}
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground mt-0.5">
            {formatCardioDate(session.finished_at)}
          </Text>
        </View>

        {/* Map */}
        {hasRoute && (
          <RouteMap
            points={session.gps_points}
            pointsVersion={session.gps_points.length}
            height={240}
            live={false}
            activityType={session.activity_type}
          />
        )}

        {/* Elevation profile (self-hides when the track has no altitude data) */}
        {hasRoute && <ElevationProfile points={session.gps_points} height={80} />}

        {/* Primary stats */}
        <View className="flex-row gap-3">
          <StatBox
            value={session.distance_km.toFixed(2)}
            label="KM"
            accent="text-lime"
          />
          <StatBox
            value={formatDuration(session.duration_seconds)}
            label="TIEMPO"
            accent="text-foreground"
          />
          <StatBox
            value={
              isCycling
                ? formatSpeed(session.avg_speed_kmh ?? 0)
                : formatPace(session.avg_pace)
            }
            label={isCycling ? 'KM/H' : 'MIN/KM'}
            accent="text-sky-500"
          />
        </View>

        {/* Secondary stats */}
        <View className="flex-row gap-3">
          <StatBox
            value={String(session.calories_burned ?? 0)}
            label="KCAL"
            accent="text-amber-400"
            small
          />
          <StatBox
            value={`${session.elevation_gain ?? 0}m`}
            label="DESNIVEL"
            accent="text-amber-400"
            small
          />
          <StatBox
            value={
              isCycling
                ? formatSpeed(session.max_speed_kmh ?? 0)
                : formatPace(session.max_pace ?? 0)
            }
            label={isCycling ? 'VEL. MÁX' : 'MEJOR RITMO'}
            accent="text-pink-500"
            small
          />
        </View>

        {/* Splits */}
        {session.splits && session.splits.length > 0 && (
          <View className="gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              SPLITS
            </Text>
            <SplitsTable splits={session.splits} />
          </View>
        )}

        {/* Note */}
        {Boolean(session.note) && (
          <View className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground mb-1.5">
              NOTA
            </Text>
            <Text className="font-sans-italic text-sm text-muted-foreground leading-5">
              &quot;{session.note}&quot;
            </Text>
          </View>
        )}

        {/* Share button (full card with map) */}
        <CardioShareButton
          session={session}
          userName={shareUserName}
          referralCode={shareReferralCode}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, title }: { router: ReturnType<typeof useRouter>; title: string }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        className="p-2"
        accessibilityLabel="Volver"
      >
        <ArrowLeft size={20} color="hsl(0 0% 55%)" />
      </Pressable>
      {title ? (
        <Text className="flex-1 font-bebas text-xl leading-none text-foreground" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  )
}

interface StatBoxProps {
  value: string
  label: string
  accent: string
  small?: boolean
}

function StatBox({ value, label, accent, small }: StatBoxProps) {
  return (
    <View className="flex-1 items-center rounded-xl bg-muted/60 p-4">
      <Text className={`font-bebas ${small ? 'text-2xl' : 'text-3xl'} leading-none ${accent}`}>
        {value}
      </Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}

function formatCardioDate(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.replace(' ', 'T'))
    return d.toLocaleDateString('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
