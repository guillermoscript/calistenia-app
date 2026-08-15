import { beforeAll, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import en from '../locales/en/translation.json'
import es from '../locales/es/translation.json'
import {
  BEGINNER_CHALLENGE_PRESETS,
  findExistingPresetChallenge,
  getBeginnerChallengePreset,
  getPresetDateRange,
  getPresetTargetLabel,
  getVisibleBeginnerChallengePresets,
  resolvePresetChallengeTitle,
} from './challenge-presets'
import { getCatalogEntry } from './variants'

describe('beginner challenge presets', () => {
  // Las claves llevan puntos literales, así que hay que desactivar los separadores.
  beforeAll(async () => {
    await i18n.init({
      lng: 'en',
      resources: { en: { translation: en }, es: { translation: es } },
      keySeparator: false,
      nsSeparator: false,
    })
  })

  it('contains the four requested presets, all enabled now that cumulative scoring exists', () => {
    expect(BEGINNER_CHALLENGE_PRESETS.map((preset) => preset.id)).toEqual([
      'starter_7_day',
      'consistency_30_day',
      'first_10_workouts',
      'pushup_builder',
    ])
    expect(BEGINNER_CHALLENGE_PRESETS.every((preset) => preset.enabled)).toBe(true)
  })

  // #345: el Push-up Builder nació deshabilitado (#350) porque `most_pushups`
  // es un PR, no un total; con `total_exercise` (#352) suma las reps de
  // push-up estándar registradas en la ventana del reto.
  it('scores the push-up builder as a cumulative total of standard push-ups', () => {
    const pushups = getBeginnerChallengePreset('pushup_builder')!
    expect(pushups.metric).toBe('total_exercise')
    expect(pushups.exerciseSlug).toBe('pushup_std')
    expect(pushups.goal).toBe(100)
    expect(pushups.durationDays).toBe(30)
    expect(pushups.disabledReasonKey).toBeUndefined()
  })

  it('every preset that scores one exercise names a real catalog exercise', () => {
    for (const preset of BEGINNER_CHALLENGE_PRESETS) {
      if (preset.metric === 'exercise' || preset.metric === 'total_exercise') {
        expect(preset.exerciseSlug, preset.id).toBeTruthy()
        expect(getCatalogEntry(preset.exerciseSlug!), preset.id).toBeDefined()
      } else {
        expect(preset.exerciseSlug, preset.id).toBeUndefined()
      }
    }
  })

  // #384: una tarjeta con "PRÓXIMAMENTE" que no se puede pulsar no informa,
  // sólo ocupa sitio — el catálogo esconde los presets deshabilitados.
  it('shows every enabled preset in the catalog and keeps resolving disabled ones by id', () => {
    expect(getVisibleBeginnerChallengePresets().map((preset) => preset.id)).toEqual([
      'starter_7_day',
      'consistency_30_day',
      'first_10_workouts',
      'pushup_builder',
    ])
    expect(getVisibleBeginnerChallengePresets().every((preset) => preset.enabled)).toBe(true)
    // Un reto ya creado desde un preset tiene que seguir resolviendo por id
    // aunque el preset se retire luego del catálogo.
    expect(getBeginnerChallengePreset('pushup_builder')?.id).toBe('pushup_builder')
  })

  it('uses inclusive start/end dates for a preset duration', () => {
    const preset = BEGINNER_CHALLENGE_PRESETS[0]
    expect(getPresetDateRange(preset, '2026-08-09')).toEqual({
      startsAt: '2026-08-09',
      endsAt: '2026-08-15',
    })
  })

  it('returns the existing challenge for a repeated preset join', () => {
    const existing = { id: 'challenge-1', preset_key: 'starter_7_day', starts_at: '2026-08-09', ends_at: '2026-08-15', status: 'active' }
    expect(findExistingPresetChallenge([
      { expand: { challenge: existing } },
    ], 'starter_7_day')).toEqual(existing)
    expect(findExistingPresetChallenge([
      { expand: { challenge: existing } },
    ], 'consistency_30_day')).toBeNull()
  })

  it('ignores finished rounds so a preset can be started again', () => {
    const finished = { id: 'challenge-1', preset_key: 'starter_7_day', starts_at: '2026-08-01', ends_at: '2026-08-07', status: 'ended' }
    expect(findExistingPresetChallenge([{ expand: { challenge: finished } }], 'starter_7_day')).toBeNull()
  })

  it('prefers the active round when an older one already finished', () => {
    const finished = { id: 'challenge-1', preset_key: 'starter_7_day', starts_at: '2026-08-01', ends_at: '2026-08-07', status: 'ended' }
    const active = { id: 'challenge-2', preset_key: 'starter_7_day', starts_at: '2026-08-09', ends_at: '2026-08-15', status: 'active' }
    expect(findExistingPresetChallenge([
      { expand: { challenge: finished } },
      { expand: { challenge: active } },
    ], 'starter_7_day')).toEqual(active)
  })

  it('labels the target with the metric unit instead of always saying workouts', () => {
    const pushups = BEGINNER_CHALLENGE_PRESETS.find((preset) => preset.id === 'pushup_builder')!
    const sessions = BEGINNER_CHALLENGE_PRESETS.find((preset) => preset.id === 'starter_7_day')!
    // La meta de push-ups son reps, no entrenamientos.
    expect(getPresetTargetLabel(pushups)).toBe('100 reps')
    expect(getPresetTargetLabel(sessions)).toBe('3 workouts')
  })

  it('re-resolves preset titles instead of trusting the language frozen in the record', async () => {
    // El registro guarda el título en inglés (el idioma de quien se unió).
    const record = { title: '7-Day Starter', preset_key: 'starter_7_day' }
    expect(resolvePresetChallengeTitle(record)).toBe('7-Day Starter')

    await i18n.changeLanguage('es')
    expect(resolvePresetChallengeTitle(record)).toBe('Starter de 7 días')
    await i18n.changeLanguage('en')
  })

  it('keeps the stored title for challenges that do not come from a preset', () => {
    expect(resolvePresetChallengeTitle({ title: 'Reto de agosto' })).toBe('Reto de agosto')
    expect(resolvePresetChallengeTitle({ title: 'Reto de agosto', preset_key: 'desconocido' })).toBe('Reto de agosto')
  })
})
