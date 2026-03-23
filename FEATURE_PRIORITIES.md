# 4 Nuevas Features — Implementación Completada

> Fecha: 2026-03-20 | Estado: **Todo implementado y testeado**

---

## Feature 1: Equipment por Ejercicio

**Estado: Implementado y testeado**

Cada ejercicio ahora tiene un campo `equipment` con los IDs del material necesario. Se añadió un catálogo de 14 tipos de equipamiento con iconos y labels en español.

### Archivos creados
- `pb_migrations/1774000028_add_equipment_to_exercises_catalog.js` — Migración PocketBase: campo `equipment` (JSON) en `exercises_catalog`

### Archivos modificados
- `src/types/index.ts` — Campo `equipment?: string[]` en interfaz `Exercise`
- `src/lib/equipment.ts` — Reescrito con:
  - `EQUIPMENT_CATALOG`: 14 items (ninguno, barra_dominadas, paralelas, anillas, banda_elastica, lastre, fitball, rueda_abdominal, trx, banco, kettlebell, pared, toalla, escalon)
  - `detectEquipment()`: retorna slugs en vez de nombres display
  - `getExerciseEquipment()`: usa campo explícito, fallback a detección heurística
  - `getEquipmentLabel()`: slug → label legible
- `src/data/workouts.ts` — Todos los ejercicios (~80) tienen `equipment: string[]` asignado
- `src/pages/ExerciseDetailPage.tsx` — Tab "Material" muestra iconos + labels del catálogo
- `src/pages/ExerciseLibraryPage.tsx` — Fila de pills scrollable para filtrar por equipment (13 opciones, excluyendo "ninguno")

---

## Feature 2: Integración Open Food Facts

**Estado: Implementado y testeado**

Búsqueda de alimentos en la base de datos abierta Open Food Facts (900K+ productos). Se integra como fuente secundaria cuando los resultados locales son insuficientes.

### Archivos creados
- `src/lib/openfoodfacts.ts` — Cliente API:
  - `searchOFF(query, locale)` — Búsqueda por texto (10 resultados, timeout 5s)
  - `getProductByBarcode(barcode)` — Búsqueda por código de barras (EAN/UPC)
  - `mapOFFToFoodItem(product)` — Mapeo de producto OFF a `FoodItem` (nombre ES, macros por 100g)

### Archivos modificados
- `src/hooks/useFoodCatalog.ts` — `searchFoods()` ahora:
  1. Busca en PocketBase + common foods locales
  2. Si < 5 resultados → busca en Open Food Facts
  3. Cachea resultados OFF en PB con `source: 'openfoodfacts'` (fire-and-forget)
- `src/components/nutrition/FoodNameInput.tsx` — Nuevo:
  - Búsqueda OFF separada con debounce 600ms
  - Sección "OPEN FOOD FACTS" en dropdown con thumbnails de producto y badge naranja "OFF"
  - Deduplicación contra resultados locales/catálogo/recientes

---

## Feature 3: Barcode Scanner

**Estado: Implementado y testeado** — Depende de Feature 2

Escaneo de códigos de barras con la cámara del móvil para identificar productos automáticamente via Open Food Facts.

### Dependencias npm
- `html5-qrcode@^2.3.8` (~45KB, soporta EAN-13/EAN-8/UPC-A/UPC-E)

### Archivos creados
- `src/components/nutrition/BarcodeScanner.tsx` — Componente fullscreen:
  - Overlay oscuro con viewfinder y línea de escaneo animada
  - Filtro regex: solo acepta códigos numéricos de 8-14 dígitos
  - Auto-stop cámara en unmount
  - Botón de cierre
- `src/hooks/useBarcodeScanner.ts` — Hook con estados:
  - `startScan()` → abre scanner
  - `handleBarcode(code)` → `getProductByBarcode()` → `mapOFFToFoodItem()`
  - `closeScan()`, `reset()`
  - Estados: `scanning`, `product`, `loading`, `error`

### Archivos modificados
- `src/components/nutrition/MealLoggerContent.tsx` — Integración:
  - Botón "ESCANEAR CÓDIGO DE BARRAS" con icono en paso capture
  - Flujo: scan → OFF lookup → producto encontrado → review step con food pre-cargado
  - Producto cacheado en PB via `saveFoodToCatalog()`
  - Estados de loading y error con botón de dismiss
  - `BarcodeIcon` SVG inline
- `package.json` — Añadida dependencia `html5-qrcode`

---

## Feature 4: GPS Tracking para Cardio

**Estado: Implementado y testeado**

Tracking GPS completo para sesiones de running, caminata y ciclismo con mapa de ruta, estadísticas en tiempo real y exportación GPX.

### Dependencias
- Leaflet 1.9.4 via CDN (CSS + JS)

### Archivos creados
- `pb_migrations/1774000029_created_cardio_sessions.js` — Colección `cardio_sessions`:
  - Campos: user (relation), activity_type, gps_points (JSON), distance_km, duration_seconds, avg_pace, elevation_gain, started_at, finished_at, note
  - Auth rules: solo el propio usuario puede CRUD
  - Índice en `user + started_at`
- `src/lib/geo.ts` — Utilidades geográficas:
  - `haversineDistance()` — Distancia entre dos coordenadas (metros)
  - `calculateTotalDistance()` — Distancia total de array de puntos (km)
  - `calculateElevationGain()` — Desnivel positivo acumulado (metros)
  - `formatPace()` — "5:30" min/km
  - `formatDuration()` — "1:05:30"
  - `pointsToGPX()` — Exportación a formato GPX XML
- `src/hooks/useCardioSession.ts` — Hook con máquina de estados:
  - Estados: `idle → tracking → paused → tracking → finished`
  - `navigator.geolocation.watchPosition()` con alta precisión
  - Filtro de ruido: descarta puntos con accuracy > 30m o velocidad > 50 km/h
  - `navigator.wakeLock` para pantalla activa
  - Timer independiente del GPS (1s interval)
  - Métodos: `start()`, `pause()`, `resume()`, `finish()`, `discard()`
  - `getHistory()` — Lista de sesiones pasadas desde PB
- `src/components/cardio/RouteMap.tsx` — Mapa Leaflet:
  - Polyline de ruta en color lime
  - Marcadores de inicio (verde) y fin (rojo)
  - Auto-fit bounds
  - Tiles OpenStreetMap (gratis)
- `src/components/cardio/CardioHistory.tsx` — Lista de historial:
  - Sesiones con icono de actividad, fecha, distancia, duración, ritmo
  - Expandible con mapa inline y grid de stats
  - Estado vacío con mensaje
- `src/pages/CardioSessionPage.tsx` — Página completa con 3 vistas:
  - **Pre-sesión**: selector de actividad (🏃/🚶/🚴), botón iniciar, historial
  - **Tracking activo**: stats grandes (distancia, duración, ritmo), mini mapa, botones pausa/stop, indicador "GRABANDO"
  - **Post-sesión**: mapa completo, grid de stats (4 métricas), input de nota, exportar GPX

### Archivos modificados
- `src/types/index.ts` — Tipos añadidos:
  - `CardioActivityType` ('running' | 'walking' | 'cycling')
  - `GpsPoint` (lat, lng, alt?, timestamp, speed?, accuracy?)
  - `CardioSession` (campos completos)
- `src/App.tsx` — Cambios:
  - Lazy import de `CardioSessionPage`
  - `RunningIcon` SVG
  - Nav item: `{ path: '/cardio', label: 'Cardio', icon: RunningIcon }`
  - Ruta: `<Route path="/cardio" element={<CardioSessionPage userId={user.id} />} />`
  - Breadcrumb: `'/cardio' → 'Cardio'`
- `index.html` — Leaflet CSS + JS desde CDN unpkg

---

## Resumen de archivos

| Feature | Archivos nuevos | Archivos modificados |
|---------|----------------|---------------------|
| 1. Equipment | 1 migración | 5 (types, equipment, workouts, detail, library) |
| 2. Open Food Facts | 1 (openfoodfacts.ts) | 2 (useFoodCatalog, FoodNameInput) |
| 3. Barcode | 2 (BarcodeScanner, useBarcodeScanner) | 2 (MealLoggerContent, package.json) |
| 4. GPS Cardio | 6 (migración, geo, hook, RouteMap, CardioHistory, CardioSessionPage) | 3 (types, App, index.html) |
| **Total** | **10 archivos nuevos** | **12 archivos modificados** |

## Verificación

| Check | Resultado |
|-------|-----------|
| TypeScript (`npx tsc --noEmit`) | 0 errores |
| Vite build (`npx vite build`) | Éxito |
| Test: Equipment filters | PASS — 13 pills, filtrado funciona, detail page muestra iconos |
| Test: Barcode button | PASS — Botón visible en meal logger |
| Test: Cardio page | PASS — Selector actividad, botón iniciar, historial, nav en sidebar |
