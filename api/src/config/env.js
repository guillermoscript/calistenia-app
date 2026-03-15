/**
 * @typedef {Object} ProviderConfig
 * @property {boolean} anthropic
 * @property {boolean} google
 * @property {boolean} openai
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} windowMs  — Time window in milliseconds
 * @property {number} maxRequests — Max requests per window per user
 */

/**
 * @typedef {Object} UploadConfig
 * @property {number} maxSizeMb
 * @property {string[]} allowedMimeTypes
 */

/**
 * @typedef {Object} AppConfig
 * @property {number} port
 * @property {string} pocketbaseUrl
 * @property {ProviderConfig} providers
 * @property {RateLimitConfig} rateLimit
 * @property {UploadConfig} upload
 * @property {string} defaultProvider — Preferred provider: 'anthropic' | 'google' | 'openai'
 * @property {string} defaultModelFree — Override free-tier model ID (e.g. 'claude-haiku-4-5')
 * @property {string} defaultModelPro  — Override pro-tier model ID (e.g. 'claude-sonnet-4-6')
 */

/** @type {AppConfig} */
const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  pocketbaseUrl: process.env.POCKETBASE_URL || 'http://127.0.0.1:8090',
  providers: {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
  },
  upload: {
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  defaultProvider: process.env.DEFAULT_AI_PROVIDER || '',
  defaultModelFree: process.env.DEFAULT_MODEL_FREE || '',
  defaultModelPro: process.env.DEFAULT_MODEL_PRO || '',
}

export default config
