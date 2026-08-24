import { describe, it, expect, vi } from 'vitest'
import { isAutoCancelError, isTransientError, retryTransient } from './pocketbase-errors'

describe('isAutoCancelError', () => {
  it('detecta el rechazo de auto-cancelación del SDK', () => {
    const err = Object.assign(new Error('The request was aborted (most likely autocancelled).'), {
      status: 0, isAbort: true, response: {}, data: {},
    })
    expect(isAutoCancelError(err)).toBe(true)
  })

  it('no confunde otros errores ni valores no-objeto', () => {
    expect(isAutoCancelError(new Error('boom'))).toBe(false)
    expect(isAutoCancelError({ status: 404, isAbort: false })).toBe(false)
    expect(isAutoCancelError(null)).toBe(false)
    expect(isAutoCancelError(undefined)).toBe(false)
    expect(isAutoCancelError('isAbort')).toBe(false)
  })
})

describe('isTransientError', () => {
  const pbErr = (status: number, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error('ClientResponseError'), { status, response: {}, data: {}, ...extra })

  it('reintenta el 504 del gateway y el resto de 5xx', () => {
    expect(isTransientError(pbErr(504))).toBe(true)
    expect(isTransientError(pbErr(502))).toBe(true)
    expect(isTransientError(pbErr(500))).toBe(true)
  })

  it('reintenta el «sin respuesta» (status 0) que no es una auto-cancelación', () => {
    expect(isTransientError(pbErr(0, { isAbort: false }))).toBe(true)
  })

  it('NO reintenta una auto-cancelación aunque venga con status 0', () => {
    expect(isTransientError(pbErr(0, { isAbort: true }))).toBe(false)
  })

  it('NO reintenta los 4xx ni los valores que no son errores de PocketBase', () => {
    expect(isTransientError(pbErr(400))).toBe(false)
    expect(isTransientError(pbErr(403))).toBe(false)
    expect(isTransientError(pbErr(404))).toBe(false)
    expect(isTransientError(new Error('boom'))).toBe(false)
    expect(isTransientError(null)).toBe(false)
    expect(isTransientError('504')).toBe(false)
  })
})

describe('retryTransient', () => {
  // delayMs a 0: el backoff real lo cubre la implementación, aquí interesa el
  // número de intentos, no esperar 3s por test.
  const opts = { delayMs: () => 0 }

  it('devuelve el resultado sin reintentar cuando va a la primera', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(retryTransient(fn, opts)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta un 504 y devuelve el resultado del segundo intento', async () => {
    const err = Object.assign(new Error('ClientResponseError'), { status: 504 })
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(['sesion'])
    await expect(retryTransient(fn, opts)).resolves.toEqual(['sesion'])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('se rinde tras `retries` reintentos y propaga el ÚLTIMO error', async () => {
    const err = Object.assign(new Error('ClientResponseError'), { status: 504 })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(retryTransient(fn, opts)).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3) // 1 intento + 2 reintentos
  })

  it('no reintenta un 4xx: falla al primer intento', async () => {
    const err = Object.assign(new Error('ClientResponseError'), { status: 403 })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(retryTransient(fn, opts)).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('no reintenta una auto-cancelación', async () => {
    const err = Object.assign(new Error('autocancelled'), { status: 0, isAbort: true })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(retryTransient(fn, opts)).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
