import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CARDIO_ACTIVE_KEY,
  CIRCUIT_ACTIVE_KEY,
  STRENGTH_ACTIVE_KEY,
} from '@calistenia/core/lib/storage-keys'

import { hasActiveWorkout } from './active-workout'

/**
 * Este predicado decide si el service worker puede recargar la página sola
 * (#690). Un falso negativo le tira el entreno a alguien a mitad de una serie,
 * así que cada caso de «ante la duda, sí hay entreno» está fijado aquí.
 */
const HOUR = 60 * 60 * 1000

describe('hasActiveWorkout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('sin ninguna clave, no hay entreno', () => {
    expect(hasActiveWorkout()).toBe(false)
  })

  it.each([
    ['fuerza', STRENGTH_ACTIVE_KEY, 'startedAt'],
    ['circuito', CIRCUIT_ACTIVE_KEY, 'startedAt'],
    ['cardio', CARDIO_ACTIVE_KEY, 'startTime'],
  ])('detecta una sesión de %s recién empezada', (_name, key, field) => {
    localStorage.setItem(key, JSON.stringify({ [field]: Date.now() - 5 * 60 * 1000 }))
    expect(hasActiveWorkout()).toBe(true)
  })

  it.each([
    ['fuerza', STRENGTH_ACTIVE_KEY, 'startedAt'],
    ['circuito', CIRCUIT_ACTIVE_KEY, 'startedAt'],
    ['cardio', CARDIO_ACTIVE_KEY, 'startTime'],
  ])('ignora una sesión de %s de más de 24 h', (_name, key, field) => {
    // Los hooks la borran al montar; si contara aquí, quien abandonó un entreno
    // hace una semana no volvería a actualizar nunca.
    localStorage.setItem(key, JSON.stringify({ [field]: Date.now() - 25 * HOUR }))
    expect(hasActiveWorkout()).toBe(false)
  })

  it('cuenta una sesión justo en el límite de las 24 h', () => {
    localStorage.setItem(STRENGTH_ACTIVE_KEY, JSON.stringify({ startedAt: Date.now() - 24 * HOUR }))
    expect(hasActiveWorkout()).toBe(true)
  })

  it('basta con que una de las tres esté viva', () => {
    localStorage.setItem(STRENGTH_ACTIVE_KEY, JSON.stringify({ startedAt: Date.now() - 40 * HOUR }))
    localStorage.setItem(CARDIO_ACTIVE_KEY, JSON.stringify({ startTime: Date.now() - 40 * HOUR }))
    localStorage.setItem(CIRCUIT_ACTIVE_KEY, JSON.stringify({ startedAt: Date.now() }))
    expect(hasActiveWorkout()).toBe(true)
  })

  it('una entrada corrupta no es una sesión', () => {
    localStorage.setItem(STRENGTH_ACTIVE_KEY, 'no-soy-json{')
    expect(hasActiveWorkout()).toBe(false)
  })

  it.each([
    ['cadena vacía', ''],
    ['null serializado', 'null'],
    ['un número', '42'],
    ['un array', '[]'],
  ])('%s no es una sesión', (_name, raw) => {
    localStorage.setItem(CARDIO_ACTIVE_KEY, raw)
    expect(hasActiveWorkout()).toBe(false)
  })

  it.each([
    ['sin campo de arranque', { workout: {}, progress: {} }],
    ['con un arranque que no es número', { startedAt: '2026-09-02T10:00:00Z' }],
    ['con un arranque NaN', { startedAt: Number.NaN }],
  ])('trata un objeto %s como sesión viva', (_name, value) => {
    // Ante la duda no se recarga: el coste de equivocarse aquí es un aviso de
    // más, y del otro lado es perder un entreno.
    localStorage.setItem(CIRCUIT_ACTIVE_KEY, JSON.stringify(value))
    expect(hasActiveWorkout()).toBe(true)
  })

  it('si localStorage tira al leer, asume que hay entreno', () => {
    // `src/test/setup.ts` sustituye localStorage por un shim en memoria, así que
    // el espía va sobre el propio objeto, no sobre `Storage.prototype`.
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(hasActiveWorkout()).toBe(true)
  })

  it('no confunde otras claves de calistenia con un entreno', () => {
    localStorage.setItem('calistenia_cardio_unsaved', JSON.stringify([{ startTime: Date.now() }]))
    localStorage.setItem('calistenia_free_session_queue', JSON.stringify([{ startedAt: Date.now() }]))
    expect(hasActiveWorkout()).toBe(false)
  })
})
