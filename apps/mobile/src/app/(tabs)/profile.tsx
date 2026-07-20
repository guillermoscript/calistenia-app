// Versión compacta del ProfilePage web: identidad, idioma, cuenta y sesión.
// Los campos extensos (peso/altura/salud/timezone) siguen solo en la web.
import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, Bell, ChevronRight, Watch, Sun, Moon, Smartphone, Sparkles, Camera, UserX, Compass } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme-mode'
import { ChangelogHistory } from '@/components/WhatsNewModal'
import { DiscoverSheet } from '@/components/DiscoverSheet'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { pb, logout } from '@calistenia/core/lib/pocketbase'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { recomputeAutoNutritionGoal } from '@calistenia/core/hooks/useNutrition'
import { SUPPORTED_CURRENCIES, currencySymbol } from '@calistenia/core/lib/money'
import { parseDecimal } from '@calistenia/core/lib/bmi'
import type { ActivityLevel } from '@/components/onboarding/StepGoals'
import { Sentry } from '@/lib/instrument'

type SaveState = 'idle' | 'saving' | 'saved'

const ACTIVITY_LEVEL_IDS: ActivityLevel[] = ['sedentary', 'light', 'active', 'very_active']
const ACTIVITY_LEVEL_LABEL_KEYS: Record<ActivityLevel, string> = {
  sedentary: 'onboarding.activitySedentary',
  light: 'onboarding.activityLight',
  active: 'onboarding.activityActive',
  very_active: 'onboarding.activityVeryActive',
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { settings } = useWorkoutState()
  const { colorScheme } = useColorScheme()
  const { getTotalSessions, getLongestStreak, getWeeklyDoneCount } = useWorkoutActions()

  // Lime se aclara/oscurece según el tema (paridad con reminders.tsx); muted = chevron gris.
  const lime = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'
  const muted = 'hsl(0 0% 45%)'

  const queryClient = useQueryClient()
  const [name, setName] = useState((user?.display_name as string) || (user?.name as string) || '')
  // Multimoneda (USD de referencia): moneda en la que el user habla en la despensa
  const { prefs: currencyPrefs, setDefaultCurrency } = useUserCurrency((user?.id as string) ?? null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)

  // Cuerpo (#243 F4a): peso/altura/edad/sexo/actividad — hoy solo editables en
  // web; se portan aquí para que el objetivo nutricional 'auto' pueda seguir
  // recalculándose cuando el usuario actualiza su perfil desde el móvil.
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'' | 'male' | 'female'>('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('')
  const [bodySaveState, setBodySaveState] = useState<SaveState>('idle')
  // No permitir guardar hasta que carguen los datos actuales (ni si la carga
  // falla): guardar con los campos vacíos borraría peso/altura/edad/sexo/
  // actividad ya guardados. (#243 F4a)
  const [bodyLoaded, setBodyLoaded] = useState(false)
  // Edad/sexo son PII ocultos en `users` (fix GHSA-wwj3-9h95-wcpf): no se
  // serializan ni se pueden escribir con token de usuario. Su fuente fiable es
  // la fila de `nutrition_goals` (protegida per-user), que además es lo que
  // consume el cálculo de calorías. Guardamos su id para poder actualizarla.
  const [bodyGoalId, setBodyGoalId] = useState<string | null>(null)

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
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_display_name' } })
      setSaveState('idle')
    }
  }

  // Carga peso/altura/edad/sexo/actividad guardados (no vienen en el modelo
  // de auth) para poder editarlos aquí.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        // Peso/altura/actividad viven en `users` (no ocultos).
        const rec: any = await pb.collection('users').getOne(user.id)
        if (cancelled) return
        setWeight(rec.weight ? String(rec.weight) : '')
        setHeight(rec.height ? String(rec.height) : '')
        setActivityLevel((rec.activity_level as ActivityLevel) || '')
        // Edad/sexo desde la fila de nutrition_goals (PII protegida). Si el
        // usuario aún no tiene objetivo, quedan vacíos y solo se fijarán al
        // crear uno (el wizard los pide). (#243 F4a)
        try {
          const goal: any = await pb.collection('nutrition_goals').getFirstListItem(
            pb.filter('user = {:uid}', { uid: user.id }), { $autoCancel: false },
          )
          if (cancelled) return
          setBodyGoalId(goal.id)
          setAge(goal.age ? String(goal.age) : '')
          setSex((goal.sex as 'male' | 'female') || '')
        } catch { /* sin objetivo todavía: edad/sexo vacíos */ }
        if (!cancelled) setBodyLoaded(true)
      } catch (e) {
        Sentry.captureException(e, { tags: { feature: 'profile', op: 'load_body_fields' } })
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const handleSaveBody = async () => {
    if (!user || bodySaveState === 'saving' || !bodyLoaded) return
    setBodySaveState('saving')
    try {
      // Peso/altura/actividad → `users` (campos no ocultos).
      await pb.collection('users').update(user.id, {
        weight: parseDecimal(weight),
        height: parseDecimal(height),
        activity_level: activityLevel || '',
      })
      // Edad/sexo → fila de `nutrition_goals` (PII protegida; en `users` están
      // ocultos y no se pueden escribir con token de usuario). Solo si ya hay
      // objetivo; el recompute de abajo la releerá desde ahí. (#243 F4a)
      if (bodyGoalId) {
        await pb.collection('nutrition_goals').update(bodyGoalId, {
          age: age ? parseInt(age, 10) : null,
          sex: sex || '',
        }).catch((e) => {
          Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_body_age_sex' } })
        })
      }
      setBodySaveState('saved')
      setTimeout(() => setBodySaveState('idle'), 2000)
      // Reactivo (#243 F3): si el goal nutricional guardado es 'auto', refresca
      // sus macros con los datos corporales recién guardados. Best-effort — un
      // fallo aquí no debe bloquear el feedback de guardado de arriba.
      recomputeAutoNutritionGoal(user.id, queryClient).catch((e) => {
        Sentry.captureException(e, { tags: { feature: 'profile', op: 'recompute_auto_goal' } })
      })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_body_fields' } })
      setBodySaveState('idle')
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

        {/* Cuerpo (#243 F4a): alimenta el objetivo nutricional 'auto' */}
        <Card>
          <CardContent className="gap-4 py-5">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('profile.sectionBody')}
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Text className="text-[11px] text-muted-foreground">{t('profile.weight')}</Text>
                <Input
                  value={weight}
                  onChangeText={setWeight}
                  placeholder={t('profile.weightPlaceholder')}
                  keyboardType="decimal-pad"
                  className="h-11"
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-[11px] text-muted-foreground">{t('profile.height')}</Text>
                <Input
                  value={height}
                  onChangeText={setHeight}
                  placeholder={t('profile.heightPlaceholder')}
                  keyboardType="decimal-pad"
                  className="h-11"
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-[11px] text-muted-foreground">{t('profile.age')}</Text>
                <Input
                  value={age}
                  onChangeText={setAge}
                  placeholder={t('profile.agePlaceholder')}
                  keyboardType="number-pad"
                  className="h-11"
                />
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-[11px] text-muted-foreground">{t('profile.sex')}</Text>
              <View className="flex-row gap-2">
                {([['male', t('profile.male')], ['female', t('profile.female')]] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => setSex(sex === value ? '' : value)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      sex === value ? 'border-lime/40 bg-lime/10' : 'border-border',
                    )}
                  >
                    <Text className={cn('text-sm', sex === value ? 'text-lime' : 'text-muted-foreground')}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-[11px] text-muted-foreground">{t('onboarding.activityLevel')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {ACTIVITY_LEVEL_IDS.map(id => (
                  <Pressable
                    key={id}
                    onPress={() => setActivityLevel(activityLevel === id ? '' : id)}
                    className={cn(
                      'h-11 min-w-[45%] flex-1 items-center justify-center rounded-md border',
                      activityLevel === id ? 'border-lime/40 bg-lime/10' : 'border-border',
                    )}
                  >
                    <Text className={cn('text-xs', activityLevel === id ? 'text-lime' : 'text-muted-foreground')}>
                      {t(ACTIVITY_LEVEL_LABEL_KEYS[id])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Button
              className="h-11 bg-lime active:bg-lime/90"
              onPress={handleSaveBody}
              disabled={bodySaveState === 'saving' || !bodyLoaded}
            >
              <Text className="font-bebas text-base tracking-wide text-lime-foreground">
                {bodySaveState === 'saving' ? t('profile.saving') : bodySaveState === 'saved' ? t('profile.saved') : t('common.save').toUpperCase()}
              </Text>
            </Button>
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

        {/* Fotos de progreso */}
        <Pressable onPress={() => router.push('/progress-photos')}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Camera size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('progress.bodyPhotos.title')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('progress.bodyPhotos.rowDesc')}
                </Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {/* Usuarios bloqueados */}
        <Pressable onPress={() => router.push('/blocked-users' as never)}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <UserX size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('blocks.manageEntry')}</Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {/* Descubre — directorio de todas las features (issue #236) */}
        <Pressable onPress={() => setDiscoverOpen(true)}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Compass size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('profile.discover')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('profile.discoverDesc')}
                </Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {/* Novedades / historial de cambios */}
        <Pressable onPress={() => setHistoryOpen(true)}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Sparkles size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('profile.whatsNew')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('profile.whatsNewDesc')}
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

        {/* Moneda (despensa: en qué moneda hablas; el gasto siempre se muestra en $) */}
        <Card>
          <CardContent className="gap-3 py-4">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('profile.currency', { defaultValue: 'Moneda' })}
            </Text>
            <View className="flex-row gap-2">
              {SUPPORTED_CURRENCIES.map(code => {
                const active = currencyPrefs.defaultCurrency === code
                return (
                  <Pressable
                    key={code}
                    onPress={() => setDefaultCurrency(code)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      active ? 'border-lime/40 bg-lime/10' : 'border-border',
                    )}
                  >
                    <Text className={cn('font-mono text-xs tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {currencySymbol(code)} {code}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text className="font-mono text-[9px] tracking-wide text-muted-foreground/70">
              {t('profile.currencyDesc', { defaultValue: 'El gasto se muestra siempre en $ (USD de referencia).' })}
            </Text>
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
                ['system', t('profile.themeSystem'), Smartphone],
                ['light', t('profile.themeLight'), Sun],
                ['dark', t('profile.themeDark'), Moon],
              ] as const).map(([mode, label, Icon]) => {
                const active = themeMode === mode
                return (
                  <Pressable
                    key={mode}
                    onPress={() => changeTheme(mode)}
                    className={cn(
                      'flex-1 items-center justify-center gap-1.5 rounded-md border py-3',
                      active ? 'border-lime/40 bg-lime/10' : 'border-border',
                    )}
                  >
                    <Icon size={18} color={active ? lime : muted} />
                    <Text className={cn('font-mono text-xs tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
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

      <ChangelogHistory visible={historyOpen} onClose={() => setHistoryOpen(false)} />
      <DiscoverSheet visible={discoverOpen} onClose={() => setDiscoverOpen(false)} />
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
