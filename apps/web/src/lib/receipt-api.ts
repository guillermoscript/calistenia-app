// F5 (#174): cliente web del parser de recibos — multipart directo con File
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { pb } from '@calistenia/core/lib/pocketbase'
import type { ReceiptParseResult } from '@calistenia/core/types'

export async function parseReceipt(files: File[]): Promise<ReceiptParseResult> {
  const formData = new FormData()
  for (const file of files.slice(0, 3)) {
    formData.append('images', file, file.name)
  }
  const headers: Record<string, string> = {}
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  const res = await fetch(`${AI_API_URL}/api/pantry/parse-receipt`, {
    method: 'POST', headers, body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // Error REAL visible (regla del repo: nada de catches silenciosos)
    throw new Error((err as { error?: string }).error || `Error ${res.status}`)
  }
  return res.json()
}
