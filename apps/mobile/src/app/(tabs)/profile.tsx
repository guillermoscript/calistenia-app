// Versión compacta del ProfilePage web: identidad, idioma, cuenta y sesión.
// Los campos extensos (peso/altura/salud/timezone) siguen solo en la web.
import { useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { LogOut, Bell, ChevronRight, Watch } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme-mode'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { pb, logout } from '@calistenia/core/lib/pocketbase'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'

type SaveState = 'idle' | 'saving' | 'saved'

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { settings } = useWorkoutState()
  const { getTotalSessions, getLongestStreak, getWeeklyDoneCount } = useWorkoutActions()

  const [name, setName] = useState((user?.display_name as string) || (user?.name as string) || '')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode)

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode)
    setThemeModeState(mode)
  }

  const currentLang = i18n.language.startsWith('en') ? 'en' : 'es'
  const initial = (name || (user?.email as string) || '?').trim().charAt(0).toUpperCase()

  const handleSaveName = async () => {
    if (!user || saveState === 'saving') return
    setSaveState('saving')
    try {
      await pb.collection('users').update(user.id, { display_name: name.trim() })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('idle')
    }
  }

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-8 gap-4">
        {/* Header */}
        <View className="pt-2">
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('profile.accountLabel')}
          </Text>
          <Text className="mt-1 font-bebas text-[40px] leading-none text-foreground">{t('profile.title')}</Text>
        </View>

        {/* Identidad */}
        <Card>
          <CardContent className="gap-4 py-5">
            <View className="flex-row items-center gap-4">
              <View className="size-16 items-center justify-center rounded-full border border-border bg-muted">
                <Text className="font-bebas text-3xl leading-none text-foreground">{initial}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                  {name || t('profile.namePlaceholder')}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground" numberOfLines={1}>
                  {(user?.email as string) || ''}
                </Text>
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-[11px] text-muted-foreground">{t('profile.name')}</Text>
              <View className="flex-row gap-2">
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder={t('profile.namePlaceholder')}
                  className="h-11 flex-1"
                  maxLength={60}
                />
                <Button
                  className="h-11 bg-lime px-4 active:bg-lime/90"
                  onPress={handleSaveName}
                  disabled={saveState === 'saving'}
                >
                  <Text className="font-bebas text-base tracking-wide text-lime-foreground">
                    {saveState === 'saving' ? t('profile.saving') : saveState === 'saved' ? t('profile.saved') : t('common.save').toUpperCase()}
                  </Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatCard label={t('profile.sessions', { defaultValue: 'Sesiones' })} value={String(getTotalSessions())} />
          <StatCard label={t('profile.streak', { defaultValue: 'Racha' })} value={String(getLongestStreak())} />
          <StatCard label={t('common.week')} value={`${getWeeklyDoneCount()}/${settings.weeklyGoal || 5}`} />
        </View>

        {/* Recordatorios */}
        <Pressable onPress={() => router.push('/reminders')}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Bell size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('profile.reminders')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('profile.remindersDesc')}
                </Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {/* Reloj y salud */}
        <Pressable onPress={() => router.push('/health')}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Watch size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">
                  {t('profile.health', { defaultValue: 'Reloj y salud' })}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('profile.healthDesc', { defaultValue: 'Conecta tu reloj vía Health Connect' })}
                </Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {/* Idioma */}
        <Card>
          <CardContent className="gap-3 py-4">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('profile.language')}
            </Text>
            <View className="flex-row gap-2">
              {([['es', 'Español'], ['en', 'English']] as const).map(([code, label]) => (
                <Pressable
                  key={code}
                  onPress={() => i18n.changeLanguage(code)}
                  className={cn(
                    'h-11 flex-1 items-center justify-center rounded-md border',
                    currentLang === code ? 'border-lime/40 bg-lime/10' : 'border-border',
                  )}
                >
                  <Text className={cn('font-mono text-xs tracking-wide', currentLang === code ? 'text-lime' : 'text-muted-foreground')}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Tema */}
        <Card>
          <CardContent className="gap-3 py-4">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('profile.theme')}
            </Text>
            <View className="flex-row gap-2">
              {([
                ['system', t('profile.themeSystem')],
                ['light', t('profile.themeLight')],
                ['dark', t('profile.themeDark')],
              ] as const).map(([mode, label]) => (
                <Pressable
                  key={mode}
                  onPress={() => changeTheme(mode)}
                  className={cn(
                    'h-11 flex-1 items-center justify-center rounded-md border',
                    themeMode === mode ? 'border-lime/40 bg-lime/10' : 'border-border',
                  )}
                >
                  <Text className={cn('font-mono text-xs tracking-wide', themeMode === mode ? 'text-lime' : 'text-muted-foreground')}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Cuenta */}
        <Card>
          <CardContent className="gap-2.5 py-4">
            <Text className="mb-0.5 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('profile.accountSection')}
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] text-muted-foreground">{t('profile.email')}</Text>
              <Text className="text-sm text-foreground" numberOfLines={1}>{(user?.email as string) || '—'}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] text-muted-foreground">{t('profile.memberSince')}</Text>
              <Text className="font-mono text-xs text-foreground">
                {user?.created ? utcToLocalDateStr(user.created as string) : '—'}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Sesión */}
        <Button
          variant="outline"
          className="h-12 border-destructive/30 bg-destructive/5 active:bg-destructive/10"
          onPress={handleLogout}
        >
          <View className="flex-row items-center gap-2">
            <LogOut size={15} color="hsl(0 72% 55%)" />
            <Text className="font-mono text-xs tracking-[2px] text-destructive">{t('nav.signOut').toUpperCase()}</Text>
          </View>
        </Button>

        <Text className="text-center font-mono text-[9px] tracking-[2px] text-muted-foreground/50">
          v{Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="items-center py-4">
        <Text className="font-bebas text-2xl leading-none text-foreground">{value}</Text>
        <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>{label}</Text>
      </CardContent>
    </Card>
  )
}
