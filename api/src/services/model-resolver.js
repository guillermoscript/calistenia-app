import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import config from '../config/env.js'

/**
 * @typedef {'free' | 'pro'} Tier
 */

/**
 * @typedef {Object} ResolvedModel
 * @property {import('ai').LanguageModelV1} model — AI SDK model instance
 * @property {string} name — Human-readable model identifier
 */

/**
 * @typedef {Object} ModelCandidate
 * @property {string} provider — Provider key ('anthropic' | 'google' | 'openai')
 * @property {() => import('ai').LanguageModelV1} model — Factory that creates the model
 * @property {string} name — Model identifier string
 */

/** @type {Record<Tier, ModelCandidate[]>} */
const MODEL_MAP = {
  pro: [
    { provider: 'anthropic', model: () => anthropic('claude-sonnet-4-6'), name: 'claude-sonnet-4-6' },
    { provider: 'openai',    model: () => openai('gpt-4o'),              name: 'gpt-4o' },
    { provider: 'google',    model: () => google('gemini-2.5-pro'),      name: 'gemini-2.5-pro' },
  ],
  free: [
    { provider: 'anthropic', model: () => anthropic('claude-haiku-4-5'),  name: 'claude-haiku-4-5' },
    { provider: 'google',    model: () => google('gemini-2.5-flash'),     name: 'gemini-2.5-flash' },
    { provider: 'openai',    model: () => openai('gpt-4.1-mini'),         name: 'gpt-4.1-mini' },
  ],
}

/** @type {Record<string, (id: string) => import('ai').LanguageModelV1>} */
const PROVIDER_FACTORIES = {
  anthropic,
  google,
  openai,
}

/**
 * Resolve the AI model to use based on user tier and configuration.
 *
 * Priority:
 *   1. Env override: DEFAULT_MODEL_FREE / DEFAULT_MODEL_PRO (exact model ID)
 *   2. Env override: DEFAULT_AI_PROVIDER (preferred provider)
 *   3. Fallback: first available provider in MODEL_MAP order
 *
 * @param {Tier} [tier='free']
 * @returns {ResolvedModel}
 * @throws {Error} If no provider API key is configured
 */
export function resolveModel(tier = 'free') {
  // 1. Check for explicit model override via env
  const override = tier === 'pro' ? config.defaultModelPro : config.defaultModelFree
  if (override) {
    const resolved = resolveOverride(override)
    if (resolved) return resolved
  }

  // 2. Check for preferred provider via env
  const candidates = MODEL_MAP[tier] || MODEL_MAP.free
  if (config.defaultProvider) {
    const preferred = candidates.find(
      c => c.provider === config.defaultProvider && config.providers[c.provider],
    )
    if (preferred) return { model: preferred.model(), name: preferred.name }
  }

  // 3. Fallback: first available
  for (const candidate of candidates) {
    if (config.providers[candidate.provider]) {
      return { model: candidate.model(), name: candidate.name }
    }
  }

  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENAI_API_KEY.',
  )
}

/**
 * Resolve an explicit model ID override like "claude-haiku-4-5" or "gpt-4o".
 * Detects provider from the model name prefix.
 *
 * @param {string} modelId
 * @returns {ResolvedModel | null}
 */
function resolveOverride(modelId) {
  /** @type {Array<[string, string]>} */
  const prefixMap = [
    ['claude', 'anthropic'],
    ['gpt', 'openai'],
    ['gemini', 'google'],
  ]

  for (const [prefix, provider] of prefixMap) {
    if (modelId.startsWith(prefix) && config.providers[provider]) {
      const factory = PROVIDER_FACTORIES[provider]
      return { model: factory(modelId), name: modelId }
    }
  }

  return null
}

/**
 * Get which providers have API keys configured.
 * @returns {import('./config/env.js').ProviderConfig}
 */
export function getAvailableProviders() {
  return { ...config.providers }
}
