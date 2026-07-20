/**
 * SleepCard — tarjeta de Home "¿Cómo dormiste?" (paridad con
 * apps/web/src/components/sleep/SleepDashboardWidget.tsx en DashboardPage).
 * Solo lectura + navegación: el registro/edición vive en la screen `/sleep`
 * (mismo patrón que el widget web, que navega a `/sleep` en vez de abrir el
 * form inline). Reusa useSleep del core — no toca PocketBase aquí.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Moon } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useSleep } from '@calistenia/core/hooks/useSleep'
import { daysAgoStr } from '@calistenia/core/lib/dateUtils'

const QUALITY_LABEL_KEYS = ['', 'sleep.quality.1', 'sleep.quality.2', 'sleep.quality.3', 'sleep.quality.4', 'sleep.quality.5']

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function qualityColor(q: number): string {
  if (q <= 2) return '#ef4444'
  if (q === 3) return '#fbbf24'
  return '#10b981'
}

export default function SleepCard({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { entries, isReady } = useSleep(userId)

  const lastNightDate = daysAgoStr(1)
  const lastEntry = entries.find((e) => e.date === lastNightDate) || null

  if (!isReady) return null

  const handlePress = () => {
    haptics.selection()
    router.push('/sleep')
  }

  return (
    <Pressable onPress={handlePress} className="active:opacity-80">
      <View
        className={cn(
          'flex-row items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 border-l-[3px]',
          lastEntry ? (lastEntry.quality >= 4 ? 'border-l-emerald-500' : lastEntry.quality === 3 ? 'border-l-amber-400' : 'border-l-red-500') : 'border-l-indigo-400',
        )}
      >
        <View className="size-11 items-center justify-center rounded-full bg-indigo-400/10">
          <Moon size={20} color="#818cf8" />
        </View>
        <View className="flex-1">
          <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">{t('sleep.title')}</Text>
          {lastEntry ? (
            <>
              <Text className="mt-0.5 font-sans-medium text-foreground">
                {formatDuration(lastEntry.duration_minutes)}
                <Text className="text-muted-foreground"> · </Text>
                <Text style={{ color: qualityColor(lastEntry.quality) }}>{t(QUALITY_LABEL_KEYS[lastEntry.quality])}</Text>
              </Text>
              <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {lastEntry.bedtime} — {lastEntry.wake_time}
              </Text>
            </>
          ) : (
            <>
              <Text className="mt-0.5 font-sans-medium text-indigo-400">{t('sleep.howDidYouSleep')}</Text>
              <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">{t('sleep.tapToRegister')}</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  )
}
