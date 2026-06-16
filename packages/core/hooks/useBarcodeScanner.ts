import { useState, useCallback } from 'react'
import i18n from 'i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getProductByBarcode, mapOFFToFoodItem, isIncompleteFood } from '../lib/openfoodfacts'
import { qk } from '../lib/query-keys'
import type { FoodItem } from '../types'

interface BarcodeScannerOptions {
  onIncompleteProduct?: (food: FoodItem) => Promise<FoodItem>
}

export function useBarcodeScanner(options?: BarcodeScannerOptions) {
  // Estado de cámara/escaneo — permanece local, no es datos de red
  const [scanning, setScanning] = useState(false)
  const [barcode, setBarcode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const qc = useQueryClient()

  // Suscripción reactiva al último barcode escaneado. staleTime Infinity porque
  // un código de barras siempre devuelve el mismo producto (dato externo estable).
  // Se activa solo cuando hay un barcode capturado.
  const { data: product = null, isFetching: loading } = useQuery({
    queryKey: qk.foods.barcode(barcode ?? ''),
    enabled: !!barcode,
    staleTime: Infinity,
    queryFn: () => fetchBarcode(barcode!, options?.onIncompleteProduct, setError),
  })

  const startScan = useCallback(() => {
    setScanning(true)
    setBarcode(null)
    setError(null)
  }, [])

  // handleBarcode recibe el código escaneado. Usa fetchQuery para disparar la
  // búsqueda de red y devolver el resultado en la misma llamada, preservando la
  // firma pública original (Promise<FoodItem | null>). El estado `product` del
  // useQuery también se actualiza reactivamente (hit de caché).
  const handleBarcode = useCallback(async (scannedBarcode: string): Promise<FoodItem | null> => {
    setScanning(false)
    setError(null)
    setBarcode(scannedBarcode)

    try {
      const food = await qc.fetchQuery({
        queryKey: qk.foods.barcode(scannedBarcode),
        staleTime: Infinity,
        queryFn: () => fetchBarcode(scannedBarcode, options?.onIncompleteProduct, setError),
      })
      return food
    } catch {
      setError(i18n.t('barcode.connectionError'))
      return null
    }
  }, [qc, options?.onIncompleteProduct])

  const reset = useCallback(() => {
    setScanning(false)
    setBarcode(null)
    setError(null)
  }, [])

  const closeScan = useCallback(() => {
    setScanning(false)
  }, [])

  return { scanning, product, loading, error, startScan, handleBarcode, closeScan, reset }
}

/** Función de fetch compartida entre useQuery y fetchQuery para el mismo barcode. */
async function fetchBarcode(
  barcode: string,
  onIncompleteProduct: ((food: FoodItem) => Promise<FoodItem>) | undefined,
  setError: (msg: string | null) => void,
): Promise<FoodItem | null> {
  const offProduct = await getProductByBarcode(barcode)
  if (!offProduct) {
    setError(i18n.t('barcode.notFound'))
    return null
  }
  let food = mapOFFToFoodItem(offProduct)
  if (!food) {
    setError(i18n.t('barcode.notFound'))
    return null
  }

  // Si los datos de OFF están incompletos, intentar enriquecer con IA
  if (isIncompleteFood(food) && onIncompleteProduct) {
    try {
      food = await onIncompleteProduct(food)
    } catch {
      // IA también falló — devolvemos lo que tenemos
    }
  }

  return food
}
