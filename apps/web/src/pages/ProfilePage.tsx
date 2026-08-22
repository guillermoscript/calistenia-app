import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '@calistenia/core/types'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import { setTimezone as setGlobalTimezone, getTimezone, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
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
import { recomputeAutoNutritionGoal } from '@calistenia/core/hooks/useNutrition'

interface ProfilePageProps {
  user: AuthUser
}

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Moneda de despensa (F5 #174): en qué moneda habla el user; el gasto siempre en $ USD
  const { prefs: currencyPrefs, setDefaultCurrency } = useUserCurrency(user?.id ?? null)

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

  return (
    <div className="max-w-[1080px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-1 bg-lime" />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between md:p-7">
          <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="relative group size-20 shrink-0 rounded-full overflow-hidden bg-accent border-2 border-border hover:border-lime transition-colors focus:outline-none focus:ring-2 focus:ring-lime"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
          ) : (
            <span className="flex items-center justify-center size-full text-3xl font-bebas text-foreground">
              {(displayName || user?.email || '?')[0]?.toUpperCase()}
            </span>
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          {uploadingAvatar && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="size-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">{t('profile.accountLabel')}</div>
              <h1 className="mt-1 truncate font-bebas text-[40px] leading-none md:text-[52px]">{displayName || t('profile.title')}</h1>
              <div className="mt-2 text-xs text-muted-foreground">{user?.email || '—'} · {t('profile.changePhoto')}</div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="mb-3 text-[10px] font-mono tracking-[2px] text-muted-foreground uppercase">{t('profile.shareProfile')}</div>
            <div className="flex flex-wrap gap-2">
          <Button
            onClick={shareWhatsApp}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-9 px-4"
          >
            <WhatsAppIcon className="size-4 mr-1.5" />
            WHATSAPP
          </Button>
          <Button
            onClick={copyProfileLink}
            variant="outline"
            size="sm"
            className="text-[10px] tracking-widest h-9 px-4"
          >
            {copied ? (
              <>
                <svg className="size-3.5 mr-1.5 text-lime" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                {t('profile.copied')}
              </>
            ) : (
              <>
                <svg className="size-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                {t('profile.copyLink')}
              </>
            )}
          </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Body & demographics */}
        <Card id="tour-personal-info">
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">{t('profile.sectionBody')}</div>

            <div>
              <Label htmlFor="profile-name" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.name')}</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder={t('profile.namePlaceholder')}
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="profile-weight" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.weight')}</Label>
                <Input
                  id="profile-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => set('weight', e.target.value)}
                  placeholder={t('profile.weightPlaceholder')}
                  className="h-10"
                />
              </div>
              <div>
                <Label htmlFor="profile-height" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.height')}</Label>
                <Input
                  id="profile-height"
                  type="number"
                  min="0"
                  value={height}
                  onChange={(e) => set('height', e.target.value)}
                  placeholder={t('profile.heightPlaceholder')}
                  className="h-10"
                />
              </div>
              <div>
                <Label htmlFor="profile-age" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.age')}</Label>
                <Input
                  id="profile-age"
                  type="number"
                  min="13"
                  max="120"
                  value={age}
                  onChange={(e) => set('age', e.target.value)}
                  placeholder={t('profile.agePlaceholder')}
                  className="h-10"
                />
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.sex')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'male', label: t('profile.male') },
                  { value: 'female', label: t('profile.female') },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('sex', sex === opt.value ? '' : opt.value)}
                    aria-pressed={sex === opt.value}
                    className={cn(
                      'h-10 rounded-md border text-sm transition-colors',
                      sex === opt.value
                        ? 'border-lime bg-lime/10 text-lime'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {bmi && bmiCategory && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/60">
                <div className="flex items-baseline gap-2">
                  <span className="font-bebas text-3xl leading-none text-foreground">{bmi}</span>
                  <span className="text-[10px] text-muted-foreground tracking-wide uppercase">{t('profile.bmiLabel')}</span>
                </div>
                <div className={cn('text-xs mt-0.5', bmiCategory.color)}>{bmiCategory.label}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">{t('profile.sectionGoals')}</div>

            <div>
              <Label htmlFor="profile-goal-weight" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.goalWeight')}</Label>
              <Input
                id="profile-goal-weight"
                type="number"
                step="0.1"
                min="0"
                value={goalWeight}
                onChange={(e) => set('goalWeight', e.target.value)}
                placeholder={t('profile.goalWeightPlaceholder')}
                className="h-10"
              />
              {goalBmi && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  {t('onboarding.bmiGoal', { bmi: goalBmi })}
                </div>
              )}
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.activityLevel')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['sedentary', 'activitySedentary'],
                  ['light', 'activityLight'],
                  ['active', 'activityActive'],
                  ['very_active', 'activityVeryActive'],
                ] as const).map(([val, key]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('activityLevel', activityLevel === val ? '' : val)}
                    aria-pressed={activityLevel === val}
                    className={cn(
                      'h-10 rounded-md border text-sm transition-colors',
                      activityLevel === val
                        ? 'border-lime bg-lime/10 text-lime'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {t(`onboarding.${key}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.pace')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['gradual', 'paceGradual'],
                  ['balanced', 'paceBalanced'],
                  ['aggressive', 'paceAggressive'],
                ] as const).map(([val, key]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('pace', pace === val ? '' : val)}
                    aria-pressed={pace === val}
                    className={cn(
                      'h-10 rounded-md border text-sm transition-colors',
                      pace === val
                        ? 'border-lime bg-lime/10 text-lime'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {t(`onboarding.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Health */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">{t('profile.sectionHealth')}</div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.medicalConditions')}</Label>
              <div className="flex flex-wrap gap-2">
                {CONDITION_IDS.map(id => {
                  const active = medicalConditions.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle('medicalConditions', id)}
                      aria-pressed={active}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs transition-colors',
                        active
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {t(`onboarding.conditions.${id}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.injuriesLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {INJURY_IDS.map(id => {
                  const active = injuries.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle('injuries', id)}
                      aria-pressed={active}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs transition-colors',
                        active
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {t(`onboarding.injuries.${id}`)}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Moneda (despensa F5: en qué moneda hablas; el gasto siempre se muestra en $) */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">
              {t('profile.currency', { defaultValue: 'Moneda' })}
            </div>
            <div className="flex gap-2">
              {SUPPORTED_CURRENCIES.map(code => {
                const active = currencyPrefs.defaultCurrency === code
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setDefaultCurrency(code)}
                    aria-pressed={active}
                    className={cn(
                      'h-11 flex-1 flex items-center justify-center rounded-md border font-mono text-xs tracking-wide transition-colors',
                      active
                        ? 'border-lime/40 bg-lime/10 text-lime'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {currencySymbol(code)} {code}
                  </button>
                )
              })}
            </div>
            <div className="font-mono text-[9px] tracking-wide text-muted-foreground/70">
              {t('profile.currencyDesc', { defaultValue: 'El gasto se muestra siempre en $ (USD de referencia).' })}
            </div>
          </CardContent>
        </Card>

        {/* Training */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">{t('profile.sectionTraining')}</div>

            <div id="tour-level-selector">
              <Label htmlFor="profile-level" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.level')}</Label>
              <div className="flex gap-2">
                {LEVELS.map(l => (
                  <Button
                    key={l.value}
                    variant={level === l.value ? 'limeSolid' : 'outline'}
                    size="sm"
                    aria-pressed={level === l.value}
                    onClick={() => set('level', l.value)}
                    className="h-8 px-4 text-[11px]"
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.focusAreas')}</Label>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREA_IDS.map(id => {
                  const active = focusAreas.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle('focusAreas', id)}
                      aria-pressed={active}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs transition-colors',
                        active
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {t(`onboarding.focus.${id}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.trainingDays')}</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_IDS.map(d => {
                  const active = trainingDays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle('trainingDays', d)}
                      aria-pressed={active}
                      className={cn(
                        'h-10 rounded-md border text-xs font-medium transition-colors',
                        active
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {t(`onboarding.days.${d}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1.5 block">{t('onboarding.intensity')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['light', 'intensityLight'],
                  ['moderate', 'intensityModerate'],
                  ['intense', 'intensityIntense'],
                ] as const).map(([val, key]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('intensity', intensity === val ? '' : val)}
                    aria-pressed={intensity === val}
                    className={cn(
                      'h-10 rounded-md border text-sm transition-colors',
                      intensity === val
                        ? 'border-lime bg-lime/10 text-lime'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {t(`onboarding.${key}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="profile-goal" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.goal')}</Label>
              <textarea
                id="profile-goal"
                value={goal}
                onChange={(e) => set('goal', e.target.value)}
                placeholder={t('profile.goalPlaceholder')}
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Preferences: timezone */}
        <Card>
          <CardContent className="p-5">
            <div>
              <Label htmlFor="profile-timezone" className="text-[11px] text-muted-foreground mb-1.5 block">{t('profile.timezone')}</Label>
              <Input
                id="profile-tz-search"
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                placeholder={t('profile.searchTimezone')}
                className="h-8 text-xs mb-2"
              />
              <select
                id="profile-timezone"
                value={timezone}
                onChange={(e) => set('timezone', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {(() => {
                  try {
                    // `supportedValuesOf` es ES2022 y el `lib` de web sigue en ES2020.
                    const allTz = (Intl as typeof Intl & {
                      supportedValuesOf(key: string): string[]
                    }).supportedValuesOf('timeZone')
                    const filtered = tzSearch
                      ? allTz.filter(tz => tz.toLowerCase().includes(tzSearch.toLowerCase()))
                      : allTz
                    return filtered.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))
                  } catch {
                    // Fallback for older browsers
                    const common = [
                      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                      'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires',
                      'America/Mexico_City', 'America/Sao_Paulo',
                      'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
                      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
                      'Australia/Sydney', 'Pacific/Auckland',
                    ]
                    return common.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))
                  }
                })()}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1">
                {t('profile.currentTimezone')}: {timezone.replace(/_/g, ' ')}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('profile.language')}</div>
            <select
              value={currentLang}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </CardContent>
        </Card>

        {/* Account info (read-only) */}
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('profile.accountSection')}</div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">{t('profile.email')}</span>
                <span className="text-sm text-foreground">{user?.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">{t('profile.memberSince')}</span>
                <span className="text-sm text-foreground">{user?.created ? utcToLocalDateStr(user.created) : '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Herramientas con jerarquía: el hábito diario tiene más peso visual. */}
        <section className="space-y-3 lg:col-span-2" aria-label={t('profile.quickActions')}>
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">{t('profile.quickActions')}</div>
          <div className="grid gap-3 sm:grid-cols-[1.45fr_1fr]">
            <Card
              className="cursor-pointer border-lime bg-lime text-lime-foreground transition-transform hover:-translate-y-0.5"
              onClick={() => navigate('/reminders')}
            >
              <CardContent className="p-5 flex h-full items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-black/10 text-xl">🔔</span>
                  <div><div className="text-sm font-medium">{t('profile.reminders')}</div><div className="mt-0.5 text-[10px] text-lime-foreground/70">{t('profile.remindersDesc')}</div></div>
                </div>
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer border-border/80 transition-colors hover:border-lime/50 hover:bg-muted/40"
              onClick={() => navigate('/settings/blocked')}
            >
              <CardContent className="p-5 flex h-full items-center justify-between gap-3">
                <div><span className="mb-3 flex size-9 items-center justify-center rounded-full bg-muted text-lg">🚫</span><div className="text-sm font-medium">{t('blocks.manageEntry')}</div></div>
                <svg className="size-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="limeSolid"
          className="h-11 font-bebas text-lg tracking-wide lg:col-span-2"
        >
          {saving ? t('profile.saving') : saved ? t('profile.saved') : t('profile.saveChanges')}
        </Button>

        {/* Zona de peligro: baja de cuenta (#300). Al final y separada del
            resto para que no se pulse de paso mientras se editan campos. */}
        <Card className="border-destructive/30 lg:col-span-2">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="text-[10px] text-destructive tracking-[3px] uppercase">{t('account.dangerZone')}</div>
            <p className="text-sm text-muted-foreground">{t('account.deleteDesc')}</p>
            <Button
              variant="outline"
              className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              {t('account.deleteCta')}
            </Button>
          </CardContent>
        </Card>
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
