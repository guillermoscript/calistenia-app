import { useState, useCallback, useRef } from 'react'
import i18n from '../lib/i18n'
import { getProductByBarcode, mapOFFToFoodItem, isIncompleteFood } from '../lib/openfoodfacts'
import type { FoodItem } from '../types'

interface BarcodeScannerOptions {
  onIncompleteProduct?: (food: FoodItem) => Promise<FoodItem>
}

export function useBarcodeScanner(options?: BarcodeScannerOptions) {
  const [scanning, setScanning] = useState(false)
  const [product, setProduct] = useState<FoodItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const startScan = useCallback(() => {
    // Abort any in-flight barcode lookup
    abortRef.current?.abort()
    setScanning(true)
    setProduct(null)
    setError(null)
    setLoading(false)
  }, [])

  const handleBarcode = useCallback(async (barcode: string) => {
    // Abort previous request if still in flight
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setScanning(false)
    setLoading(true)
    setError(null)
    try {
      const offProduct = await getProductByBarcode(barcode)
      if (controller.signal.aborted) return null

      if (!offProduct) {
        setError(i18n.t('barcode.notFound'))
        setLoading(false)
        return null
      }
      let food = mapOFFToFoodItem(offProduct)
      if (!food) {
        setError(i18n.t('barcode.notFound'))
        setLoading(false)
        return null
      }

      // If OFF data is incomplete, try to complete with AI
      if (isIncompleteFood(food) && options?.onIncompleteProduct) {
        try {
          food = await options.onIncompleteProduct(food)
        } catch {
          // AI also failed — return with whatever we have
        }
      }

      if (controller.signal.aborted) return null

      setProduct(food)
      setLoading(false)
      return food
    } catch (err) {
      if (controller.signal.aborted) return null
      setError(i18n.t('barcode.connectionError'))
      setLoading(false)
      return null
    }
  }, [options?.onIncompleteProduct])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setScanning(false)
    setProduct(null)
    setLoading(false)
    setError(null)
  }, [])

  const closeScan = useCallback(() => {
    setScanning(false)
  }, [])

  return { scanning, product, loading, error, startScan, handleBarcode, closeScan, reset }
}
