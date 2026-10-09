/**
 * Guarda del programa activo fantasma (#605).
 *
 * `fetchActiveEnrollment` devolvía el `program` de la fila a ciegas. Si ese
 * programa ya no existe —una fila huérfana de las que quedaron en producción
 * antes del hook `programs_delete_cleanup`— el id viajaba hasta
 * `fetchProgramDetail`, que se estrellaba contra un `programs` inexistente y
 * dejaba a home y al onboarding sin «hoy toca».
 *
 * El hook no se renderiza (core corre en vitest/node, sin testing-library), así
 * que se prueba la función. Cada caso afirma el VALOR de su fixture: un test que
 * solo comprobara «devuelve algo» pasaría en verde con la guarda al revés.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getFirstListItem = vi.fn()

vi.mock('../lib/pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: () => ({ getFirstListItem }),
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { fetchActiveEnrollment } from './usePrograms'

/** Fila de `user_programs` tal y como la devuelve PB con `expand=program`. */
function enrollment(over: Record<string, unknown> = {}) {
  return {
    id: 'enroll_1',
    user: 'user_1',
    program: 'prog_vivo_1',
    is_current: true,
    status: 'active',
    expand: { program: { id: 'prog_vivo_1', name: 'Full body' } },
    ...over,
  }
}

describe('fetchActiveEnrollment', () => {
  beforeEach(() => {
    getFirstListItem.mockReset()
  })

  it('devuelve el programa de la inscripción activa', async () => {
    getFirstListItem.mockResolvedValue(enrollment())
    await expect(fetchActiveEnrollment('user_1')).resolves.toMatchObject({
      id: 'enroll_1',
      program: 'prog_vivo_1',
    })
  })

  it('pide el expand del programa, o no hay nada que comprobar', async () => {
    getFirstListItem.mockResolvedValue(enrollment())
    await fetchActiveEnrollment('user_1')
    expect(getFirstListItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ expand: 'program' }),
    )
  })

  it('trata como «sin programa» una fila cuyo programa fue borrado', async () => {
    // El programa ya no existe: PB devuelve la fila sin `expand.program`.
    getFirstListItem.mockResolvedValue(enrollment({ expand: {} }))
    await expect(fetchActiveEnrollment('user_1')).resolves.toBeNull()
  })

  it('trata como «sin programa» una fila con la relación ya vaciada', async () => {
    // Lo que deja PocketBase al borrar el programa desde #605: relación vacía.
    getFirstListItem.mockResolvedValue(enrollment({ program: '', expand: undefined }))
    await expect(fetchActiveEnrollment('user_1')).resolves.toBeNull()
  })

  it('devuelve null cuando el usuario no tiene inscripción activa', async () => {
    getFirstListItem.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    await expect(fetchActiveEnrollment('user_1')).resolves.toBeNull()
  })

  it.each([500, 503, 0, 401])('relanza un fallo %s en vez de resolver a null', async (status) => {
    // Resolver a null pisaba la inscripción cacheada y Home mostraba «sin programa».
    const err = Object.assign(new Error('boom'), { status })
    getFirstListItem.mockRejectedValue(err)
    await expect(fetchActiveEnrollment('user_1')).rejects.toBe(err)
  })

  it('relanza un error sin status (p. ej. de red)', async () => {
    getFirstListItem.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchActiveEnrollment('user_1')).rejects.toThrow('Failed to fetch')
  })

  it('guarda el programa expandido como ProgramMeta de respaldo', async () => {
    getFirstListItem.mockResolvedValue(enrollment({
      expand: { program: { id: 'prog_vivo_1', name: 'Full body', duration_weeks: 8, is_official: true } },
    }))
    const e = await fetchActiveEnrollment('user_1')
    expect(e?.programMeta).toMatchObject({ id: 'prog_vivo_1', name: 'Full body', duration_weeks: 8, is_official: true })
  })
})
