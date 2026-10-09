// Perfil y ajustes (#859): pantalla de pila que se abre desde el avatar de
// cada pestaña. Arriba quién eres (nivel, cifras); debajo los ajustes en tres
// grupos —Entrenamiento, Cuerpo y App—, una fila por tema. Lo que se edita se
// despliega aquí mismo, lo que es otra pantalla navega.
import { useEffect, useState } from 'react'
import { View, ScrollView, Linking, Switch, Alert, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, LogOut, Trash2 } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { QuickGuideSheet } from '@/components/profile/QuickGuideSheet'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useKeepScrollOffset } from '@/lib/use-keep-scroll-offset'
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme-mode'
import { ChangelogHistory } from '@/components/WhatsNewModal'
import { DiscoverSheet } from '@/components/DiscoverSheet'
import { DeleteAccountModal } from '@/components/profile/DeleteAccountModal'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { SettingsRow, Field, UnitInput, Segmented, DayToggle } from '@/components/profile/SettingsPanel'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { pb, logout } from '@calistenia/core/lib/pocketbase'
import { utcToLocalDateStr, todayStr } from '@calistenia/core/lib/dateUtils'
import { useAccountSessionCount } from '@calistenia/core/hooks/useAccountSessionCount'
import { getEffectiveWeeklyGoal, trainableDaysPerWeek, DEFAULT_WEEKLY_GOAL } from '@calistenia/core/lib/weeklyGoal'
import { useTrainingWeek } from '@/lib/use-training-week'
import { buildSkills, programWeek } from '@calistenia/core/lib/athlete-card'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { usePrivateAccount } from '@calistenia/core/hooks/usePrivateAccount'
import {
  fetchProfileBody, saveProfileBody, bodyFromUserRecord,
} from '@calistenia/core/hooks/useProfileForm'
import { SUPPORTED_CURRENCIES, currencySymbol } from '@calistenia/core/lib/money'
import { parseDecimal } from '@calistenia/core/lib/bmi'
import {
  FOCUS_AREA_IDS, DAY_IDS,
  type ActivityLevel, type DayId, type FocusAreaId, type Intensity, type Pace,
} from '@calistenia/core/types/onboarding'
import { Chip } from '@/components/ui/chip'
import { Textarea } from '@/components/ui/textarea'
import { Sentry } from '@/lib/instrument'

type SaveState = 'idle' | 'saving' | 'saved'
/** Temas de ajuste que se despliegan en la lista del final. */
type SettingsSection = 'goal' | 'skills' | 'training' | 'body' | 'prefs' | 'account'

function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && ['goal', 'skills', 'training', 'body', 'prefs', 'account'].includes(value)
}

/** Objetivo semanal: de 1 a 7 entrenos (#853 lo acota igual). */
const GOAL_OPTIONS = ['1', '2', '3', '4', '5', '6', '7'].map(value => ({ value, label: value }))

// Pares `valor → clave de traducción` de los campos de una sola opción.
const ACTIVITY_OPTIONS = [
  ['sedentary', 'onboarding.activitySedentary'],
  ['light', 'onboarding.activityLight'],
  ['active', 'onboarding.activityActive'],
  ['very_active', 'onboarding.activityVeryActive'],
] as const satisfies readonly (readonly [ActivityLevel, string])[]

const PACE_OPTIONS = [
  ['gradual', 'onboarding.paceGradual'],
  ['balanced', 'onboarding.paceBalanced'],
  ['aggressive', 'onboarding.paceAggressive'],
] as const satisfies readonly (readonly [Pace, string])[]

const INTENSITY_OPTIONS = [
  ['light', 'onboarding.intensityLight'],
  ['moderate', 'onboarding.intensityModerate'],
  ['intense', 'onboarding.intensityIntense'],
] as const satisfies readonly (readonly [Intensity, string])[]

const THEME_OPTIONS = [
  ['system', 'profile.themeSystem'],
  ['light', 'profile.themeLight'],
  ['dark', 'profile.themeDark'],
] as const satisfies readonly (readonly [ThemeMode, string])[]
const LEVELS = [
  { value: 'principiante', label: 'difficulty.beginner' },
  { value: 'intermedio', label: 'difficulty.intermediate' },
  { value: 'avanzado', label: 'difficulty.advanced' },
]
const LEVEL_LABEL_KEYS: Record<string, string> = {
  principiante: 'difficulty.beginner',
  intermedio: 'difficulty.intermediate',
  avanzado: 'difficulty.advanced',
}

/** Enlace dentro de un panel desplegado: texto, pista opcional y chevron. */
function PanelLink({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 border-b border-border/70 py-2 active:opacity-60"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] text-foreground">{label}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      <ChevronRight size={16} color="hsl(0 0% 45%)" />
    </Pressable>
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

// Estilo estable (#881): fuera del render, sin pasar por la interop de NativeWind
// en cada refresco de datos.
const CONTENT_STYLE = { paddingHorizontal: 16, paddingBottom: 32, gap: 12 } as const

export default function ProfileScreen() {
  const keepScroll = useKeepScrollOffset()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { settings, activeProgram, programProgress, weekDays, progress } = useWorkoutState()
  const { colorScheme } = useColorScheme()
  const { updateSettings } = useWorkoutActions()
  // `?section=goal` abre un panel directamente (el enlace «Objetivo» de Progreso).
  const params = useLocalSearchParams<{ section?: string }>()

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
  const [guideOpen, setGuideOpen] = useState(false)
  const [openSection, setOpenSection] = useState<SettingsSection | null>(
    isSettingsSection(params.section) ? params.section : null,
  )

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

  // Entrenamiento (#820): nivel, objetivo de peso, ritmo, áreas de foco, días
  // y intensidad — antes se pedían en el onboarding; ahora se editan aquí. En
  // `users`, igual que peso/altura/actividad (no son PII ocultos).
  const [goalWeight, setGoalWeight] = useState('')
  const [pace, setPace] = useState<Pace | ''>('')
  const [focusAreas, setFocusAreas] = useState<FocusAreaId[]>([])
  const [trainingDays, setTrainingDays] = useState<DayId[]>([])
  const [intensity, setIntensity] = useState<Intensity | ''>('')
  const [goal, setGoal] = useState('')
  const [trainingSaveState, setTrainingSaveState] = useState<SaveState>('idle')
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
  // Sesiones de la CUENTA (#869/#881): la misma cifra que Progreso.
  const totalSessions = useAccountSessionCount(user?.id ?? null, progress)
  const weeklyGoal = getEffectiveWeeklyGoal(settings, activeProgram ? { weekDays } : null)
  // El objetivo que tendría sin fijarlo a mano: los días de su programa (#853).
  const programGoal = (activeProgram && trainableDaysPerWeek(weekDays)) || DEFAULT_WEEKLY_GOAL
  // Racha SEMANAL (#853): la misma que Inicio y Progreso.
  const { streak } = useTrainingWeek()
  const skills = buildSkills(settings as unknown as Record<string, number>)
  // #616: con inscripción activa la semana sale del programa (`started_at`);
  // sin ella se conserva el cálculo sobre `settings.startDate`, que es lo
  // único que tiene quien todavía no se ha apuntado a nada.
  const week = programProgress.hasStarted && programProgress.currentWeek
    ? { current: programProgress.currentWeek, total: programProgress.totalWeeks }
    : programWeek(settings.startDate, activeProgram?.duration_weeks, todayStr())
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
        // Entrenamiento (#820): mismo registro de `users`, sin PII oculta.
        setGoalWeight(rec.goal_weight ? String(rec.goal_weight) : '')
        setPace(rec.pace || '')
        setFocusAreas(Array.isArray(rec.focus_areas) ? rec.focus_areas : [])
        setTrainingDays(Array.isArray(rec.training_days) ? rec.training_days : [])
        setIntensity(rec.intensity || '')
        setGoal(rec.goal || '')
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
      await saveProfileBody({
        userId: user.id,
        patch: { display_name: name.trim() },
        body: { weight, height, activityLevel },
        bodyGoalId, age, sex,
        queryClient,
        onSoftError: (step, e) => {
          Sentry.captureException(e, {
            tags: { feature: 'profile', op: step === 'age_sex' ? 'update_body_age_sex' : 'recompute_auto_goal' },
          })
        },
      })
      setBodySaveState('saved')
      setTimeout(() => setBodySaveState('idle'), 2000)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_body_fields' } })
      setBodySaveState('idle')
    }
  }

  const toggleFocusArea = (id: FocusAreaId) => {
    setFocusAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const toggleTrainingDay = (id: DayId) => {
    setTrainingDays((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Guardado propio del panel de entrenamiento (#820): mismos campos que
  // pedía el onboarding en Goals/Training, ahora editables aquí en cualquier
  // momento — nunca se pierden, solo dejaron de bloquear el camino crítico.
  const handleSaveTraining = async () => {
    if (!user || trainingSaveState === 'saving' || !bodyLoaded) return
    setTrainingSaveState('saving')
    try {
      await pb.collection('users').update(user.id, {
        level,
        goal_weight: parseDecimal(goalWeight),
        pace: pace || '',
        focus_areas: focusAreas,
        training_days: trainingDays,
        intensity: intensity || '',
        goal,
      })
      setTrainingSaveState('saved')
      setTimeout(() => setTrainingSaveState('idle'), 2000)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'profile', op: 'update_training_fields' } })
      setTrainingSaveState('idle')
    }
  }

  // Objetivo semanal (#853): guardarlo lo marca como elegido a mano, y a
  // partir de ahí manda sobre los días del programa.
  const saveWeeklyGoal = (goal: number) => {
    if (settings.weeklyGoalCustom && goal === settings.weeklyGoal) return
    void updateSettings({ weeklyGoal: goal, weeklyGoalCustom: true })
  }
  const resetWeeklyGoal = () => {
    void updateSettings({ weeklyGoal: programGoal, weeklyGoalCustom: false })
  }

  const bodySummary = [weight ? `${weight} kg` : '', height ? `${height} cm` : ''].filter(Boolean).join(' · ')
  // Admin y editor solo existen en la web (`/admin`, `/editor`).
  const role = user?.role as string | undefined
  const staffPath = role === 'admin' ? 'admin' : role === 'editor' ? 'editor' : null

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={CONTENT_STYLE} {...keepScroll}>
        {/* Pantalla de pila desde #859: se llega desde el avatar de cada pestaña. */}
        <View className="flex-row items-center gap-1 pt-1">
          <BackButton />
          <Kicker>{t('profile.screenKicker')}</Kicker>
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
                {t('profile.phase', { phase: programProgress.currentPhase || 1 })}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Cifras: tres, grandes, y la racha (semanal, #853) en lima porque es la que se cuida. */}
        <View className="flex-row gap-3">
          <StatTile label={t('profile.sessions')} value={totalSessions === null ? '–' : String(totalSessions)} />
          <StatTile label={t('profile.streak')} value={t('progressTab.weeksShort', { count: streak.current })} lime />
          <StatTile label={t('common.week')} value={`${streak.thisWeek.done}/${streak.thisWeek.goal}`} />
        </View>

        {/* Entrenamiento */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.groupTraining')}</Kicker>
          <Card className="gap-0 overflow-hidden py-1">
            <SettingsRow
              label={t('profile.weeklyGoal')}
              value={t('profile.weeklyGoalValue', { count: weeklyGoal })}
              open={openSection === 'goal'}
              onPress={() => toggleSection('goal')}
              bordered={false}
              muted={muted} lime={lime}
            >
              <Field
                label={t('profile.weeklyGoalField')}
                hint={settings.weeklyGoalCustom
                  ? t('profile.weeklyGoalHintCustom')
                  : t('profile.weeklyGoalHintProgram', { count: programGoal })}
              >
                <Segmented
                  allowClear={false}
                  options={GOAL_OPTIONS}
                  value={String(weeklyGoal)}
                  onChange={(next) => { if (next) saveWeeklyGoal(Number(next)) }}
                />
              </Field>
              {settings.weeklyGoalCustom ? (
                <Button variant="outline" className="h-10 self-start px-3" onPress={resetWeeklyGoal}>
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-foreground">
                    {t('profile.weeklyGoalReset', { count: programGoal })}
                  </Text>
                </Button>
              ) : null}
            </SettingsRow>

            <SettingsRow
              label={t('profile.programAndPhase')}
              value={activeProgram ? activeProgram.name : undefined}
              onPress={() => router.push('/programs')}
              bordered
              muted={muted} lime={lime}
            />

            <SettingsRow
              label={t('profile.skillsAndRecords')}
              open={openSection === 'skills'}
              onPress={() => toggleSection('skills')}
              bordered
              muted={muted} lime={lime}
            >
              {skills.length > 0 ? (
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
              <Button variant="outline" className="h-10 self-start px-3" onPress={() => router.push('/stats')}>
                <Text className="font-mono text-[10px] uppercase tracking-widest text-foreground">{t('profile.seeRecords')}</Text>
              </Button>
            </SettingsRow>

            <SettingsRow
              label={t('profile.sectionTraining')}
              value={levelLabel}
              open={openSection === 'training'}
              onPress={() => toggleSection('training')}
              bordered
              muted={muted} lime={lime}
            >
              <Field label={t('profile.level')}>
                <Segmented
                  allowClear={false}
                  options={LEVELS.map((l) => ({ value: l.value, label: t(l.label) }))}
                  value={level}
                  onChange={(next) => { if (next) setLevel(next) }}
                />
              </Field>

              <Field label={t('profile.goalWeightShort')}>
                <UnitInput value={goalWeight} onChangeText={setGoalWeight} placeholder={t('profile.goalWeightPlaceholder')} keyboardType="decimal-pad" unit="kg" />
              </Field>

              <Field label={t('onboarding.pace')}>
                <Segmented
                  options={PACE_OPTIONS.map(([value, key]) => ({ value, label: t(key) }))}
                  value={pace}
                  onChange={setPace}
                />
              </Field>

              <Field label={t('onboarding.focusAreas')}>
                <View className="flex-row flex-wrap gap-2">
                  {FOCUS_AREA_IDS.map((id) => (
                    <Chip
                      key={id}
                      label={t(`onboarding.focus.${id}`)}
                      active={focusAreas.includes(id)}
                      onPress={() => toggleFocusArea(id)}
                    />
                  ))}
                </View>
              </Field>

              <Field label={t('onboarding.trainingDays')}>
                <View className="flex-row gap-1.5">
                  {DAY_IDS.map((d) => (
                    <DayToggle
                      key={d}
                      label={t(`onboarding.days.${d}`)}
                      active={trainingDays.includes(d)}
                      onPress={() => toggleTrainingDay(d)}
                    />
                  ))}
                </View>
              </Field>

              <Field label={t('onboarding.intensity')}>
                <Segmented
                  options={INTENSITY_OPTIONS.map(([value, key]) => ({ value, label: t(key) }))}
                  value={intensity}
                  onChange={setIntensity}
                />
              </Field>

              <Field label={t('profile.goal')}>
                <Textarea value={goal} onChangeText={setGoal} placeholder={t('profile.goalPlaceholder')} numberOfLines={3} />
              </Field>

              <View className="border-t border-border/70 pt-4">
                <Button
                  className="h-11 bg-lime active:bg-lime/90"
                  onPress={handleSaveTraining}
                  disabled={trainingSaveState === 'saving' || !bodyLoaded}
                >
                  <Text className="font-bebas text-base tracking-wide text-lime-foreground">
                    {trainingSaveState === 'saving' ? t('profile.saving') : trainingSaveState === 'saved' ? t('profile.saved') : t('common.save').toUpperCase()}
                  </Text>
                </Button>
              </View>
            </SettingsRow>

            {/* Recordatorios y avisos: antes colgaban del ☰. Dos filas que
                navegan, no un panel, para que sigan a dos toques del avatar. */}
            <SettingsRow label={t('nav.reminders')} value={t('profile.remindersHint')} onPress={() => router.push('/reminders')} bordered muted={muted} lime={lime} />
            <SettingsRow
              label={t('nav.notificationSettings')}
              value={t('profile.alertsHint')}
              onPress={() => router.push('/notification-settings')}
              bordered
              muted={muted} lime={lime}
            />
            <SettingsRow
              label={t('achievements.profileRow')}
              value={t('achievements.profileHint')}
              onPress={() => router.push('/achievements')}
              bordered
              muted={muted} lime={lime}
            />
          </Card>
        </View>

        {/* Cuerpo */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.sectionBody')}</Kicker>
          <Card className="gap-0 overflow-hidden py-1">
            <SettingsRow
              label={t('profile.rowBodyGoals')}
              value={bodySummary || undefined}
              open={openSection === 'body'}
              onPress={() => toggleSection('body')}
              bordered={false}
              muted={muted} lime={lime}
            >
              <Field label={t('profile.name')}>
                <UnitInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('profile.namePlaceholder')}
                  maxLength={60}
                />
              </Field>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field label={t('profile.weightShort')}>
                    <UnitInput value={weight} onChangeText={setWeight} placeholder={t('profile.weightPlaceholder')} keyboardType="decimal-pad" unit="kg" />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label={t('profile.heightShort')}>
                    <UnitInput value={height} onChangeText={setHeight} placeholder={t('profile.heightPlaceholder')} keyboardType="decimal-pad" unit="cm" />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label={t('profile.age')}>
                    <UnitInput value={age} onChangeText={setAge} placeholder={t('profile.agePlaceholder')} keyboardType="number-pad" />
                  </Field>
                </View>
              </View>

              <Field label={t('profile.sex')}>
                <Segmented
                  options={[
                    { value: 'male', label: t('profile.male') },
                    { value: 'female', label: t('profile.female') },
                  ]}
                  value={sex}
                  onChange={setSex}
                />
              </Field>

              <Field label={t('onboarding.activityLevel')}>
                <Segmented
                  columns={2}
                  options={ACTIVITY_OPTIONS.map(([value, key]) => ({ value, label: t(key) }))}
                  value={activityLevel}
                  onChange={setActivityLevel}
                />
              </Field>

              <View className="border-t border-border/70 pt-4">
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
            <SettingsRow label={t('profile.health')} onPress={() => router.push('/health')} bordered muted={muted} lime={lime} />
          </Card>
        </View>

        {/* App */}
        <View className="mt-3 gap-2">
          <Kicker>{t('profile.groupApp')}</Kicker>
          <Card className="gap-0 overflow-hidden py-1">
            <SettingsRow
              label={t('profile.rowPreferences')}
              value={`${currentLang.toUpperCase()} · ${currencyPrefs.defaultCurrency}`}
              open={openSection === 'prefs'}
              onPress={() => toggleSection('prefs')}
              bordered={false}
              muted={muted} lime={lime}
            >
              <Field label={t('profile.language')}>
                <Segmented
                  allowClear={false}
                  options={[
                    { value: 'es', label: 'Español' },
                    { value: 'en', label: 'English' },
                  ]}
                  value={currentLang}
                  onChange={(next) => { if (next) i18n.changeLanguage(next) }}
                />
              </Field>

              <Field label={t('profile.currency')} hint={t('profile.currencyDesc')}>
                <Segmented
                  allowClear={false}
                  options={SUPPORTED_CURRENCIES.map(code => ({ value: code, label: `${currencySymbol(code)} ${code}` }))}
                  value={currencyPrefs.defaultCurrency}
                  onChange={(next) => { if (next) setDefaultCurrency(next) }}
                />
              </Field>

              <Field label={t('profile.theme')}>
                <Segmented
                  allowClear={false}
                  options={THEME_OPTIONS.map(([value, key]) => ({ value, label: t(key) }))}
                  value={themeMode}
                  onChange={(next) => { if (next) changeTheme(next) }}
                />
              </Field>
            </SettingsRow>
            <SettingsRow
              label={t('profile.whatsNew')}
              value={`v${Constants.expoConfig?.version || '1.0.0'}`}
              onPress={() => setHistoryOpen(true)}
              bordered
              muted={muted} lime={lime}
            />
            <SettingsRow label={t('profile.discover')} onPress={() => setDiscoverOpen(true)} bordered muted={muted} lime={lime} />
            <SettingsRow
              label={t('profile.rowAccountPrivacy')}
              value={(user?.email as string) || undefined}
              open={openSection === 'account'}
              onPress={() => toggleSection('account')}
              bordered
              muted={muted} lime={lime}
            >
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3 border-b border-border/60 pb-2.5">
                  <Kicker size="xs" className="shrink-0">{t('profile.email')}</Kicker>
                  <Text className="shrink text-sm text-foreground" numberOfLines={1}>{(user?.email as string) || '—'}</Text>
                </View>
                <View className="flex-row items-center justify-between gap-3">
                  <Kicker size="xs" className="shrink-0">{t('profile.memberSince')}</Kicker>
                  <Text className="font-mono text-xs text-foreground">
                    {user?.created ? utcToLocalDateStr(user.created as string) : '—'}
                  </Text>
                </View>
              </View>

              {/* Cuenta privada (#422): interruptor que se queda aquí, no navega. */}
              <View className="flex-row items-center gap-3 rounded-lg border border-border bg-background p-4">
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

              {/* Bloqueados y legal: antes eran filas sueltas de «Cuenta y comunidad». */}
              <View>
                <PanelLink label={t('blocks.manageEntry')} onPress={() => router.push('/blocked-users' as never)} />
                <PanelLink
                  label={t('account.privacyEntry')}
                  onPress={() => { Linking.openURL(`${WEB_BASE_URL}/legal#privacy`).catch(() => {}) }}
                />
              </View>

              {/* Zona de peligro: baja de cuenta (#300). Al final del todo y
                  separada del cierre de sesión para que no se confundan. */}
              <View className="gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
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
            </SettingsRow>
            <SettingsRow label={t('quickGuide.title')} onPress={() => setGuideOpen(true)} bordered muted={muted} lime={lime} />
            {/* Admin y editor viven solo en la web: aquí es un enlace, y solo para esos roles. */}
            {staffPath ? (
              <SettingsRow
                label={t('profile.staffPanel')}
                value={t(staffPath === 'admin' ? 'nav.admin' : 'nav.editor')}
                onPress={() => { Linking.openURL(`${WEB_BASE_URL}/${staffPath}`).catch(() => {}) }}
                bordered
                muted={muted} lime={lime}
              />
            ) : null}
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
      <QuickGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} />
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
