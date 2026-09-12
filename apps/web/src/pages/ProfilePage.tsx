import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '@calistenia/core/types'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Kicker } from '../components/ui/kicker'
import { cn } from '../lib/utils'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import { setTimezone as setGlobalTimezone, getTimezone, utcToLocalDateStr, todayStr } from '@calistenia/core/lib/dateUtils'
import { buildSkills, programWeek } from '@calistenia/core/lib/athlete-card'
import { CONDITION_IDS, INJURY_IDS, type ConditionId, type InjuryId } from '../components/onboarding/StepHealth'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { SUPPORTED_CURRENCIES, currencySymbol } from '@calistenia/core/lib/money'
import { FOCUS_AREA_IDS, DAY_IDS, type FocusAreaId, type DayId, type Intensity } from '../components/onboarding/StepTraining'
import type { ActivityLevel, Pace } from '../components/onboarding/StepGoals'
import { calculateBmi, bmiCategoryKey, bmiColorClass, parseDecimal } from '@calistenia/core/lib/bmi'
import { fetchUserHealth, upsertUserHealth } from '@calistenia/core/hooks/useUserHealth'
import {
  useProfileForm, fetchProfileBody, saveBodyDemographics, bodyUserPatch, bodyFromUserRecord,
} from '@calistenia/core/hooks/useProfileForm'
import { DeleteAccountDialog } from '../components/profile/DeleteAccountDialog'
import { PrivateAccountCard } from '../components/profile/PrivateAccountCard'
import {
  SettingsRow, Field, UnitInput, Segmented, ChipToggle, DayToggle,
} from '../components/profile/SettingsPanel'
import { recomputeAutoNutritionGoal } from '@calistenia/core/hooks/useNutrition'

interface ProfilePageProps {
  user: AuthUser
}

/** Temas de ajuste que se despliegan en la lista del final. */
type SettingsSection = 'body' | 'training' | 'health' | 'prefs' | 'account'

// Pares `valor → clave de traducción` de los campos de una sola opción. Fuera
// del componente: no dependen de nada del render y así el JSX queda plano.
const ACTIVITY_OPTIONS = [
  ['sedentary', 'activitySedentary'],
  ['light', 'activityLight'],
  ['active', 'activityActive'],
  ['very_active', 'activityVeryActive'],
] as const satisfies readonly (readonly [ActivityLevel, string])[]

const PACE_OPTIONS = [
  ['gradual', 'paceGradual'],
  ['balanced', 'paceBalanced'],
  ['aggressive', 'paceAggressive'],
] as const satisfies readonly (readonly [Pace, string])[]

const INTENSITY_OPTIONS = [
  ['light', 'intensityLight'],
  ['moderate', 'intensityModerate'],
  ['intense', 'intensityIntense'],
] as const satisfies readonly (readonly [Intensity, string])[]

export default function ProfilePage({ user }: ProfilePageProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Los 16 campos editables son un solo formulario: se hidratan juntos en el
  // efecto de carga y se envían juntos en `handleSave`, así que viven en un
  // reducer compartido con móvil en vez de en 16 `useState` sueltos (#478).
  // Se desestructuran con sus nombres de siempre para que el resto del fichero
  // no cambie; lo único que cambia es cómo se escriben (`set`/`toggle`).
  const { form, set, toggle, hydrate } = useProfileForm({
    displayName: user?.display_name || user?.name || '',
    timezone: getTimezone(),
  })
  const {
    displayName, weight, height, age, sex, level, goal, goalWeight,
    activityLevel, pace, medicalConditions, injuries, focusAreas,
    trainingDays, intensity, timezone,
  } = form
  // Edad/sexo son PII ocultos en `users` (fix GHSA-wwj3-9h95-wcpf): no se
  // serializan ni se pueden escribir con token de usuario. Su fuente fiable es
  // la fila de `nutrition_goals` (protegida per-user), que además es lo que
  // consume el cálculo de calorías. Guardamos su id para poder actualizarla. (#243 F4a)
  const [bodyGoalId, setBodyGoalId] = useState<string | null>(null)
  // Estado de UI puro: no se guarda ni se hidrata, así que no entra en el reducer.
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tzSearch, setTzSearch] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Moneda de despensa (F5 #174): en qué moneda habla el user; el gasto siempre en $ USD
  const { prefs: currencyPrefs, setDefaultCurrency } = useUserCurrency(user?.id ?? null)
  // Cifras del carné: las mismas que el dashboard, leídas del contexto de
  // entreno para que no puedan discrepar de lo que ve el usuario en portada.
  const { settings, activeProgram, programProgress } = useWorkoutState()
  const { getTotalSessions, getLongestStreak, getWeeklyDoneCount } = useWorkoutActions()
  const totalSessions = getTotalSessions()
  const streak = getLongestStreak()
  const weeklyDone = getWeeklyDoneCount()

  const currentLang = i18n.language.startsWith('en') ? 'en' : 'es'

  const LEVELS = [
    { value: 'principiante', label: t('difficulty.beginner') },
    { value: 'intermedio', label: t('difficulty.intermediate') },
    { value: 'avanzado', label: t('difficulty.advanced') },
  ]

  const profileUrl = `${window.location.origin}/u/${user?.id}`

  function shareWhatsApp() {
    const msg = `${t('profile.whatsappShare')}\n${profileUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = profileUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    if (!user?.id || loaded) return

    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          // Tres hidrataciones, no una: conservan el mismo escalonado de
          // renders que tenían los 16 setters sueltos (los campos de `users`
          // aparecen antes de esperar a las otras dos colecciones).
          const rec = await pb.collection('users').getOne(user.id, { requestKey: null })
          setAvatarUrl(getUserAvatarUrl(rec, '200x200'))
          hydrate({
            displayName: rec.display_name || rec.name || '',
            ...bodyFromUserRecord(rec),
            level: rec.level || 'principiante',
            goal: rec.goal || '',
            goalWeight: rec.goal_weight ? String(rec.goal_weight) : '',
            pace: rec.pace || '',
            focusAreas: Array.isArray(rec.focus_areas) ? rec.focus_areas : [],
            trainingDays: Array.isArray(rec.training_days) ? rec.training_days : [],
            intensity: rec.intensity || '',
            // Sin zona horaria guardada se conserva la detectada del navegador.
            ...(rec.timezone ? { timezone: rec.timezone } : {}),
          })
          // Edad/sexo desde la fila de `nutrition_goals` (PII protegida). Si el
          // usuario aún no tiene objetivo, quedan vacíos y solo se fijarán al
          // crear uno (el wizard los pide). (#243 F4a)
          const body = await fetchProfileBody(user.id)
          setBodyGoalId(body.bodyGoalId)
          hydrate({ age: body.age, sex: body.sex })
          // Condiciones/lesiones desde `user_health` (en `users` son PII ocultos
          // que no se serializan ni se pueden escribir con token de usuario). (#247)
          const uh = await fetchUserHealth(user.id)
          if (uh) hydrate({ medicalConditions: uh.medical_conditions, injuries: uh.injuries })
        } catch (e) {
          console.warn('Failed to load profile:', e)
        }
      }
      setLoaded(true)
    }
    load()
    // `hydrate` es estable (useCallback sin deps sobre el dispatch del reducer
    // de useProfileForm), así que entra en las deps sin recargar de más. (#484)
  }, [user?.id, loaded, hydrate])

  const bmi = useMemo(() => calculateBmi(parseDecimal(weight), parseDecimal(height)), [weight, height])

  const goalBmi = useMemo(() => calculateBmi(parseDecimal(goalWeight), parseDecimal(height)), [goalWeight, height])

  const bmiCategory = useMemo(() => {
    if (bmi == null) return null
    const key = bmiCategoryKey(bmi)
    return { label: t(`profile.${key}`), color: bmiColorClass(bmi) }
  }, [bmi, t])

  // Skills = las cinco marcas del perfil público. Las `pr_*` de `settings` se
  // mantienen sincronizadas con el mapa `prs`, así que son la fuente barata.
  const skills = useMemo(
    () => buildSkills(settings as unknown as Record<string, number>),
    [settings],
  )

  // «Intermedio · Semana 12 de 12»: nivel y, si el programa tiene fecha de
  // inicio, en qué punto va. Sin fecha no se inventa la semana.
  const levelLabel = LEVELS.find(l => l.value === level)?.label ?? ''
  // #616: con inscripción activa la semana la da el programa (`started_at`);
  // sin ella se conserva el cálculo sobre `settings.startDate`, que es lo único
  // que tiene quien todavía no se ha apuntado a nada.
  const week = useMemo(
    () => (programProgress.hasStarted && programProgress.currentWeek
      ? { current: programProgress.currentWeek, total: programProgress.totalWeeks }
      : programWeek(settings.startDate, activeProgram?.duration_weeks, todayStr())),
    [programProgress.hasStarted, programProgress.currentWeek, programProgress.totalWeeks, settings.startDate, activeProgram?.duration_weeks],
  )
  const identityLine = [
    levelLabel,
    week ? t('profile.weekOfTotal', { current: week.current, total: week.total }) : null,
  ].filter(Boolean).join(' · ')

  const healthCount = medicalConditions.length + injuries.length

  // La lista de zonas horarias no depende de nada del formulario salvo el
  // filtro, así que se calcula una vez por búsqueda y no en cada render.
  const timezoneOptions = useMemo(() => {
    let all: string[]
    try {
      // `supportedValuesOf` es ES2022 y el `lib` de web sigue en ES2020.
      all = (Intl as typeof Intl & { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone')
    } catch {
      all = [
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires',
        'America/Mexico_City', 'America/Sao_Paulo',
        'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
        'Australia/Sydney', 'Pacific/Auckland',
      ]
    }
    const q = tzSearch.trim().toLowerCase()
    return q ? all.filter(tz => tz.toLowerCase().includes(q)) : all
  }, [tzSearch])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    setUploadingAvatar(true)
    try {
      const available = await isPocketBaseAvailable()
      if (available) {
        const formData = new FormData()
        formData.append('avatar', file)
        const updated = await pb.collection('users').update(user.id, formData)
        // Add cache-busting param so the browser doesn't show the old cached image
        const url = getUserAvatarUrl(updated, '200x200')
        setAvatarUrl(url ? `${url}&t=${Date.now()}` : null)
        // Refresh auth to sync avatar in authStore
        await pb.collection('users').authRefresh()
      }
    } catch (e) {
      console.warn('Failed to upload avatar:', e)
    }
    setUploadingAvatar(false)
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    try {
      const available = await isPocketBaseAvailable()
      if (available) {
        await pb.collection('users').update(user.id, {
          display_name: displayName,
          ...bodyUserPatch(form),
          level,
          goal,
          goal_weight: parseDecimal(goalWeight),
          pace: pace || '',
          focus_areas: focusAreas,
          training_days: trainingDays,
          intensity: intensity || '',
          timezone,
        })
        // Edad/sexo → fila de `nutrition_goals` (PII protegida; en `users` están
        // ocultos y no se pueden escribir con token de usuario). Solo si ya hay
        // objetivo; el recompute de abajo la releerá desde ahí. (#243 F4a)
        await saveBodyDemographics(bodyGoalId, age, sex,
          (e) => console.warn('Failed to save body age/sex:', e))
        // Condiciones/lesiones → `user_health` (upsert per-user; en `users`
        // están ocultos y no se pueden escribir con token de usuario). (#247)
        await upsertUserHealth(user.id, {
          medical_conditions: medicalConditions,
          injuries,
        }).catch((e) => console.warn('Failed to save health:', e))
        setGlobalTimezone(timezone)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        // Reactivo (#243 F3): si el objetivo nutricional es 'auto', recalcula
        // calorías/macros con el cuerpo recién guardado (no toca 'manual').
        recomputeAutoNutritionGoal(user.id, queryClient).catch((e) =>
          console.warn('Failed to recompute nutrition goal:', e),
        )
      }
    } catch (e) {
      console.warn('Failed to save profile:', e)
    }

    setSaving(false)
  }

  // Una sola sección abierta a la vez: los ajustes son una lista de filas y lo
  // que se despliega es el formulario de siempre, no una pantalla nueva.
  const toggleSection = (id: SettingsSection) =>
    setOpenSection(prev => (prev === id ? null : id))

  const saveBar = (
    <div className="border-t border-border pt-4">
      <Button
        onClick={handleSave}
        disabled={saving}
        variant="limeSolid"
        className="h-11 w-full font-bebas text-lg tracking-wide"
      >
        {saving ? t('profile.saving') : saved ? t('profile.saved') : t('profile.saveChanges')}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-6 md:py-8">
      <Kicker>{t('profile.accountLabel')}</Kicker>
      <h1 className="mb-6 mt-1 font-bebas text-[36px] leading-none md:text-[52px]">{t('profile.title')}</h1>

      {/* Carné de atleta: quién eres antes que qué puedes configurar. */}
      <section className="rounded-lg border border-border p-5 md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label={t('profile.changePhoto')}
            className="group relative size-16 shrink-0 overflow-hidden rounded-full border border-lime/40 bg-lime/10 transition-colors hover:border-lime focus:outline-none focus:ring-2 focus:ring-lime"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center font-bebas text-3xl text-lime">
                {(displayName || user?.name || user?.email || '?')[0]?.toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="size-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />

          <div className="min-w-0 flex-1">
            <div className="truncate font-bebas text-[28px] leading-none md:text-[34px]">
              {displayName || user?.name || t('profile.title')}
            </div>
            <Kicker className="mt-1.5">{identityLine}</Kicker>
          </div>

          <Badge className="shrink-0 self-start rounded-full border-transparent bg-lime px-3 font-mono text-[10px] font-normal uppercase tracking-widest text-lime-foreground hover:bg-lime sm:self-center">
            {t('profile.phase', { phase: programProgress.currentPhase || 1 })}
          </Badge>
        </div>

        {/* Compartir: es la única acción del carné, así que vive dentro de él. */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Kicker size="xs" className="mr-1">{t('profile.shareProfile')}</Kicker>
          <Button
            onClick={shareWhatsApp}
            size="sm"
            className="h-8 bg-emerald-600 px-3 text-[10px] tracking-widest text-white hover:bg-emerald-700"
          >
            <WhatsAppIcon className="mr-1.5 size-3.5" />
            WHATSAPP
          </Button>
          <Button onClick={copyProfileLink} variant="outline" size="sm" className="h-8 px-3 text-[10px] tracking-widest">
            {copied ? (
              <>
                <svg className="mr-1.5 size-3.5 text-lime" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                {t('profile.copied')}
              </>
            ) : (
              <>
                <svg className="mr-1.5 size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                {t('profile.copyLink')}
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Cifras: tres, grandes, y la racha en lima porque es la que se cuida. */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 md:p-4">
          <div className="font-bebas text-[34px] leading-none">{totalSessions}</div>
          <Kicker className="mt-1">{t('profile.sessions')}</Kicker>
        </div>
        <div className="rounded-lg border border-border p-3 md:p-4">
          <div className="font-bebas text-[34px] leading-none text-lime">{streak}</div>
          <Kicker className="mt-1">{t('profile.streak')}</Kicker>
        </div>
        <div className="rounded-lg border border-border p-3 md:p-4">
          <div className="font-bebas text-[34px] leading-none">{weeklyDone}/{settings.weeklyGoal || 5}</div>
          <Kicker className="mt-1">{t('common.week')}</Kicker>
        </div>
      </div>

      {/* Skills: lo desbloqueado en lima, lo que está en camino con su avance. */}
      <Kicker className="mb-2 mt-6">{t('profile.skills')}</Kicker>
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map(s => (
            <span
              key={s.key}
              className={cn(
                'rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest',
                s.achieved
                  ? 'border-lime/40 bg-lime/10 text-lime'
                  : 'border-border text-muted-foreground',
              )}
            >
              {s.achieved
                ? t('profile.skillAchieved', { label: s.label, value: `${s.value}${s.unit === 's' ? 's' : ''}` })
                : t('profile.skillLocked', { label: s.label, pct: s.pct })}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('profile.skillsEmpty')}</p>
      )}

      {/* Cuerpo: resumen legible; editar abre el formulario de abajo. */}
      <Kicker className="mb-2 mt-6">{t('profile.sectionBody')}</Kicker>
      <div id="tour-personal-info" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4 md:px-5">
        <div className="flex gap-6 md:gap-8">
          <div>
            <div className="font-bebas text-[28px] leading-none">
              {weight || '—'}<span className="text-[13px] text-muted-foreground"> kg</span>
            </div>
            <Kicker className="mt-1">{t('profile.weightShort')}</Kicker>
          </div>
          <div>
            <div className="font-bebas text-[28px] leading-none">
              {height || '—'}<span className="text-[13px] text-muted-foreground"> cm</span>
            </div>
            <Kicker className="mt-1">{t('profile.heightShort')}</Kicker>
          </div>
          <div>
            <div className="font-bebas text-[28px] leading-none">{age || '—'}</div>
            <Kicker className="mt-1">{t('profile.age')}</Kicker>
          </div>
          {bmi && bmiCategory && (
            <div>
              <div className={cn('font-bebas text-[28px] leading-none', bmiCategory.color)}>{bmi}</div>
              <Kicker className="mt-1">{t('profile.bmiLabel')}</Kicker>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpenSection('body')}
          className="font-mono text-[10px] uppercase tracking-widest"
        >
          {t('common.edit')}
        </Button>
      </div>

      {/* Ajustes: una fila por tema, al final. Lo que se edita se despliega
          aquí mismo; lo que es otra pantalla, navega. */}
      <Kicker className="mb-1 mt-6">{t('profile.settings')}</Kicker>
      <div className="overflow-hidden rounded-lg border border-border px-4 md:px-5">
        <SettingsRow
          // Sin valor a la derecha a propósito: la tarjeta «Cuerpo» de arriba ya
          // enseña esas mismas cifras y repetirlas a dos dedos parece un fallo.
          label={t('profile.rowBodyGoals')}
          open={openSection === 'body'}
          onClick={() => toggleSection('body')}
        >
          <Field label={t('profile.name')} htmlFor="profile-name">
            <UnitInput
              id="profile-name"
              value={displayName}
              onChange={(e) => set('displayName', e.target.value)}
              placeholder={t('profile.namePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={t('profile.weightShort')} htmlFor="profile-weight">
              <UnitInput id="profile-weight" type="number" step="0.1" min="0" unit="kg" value={weight} onChange={(e) => set('weight', e.target.value)} placeholder={t('profile.weightPlaceholder')} />
            </Field>
            <Field label={t('profile.heightShort')} htmlFor="profile-height">
              <UnitInput id="profile-height" type="number" min="0" unit="cm" value={height} onChange={(e) => set('height', e.target.value)} placeholder={t('profile.heightPlaceholder')} />
            </Field>
            <Field label={t('profile.age')} htmlFor="profile-age">
              <UnitInput id="profile-age" type="number" min="13" max="120" value={age} onChange={(e) => set('age', e.target.value)} placeholder={t('profile.agePlaceholder')} />
            </Field>
          </div>

          <Field label={t('profile.sex')}>
            <Segmented
              options={[
                { value: 'male', label: t('profile.male') },
                { value: 'female', label: t('profile.female') },
              ]}
              value={sex}
              onChange={(next) => set('sex', next)}
            />
          </Field>

          <Field
            label={t('profile.goalWeightShort')}
            htmlFor="profile-goal-weight"
            hint={goalBmi ? t('onboarding.bmiGoal', { bmi: goalBmi }) : undefined}
          >
            <UnitInput id="profile-goal-weight" type="number" step="0.1" min="0" unit="kg" value={goalWeight} onChange={(e) => set('goalWeight', e.target.value)} placeholder={t('profile.goalWeightPlaceholder')} />
          </Field>

          <Field label={t('onboarding.activityLevel')}>
            <Segmented
              columns={2}
              options={ACTIVITY_OPTIONS.map(([value, key]) => ({ value, label: t(`onboarding.${key}`) }))}
              value={activityLevel}
              onChange={(next) => set('activityLevel', next)}
            />
          </Field>

          <Field label={t('onboarding.pace')}>
            <Segmented
              options={PACE_OPTIONS.map(([value, key]) => ({ value, label: t(`onboarding.${key}`) }))}
              value={pace}
              onChange={(next) => set('pace', next)}
            />
          </Field>
          {saveBar}
        </SettingsRow>

        <SettingsRow
          label={t('profile.sectionTraining')}
          value={levelLabel}
          open={openSection === 'training'}
          onClick={() => toggleSection('training')}
        >
          <div id="tour-level-selector">
            <Field label={t('profile.level')}>
              <Segmented
                allowClear={false}
                options={LEVELS.map(l => ({ value: l.value, label: l.label }))}
                value={level}
                onChange={(next) => set('level', next)}
              />
            </Field>
          </div>

          <Field label={t('onboarding.focusAreas')}>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREA_IDS.map(id => (
                <ChipToggle
                  key={id}
                  label={t(`onboarding.focus.${id}`)}
                  active={focusAreas.includes(id)}
                  onClick={() => toggle('focusAreas', id)}
                />
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.trainingDays')}>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_IDS.map(d => (
                <DayToggle
                  key={d}
                  label={t(`onboarding.days.${d}`)}
                  active={trainingDays.includes(d)}
                  onClick={() => toggle('trainingDays', d)}
                />
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.intensity')}>
            <Segmented
              options={INTENSITY_OPTIONS.map(([value, key]) => ({ value, label: t(`onboarding.${key}`) }))}
              value={intensity}
              onChange={(next) => set('intensity', next)}
            />
          </Field>

          <Field label={t('profile.goal')} htmlFor="profile-goal">
            <textarea
              id="profile-goal"
              value={goal}
              onChange={(e) => set('goal', e.target.value)}
              placeholder={t('profile.goalPlaceholder')}
              rows={3}
              className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
          {saveBar}
        </SettingsRow>

        <SettingsRow
          label={t('profile.sectionHealth')}
          value={healthCount ? String(healthCount) : undefined}
          open={openSection === 'health'}
          onClick={() => toggleSection('health')}
        >
          <Field label={t('onboarding.medicalConditions')}>
            <div className="flex flex-wrap gap-2">
              {CONDITION_IDS.map(id => (
                <ChipToggle
                  key={id}
                  label={t(`onboarding.conditions.${id}`)}
                  active={medicalConditions.includes(id)}
                  onClick={() => toggle('medicalConditions', id)}
                />
              ))}
            </div>
          </Field>

          <Field label={t('onboarding.injuriesLabel')}>
            <div className="flex flex-wrap gap-2">
              {INJURY_IDS.map(id => (
                <ChipToggle
                  key={id}
                  label={t(`onboarding.injuries.${id}`)}
                  active={injuries.includes(id)}
                  onClick={() => toggle('injuries', id)}
                />
              ))}
            </div>
          </Field>
          {saveBar}
        </SettingsRow>

        <SettingsRow
          label={t('profile.rowPreferences')}
          value={`${currentLang.toUpperCase()} · ${currencyPrefs.defaultCurrency}`}
          open={openSection === 'prefs'}
          onClick={() => toggleSection('prefs')}
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

          <Field
            label={t('profile.timezone')}
            htmlFor="profile-timezone"
            hint={`${t('profile.currentTimezone')}: ${timezone.replace(/_/g, ' ')}`}
          >
            <UnitInput
              id="profile-tz-search"
              value={tzSearch}
              onChange={(e) => setTzSearch(e.target.value)}
              placeholder={t('profile.searchTimezone')}
              className="h-9 text-xs"
            />
            <select
              id="profile-timezone"
              value={timezone}
              onChange={(e) => set('timezone', e.target.value)}
              className="mt-2 flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {timezoneOptions.map(tz => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          {saveBar}
        </SettingsRow>

        <SettingsRow label={t('profile.reminders')} onClick={() => navigate('/reminders')} />
        <SettingsRow label={t('blocks.manageEntry')} onClick={() => navigate('/settings/blocked')} />

        <SettingsRow
          label={t('profile.rowAccountPrivacy')}
          value={user?.email || undefined}
          open={openSection === 'account'}
          onClick={() => toggleSection('account')}
        >
          <dl className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2.5">
              <Kicker as="span" size="xs" className="shrink-0">{t('profile.email')}</Kicker>
              <dd className="truncate text-sm">{user?.email || '—'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <Kicker as="span" size="xs" className="shrink-0">{t('profile.memberSince')}</Kicker>
              <dd className="font-mono text-xs">{user?.created ? utcToLocalDateStr(user.created) : '—'}</dd>
            </div>
          </dl>

          {/* Cuenta privada (#422): interruptor que se queda aquí, no navega. */}
          <PrivateAccountCard userId={user?.id ?? null} />

          {/* Zona de peligro (#300): dentro de «cuenta», al final del todo, para
              que no se pulse de paso mientras se editan otros campos. */}
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4">
            <Kicker className="text-destructive">{t('account.dangerZone')}</Kicker>
            <p className="text-sm text-muted-foreground">{t('account.deleteDesc')}</p>
            <Button
              variant="outline"
              className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              {t('account.deleteCta')}
            </Button>
          </div>
        </SettingsRow>
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        email={user?.email}
        onDeleted={() => navigate('/', { replace: true })}
      />
    </div>
  )
}
