import { useState, useCallback } from 'react'
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

  const startScan = useCallback(() => {
    setScanning(true)
    setProduct(null)
    setError(null)
  }, [])

  const handleBarcode = useCallback(async (barcode: string) => {
    setScanning(false)
    setLoading(true)
    setError(null)
    try {
      const offProduct = await getProductByBarcode(barcode)
      if (!offProduct) {
        setError('No encontramos ese código de barras. Prueba escribiendo el nombre del producto.')
        setLoading(false)
        return null
      }
      let food = mapOFFToFoodItem(offProduct)
      if (!food) {
        setError('No encontramos ese código de barras. Prueba escribiendo el nombre del producto.')
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

      setProduct(food)
      setLoading(false)
      return food
    } catch {
      setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
      setLoading(false)
      return null
    }
  }, [options])

  const reset = useCallback(() => {
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
