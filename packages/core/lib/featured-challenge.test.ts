import { describe, it, expect } from 'vitest'
import { pickFeaturedChallenge, RESULTS_WINDOW_DAYS } from './featured-challenge'
import type { Challenge } from '../types'

const TODAY = '2026-08-10'

function challenge(overrides: Partial<Challenge> & { id: string }): Challenge {
  return {
    creator: 'creator1',
    title: 'Reto',
    metric: 'most_sessions',
    starts_at: '2026-08-01',
    ends_at: '2026-08-20',
    status: 'active',
    ...overrides,
  }
}

describe('pickFeaturedChallenge', () => {
  it('devuelve null sin candidatos (la card no se renderiza)', () => {
    expect(pickFeaturedChallenge([], new Set(), TODAY)).toBeNull()
  })

  it('usuario nuevo: reto vivo sin participar → estado join', () => {
    const card = pickFeaturedChallenge([challenge({ id: 'a' })], new Set(), TODAY)
    expect(card).not.toBeNull()
    expect(card!.state).toBe('join')
    expect(card!.isParticipant).toBe(false)
  })

  it('participante: reto vivo → estado continue con progreso temporal, nunca CTA de unirse duplicado', () => {
    const card = pickFeaturedChallenge([challenge({ id: 'a' })], new Set(['a']), TODAY)
    expect(card!.state).toBe('continue')
    expect(card!.isParticipant).toBe(true)
    // 2026-08-01 → 2026-08-20 son 19 días; hoy van 9 → ~47%
    expect(card!.progressPct).toBe(47)
    expect(card!.daysRemaining).toBe(10)
  })

  it('con varios vivos gana el que antes termina', () => {
    const soon = challenge({ id: 'soon', ends_at: '2026-08-12' })
    const later = challenge({ id: 'later', ends_at: '2026-08-30' })
    const card = pickFeaturedChallenge([later, soon], new Set(), TODAY)
    expect(card!.challenge.id).toBe('soon')
  })

  it('termina hoy sigue vivo con daysRemaining 0', () => {
    const card = pickFeaturedChallenge([challenge({ id: 'a', ends_at: TODAY })], new Set(), TODAY)
    expect(card!.state).toBe('join')
    expect(card!.daysRemaining).toBe(0)
  })

  it('aún no empezado (upcoming) no se muestra', () => {
    const card = pickFeaturedChallenge([challenge({ id: 'a', starts_at: '2026-08-15' })], new Set(), TODAY)
    expect(card).toBeNull()
  })

  it('completado: terminado hace poco y participando → estado results', () => {
    const ended = challenge({ id: 'a', ends_at: '2026-08-08', status: 'ended' })
    const card = pickFeaturedChallenge([ended], new Set(['a']), TODAY)
    expect(card!.state).toBe('results')
    expect(card!.progressPct).toBe(100)
  })

  it('caducado por fecha pero aún status active cuenta como terminado', () => {
    const stale = challenge({ id: 'a', ends_at: '2026-08-08', status: 'active' })
    const card = pickFeaturedChallenge([stale], new Set(['a']), TODAY)
    expect(card!.state).toBe('results')
  })

  it('expirado: terminado sin participar → oculto', () => {
    const ended = challenge({ id: 'a', ends_at: '2026-08-08', status: 'ended' })
    expect(pickFeaturedChallenge([ended], new Set(), TODAY)).toBeNull()
  })

  it('terminado fuera de la ventana de resultados → oculto aunque participara', () => {
    const old = challenge({ id: 'a', ends_at: '2026-07-20', status: 'ended' })
    expect(pickFeaturedChallenge([old], new Set(['a']), TODAY)).toBeNull()
    // Justo en el borde de la ventana sí se muestra
    const edge = challenge({ id: 'b', ends_at: '2026-08-03', status: 'ended' })
    expect(RESULTS_WINDOW_DAYS).toBe(7)
    expect(pickFeaturedChallenge([edge], new Set(['b']), TODAY)!.state).toBe('results')
  })

  it('un vivo gana sobre un terminado con participación (siguiente destacado sustituye resultados)', () => {
    const ended = challenge({ id: 'old', ends_at: '2026-08-08', status: 'ended' })
    const live = challenge({ id: 'new', ends_at: '2026-08-25' })
    const card = pickFeaturedChallenge([ended, live], new Set(['old']), TODAY)
    expect(card!.challenge.id).toBe('new')
    expect(card!.state).toBe('join')
  })
})
