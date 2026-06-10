export class RaceAuthError extends Error {
  constructor(message = 'Race auth error') {
    super(message)
    this.name = 'RaceAuthError'
  }
}

export class RaceNotFoundError extends Error {
  constructor(message = 'Race not found') {
    super(message)
    this.name = 'RaceNotFoundError'
  }
}

export class RaceRuleError extends Error {
  constructor(message = 'Race rule violation') {
    super(message)
    this.name = 'RaceRuleError'
  }
}

export function wrapPbError(e: unknown): Error {
  const err = e as { status?: number; message?: string }
  if (err?.status === 401 || err?.status === 403) return new RaceAuthError(err.message)
  if (err?.status === 404) return new RaceNotFoundError(err.message)
  if (err?.status === 400) return new RaceRuleError(err.message)
  return e instanceof Error ? e : new Error(String(e))
}
