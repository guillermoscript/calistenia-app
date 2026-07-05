import { AI_API_URL } from './ai-api'
import { pb } from './pocketbase'
import type { PantryParseResult } from '../types'

export async function parsePantry(text: string, existingItems: string[]): Promise<PantryParseResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  const res = await fetch(`${AI_API_URL}/api/pantry/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, existing_items: existingItems }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Pantry parse failed: ${res.status}`)
  }
  return res.json()
}
