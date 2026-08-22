// Carné de atleta: quién eres primero (nivel, cifras, skills, cuerpo) y los
// ajustes al final, una sola fila por tema. Misma estructura que el perfil web:
// lo que se edita se despliega aquí mismo, lo que es otra pantalla navega.
import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable, Linking, Switch, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, ChevronRight, Sun, Moon, Smartphone, Trash2 } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme-mode'
import { ChangelogHistory } from '@/components/WhatsNewModal'
import { DiscoverSheet } from '@/components/DiscoverSheet'
import { DeleteAccountModal } from '@/components/profile/DeleteAccountModal'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { pb, logout } from '@calistenia/core/lib/pocketbase'
import { utcToLocalDateStr, todayStr } from '@calistenia/core/lib/dateUtils'
import { buildSkills, programWeek } from '@calistenia/core/lib/athlete-card'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { usePrivateAccount } from '@calistenia/core/hooks/usePrivateAccount'
import { recomputeAutoNutritionGoal } from '@calistenia/core/hooks/useNutrition'
import {
  fetchProfileBody, saveBodyDemographics, bodyUserPatch, bodyFromUserRecord,
} from '@calistenia/core/hooks/useProfileForm'
import { SUPPORTED_CURRENCIES, currencySymbol } from '@calistenia/core/lib/money'
import type { ActivityLevel } from '@/components/onboarding/StepGoals'
import { Sentry } from '@/lib/instrument'

type SaveState = 'idle' | 'saving' | 'saved'
/** Temas de ajuste que se despliegan en la lista del final. */
type SettingsSection = 'body' | 'prefs' | 'account'

const ACTIVITY_LEVEL_IDS: ActivityLevel[] = ['sedentary', 'light', 'active', 'very_active']
const ACTIVITY_LEVEL_LABEL_KEYS: Record<ActivityLevel, string> = {
  sedentary: 'onboarding.activitySedentary',
  light: 'onboarding.activityLight',
  active: 'onboarding.activityActive',
  very_active: 'onboarding.activityVeryActive',
}
const LEVEL_LABEL_KEYS: Record<string, string> = {
  principiante: 'difficulty.beginner',
  intermedio: 'difficulty.intermediate',
  avanzado: 'difficulty.advanced',
}

/**
 * Fila de ajuste: una por tema, con su valor a la derecha. Despliega su panel
 * o navega, nunca las dos cosas.
 *
 * Vive a nivel de módulo, no dentro de la pantalla: definirla en el render la
 * recrearía en cada pulsación y React desmontaría el panel abierto — los
 * `Input` de dentro perderían el foco a cada letra.
 */
function SettingsRow({ label, value, open, onPress, bordered, muted, children }: {
  label: string
  value?: string
  /** Solo para las filas que despliegan; las que navegan no la pasan. */
  open?: boolean
  onPress: () => void
  bordered: boolean
  muted: string
  children?: React.ReactNode
}) {
  return (
    <View className={cn(bordered && 'border-t border-border/70')}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={children ? { expanded: !!open } : undefined}
        className="flex-row items-center gap-3 px-5 py-3.5 active:bg-muted/70"
      >
        <Text className="flex-1 text-[15px] text-foreground">{label}</Text>
        {value ? (
          <Text className="shrink font-mono text-[11px] text-muted-foreground" numberOfLines={1}>{value}</Text>
        ) : null}
        <View className="shrink-0" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRight size={16} color={muted} />
        </View>
      </Pressable>
      {open && children ? <View className="px-5 pb-5 pt-1">{children}</View> : null}
    </View>
  )
}

/** Cifra grande + etiqueta mono: las tres del carné. */
function StatTile({ label, value, lime }: { label: string; value: string; lime?: boolean }) {
  return (
    <View className="flex-1 rounded-lg border border-border p-3">
      <Text className={cn('font-bebas text-[32px] leading-none', lime ? 'text-lime' : 'text-foreground')}>{value}</Text>
      <Kicker size="xs" className="mt-1" numberOfLines={1}>{label}</Kicker>
    </View>
  )
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { settings, activeProgram } = useWorkoutState()
  const { colorScheme } = useColorScheme()
  const { getTotalSessions, getLongestStreak, getWeeklyDoneCount } = useWorkoutActions()

  // Lime se aclara/oscurece según el tema (paridad con reminders.tsx); muted = chevron gris.
  const lime = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'
  const muted = 'hsl(0 0% 45%)'
  // Cuenta privada (#422): seguirte requiere aprobación.
  const { isPrivate, saving: privacySaving, setPrivate } = usePrivateAccount(user?.id ?? null)
  const togglePrivate = async (next: boolean) => {
    const ok = await setPrivate(next)
    if (!ok) Alert.alert(t('privacy.saveError'))
  }

  const queryClient = useQueryClient()
  const [name, setName] = useState((user?.display_name as string) || (user?.name as string) || '')
  // Multimoneda (USD de referencia): moneda en la que el user habla en la despensa
  const { prefs: currencyPrefs, setDefaultCurrency } = useUserCurrency((user?.id as string) ?? null)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null)

  // Cuerpo (#243 F4a): peso/altura/edad/sexo/actividad — alimentan el objetivo
  // nutricional 'auto', así que se pueden editar también desde el móvil.
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'' | 'male' | 'female'>('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('')
  const [level, setLevel] = useState('')
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

  const toggleSection = (id: SettingsSection) =>
    setOpenSection(prev => (prev === id ? null : id))

  const currentLang = i18n.language.startsWith('en') ? 'en' : 'es'
  const initial = (name || (user?.email as string) || '?').trim().charAt(0).toUpperCase()

  // Carné: las mismas cifras que el dashboard y las mismas cinco skills que el
  // perfil público, para que nada discrepe entre pantallas.
  const totalSessions = getTotalSessions()
  const streak = getLongestStreak()
  const weeklyDone = getWeeklyDoneCount()
  const skills = buildSkills(settings as unknown as Record<string, number>)
  const hasSkills = skills.some(s => s.value > 0)
  const week = programWeek(settings.startDate, activeProgram?.duration_weeks, todayStr())
  const levelLabel = level && LEVEL_LABEL_KEYS[level] ? t(LEVEL_LABEL_KEYS[level]) : ''
  const identityLine = [
    levelLabel,
    week ? t('profile.weekOfTotal', { current: week.current, total: week.total }) : null,
  ].filter(Boolean).join(' · ')

  // Carga nombre/nivel/peso/altura/edad/sexo/actividad guardados (no vienen en
  // el modelo de auth) para poder editarlos aquí.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        // Peso/altura/actividad/nivel viven en `users` (no ocultos).
        const rec: any = await pb.collection('users').getOne(user.id, { requestKey: null })
        if (cancelled) return
        const body = bodyFromUserRecord(rec)
        setWeight(body.weight)
        setHeight(body.height)
        setActivityLevel(body.activityLevel)
        setLevel(rec.level || '')
        // Edad/sexo desde la fila de nutrition_goals (PII protegida). Si el
        // usuario aún no tiene objetivo, quedan vacíos y solo se fijarán al
        // crear uno (el wizard los pide). (#243 F4a)
        const demo = await fetchProfileBody(user.id)
        if (cancelled) return
        setBodyGoalId(demo.bodyGoalId)
        setAge(demo.age)
        setSex(demo.sex as 'male' | 'female' | '')
        setBodyLoaded(true)
      } catch (e) {
        Sentry.captureException(e, { tags: { feature: 'profile', op: 'load_body_fields' } })
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Un solo guardado para todo el panel de cuerpo: el nombre viaja en la misma
  // escritura a `users` que peso/altura/actividad, así que no hay dos botones.
  const handleSaveBody = async () => {
    if (!user || bodySaveState === 'saving' || !bodyLoaded) return
    setBodySaveState('saving')
    try {
      await pb.collection('users').update(user.id, {
        display_name: name.trim(),
        ...bodyUserPatch({ weight, height, activityLevel }),
      })
      // Edad/sexo → fila de `nutrition_goals` (PII protegida; en `users` están
      // ocultos y no se pueden escribir con token de usuario). Solo si ya hay
      // objetivo; el recompute de abajo la releerá desde ahí. (#243 F4a)
      await saveBodyDemographics(bodyGoalId, age, sex, (e) => {
        Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_body_age_sex' } })
      })
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
      <ScrollView contentContainerClassName="px-4 pb-8 gap-3">
        {/* Header */}
        <View className="pt-2">
          <Kicker>{t('profile.accountLabel')}</Kicker>
          <Text className="mt-1 font-bebas text-[40px] leading-none text-foreground">{t('profile.title')}</Text>
        </View>

        {/* Identidad: avatar, nombre y en qué punto del programa vas. */}
        <Card>
          <CardContent className="flex-row items-center gap-4 py-5">
            <AvatarPicker user={user} initial={initial} />
            <View className="flex-1">
              <Text className="font-bebas text-[28px] leading-none text-foreground" numberOfLines={1}>
                {name || t('profile.namePlaceholder')}
              </Text>
              {identityLine ? (
                <Kicker size="xs" className="mt-1.5" numberOfLines={1}>{identityLine}</Kicker>
              ) : (
                <Kicker size="xs" className="mt-1.5" numberOfLines={1}>{(user?.email as string) || ''}</Kicker>
              )}
            </View>
            <View className="shrink-0 rounded-full bg-lime px-3 py-1">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-foreground">
                {t('profile.phase', { phase: settings.phase || 1 })}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Cifras: tres, grandes, y la racha en lima porque es la que se cuida. */}
        <View className="flex-row gap-3">
          <StatTile label={t('profile.sessions')} value={String(totalSessions)} />
          <StatTile label={t('profile.streak')} value={String(streak)} lime />
          <StatTile label={t('common.week')} value={`${weeklyDone}/${settings.weeklyGoal || 5}`} />
        </View>

        {/* Skills: lo desbloqueado en lima, lo que está en camino con su avance. */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.skills')}</Kicker>
          {hasSkills ? (
            <View className="flex-row flex-wrap gap-2">
              {skills.map(s => (
                <View
                  key={s.key}
                  className={cn(
                    'rounded-full border px-3 py-1.5',
                    s.achieved ? 'border-lime/40 bg-lime/10' : 'border-border',
                  )}
                >
                  <Text className={cn(
                    'font-mono text-[10px] uppercase tracking-widest',
                    s.achieved ? 'text-lime' : 'text-muted-foreground',
                  )}>
                    {s.achieved
                      ? t('profile.skillAchieved', { label: s.label, value: `${s.value}${s.unit === 's' ? 's' : ''}` })
                      : t('profile.skillLocked', { label: s.label, pct: s.pct })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-[13px] text-muted-foreground">{t('profile.skillsEmpty')}</Text>
          )}
        </View>

        {/* Cuerpo: resumen legible; editar abre el panel de la lista de abajo. */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.sectionBody')}</Kicker>
          <Card>
            <CardContent className="flex-row items-center justify-between gap-3 py-4">
              <View className="flex-row gap-5">
                <View>
                  <Text className="font-bebas text-[26px] leading-none text-foreground">
                    {weight || '—'}<Text className="text-[12px] text-muted-foreground"> kg</Text>
                  </Text>
                  <Kicker size="xs" className="mt-0.5">{t('profile.weightShort')}</Kicker>
                </View>
                <View>
                  <Text className="font-bebas text-[26px] leading-none text-foreground">
                    {height || '—'}<Text className="text-[12px] text-muted-foreground"> cm</Text>
                  </Text>
                  <Kicker size="xs" className="mt-0.5">{t('profile.heightShort')}</Kicker>
                </View>
                <View>
                  <Text className="font-bebas text-[26px] leading-none text-foreground">{age || '—'}</Text>
                  <Kicker size="xs" className="mt-0.5">{t('profile.age')}</Kicker>
                </View>
              </View>
              <Button
                variant="outline"
                className="h-9 shrink-0 px-3"
                onPress={() => setOpenSection('body')}
              >
                <Text className="font-mono text-[10px] uppercase tracking-widest text-foreground">
                  {t('common.edit')}
                </Text>
              </Button>
            </CardContent>
          </Card>
        </View>

        {/* Ajustes: una fila por tema. Lo que se edita se despliega aquí mismo;
            lo que es otra pantalla, navega. */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.settings')}</Kicker>
          <Card className="gap-0 py-1">
            <SettingsRow
              label={t('profile.rowBodyGoals')}
              value={weight && height ? `${weight} kg · ${height} cm` : undefined}
              open={openSection === 'body'}
              onPress={() => toggleSection('body')}
              bordered={false}
              muted={muted}
            >
              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="text-[11px] text-muted-foreground">{t('profile.name')}</Text>
                  <Input
                    value={name}
                    onChangeText={setName}
                    placeholder={t('profile.namePlaceholder')}
                    className="h-11"
                    maxLength={60}
                  />
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <Text className="text-[11px] text-muted-foreground">{t('profile.weight')}</Text>
                    <Input value={weight} onChangeText={setWeight} placeholder={t('profile.weightPlaceholder')} keyboardType="decimal-pad" className="h-11" />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Text className="text-[11px] text-muted-foreground">{t('profile.height')}</Text>
                    <Input value={height} onChangeText={setHeight} placeholder={t('profile.heightPlaceholder')} keyboardType="decimal-pad" className="h-11" />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Text className="text-[11px] text-muted-foreground">{t('profile.age')}</Text>
                    <Input value={age} onChangeText={setAge} placeholder={t('profile.agePlaceholder')} keyboardType="number-pad" className="h-11" />
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
                        <Text className={cn('text-sm', sex === value ? 'text-lime' : 'text-muted-foreground')}>{label}</Text>
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
              </View>
            </SettingsRow>

            <SettingsRow
              label={t('profile.rowPreferences')}
              value={`${currentLang.toUpperCase()} · ${currencyPrefs.defaultCurrency}`}
              open={openSection === 'prefs'}
              onPress={() => toggleSection('prefs')}
              bordered
              muted={muted}
            >
              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="text-[11px] text-muted-foreground">{t('profile.language')}</Text>
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
                </View>

                <View className="gap-1.5">
                  <Text className="text-[11px] text-muted-foreground">{t('profile.currency')}</Text>
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
                    {t('profile.currencyDesc')}
                  </Text>
                </View>

                <View className="gap-1.5">
                  <Text className="text-[11px] text-muted-foreground">{t('profile.theme')}</Text>
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
                </View>
              </View>
            </SettingsRow>

            <SettingsRow
              label={t('profile.reminders')}
              onPress={() => router.push('/reminders')}
              bordered
              muted={muted}
            />

            <SettingsRow
              label={t('profile.rowAccountPrivacy')}
              value={(user?.email as string) || undefined}
              open={openSection === 'account'}
              onPress={() => toggleSection('account')}
              bordered
              muted={muted}
            >
              <View className="gap-4">
                <View className="gap-2.5">
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
                </View>

                {/* Cuenta privada (#422): interruptor que se queda aquí, no navega. */}
                <View className="flex-row items-center gap-3 rounded-lg border border-border p-4">
                  <View className="flex-1">
                    <Text className="font-sans-medium text-foreground">{t('privacy.privateAccount')}</Text>
                    <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                      {isPrivate ? t('privacy.privateAccountDesc') : t('privacy.publicAccountDesc')}
                    </Text>
                    {isPrivate ? (
                      <Text className="mt-1.5 font-mono text-[10px] leading-4 tracking-wide text-muted-foreground">
                        {t('privacy.privateNote')}
                      </Text>
                    ) : null}
                  </View>
                  <Switch
                    value={isPrivate}
                    onValueChange={(v) => { void togglePrivate(v) }}
                    disabled={privacySaving}
                    trackColor={{ false: 'rgba(255,255,255,0.15)', true: lime }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="rgba(255,255,255,0.15)"
                    accessibilityLabel={t('privacy.privateAccount')}
                  />
                </View>

                {/* Zona de peligro: baja de cuenta (#300). Al final del todo y
                    separada del cierre de sesión para que no se confundan. */}
                <View className="gap-2.5 rounded-lg border border-destructive/30 p-4">
                  <Kicker className="text-destructive">{t('account.dangerZone')}</Kicker>
                  <Text className="text-[13px] text-muted-foreground">{t('account.deleteDesc')}</Text>
                  <Button
                    variant="outline"
                    className="mt-1 h-11 self-start border-destructive/40 px-4 active:bg-destructive/10"
                    onPress={() => setDeleteOpen(true)}
                  >
                    <View className="flex-row items-center gap-2">
                      <Trash2 size={15} color="hsl(0 72% 55%)" />
                      <Text className="font-mono text-xs tracking-[2px] text-destructive">
                        {t('account.deleteCta').toUpperCase()}
                      </Text>
                    </View>
                  </Button>
                </View>
              </View>
            </SettingsRow>
          </Card>
        </View>

        {/* Bienestar y progreso: todas navegan. */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.wellbeing')}</Kicker>
          <Card className="gap-0 py-1">
            <SettingsRow label={t('profile.health')} onPress={() => router.push('/health')} bordered={false} muted={muted} />
            <SettingsRow label={t('progress.bodyPhotos.title')} onPress={() => router.push('/progress-photos')} bordered muted={muted} />
            <SettingsRow label={t('progress.bodyMeasurements.title')} onPress={() => router.push('/body-measurements' as never)} bordered muted={muted} />
          </Card>
        </View>

        {/* Cuenta y comunidad: todas navegan o abren una hoja. */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.accountTools')}</Kicker>
          <Card className="gap-0 py-1">
            <SettingsRow label={t('referrals.navLabel')} onPress={() => router.push('/referrals')} bordered={false} muted={muted} />
            <SettingsRow label={t('profile.discover')} onPress={() => setDiscoverOpen(true)} bordered muted={muted} />
            <SettingsRow label={t('profile.whatsNew')} onPress={() => setHistoryOpen(true)} bordered muted={muted} />
            <SettingsRow label={t('blocks.manageEntry')} onPress={() => router.push('/blocked-users' as never)} bordered muted={muted} />
            <SettingsRow
              label={t('account.privacyEntry')}
              onPress={() => { Linking.openURL(`${WEB_BASE_URL}/legal#privacy`).catch(() => {}) }}
              bordered
              muted={muted}
            />
          </Card>
        </View>

        {/* Sesión */}
        <Button
          variant="outline"
          className="mt-3 h-12 border-destructive/30 bg-destructive/5 active:bg-destructive/10"
          onPress={handleLogout}
        >
          <View className="flex-row items-center gap-2">
            <LogOut size={15} color="hsl(0 72% 55%)" />
            <Text className="font-mono text-xs tracking-[2px] text-destructive">{t('nav.signOut').toUpperCase()}</Text>
          </View>
        </Button>

        <Text className="mt-2 text-center font-mono text-[9px] tracking-[2px] text-muted-foreground/50">
          v{Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </ScrollView>

      <ChangelogHistory visible={historyOpen} onClose={() => setHistoryOpen(false)} />
      <DiscoverSheet visible={discoverOpen} onClose={() => setDiscoverOpen(false)} />
      <DeleteAccountModal
        visible={deleteOpen}
        email={(user?.email as string) || null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false)
          router.replace('/login')
        }}
      />
    </SafeAreaView>
  )
}
