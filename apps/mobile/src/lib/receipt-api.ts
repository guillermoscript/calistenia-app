// F5 (#174): cliente mobile del parser de recibos — multipart URI→Blob
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { pb } from '@calistenia/core/lib/pocketbase'
import type { ReceiptParseResult } from '@calistenia/core/types'
import { uriToBlob } from '@/lib/image-upload'
import type { ImageAsset } from '@/lib/nutrition-api'

export async function parseReceiptMobile(images: ImageAsset[]): Promise<ReceiptParseResult> {
  const formData = new FormData()
  for (const img of images.slice(0, 3)) {
    const blob = await uriToBlob(img.uri, img.mimeType || 'image/jpeg')
    formData.append('images', blob, img.fileName || 'receipt.jpg')
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
