import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = new Map<string, string>()

vi.mock('../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
  getPlatform: () => ({ analytics: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'web' as const }),
}))

import {
  ANALYTICS_EXCLUDED_PROFILE_IDS,
  CANONICAL_ANALYTICS_EVENTS,
  emitOnce,
  normalizeCanonicalAnalyticsProperties,
  op,
  setActiveAnalyticsProfileId,
  shouldSendAnalytics,
} from './analytics'

describe('canonical analytics contract', () => {
  it('defines the versioned growth-loop event set without duplicate names', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)

    expect(events).toHaveLength(56)
    // #636: el final de UN corredor y el cierre de LA carrera son dos eventos
    // distintos. Antes `race_finished` y `race_completed` se leían igual.
    expect(events).toContain('race_participant_finished')
    expect(events).toContain('race_completed')
    expect(new Set(events).size).toBe(events.length)
    expect(events).toContain('featured_challenge_viewed')
    expect(events).toContain('post_workout_action_viewed')
    expect(events).toContain('post_workout_action_selected')
    expect(events).toContain('referral_prompt_viewed')
    expect(events).toContain('referral_status_viewed')
    expect(events).toContain('program_milestone_completed')
    expect(events).toContain('battle_shared')
    // #357: sin estos dos el embudo no sabe si alguien llega a mirar el resultado
    // que se ha ganado, ni si vuelve a jugar después.
    expect(events).toContain('battle_results_viewed')
    // #636 §5: existían solo en UNA plataforma y por el camino legacy, así que
    // no llevaban `event_version` ni `surface`. El nombre no cambia.
    for (const name of [
      'notification_clicked', 'leaderboard_viewed', 'cardio_detail_viewed',
      'exercise_searched', 'streak_milestone', 'page_error', 'program_editor_saved',
    ]) {
      expect(events).toContain(name)
    }
    // #636 §4: superficies que no emitían absolutamente nada.
    for (const name of [
      'feed_viewed', 'feed_reaction_toggled', 'feed_comment_added',
      'progress_viewed', 'calendar_viewed', 'history_viewed', 'session_detail_viewed',
      'exercise_catalog_viewed', 'exercise_viewed', 'program_viewed',
      'auth_viewed', 'signup_started', 'signup_failed', 'login_started', 'login_failed',
      'onboarding_started',
    ]) {
      expect(events).toContain(name)
    }
    expect(events).toContain('battle_rematch_created')
  })

  // #353: los programas de comunidad son OTRA cosa que el currículo de
  // entrenamiento. Si alguien reutilizase `program_joined` para las cohortes,
  // el embudo dejaría de poder distinguirlas y este test lo impide.
  it('keeps training-program and community-program events as separate families', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)
    for (const name of ['program_joined', 'program_milestone_completed']) {
      expect(events).toContain(name)
    }
    for (const name of [
      'community_program_viewed',
      'community_program_joined',
      'community_program_left',
      'community_program_milestone_completed',
      'community_program_completed',
    ]) {
      expect(events).toContain(name)
    }
    // Ningún evento de comunidad puede llamarse igual que uno del currículo.
    const community = events.filter(e => e.startsWith('community_program_'))
    const training = events.filter(e => e.startsWith('program_'))
    expect(community).toHaveLength(5)
    // #636 §4/§5 sumó `program_viewed` y `program_editor_saved` al currículo.
    expect(training).toHaveLength(4)
    expect(community.some(e => training.includes(e))).toBe(false)
  })

  // #356 separó las dos familias: `race_*` es el flujo GPS (que antes emitía
  // `battle_*` con un id de `races`) y `battle_*` queda solo para las batallas de
  // circuito. Mezclarlas otra vez rompería los embudos de las dos.
  it('keeps race and battle events as separate families', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)
    for (const name of ['race_created', 'race_joined', 'race_started', 'race_completed', 'race_shared']) {
      expect(events).toContain(name)
    }
    for (const name of ['battle_created', 'battle_joined', 'battle_started', 'battle_completed', 'battle_shared']) {
      expect(events).toContain(name)
    }
  })

  it('adds the contract version and the platform, and removes unset properties', () => {
    expect(normalizeCanonicalAnalyticsProperties({
      surface: 'post_workout',
      source: undefined,
      workout_id: 'p1_lun',
      result: null as unknown as string,
    })).toEqual({
      event_version: 1,
      platform: 'web',
      surface: 'post_workout',
      workout_id: 'p1_lun',
    })
  })

  // #636: `share_card_shared` ya usaba `platform` con OTRO significado — el
  // destino del compartir. El sello es un valor por defecto, no una imposición:
  // si el evento trae el suyo, gana el suyo.
  it('lets an explicit platform win over the stamped one', () => {
    expect(normalizeCanonicalAnalyticsProperties({
      surface: 'share_card',
      platform: 'whatsapp',
    })).toMatchObject({ platform: 'whatsapp' })
  })
})

describe('emitOnce', () => {
  beforeEach(() => { mem.clear() })

  it('emite la primera vez y deja marcador en storage', () => {
    const emit = vi.fn()
    emitOnce('k1', emit)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(mem.get('k1')).toBe('true')
  })

  it('no vuelve a emitir con la marca puesta (aunque la puso otro código)', () => {
    // Compat con los marcadores previos hand-rolled: cualquier valor truthy vale
    // (program_started guardaba un timestamp).
    mem.set('k2', '1755300000000')
    const emit = vi.fn()
    emitOnce('k2', emit)
    expect(emit).not.toHaveBeenCalled()
  })

  it('con storage roto prefiere emitir a perder el evento', async () => {
    const platform = await import('../platform')
    const spy = vi.spyOn(platform.storage, 'getItem').mockImplementation(() => { throw new Error('quota') })
    const emit = vi.fn()
    emitOnce('k3', emit)
    expect(emit).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('shouldSendAnalytics (#696, filtro del SDK para la cuenta demo)', () => {
  const demo = [...ANALYTICS_EXCLUDED_PROFILE_IDS][0]

  beforeEach(() => { setActiveAnalyticsProfileId(null) })

  it('descarta cualquier payload cuyo profileId sea una cuenta excluida', () => {
    expect(shouldSendAnalytics({ type: 'track', payload: { profileId: demo } })).toBe(false)
    expect(shouldSendAnalytics({ type: 'identify', payload: { profileId: demo } })).toBe(false)
  })

  it('deja pasar a cualquier otro usuario y a los anónimos', () => {
    expect(shouldSendAnalytics({ type: 'track', payload: { profileId: 'otro_usuario' } })).toBe(true)
    expect(shouldSendAnalytics({ type: 'track', payload: {} })).toBe(true)
    expect(shouldSendAnalytics(undefined)).toBe(true)
  })

  it('usa el último identify como respaldo para payloads sin profileId (replay)', () => {
    op.identify({ profileId: demo, firstName: 'Demo Play' })
    expect(shouldSendAnalytics({ type: 'replay', payload: {} })).toBe(false)
    // Un payload con profileId propio de otro usuario sigue pasando.
    expect(shouldSendAnalytics({ type: 'track', payload: { profileId: 'otro_usuario' } })).toBe(true)

    op.clear()
    expect(shouldSendAnalytics({ type: 'replay', payload: {} })).toBe(true)
  })
})
