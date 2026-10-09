// F5 (#174): parser de recibos en móvil — URI→Blob y la petición es la de core.
import { parseReceiptImages, MAX_RECEIPT_IMAGES } from '@calistenia/core/lib/receipt-api'
import type { ReceiptParseResult } from '@calistenia/core/types'
import { uriToBlob, type ImageAsset } from '@/lib/image-upload'

export async function parseReceiptMobile(images: ImageAsset[]): Promise<ReceiptParseResult> {
  const blobs = await Promise.all(
    images.slice(0, MAX_RECEIPT_IMAGES).map(async (img) => ({
      blob: await uriToBlob(img.uri, img.mimeType || 'image/jpeg'),
      fileName: img.fileName || 'receipt.jpg',
    })),
  )
  return parseReceiptImages(blobs)
}
