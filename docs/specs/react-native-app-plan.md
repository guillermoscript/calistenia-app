# Plan: App React Native (Parte 1 — Ejercicios)

> Fecha: 2026-06-09 · Estado: propuesta

## 1. Auditoría de reusabilidad del repo actual

El repo está **mejor separado de lo esperado**. Sí hay capa de hooks, capa de API (lib) y tipos centralizados. Veredicto por capa:

### ✅ Reusable tal cual (~60% del código no-UI)
| Capa | Contenido | Notas |
|---|---|---|
| `src/types/` | 578 líneas de tipos | 100% portable |
| `src/data/` | exercise-catalog.json (171 ejercicios), workouts.ts, circuit-presets, stretch-templates | 100% portable |
| `src/lib/` (puro) | dateUtils, difficulty, duration, equipment, progressUtils, calories, macro-calc, injuryMatch, matchPrograms, quotes, badge-definitions, challenges, geo | Sin dependencias de DOM |
| `src/hooks/` | 43 hooks; imports dominantes: react, lib/pocketbase, types, dateUtils | ~29 hooks portables sin tocar |
| `src/locales/` | en/es JSON | i18next funciona en RN |

### ⚠️ Reusable con adaptador (cambio pequeño)
- **14 hooks** usan `localStorage` directo (useProgress, useAuth, useFavorites, useWater, useSleep, useWeight…) → inyectar interfaz `storage` (web: localStorage, RN: MMKV).
- **`lib/pocketbase.ts`**: usa `import.meta.env` y `window.location.origin` → inyectar `env`; en RN el SDK necesita `AsyncAuthStore` (el de web persiste en localStorage solo).
- **`lib/i18n.ts`**: usa `i18next-browser-languagedetector` → en RN: `expo-localization`.
- **`lib/analytics.ts`**: `@openpanel/web` → en RN: `@openpanel/react-native` (misma API `op()`).
- **`lib/offlineQueue.ts`**: localStorage → misma interfaz `storage`.
- **OAuth Google**: `authWithOAuth2({ provider })` abre popup en web; en RN requiere `urlCallback` + `expo-web-browser` + deep link scheme.

### ❌ No portable (se reescribe con react-native-reusables)
- `src/components/` y `src/pages/` (Radix = DOM), CSS, recharts, leaflet, sounds (HTMLAudio), notifications/push (Web Push), share, html5-qrcode.
- 5 contexts con acoplamiento web (ActiveSession, Cardio, Circuit, Race, BackgroundJobs) — se replican siguiendo la misma arquitectura (SessionView es dueño del estado local, push al context, nunca pull).

### 🎨 Look & feel: transferencia casi directa
react-native-reusables **es el port de shadcn/ui a RN** (NativeWind + cva + tailwind-merge — las mismas libs que ya usa el repo):
- Las CSS variables de `src/index.css` (`--background`, `--primary`, `--lime`…) se copian 1:1 al `global.css` de NativeWind, incluyendo dark mode.
- `lib/style-tokens.ts` (strings de clases Tailwind) funciona en NativeWind con mínimos ajustes.
- `lucide-react` → `lucide-react-native` (mismos nombres de íconos).

## 2. ¿Repo separado? → Monorepo (recomendado)

Un repo git separado obliga a: duplicar hooks/types/lib (rompe DRY) o publicar un paquete npm privado y sincronizar versiones a mano (fricción alta para un solo dev). La solución que da "proyecto separado" sin duplicación:

```
calistenia-app/  (mismo repo git, pnpm workspaces)
├── apps/
│   ├── web/        ← la app Vite actual, movida
│   └── mobile/     ← nueva app Expo (proyecto independiente: su propio package.json, CI, builds EAS)
├── packages/
│   └── core/       ← @calistenia/core: types, hooks, lib puro, data, locales, adaptadores
├── pocketbase/ scripts/ docs/  (sin cambios)
```

- `apps/mobile` es en la práctica un proyecto separado: se abre solo, se buildea solo, se versiona con tags propios.
- Un fix en un hook beneficia a web y mobile en el mismo commit.
- Alternativa si insistes en repo aparte: extraer `core` a su propio repo y consumirlo como dependencia git — no lo recomiendo (cada cambio = commit + bump en 2 repos).

### Patrón de adaptadores (la pieza que falta para DRY)

```ts
// packages/core/src/platform.ts
export interface Platform {
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
  env: { PB_URL: string; AI_API_URL: string }
  analytics: { track(event: string, props?: object): void }
}
export function initCore(p: Platform): void  // cada app lo llama una vez al arrancar
```
Web inyecta localStorage/`import.meta.env`/@openpanel-web; mobile inyecta MMKV/`EXPO_PUBLIC_*`/@openpanel-react-native.

## 3. Plan por fases

### Fase 0 — Monorepo + extracción de core (sin cambio de comportamiento en web)
1. pnpm workspaces; mover app Vite a `apps/web`.
2. Crear `packages/core`; mover types, data, locales, lib puro.
3. Crear adaptadores `Platform`; refactor de los 14 hooks con localStorage y de pocketbase.ts/i18n.ts/analytics.ts/offlineQueue.ts para usarlos.
4. Mover los hooks portables a core; los acoplados a web se quedan en `apps/web`.
5. Verificar: `tsc --noEmit` + smoke con Playwright. **Web debe quedar idéntica.**

### Fase 1 — Scaffold Expo
1. `create-expo-app` en `apps/mobile` (Expo SDK actual, expo-router, TypeScript).
2. NativeWind v4 + react-native-reusables init; copiar theme (CSS vars light/dark) y registrar colores custom (`lime`, etc.).
3. i18next + expo-localization reutilizando `core/locales`.
4. Cliente PocketBase con `AsyncAuthStore` sobre MMKV.
5. Auth: email/password + Google OAuth (expo-web-browser, deep link `calistenia://`; verificar redirect permitido en PB).

### Fase 2 — MVP de ejercicios (alcance Parte 1)
1. **Hoy/Dashboard**: workout del día (`usePrograms` + `useWorkDay` desde core).
2. **Programas**: lista, detalle, seleccionar programa activo.
3. **Sesión activa**: pasos del workout, sets/reps, rest timer (expo-keep-awake + notificación local al terminar descanso), transiciones de sección. Misma arquitectura de sesión que web.
4. **Biblioteca de ejercicios**: lista + detalle desde catalog JSON, media.
5. **Historial**: sesiones completadas + progreso básico (sin charts complejos en v1).

### Fase 3 — Pulido mobile + distribución
1. Offline queue (storage adapter) y banner offline.
2. Haptics en acciones clave; sonidos del timer con expo-audio.
3. EAS Build → TestFlight / APK interno; Sentry (`@sentry/react-native`).

### Fuera de alcance Parte 1
Nutrición, cardio/GPS, social/amigos, races, sleep, blog, referidos, admin, AI free session.

## 4. Riesgos / decisiones abiertas
- **OAuth en RN** es la pieza con más incertidumbre técnica → hacer spike temprano en Fase 1.
- **recharts no existe en RN**: cuando toque progreso con gráficos, usar `victory-native`.
- Fase 0 toca muchos imports del web app → hacerla en una rama/worktree con typecheck + Playwright antes de mergear.
- Expo Go no soporta MMKV → usar dev builds desde el inicio (o AsyncStorage en v1 y migrar).
