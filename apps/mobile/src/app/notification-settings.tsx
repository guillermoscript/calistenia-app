/**
 * Notification Settings — stacked expo-router screen.
 * Controls per-category push notification preferences stored in
 * PocketBase `notification_prefs` (opt-out model; missing row/field = enabled).
 *
 * Uses useNotificationPrefs from @calistenia/core.
 */
import { useCallback } from 'react'
import {
  View,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import {
  useNotificationPrefs,
  NOTIFICATION_PREF_KEYS,
} from '@calistenia/core/hooks/useNotificationPrefs'
import type { NotificationPrefs } from '@calistenia/core/hooks/useNotificationPrefs'

// ── Group definitions ──────────────────────────────────────────────────────────

type PrefKey = keyof NotificationPrefs

interface PrefGroup {
  headingKey: string
  keys: PrefKey[]
}

const PREF_GROUPS: PrefGroup[] = [
  {
    headingKey: 'notifSettings.sectionSocial',
    keys: ['reactions', 'comments', 'follows', 'challenges', 'referrals'],
  },
  {
    headingKey: 'notifSettings.sectionFriends',
    keys: ['friend_workouts', 'friend_streaks', 'friend_achievements'],
  },
  {
    headingKey: 'notifSettings.sectionYou',
    keys: ['own_milestones'],
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

interface PrefRowProps {
  label: string
  value: boolean
  disabled: boolean
  onChange: (v: boolean) => void
  lime: string
}

function PrefRow({ label, value, disabled, onChange, lime }: PrefRowProps) {
  return (
    <View className="flex-row items-center justify-between py-3 px-4">
      <Text
        className="font-sans-medium text-sm text-foreground flex-1 pr-4"
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: 'rgba(255,255,255,0.15)', true: lime }}
        thumbColor="#ffffff"
        ios_backgroundColor="rgba(255,255,255,0.15)"
      />
    </View>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const LIME = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'

  const user = useAuthUser()
  const userId = user?.id ?? null

  const { prefs, loading, saving, setPref } = useNotificationPrefs(userId)

  const handleMaster = useCallback(
    (v: boolean) => setPref('push_enabled', v),
    [setPref],
  )

  // Categories independently mute BOTH the in-app inbox and push, so they stay
  // toggleable regardless of the push master. (push_enabled only kills push;
  // turning a category off also removes it from the inbox.) Optimistic updates
  // mean there's no need to disable rows while saving.
  const rowsDisabled = false

  // Verify all expected keys are present (type safety via NOTIFICATION_PREF_KEYS).
  void NOTIFICATION_PREF_KEYS // keep import used

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerClassName="pb-16"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <View className="px-4 pt-2 pb-2">
          <Pressable
            onPress={() => router.back()}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
          >
            <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Text className="font-bebas text-4xl text-foreground">
            {t('notifSettings.title')}
          </Text>
          <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('notifSettings.subtitle')}
          </Text>
        </View>

        <View className="h-px bg-border" />

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {loading ? (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator color="hsl(74 90% 45%)" />
          </View>
        ) : (
          <>
            {/* ── Master push toggle ─────────────────────────────────────────── */}
            <View className="mx-4 mt-5 rounded-xl bg-muted/20 overflow-hidden">
              <View className="flex-row items-center justify-between px-4 py-4">
                <View className="flex-1 pr-4">
                  <Text className="font-sans-medium text-sm text-foreground">
                    {t('notifSettings.pushMaster')}
                  </Text>
                  <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {t('notifSettings.pushMasterDesc')}
                  </Text>
                </View>
                <Switch
                  value={prefs.push_enabled}
                  onValueChange={handleMaster}
                  disabled={saving}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: LIME }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="rgba(255,255,255,0.15)"
                />
              </View>
            </View>

            {/* ── Per-category groups ────────────────────────────────────────── */}
            {PREF_GROUPS.map((group) => (
              <View key={group.headingKey} className="mx-4 mt-5">
                <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground px-1">
                  {t(group.headingKey)}
                </Text>
                <View className="rounded-xl bg-muted/20 overflow-hidden">
                  {group.keys.map((key, idx) => (
                    <View key={key}>
                      {idx > 0 && <View className="mx-4 h-px bg-border/40" />}
                      <PrefRow
                        label={t(`notifSettings.${key}`)}
                        value={prefs[key]}
                        disabled={rowsDisabled}
                        onChange={(v) => setPref(key, v)}
                        lime={LIME}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
