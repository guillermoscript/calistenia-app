import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import config from '../config/env.js'

const MODEL_MAP = {
  pro: [
    { check: () => config.providers.anthropic, model: () => anthropic('claude-sonnet-4-6'), name: 'claude-sonnet-4-6' },
    { check: () => config.providers.openai,    model: () => openai('gpt-4o'),              name: 'gpt-4o' },
    { check: () => config.providers.google,    model: () => google('gemini-2.5-pro'),      name: 'gemini-2.5-pro' },
  ],
  free: [
    { check: () => config.providers.anthropic, model: () => anthropic('claude-haiku-4-5'),  name: 'claude-haiku-4-5' },
    { check: () => config.providers.google,    model: () => google('gemini-2.5-flash'),     name: 'gemini-2.5-flash' },
    { check: () => config.providers.openai,    model: () => openai('gpt-4.1-mini'),         name: 'gpt-4.1-mini' },
  ],
}

export function resolveModel(tier = 'free') {
  const candidates = MODEL_MAP[tier] || MODEL_MAP.free

  for (const candidate of candidates) {
    if (candidate.check()) {
      return { model: candidate.model(), name: candidate.name }
    }
  }

  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENAI_API_KEY.',
  )
}

export function getAvailableProviders() {
  return { ...config.providers }
}
