import { describe, it, expect, beforeEach } from 'vitest'
import { initCore } from '../platform'
import {
  capturePendingSharedProgram,
  consumePendingSharedProgram,
  clearPendingSharedProgram,
} from './sharedProgramHandoff'

/**
 * Lo que se protege aquí es la lectura de UN SOLO USO (#604).
 *
 * Si el id se quedara guardado, el siguiente arranque de la app volvería a
 * redirigir al mismo programa —y el siguiente, y el siguiente— secuestrando la
 * navegación de alguien que abrió ese enlace hace semanas. Es el fallo que ya
 * obligó a escribir `battleInviteHandoff` así, y el que un test de
 * «guarda y devuelve» dejaría pasar sin enterarse.
 */

const memory = new Map<string, string>()

initCore({
  storage: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v) },
    removeItem: (k) => { memory.delete(k) },
  },
  env: { pbUrl: 'http://localhost:8090', aiApiUrl: '', isDev: true },
  analytics: { track: () => {}, identify: () => {}, clear: () => {} },
  connectivity: { isOnline: () => true, onOnline: () => () => {} },
})

describe('sharedProgramHandoff', () => {
  beforeEach(() => {
    memory.clear()
  })

  it('lleva el programa al otro lado del registro', () => {
    capturePendingSharedProgram('prog123')
    expect(consumePendingSharedProgram()).toBe('prog123')
  })

  it('solo lo devuelve una vez', () => {
    capturePendingSharedProgram('prog123')
    expect(consumePendingSharedProgram()).toBe('prog123')
    expect(consumePendingSharedProgram()).toBeNull()
  })

  it('sin nada pendiente devuelve null en vez de reventar', () => {
    expect(consumePendingSharedProgram()).toBeNull()
  })

  it('ignora un id vacío', () => {
    // La landing llama a `capture` con lo que traiga la URL; un `/shared/`
    // suelto no debe dejar un pendiente que redirija a ninguna parte.
    capturePendingSharedProgram('')
    expect(consumePendingSharedProgram()).toBeNull()
  })

  it('se puede descartar sin consumirlo', () => {
    capturePendingSharedProgram('prog123')
    clearPendingSharedProgram()
    expect(consumePendingSharedProgram()).toBeNull()
  })
})
