import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useChallenges } from '@calistenia/core/hooks/useChallenges'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { cn } from '../lib/utils'
import { todayStr, toLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { getMetricUnit } from '@calistenia/core/lib/challenges'
import { getCatalogEntry, getAllCatalogEntries } from '@calistenia/core/lib/variants'
import { localize } from '@calistenia/core/lib/i18n-db'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import type { ChallengeMetric } from '@calistenia/core/types'

interface MetricOption {
  id: ChallengeMetric
  icon: string
}

/**
 * Las cuatro que se usan de verdad (#384). El corte sale de los presets de
 * #370 —`most_sessions` en tres de los cuatro, `most_pushups` en el otro— más
 * las dos métricas clásicas que se eligen de un solo toque.
 */
const PRIMARY_METRICS: MetricOption[] = [
  { id: 'most_sessions', icon: '💪' },
  { id: 'longest_streak', icon: '🔥' },
  { id: 'most_pullups', icon: '🏋️' },
  { id: 'most_pushups', icon: '🫸' },
]

/**
 * El resto, tras "Más métricas". Ninguna desaparece del producto: todas piden
 * un paso extra (elegir ejercicio del catálogo, una unidad ajena como los km)
 * o son la salida de emergencia (`custom`, la última de todas).
 */
const SECONDARY_METRICS: MetricOption[] = [
  { id: 'exercise', icon: '🎯' },
  { id: 'total_workouts', icon: '🏋️' },
  { id: 'total_exercise', icon: '🔢' },
  { id: 'total_distance', icon: '🛣️' },
  { id: 'most_lsit', icon: '🧘' },
  { id: 'most_handstand', icon: '🤸' },
  { id: 'custom', icon: '✏️' },
]

const ALL_METRICS: MetricOption[] = [...PRIMARY_METRICS, ...SECONDARY_METRICS]

const isSecondaryMetric = (metric: ChallengeMetric) =>
  SECONDARY_METRICS.some(m => m.id === metric)

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const DURATION_DAYS = [7, 14, 30, 0]

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return toLocalDateStr(d)
}

interface CreateChallengePageProps {
  userId: string
}

export default function CreateChallengePage({ userId }: CreateChallengePageProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { createChallenge } = useChallenges(userId)
  const { following } = useFollows(userId)

  const today = todayStr()
  const locale = i18n.language

  // ?exercise=<slug> (desde el detalle de ejercicio) preselecciona la métrica
  const prefilledExercise = getCatalogEntry(searchParams.get('exercise') ?? '')

  const [title, setTitle] = useState(
    prefilledExercise ? t('challenge.exerciseTitlePrefill', { name: localize(prefilledExercise.name, locale) }) : ''
  )
  const [description, setDescription] = useState('')
  const [metric, setMetric] = useState<ChallengeMetric>(prefilledExercise ? 'exercise' : 'most_sessions')
  // `?exercise=<slug>` preselecciona `exercise`, que vive en el desplegable: si
  // no lo abrimos, el paso arrancaría con la métrica activa fuera de la vista.
  const [showAllMetrics, setShowAllMetrics] = useState(() => isSecondaryMetric(prefilledExercise ? 'exercise' : 'most_sessions'))
  const [customMetric, setCustomMetric] = useState('')
  const [exerciseSlug, setExerciseSlug] = useState<string | null>(prefilledExercise?.id ?? null)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [goal, setGoal] = useState('')
  const [durationPreset, setDurationPreset] = useState(7)
  const [startsAt, setStartsAt] = useState(today)
  const [endsAt, setEndsAt] = useState(addDays(today, 7))
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const handleDurationPreset = (days: number) => {
    setDurationPreset(days)
    if (days > 0) {
      setEndsAt(addDays(startsAt, days))
    }
  }

  const handleStartChange = (val: string) => {
    setStartsAt(val)
    if (durationPreset > 0) {
      setEndsAt(addDays(val, durationPreset))
    }
  }

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFriends = () => {
    if (selectedFriends.size === following.length) {
      setSelectedFriends(new Set())
    } else {
      setSelectedFriends(new Set(following.map(f => f.id)))
    }
  }

  const isCustomMetric = metric === 'custom'
  const isExerciseMetric = metric === 'exercise' || metric === 'total_exercise'

  // Plegado enseñamos las principales y, si la elegida está en el desplegable,
  // también esa: plegar nunca puede esconder la métrica que está seleccionada.
  const selectedSecondary = SECONDARY_METRICS.find(m => m.id === metric)
  const visibleMetrics = showAllMetrics
    ? ALL_METRICS
    : selectedSecondary
      ? [...PRIMARY_METRICS, selectedSecondary]
      : PRIMARY_METRICS
  const hiddenMetricCount = ALL_METRICS.length - visibleMetrics.length
  const selectedExercise = exerciseSlug ? getCatalogEntry(exerciseSlug) : undefined

  const exerciseResults = useMemo(() => {
    const q = stripAccents(exerciseQuery.trim())
    if (q.length < 2) return []
    return getAllCatalogEntries()
      .filter(ex => stripAccents(ex.name.es ?? '').includes(q) || stripAccents(ex.name.en ?? '').includes(q))
      .slice(0, 15)
  }, [exerciseQuery])

  const selectExercise = (slug: string) => {
    setExerciseSlug(slug)
    setExerciseQuery('')
    if (!title.trim()) {
      const entry = getCatalogEntry(slug)
      if (entry) setTitle(t('challenge.exerciseTitlePrefill', { name: localize(entry.name, locale) }))
    }
  }

  const canSubmit = title.trim().length > 0 && startsAt && endsAt && endsAt >= startsAt
    && (!isCustomMetric || customMetric.trim().length > 0)
    && (!isExerciseMetric || !!exerciseSlug)

  const handleSubmit = async () => {
    if (!canSubmit || creating) return
    setCreating(true)
    const id = await createChallenge({
      title: title.trim(),
      metric,
      custom_metric: isCustomMetric ? customMetric.trim() : undefined,
      exercise_slug: isExerciseMetric ? (exerciseSlug ?? undefined) : undefined,
      description: description.trim() || undefined,
      goal: goal ? Number(goal) : undefined,
      starts_at: startsAt,
      ends_at: endsAt,
      invitedUserIds: Array.from(selectedFriends),
    })
    setCreating(false)
    if (id) navigate(`/challenges/${id}`, { replace: true })
    else navigate('/challenges', { replace: true })
  }

  const shareWhatsApp = () => {
    const msg = `${t('challenge.shareWhatsAppText', { title: title || t('challenge.shareFallbackTitle') })}\n${window.location.origin}/challenges`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back */}
      <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        {t('common.back')}
      </button>

      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('challenge.new')}</div>
      <h1 className="font-bebas text-3xl md:text-4xl mb-6">{t('challenge.createTitle')}</h1>

      {/* Title */}
      <div className="mb-5">
        <label htmlFor="challenge-title" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">{t('challenge.nameLabel')}</label>
        <Input
          id="challenge-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('challenge.titlePlaceholder')}
          maxLength={60}
        />
      </div>

      {/* Description */}
      <div className="mb-5">
        <label htmlFor="challenge-desc" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">
          {t('challenge.descriptionLabel')} <span className="opacity-50">({t('challenge.optional')})</span>
        </label>
        <textarea
          id="challenge-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('challenge.descriptionPlaceholder')}
          maxLength={300}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      {/* Metric */}
      <fieldset className="mb-5">
        <legend className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('challenge.whatToCompete')}</legend>
        <div id="challenge-metric-grid" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visibleMetrics.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              aria-pressed={metric === m.id}
              className={cn(
                'px-3 py-2.5 min-h-[44px] rounded-lg text-left transition-all duration-200 border active:scale-[0.97]',
                metric === m.id
                  ? 'text-lime border-lime/40 bg-lime/10'
                  : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/20',
              )}
            >
              <div className="text-[11px] font-medium">
                <span className="mr-1.5" aria-hidden="true">{m.icon}</span>
                {t(`challenge.metric.${m.id}`)}
              </div>
              <div className="text-[9px] opacity-60 mt-0.5">{t(`challenge.metricDesc.${m.id}`)}</div>
            </button>
          ))}
        </div>

        {(showAllMetrics || hiddenMetricCount > 0) && (
          <button
            type="button"
            onClick={() => setShowAllMetrics(v => !v)}
            aria-expanded={showAllMetrics}
            aria-controls="challenge-metric-grid"
            className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm px-1 py-1.5 min-h-[32px]"
          >
            <span aria-hidden="true">{showAllMetrics ? '▾' : '▸'}</span>
            {showAllMetrics
              ? t('challenge.fewerMetrics')
              : t('challenge.moreMetrics', { n: hiddenMetricCount })}
          </button>
        )}

        {/* Custom metric input */}
        {isCustomMetric && (
          <div className="mt-3 motion-safe:animate-fade-in">
            <label htmlFor="challenge-custom-metric" className="sr-only">{t('challenge.customMetricLabel')}</label>
            <Input
              id="challenge-custom-metric"
              value={customMetric}
              onChange={e => setCustomMetric(e.target.value)}
              placeholder={t('challenge.customMetricPlaceholder')}
              maxLength={40}
            />
          </div>
        )}

        {/* Exercise picker */}
        {isExerciseMetric && (
          <div className="mt-3 motion-safe:animate-fade-in">
            {selectedExercise ? (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-lime/40 bg-lime/5">
                <div className="min-w-0">
                  <div className="text-sm truncate">{localize(selectedExercise.name, locale)}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {localize(selectedExercise.muscles ?? {}, locale)}
                  </div>
                </div>
                <button
                  onClick={() => { setExerciseSlug(null); setExerciseQuery('') }}
                  className="text-[10px] text-lime hover:text-lime/80 transition-colors shrink-0"
                >
                  {t('challenge.changeExercise')}
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="challenge-exercise" className="sr-only">{t(`challenge.metric.${metric}`)}</label>
                <Input
                  id="challenge-exercise"
                  value={exerciseQuery}
                  onChange={e => setExerciseQuery(e.target.value)}
                  placeholder={t('challenge.exerciseSearchPlaceholder')}
                  autoFocus
                />
                {exerciseResults.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 max-h-64 overflow-y-auto" role="listbox">
                    {exerciseResults.map(ex => (
                      <button
                        key={ex.id}
                        role="option"
                        aria-selected={false}
                        onClick={() => selectExercise(ex.id)}
                        className="px-3 py-2 rounded-md border border-border text-left hover:border-lime/40 hover:bg-lime/5 transition-colors"
                      >
                        <div className="text-xs">{localize(ex.name, locale)}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {localize(ex.muscles ?? {}, locale)}
                          {ex.isTimer ? ' · s' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </fieldset>

      {/* Goal */}
      <div className="mb-5">
        <label htmlFor="challenge-goal" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">
          {t('challenge.goal')} <span className="opacity-50">({t('challenge.optional')})</span>
        </label>
        <div className="flex items-center gap-3">
          <Input
            id="challenge-goal"
            type="number"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder={t('challenge.goalPlaceholder')}
            min="1"
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">
            {isCustomMetric
              ? (customMetric || t('challenge.units'))
              : isExerciseMetric
                ? getMetricUnit(metric, exerciseSlug ?? undefined)
                : metric === 'total_distance'
                  ? getMetricUnit(metric)
                  : t(`challenge.metric.${metric}`).toLowerCase()}
          </span>
        </div>
      </div>

      {/* Duration presets */}
      <fieldset className="mb-5">
        <legend className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('challenge.duration.label')}</legend>
        <div className="flex flex-wrap gap-2 mb-3">
          {DURATION_DAYS.map(days => (
            <button
              key={days}
              onClick={() => handleDurationPreset(days)}
              aria-pressed={durationPreset === days}
              className={cn(
                'px-3 py-2.5 min-h-[44px] rounded-md text-[11px] font-medium transition-all duration-150 border active:scale-95',
                durationPreset === days
                  ? 'text-lime border-lime/40 bg-lime/10'
                  : 'text-muted-foreground border-border hover:text-foreground',
              )}
            >
              {days === 7 ? t('challenge.duration.1week') : days === 14 ? t('challenge.duration.2weeks') : days === 30 ? t('challenge.duration.1month') : t('challenge.duration.custom')}
            </button>
          ))}
        </div>

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="challenge-start" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 block">{t('challenge.startLabel')}</label>
            <Input id="challenge-start" type="date" value={startsAt} onChange={e => handleStartChange(e.target.value)} min={today} />
          </div>
          <div>
            <label htmlFor="challenge-end" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 block">{t('challenge.endLabel')}</label>
            <Input
              id="challenge-end"
              type="date"
              value={endsAt}
              onChange={e => { setEndsAt(e.target.value); setDurationPreset(0) }}
              min={startsAt || today}
              disabled={durationPreset > 0}
            />
          </div>
        </div>
      </fieldset>

      {/* Friend selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
            {t('challenge.inviteFriends')} {selectedFriends.size > 0 && `(${selectedFriends.size})`}
          </span>
          {following.length > 1 && (
            <button
              onClick={selectAllFriends}
              className="text-[10px] text-lime hover:text-lime/80 transition-colors"
            >
              {selectedFriends.size === following.length ? t('challenge.deselectAll') : t('challenge.selectAll')}
            </button>
          )}
        </div>
        {following.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-3">
              Sigue a alguien primero para poder invitarlos
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/friends')}
                className="text-[10px] tracking-widest h-8"
              >
                BUSCAR AMIGOS
              </Button>
              <Button
                size="sm"
                onClick={shareWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-8"
              >
                <WhatsAppIcon className="size-3.5 mr-1" />
                INVITAR POR WHATSAPP
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" role="group" aria-label={t('challenge.inviteFriendsAriaLabel')}>
            {following.map(user => {
              const selected = selectedFriends.has(user.id)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleFriend(user.id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-150 text-left active:scale-[0.98]',
                    selected
                      ? 'border-lime/40 bg-lime/5'
                      : 'border-border hover:border-foreground/20',
                  )}
                >
                  <div className={cn(
                    'size-5 rounded border-2 flex items-center justify-center transition-colors shrink-0',
                    selected ? 'border-lime bg-lime' : 'border-muted-foreground/30',
                  )}>
                    {selected && (
                      <svg className="size-3 text-lime-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3,8 7,12 13,4" /></svg>
                    )}
                  </div>
                  <div className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium shrink-0" aria-hidden="true">
                    {user.displayName[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm truncate block">{user.displayName}</span>
                    {user.username && <span className="text-[10px] text-muted-foreground">@{user.username}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || creating}
        className="w-full bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide h-12"
      >
        {creating ? t('challenge.creating') : t('challenge.createButton')}
      </Button>
    </div>
  )
}
