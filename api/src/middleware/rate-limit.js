import config from '../config/env.js'

/**
 * @typedef {Object} RateBucket
 * @property {number} windowStart — Timestamp when the window started
 * @property {number} count       — Number of requests in this window
 */

/** @type {Map<string, RateBucket>} */
const buckets = new Map()

// Evict expired buckets every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > config.rateLimit.windowMs * 2) {
      buckets.delete(key)
    }
  }
}, 5 * 60 * 1000).unref() // .unref() so this timer doesn't keep the process alive

/**
 * In-memory sliding-window rate limiter.
 *
 * Keys by `req.user.id` (authenticated) or `req.ip` (fallback).
 * Sets standard `X-RateLimit-*` headers on every response.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function rateLimit(req, res, next) {
  const key = req.user?.id || req.ip
  const now = Date.now()

  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > config.rateLimit.windowMs) {
    bucket = { windowStart: now, count: 0 }
    buckets.set(key, bucket)
  }

  bucket.count++

  const remaining = Math.max(0, config.rateLimit.maxRequests - bucket.count)
  const resetAt = new Date(bucket.windowStart + config.rateLimit.windowMs).toISOString()

  res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests)
  res.setHeader('X-RateLimit-Remaining', remaining)
  res.setHeader('X-RateLimit-Reset', resetAt)

  if (bucket.count > config.rateLimit.maxRequests) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
      retry_after_ms: bucket.windowStart + config.rateLimit.windowMs - now,
    })
  }

  next()
}
