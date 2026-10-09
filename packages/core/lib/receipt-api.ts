// F5 (#174): cliente del parser de recibos — multipart contra el AI API.
// Web y móvil solo convierten su entrada a `Blob` + nombre (File en web,
// URI→Blob en móvil); la petición y el manejo de errores son únicos.
import { AI_API_URL } from './ai-api'
import { pb } from './pocketbase'
import type { ReceiptParseResult } from '../types'

export interface ReceiptImage { blob: Blob; fileName: string }

/** El servidor acepta como máximo 3 imágenes por recibo. */
export const MAX_RECEIPT_IMAGES = 3

export async function parseReceiptImages(images: ReceiptImage[]): Promise<ReceiptParseResult> {
  const formData = new FormData()
  for (const img of images.slice(0, MAX_RECEIPT_IMAGES)) {
    formData.append('images', img.blob, img.fileName)
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
