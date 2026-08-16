import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./pocketbase', () => ({ pb: { authStore: { token: '' } } }))
vi.mock('./ai-api', () => ({ AI_API_URL: 'http://ai.test' }))

import { pollJob } from './ai-jobs-api'

const fetchMock = vi.fn()

function jobResponse(status: string, extra: Record<string, unknown> = {}) {
  return { ok: true, json: async () => ({ id: 'j1', type: 'generate-meal-plan', status, result: null, error: null, ...extra }) }
}

/** Avanza el reloj falso hasta que la promesa resuelva/rechace (o se agoten los pasos). */
async function settle<T>(p: Promise<T>, steps = 200): Promise<T> {
  let done = false
  const wrapped = p.finally(() => { done = true })
  // Evita "unhandled rejection" mientras avanzamos el reloj.
  wrapped.catch(() => {})
  for (let i = 0; i < steps && !done; i++) {
    await vi.advanceTimersByTimeAsync(3000)
  }
  return wrapped
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pollJob', () => {
  it('resuelve el job cuando pasa a completed', async () => {
    fetchMock
      .mockResolvedValueOnce(jobResponse('processing'))
      .mockResolvedValueOnce(jobResponse('completed', { result: { meals: [] } }))
    const job = await settle(pollJob('j1', { maxMs: 60_000 }))
    expect(job?.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lanza con el error del servidor cuando el job falla', async () => {
    fetchMock.mockResolvedValueOnce(jobResponse('failed', { error: 'boom' }))
    await expect(settle(pollJob('j1', { maxMs: 60_000 }))).rejects.toThrow('boom')
  })

  it('un blip transitorio de red no aborta: reintenta en el siguiente tick', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jobResponse('completed'))
    const job = await settle(pollJob('j1', { maxMs: 60_000 }))
    expect(job?.status).toBe('completed')
  })

  it('lanza timeoutMessage al superar maxMs', async () => {
    fetchMock.mockResolvedValue(jobResponse('processing'))
    await expect(settle(pollJob('j1', { maxMs: 9_000, timeoutMessage: 'tarde' }))).rejects.toThrow('tarde')
  })

  it('resuelve null sin lanzar cuando el llamador deja de estar vivo', async () => {
    let alive = true
    fetchMock.mockImplementation(async () => { alive = false; return jobResponse('failed', { error: 'ignorado' }) })
    const job = await settle(pollJob('j1', { maxMs: 60_000, isAlive: () => alive }))
    expect(job).toBeNull()
  })
})
