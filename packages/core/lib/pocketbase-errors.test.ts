import { describe, it, expect } from 'vitest'
import { isAutoCancelError } from './pocketbase-errors'

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
