// F5 (#174): parser de recibos en web — los File ya son Blob con nombre.
import { parseReceiptImages, MAX_RECEIPT_IMAGES } from '@calistenia/core/lib/receipt-api'
import type { ReceiptParseResult } from '@calistenia/core/types'

export function parseReceipt(files: File[]): Promise<ReceiptParseResult> {
  return parseReceiptImages(files.slice(0, MAX_RECEIPT_IMAGES).map(f => ({ blob: f, fileName: f.name })))
}
