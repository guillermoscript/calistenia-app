import config from '../config/env.js'

const buckets = new Map()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > config.rateLimit.windowMs * 2) {
      buckets.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function rateLimit(req, res, next) {
  const key = req.user?.id || req.ip
  const now = Date.now()

  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > config.rateLimit.windowMs) {
    bucket = { windowStart: now, count: 0 }
    buckets.set(key, bucket)
  }

  bucket.count++

  res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests)
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.maxRequests - bucket.count))
  res.setHeader('X-RateLimit-Reset', new Date(bucket.windowStart + config.rateLimit.windowMs).toISOString())

  if (bucket.count > config.rateLimit.maxRequests) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
      retry_after_ms: bucket.windowStart + config.rateLimit.windowMs - now,
    })
  }

  next()
}
