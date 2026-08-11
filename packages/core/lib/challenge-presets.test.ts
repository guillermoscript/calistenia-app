import { beforeAll, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import en from '../locales/en/translation.json'
import es from '../locales/es/translation.json'
import {
  BEGINNER_CHALLENGE_PRESETS,
  findExistingPresetChallenge,
  getPresetDateRange,
  getPresetTargetLabel,
  resolvePresetChallengeTitle,
} from './challenge-presets'

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

  it('contains the four requested presets and keeps cumulative push-ups disabled', () => {
    expect(BEGINNER_CHALLENGE_PRESETS.map((preset) => preset.id)).toEqual([
      'starter_7_day',
      'consistency_30_day',
      'first_10_workouts',
      'pushup_builder',
    ])
    expect(BEGINNER_CHALLENGE_PRESETS.find((preset) => preset.id === 'pushup_builder')?.enabled).toBe(false)
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
