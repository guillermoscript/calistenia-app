# Widgets móviles v1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la v1 de la spec `docs/superpowers/specs/2026-06-10-mobile-widgets-design.md`: rest timer en vivo (Live Activity iOS + notificación persistente Android) y widget de home "Hoy + semana + racha" en `apps/mobile`.

**Architecture:** La app escribe un snapshot JSON en almacenamiento compartido (App Group UserDefaults en iOS vía módulo Expo local `widget-bridge`; AsyncStorage en Android, que el task handler de react-native-android-widget lee en headless JS). El timer en vivo se controla desde una fachada TS `live-session.ts` (iOS → ActivityKit vía el módulo; Android → notifee foreground service con cronómetro) enganchada a SessionView mediante un hook observador, sin tocar la máquina de estados.

**Tech Stack:** Expo SDK 56 (CNG/prebuild), expo-modules (módulo local Swift), WidgetKit + ActivityKit (SwiftUI) vía `@bacons/apple-targets`, `react-native-android-widget`, `@notifee/react-native`, vitest (nuevo, solo para funciones puras).

## Reglas del repo (OBLIGATORIAS para quien ejecute)

- **NUNCA** `git push` (push a main = deploy a PRODUCCIÓN). Trabajar en la rama actual `feat/fase3-mobile-polish`.
- `git add` siempre con **rutas explícitas** — jamás `git add -A`/`.`. Hay WIP del usuario sin commitear que NO se toca: `apps/web/src/pages/RemindersPage.tsx`, `scripts/seed-program-catalog.mjs`, `programs/`, `scripts/update-program-content.mjs`.
- Subagentes: prohibido `stash pop`, `merge`, `pull`, `rebase`.
- No escribir jamás en `pb_data/` real (solo dirs temporales).
- Typecheck: `pnpm run typecheck` desde la **raíz** del monorepo (correr tsc a mano en packages/core falla de forma espuria — no tiene tsconfig a propósito).
- RN + fuentes custom: cada peso es una familia (`font-bebas`, `font-mono`, …); **nunca** `font-bold`/`font-semibold` en mobile.
- Los widgets NO funcionan en Expo Go: los imports nativos nuevos (notifee, widget-bridge) van **lazy y con try/catch** para que Expo Go siga arrancando con todo lo demás.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/mobile/src/lib/widget-snapshot.ts` | Tipo `WidgetSnapshot` + builder puro (testeable) |
| `apps/mobile/src/lib/live-activity-state.ts` | Mapper puro fase de máquina → estado de activity (testeable) |
| `apps/mobile/src/lib/widget-bridge.ts` | Fachada TS: escribir snapshot + refrescar widgets (Platform branch) |
| `apps/mobile/src/lib/live-session.ts` | Fachada TS del timer en vivo: start/update/updateRest/end |
| `apps/mobile/src/lib/use-live-session.ts` | Hook observador para SessionView |
| `apps/mobile/modules/widget-bridge/` | Módulo Expo local iOS (UserDefaults App Group + ActivityKit) |
| `apps/mobile/targets/widgets/` | Target WidgetKit: TodayWidget + SessionLiveActivity (SwiftUI) + fuentes |
| `apps/mobile/src/widgets/TodayWidget.tsx` | Widget Android en JSX |
| `apps/mobile/src/widgets/widget-task-handler.tsx` | Task handler de react-native-android-widget |
| `apps/mobile/index.js` | Registro del task handler + foreground service notifee |
| `apps/mobile/app.json` | Plugins, entitlements App Group, NSSupportsLiveActivities |
| `apps/mobile/src/contexts/WorkoutContext.tsx` | Efecto de sync del snapshot |
| `apps/mobile/src/components/SessionView.tsx` | `useLiveSession()` + resync de descanso en RestScreen |

---

### Task 1: Infra de tests (vitest) + contrato del snapshot

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/lib/widget-snapshot.ts`
- Test: `apps/mobile/src/lib/__tests__/widget-snapshot.test.ts`

- [ ] **Step 1: Instalar vitest y añadir script**

Run (desde la raíz del monorepo):
```bash
pnpm --filter @calistenia/mobile add -D vitest
```

En `apps/mobile/package.json`, añadir a `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Escribir el test que falla**

`apps/mobile/src/lib/__tests__/widget-snapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildWidgetSnapshot } from '../widget-snapshot'

const baseArgs = {
  today: '2026-06-10',
  lang: 'es' as const,
  programName: 'Calistenia 26 semanas',
  programPhase: 2,
  todayId: 'mie',
  weekDays: [
    { id: 'lun', type: 'strength' },
    { id: 'mar', type: 'rest' },
    { id: 'mie', type: 'strength' },
  ],
  workout: { title: 'Pull Day', exerciseCount: 6 },
  todayType: 'strength',
  isDone: (key: string) => key === 'p2_lun',
  streak: 4,
  weeklyDone: 2,
  weeklyGoal: 5,
}

describe('buildWidgetSnapshot', () => {
  it('construye la semana con done por clave p{fase}_{dia}', () => {
    const snap = buildWidgetSnapshot(baseArgs)
    expect(snap.week).toEqual([
      { id: 'lun', done: true, type: 'strength' },
      { id: 'mar', done: false, type: 'rest' },
      { id: 'mie', done: false, type: 'strength' },
    ])
  })

  it('rellena workoutToday con done de hoy y metadatos', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, isDone: (k: string) => k === 'p2_mie' })
    expect(snap.workoutToday).toEqual({
      title: 'Pull Day', type: 'strength', done: true, exerciseCount: 6, programPhase: 2,
    })
    expect(snap.date).toBe('2026-06-10')
    expect(snap.streak).toBe(4)
    expect(snap.weeklyDone).toBe(2)
    expect(snap.weeklyGoal).toBe(5)
    expect(snap.lang).toBe('es')
  })

  it('workoutToday null sin programa/workout', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, programName: null, workout: null })
    expect(snap.workoutToday).toBeNull()
    expect(snap.programName).toBeNull()
  })

  it('día de descanso: workoutToday con type rest y title vacío si no hay workout', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, todayId: 'mar', todayType: 'rest', workout: null })
    expect(snap.workoutToday).toEqual({
      title: '', type: 'rest', done: false, exerciseCount: 0, programPhase: 2,
    })
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `pnpm --filter @calistenia/mobile test`
Expected: FAIL — `Cannot find module '../widget-snapshot'`

- [ ] **Step 4: Implementación mínima**

`apps/mobile/src/lib/widget-snapshot.ts` (puro: sin imports de react-native ni de core, para que vitest lo trague tal cual):
```ts
/**
 * Contrato del snapshot que la app escribe para los widgets (App Group en iOS,
 * AsyncStorage en Android). Ver docs/superpowers/specs/2026-06-10-mobile-widgets-design.md.
 * Puro a propósito: testeable sin react-native.
 */
export interface WidgetSnapshot {
  date: string // YYYY-MM-DD local; el widget lo compara con "hoy"
  programName: string | null
  workoutToday: {
    title: string
    type: string // strength | rest | cardio | yoga | circuit
    done: boolean
    exerciseCount: number
    programPhase: number
  } | null
  week: { id: string; done: boolean; type: string }[]
  streak: number
  weeklyDone: number
  weeklyGoal: number
  lang: 'es' | 'en'
}

export const WIDGET_SNAPSHOT_KEY = 'widget_snapshot'

export function buildWidgetSnapshot(args: {
  today: string
  lang: 'es' | 'en'
  programName: string | null
  programPhase: number
  todayId: string
  todayType: string
  weekDays: { id: string; type: string }[]
  workout: { title: string; exerciseCount: number } | null
  isDone: (key: string) => boolean
  streak: number
  weeklyDone: number
  weeklyGoal: number
}): WidgetSnapshot {
  const { programPhase } = args
  const hasProgram = args.programName !== null
  return {
    date: args.today,
    programName: args.programName,
    workoutToday: hasProgram
      ? {
          title: args.workout?.title ?? '',
          type: args.todayType,
          done: args.isDone(`p${programPhase}_${args.todayId}`),
          exerciseCount: args.workout?.exerciseCount ?? 0,
          programPhase,
        }
      : null,
    week: args.weekDays.map(d => ({
      id: d.id,
      done: args.isDone(`p${programPhase}_${d.id}`),
      type: d.type,
    })),
    streak: args.streak,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.weeklyGoal,
    lang: args.lang,
  }
}
```

- [ ] **Step 5: Verificar que pasa + typecheck**

Run: `pnpm --filter @calistenia/mobile test` → PASS (4 tests)
Run: `pnpm run typecheck` (raíz) → sin errores

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/lib/widget-snapshot.ts "apps/mobile/src/lib/__tests__/widget-snapshot.test.ts"
git commit -m "feat(mobile): contrato WidgetSnapshot + vitest"
```

---

### Task 2: Mapper puro fase → estado de activity

**Files:**
- Create: `apps/mobile/src/lib/live-activity-state.ts`
- Test: `apps/mobile/src/lib/__tests__/live-activity-state.test.ts`
- Modify: `docs/superpowers/specs/2026-06-10-mobile-widgets-design.md` (1 línea)

Nota de diseño: la spec decía `restEndsAt: string (ISO)`; se cambia a **epoch ms** (`number`) — evita parsing de fechas en Swift/Kotlin y es lo que ya maneja `endAtRef`. Actualizar la línea del contrato en la spec en este mismo task.

- [ ] **Step 1: Test que falla**

`apps/mobile/src/lib/__tests__/live-activity-state.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mapPhaseToActivity } from '../live-activity-state'

const step = { exerciseName: 'Dominadas', setNumber: 2, totalSets: 4 }

describe('mapPhaseToActivity', () => {
  it('exercise → work sin restEndsAt', () => {
    expect(mapPhaseToActivity({ phase: 'exercise', ...step })).toEqual({
      kind: 'update',
      state: { exerciseName: 'Dominadas', setIndex: 2, setTotal: 4, phase: 'work', restEndsAt: null },
    })
  })

  it('rest → rest con restEndsAt epoch ms', () => {
    const res = mapPhaseToActivity({ phase: 'rest', ...step, restEndsAt: 1770000000000 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'Dominadas', setIndex: 2, setTotal: 4, phase: 'rest', restEndsAt: 1770000000000 },
    })
  })

  it('paso sin series (warmup cronometrado): setTotal 0 = omitir línea SERIE', () => {
    const res = mapPhaseToActivity({ phase: 'exercise', exerciseName: 'Jumping jacks', setNumber: 1, totalSets: 1 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'Jumping jacks', setIndex: 0, setTotal: 0, phase: 'work', restEndsAt: null },
    })
  })

  it('section-transition → work con nombre de sección y sin serie', () => {
    const res = mapPhaseToActivity({ phase: 'section-transition', exerciseName: 'EJERCICIOS PRINCIPALES', setNumber: 1, totalSets: 3 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'EJERCICIOS PRINCIPALES', setIndex: 0, setTotal: 0, phase: 'work', restEndsAt: null },
    })
  })

  it('note y celebrate → end', () => {
    expect(mapPhaseToActivity({ phase: 'note', ...step })).toEqual({ kind: 'end' })
    expect(mapPhaseToActivity({ phase: 'celebrate', ...step })).toEqual({ kind: 'end' })
  })
})
```

- [ ] **Step 2: Verificar FAIL** — `pnpm --filter @calistenia/mobile test` → módulo no existe.

- [ ] **Step 3: Implementación**

`apps/mobile/src/lib/live-activity-state.ts`:
```ts
/**
 * Mapeo fase de la máquina de SessionView → estado de la Live Activity /
 * notificación persistente. Puro y testeable. Convención: setTotal === 0
 * significa "omitir la línea SERIE X/Y" (pasos cronometrados o transiciones).
 */
export interface LiveActivityState {
  exerciseName: string
  setIndex: number
  setTotal: number
  phase: 'work' | 'rest'
  restEndsAt: number | null // epoch ms
}

export type ActivityCommand = { kind: 'update'; state: LiveActivityState } | { kind: 'end' }

export function mapPhaseToActivity(input: {
  phase: 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'
  exerciseName: string
  setNumber: number
  totalSets: number
  restEndsAt?: number | null
}): ActivityCommand {
  if (input.phase === 'note' || input.phase === 'celebrate') return { kind: 'end' }

  const showSets = input.phase !== 'section-transition' && input.totalSets > 1
  return {
    kind: 'update',
    state: {
      exerciseName: input.exerciseName,
      setIndex: showSets ? input.setNumber : 0,
      setTotal: showSets ? input.totalSets : 0,
      phase: input.phase === 'rest' ? 'rest' : 'work',
      restEndsAt: input.phase === 'rest' ? (input.restEndsAt ?? null) : null,
    },
  }
}
```

- [ ] **Step 4: Verificar PASS + typecheck** — `pnpm --filter @calistenia/mobile test` y `pnpm run typecheck`.

- [ ] **Step 5: Actualizar contrato en la spec**

En `docs/superpowers/specs/2026-06-10-mobile-widgets-design.md`, cambiar la línea
`` phase: 'work' | 'rest'; restEndsAt: string | null }   // ISO date `` por
`` phase: 'work' | 'rest'; restEndsAt: number | null }   // epoch ms ``.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/live-activity-state.ts "apps/mobile/src/lib/__tests__/live-activity-state.test.ts" docs/superpowers/specs/2026-06-10-mobile-widgets-design.md
git commit -m "feat(mobile): mapper fase de sesión → estado de live activity"
```

---

### Task 3: Dependencias nativas + configuración app.json

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/app.json`, `.gitignore` (raíz)

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm --filter @calistenia/mobile add react-native-android-widget @notifee/react-native @bacons/apple-targets
```

Comprobar versiones instaladas con `pnpm --filter @calistenia/mobile list react-native-android-widget @notifee/react-native @bacons/apple-targets`. Esperado: android-widget ≥0.16, notifee ≥9, apple-targets la última. Si los peers de RN 0.85 fallan, consultar el README de cada paquete antes de forzar.

- [ ] **Step 2: app.json — entitlements, Info.plist y plugins**

En `apps/mobile/app.json`:

1. Dentro de `"ios"` añadir:
```json
"entitlements": {
  "com.apple.security.application-groups": ["group.tech.guille.calistenia"]
},
"infoPlist": {
  "NSSupportsLiveActivities": true
}
```

2. En `"plugins"`, **sustituir** la entrada `"expo-font"` por la versión con fuentes nativas Android (para el widget) y añadir los dos plugins nuevos. El array de plugins queda:
```json
"plugins": [
  "expo-router",
  "expo-localization",
  [
    "expo-splash-screen",
    {
      "backgroundColor": "#0c0a09",
      "android": { "image": "./assets/images/splash-icon.png", "imageWidth": 76 }
    }
  ],
  "expo-audio",
  "@sentry/react-native",
  [
    "expo-font",
    {
      "android": {
        "fonts": [
          "../../node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf",
          "../../node_modules/@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf",
          "../../node_modules/@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf",
          "../../node_modules/@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf"
        ]
      }
    }
  ],
  "@bacons/apple-targets",
  [
    "react-native-android-widget",
    {
      "fonts": [
        "../../node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf",
        "../../node_modules/@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf",
        "../../node_modules/@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf"
      ],
      "widgets": [
        {
          "name": "TodayWidget",
          "label": "Entrenamiento de hoy",
          "description": "Qué toca hoy, semana y racha",
          "minWidth": "250dp",
          "minHeight": "110dp",
          "targetCellWidth": 4,
          "targetCellHeight": 2,
          "updatePeriodMillis": 1800000
        }
      ]
    }
  ]
]
```

OJO: las rutas de fuentes son relativas a `apps/mobile` (los ttf viven en el store de pnpm vía node_modules del workspace — verificar con `ls apps/mobile/../../node_modules/@expo-google-fonts/bebas-neue/400Regular/`; si pnpm los tiene solo en `apps/mobile/node_modules`, usar `./node_modules/...`). Si la versión instalada de react-native-android-widget no soporta la opción `fonts`, consultar su doc "Custom fonts" y ajustar (las fuentes de expo-font en `assets/fonts` también valen).

- [ ] **Step 3: Validar config y gitignore**

Run: `cd apps/mobile && npx expo config --type prebuild > /dev/null && echo OK`
Expected: `OK` (los plugins resuelven sin tirar error).

Comprobar que `ios/` y `android/` generados por prebuild quedarán ignorados: `grep -n "^/?ios\|^/?android" apps/mobile/.gitignore .gitignore`. Si no están, añadir a `apps/mobile/.gitignore`:
```
/ios
/android
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.json apps/mobile/.gitignore
git commit -m "feat(mobile): deps de widgets (android-widget, notifee, apple-targets) + config nativa"
```

---

### Task 4: Módulo Expo local `widget-bridge` (iOS) + fachada TS

**Files:**
- Create: `apps/mobile/modules/widget-bridge/expo-module.config.json`
- Create: `apps/mobile/modules/widget-bridge/index.ts`
- Create: `apps/mobile/modules/widget-bridge/ios/WidgetBridge.podspec`
- Create: `apps/mobile/modules/widget-bridge/ios/WidgetBridgeModule.swift`
- Create: `apps/mobile/modules/widget-bridge/ios/CalisteniaActivityAttributes.swift`
- Create: `apps/mobile/modules/widget-bridge/ios/LiveActivityManager.swift`
- Create: `apps/mobile/src/lib/widget-bridge.ts`

Expo autolinkea `apps/mobile/modules/*` automáticamente (SDK 52+). Solo plataforma apple: en Android el snapshot va por AsyncStorage.

- [ ] **Step 1: Config del módulo**

`modules/widget-bridge/expo-module.config.json`:
```json
{ "platforms": ["apple"], "apple": { "modules": ["WidgetBridgeModule"] } }
```

`modules/widget-bridge/ios/WidgetBridge.podspec`:
```ruby
Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Snapshot compartido + Live Activities'
  s.author         = 'Calistenia'
  s.homepage       = 'https://gym.guille.tech'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
```

- [ ] **Step 2: Attributes de ActivityKit (compartidos con el target del widget)**

`modules/widget-bridge/ios/CalisteniaActivityAttributes.swift` — este archivo se **duplica** byte a byte en `targets/widgets/` en el Task 9 (ActivityKit exige el mismo tipo en app y extensión):
```swift
import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct CalisteniaActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var exerciseName: String
    var setIndex: Int
    var setTotal: Int
    var phase: String          // "work" | "rest"
    var restEndsAt: Double?    // epoch ms
  }
  var workoutTitle: String
}
#endif
```

- [ ] **Step 3: Manager de la activity**

`modules/widget-bridge/ios/LiveActivityManager.swift`:
```swift
import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
enum LiveActivityManager {
  private static var current: Activity<CalisteniaActivityAttributes>?

  private static func parseState(_ json: String) -> CalisteniaActivityAttributes.ContentState? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(CalisteniaActivityAttributes.ContentState.self, from: data)
  }

  private static func staleDate(for state: CalisteniaActivityAttributes.ContentState) -> Date {
    if let end = state.restEndsAt {
      return Date(timeIntervalSince1970: end / 1000).addingTimeInterval(10 * 60)
    }
    return Date().addingTimeInterval(45 * 60)
  }

  static func start(workoutTitle: String, stateJson: String) -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled,
          let state = parseState(stateJson) else { return false }
    // Si quedó una activity zombi de una sesión anterior, terminarla primero
    Task { for a in Activity<CalisteniaActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) } }
    let attrs = CalisteniaActivityAttributes(workoutTitle: workoutTitle)
    current = try? Activity.request(
      attributes: attrs,
      content: .init(state: state, staleDate: staleDate(for: state))
    )
    return current != nil
  }

  static func update(stateJson: String) async {
    guard let state = parseState(stateJson) else { return }
    await current?.update(.init(state: state, staleDate: staleDate(for: state)))
  }

  static func end() async {
    await current?.end(nil, dismissalPolicy: .immediate)
    current = nil
  }
}
#endif
```

- [ ] **Step 4: Módulo Expo**

`modules/widget-bridge/ios/WidgetBridgeModule.swift`:
```swift
import ExpoModulesCore
import WidgetKit

let APP_GROUP = "group.tech.guille.calistenia"

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("setSnapshot") { (json: String) in
      let defaults = UserDefaults(suiteName: APP_GROUP)
      defaults?.set(json, forKey: "widget_snapshot")
      WidgetCenter.shared.reloadAllTimelines()
    }

    Function("startActivity") { (workoutTitle: String, stateJson: String) -> Bool in
      if #available(iOS 16.2, *) {
        return LiveActivityManager.start(workoutTitle: workoutTitle, stateJson: stateJson)
      }
      return false
    }

    Function("updateActivity") { (stateJson: String) in
      if #available(iOS 16.2, *) {
        Task { await LiveActivityManager.update(stateJson: stateJson) }
      }
    }

    Function("endActivity") {
      if #available(iOS 16.2, *) {
        Task { await LiveActivityManager.end() }
      }
    }
  }
}
```

`modules/widget-bridge/index.ts`:
```ts
import { requireNativeModule } from 'expo-modules-core'

interface WidgetBridgeModule {
  setSnapshot(json: string): void
  startActivity(workoutTitle: string, stateJson: string): boolean
  updateActivity(stateJson: string): void
  endActivity(): void
}

/** null fuera de iOS nativo (Expo Go viejo, web, android). */
export function getWidgetBridge(): WidgetBridgeModule | null {
  try {
    return requireNativeModule<WidgetBridgeModule>('WidgetBridge')
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Fachada TS multiplataforma**

`apps/mobile/src/lib/widget-bridge.ts`:
```ts
/**
 * Escribe el snapshot para los widgets y fuerza su refresh.
 * iOS: App Group UserDefaults (módulo nativo). Android: AsyncStorage, que el
 * widget task handler lee en headless JS. Web/Expo Go: no-op.
 * Nunca lanza: un fallo de widget no puede romper la app.
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from './widget-snapshot'
import { getWidgetBridge } from '../../modules/widget-bridge'

let lastJson: string | null = null

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  try {
    const json = JSON.stringify(snapshot)
    if (json === lastJson) return // evita refresh redundante por re-renders
    lastJson = json

    if (Platform.OS === 'ios') {
      getWidgetBridge()?.setSnapshot(json)
    } else if (Platform.OS === 'android') {
      // En este task solo persistimos; el refresh del widget (requestWidgetUpdate)
      // se añade en el Task 5, que es quien crea TodayWidget.
      await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, json)
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}
```

- [ ] **Step 6: Verificar** — `pnpm run typecheck` (raíz) → sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/modules/widget-bridge apps/mobile/src/lib/widget-bridge.ts
git commit -m "feat(mobile): módulo widget-bridge (App Group + ActivityKit) y fachada TS"
```

---

### Task 5: Widget Android (JSX) + task handler

**Files:**
- Create: `apps/mobile/src/widgets/TodayWidget.tsx`
- Create: `apps/mobile/src/widgets/widget-task-handler.tsx`
- Modify: `apps/mobile/index.js`
- Modify: `apps/mobile/src/lib/widget-bridge.ts` (completar rama Android)

- [ ] **Step 1: Componente del widget**

`apps/mobile/src/widgets/TodayWidget.tsx` — réplica del hero del dashboard con la identidad de la app (Bebas/lime/mono). Colores fijos dark (`#0c0a09` fondo, lime `#8fb80a`):
```tsx
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { WidgetSnapshot } from '../lib/widget-snapshot'

const BG = '#13110f'
const BORDER = '#2a2724'
const LIME = '#a3e635'
const EMERALD = '#10b981'
const MUTED = '#8a8782'
const FG = '#fafaf9'

const STRINGS = {
  es: { today: 'ENTRENAMIENTO DE HOY', done: 'COMPLETADO', rest: 'DÍA DE DESCANSO', none: 'ELIGE UN PROGRAMA', stale: 'ABRE LA APP PARA ACTUALIZAR', streak: 'RACHA' },
  en: { today: "TODAY'S WORKOUT", done: 'COMPLETED', rest: 'REST DAY', none: 'PICK A PROGRAM', stale: 'OPEN THE APP TO UPDATE', streak: 'STREAK' },
}

function label(snapshot: WidgetSnapshot | null, today: string) {
  const tr = STRINGS[snapshot?.lang ?? 'es']
  if (!snapshot || snapshot.date !== today) return { top: '', title: tr.stale, color: MUTED }
  const w = snapshot.workoutToday
  if (!w) return { top: '', title: tr.none, color: MUTED }
  if (w.done) return { top: tr.today, title: tr.done, color: EMERALD }
  if (w.type === 'rest') return { top: tr.today, title: tr.rest, color: MUTED }
  return { top: tr.today, title: w.title.toUpperCase() || tr.today, color: LIME }
}

export function TodayWidget({ snapshot, today }: { snapshot: WidgetSnapshot | null; today: string }) {
  const { top, title, color } = label(snapshot, today)
  const tr = STRINGS[snapshot?.lang ?? 'es']
  const fresh = snapshot && snapshot.date === today

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent', width: 'match_parent', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: BG, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {top !== '' && (
          <TextWidget text={top} style={{ fontSize: 9, color: MUTED, fontFamily: 'JetBrainsMono_400Regular', letterSpacing: 0.3 }} />
        )}
        <TextWidget text={title} truncate="END" maxLines={1}
          style={{ fontSize: 30, color, fontFamily: 'BebasNeue_400Regular', marginTop: 2 }} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row' }}>
          {(fresh ? snapshot!.week : []).map(d => (
            <TextWidget
              key={d.id}
              text={d.done ? '●' : d.type === 'rest' ? '·' : '○'}
              style={{ fontSize: 13, color: d.done ? LIME : MUTED, marginRight: 6, fontFamily: 'JetBrainsMono_700Bold' }}
            />
          ))}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={fresh ? String(snapshot!.streak) : '–'}
            style={{ fontSize: 22, color: FG, fontFamily: 'BebasNeue_400Regular' }} />
          <TextWidget text={` ${tr.streak}`} style={{ fontSize: 8, color: MUTED, fontFamily: 'JetBrainsMono_400Regular' }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
```

- [ ] **Step 2: Task handler + registro**

`apps/mobile/src/widgets/widget-task-handler.tsx`:
```tsx
import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { TodayWidget } from './TodayWidget'
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from '../lib/widget-snapshot'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  let snapshot: WidgetSnapshot | null = null
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY)
    snapshot = raw ? (JSON.parse(raw) as WidgetSnapshot) : null
  } catch { /* snapshot null → estado neutro */ }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<TodayWidget snapshot={snapshot} today={localToday()} />)
      break
    default:
      break
  }
}
```

En `apps/mobile/index.js`, añadir tras los imports existentes (instrument → init-core → …), con guard para web/Expo Go:
```js
// Widget Android: el task handler corre también en headless JS (sin UI).
import { Platform } from 'react-native'
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget')
    const { widgetTaskHandler } = require('./src/widgets/widget-task-handler')
    registerWidgetTaskHandler(widgetTaskHandler)
  } catch { /* Expo Go: lib nativa ausente */ }
}
```

- [ ] **Step 3: Completar la rama Android de `writeWidgetSnapshot`**

En `src/lib/widget-bridge.ts`, sustituir la rama android por:
```ts
    } else if (Platform.OS === 'android') {
      await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, json)
      const { requestWidgetUpdate } = await import('react-native-android-widget')
      const React = await import('react')
      const { TodayWidget } = await import('../widgets/TodayWidget')
      await requestWidgetUpdate({
        widgetName: 'TodayWidget',
        renderWidget: () => React.createElement(TodayWidget, { snapshot, today: snapshot.date }),
        widgetNotFound: () => {},
      })
    }
```

- [ ] **Step 4: Verificar** — `pnpm run typecheck` → sin errores. `pnpm --filter @calistenia/mobile test` → siguen pasando.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/widgets apps/mobile/index.js apps/mobile/src/lib/widget-bridge.ts
git commit -m "feat(mobile): widget Android Hoy+semana+racha (react-native-android-widget)"
```

---

### Task 6: Target iOS WidgetKit — TodayWidget

**Files:**
- Create: `apps/mobile/targets/widgets/expo-target.config.js`
- Create: `apps/mobile/targets/widgets/WidgetsBundle.swift`
- Create: `apps/mobile/targets/widgets/SnapshotModel.swift`
- Create: `apps/mobile/targets/widgets/WidgetTheme.swift`
- Create: `apps/mobile/targets/widgets/TodayWidget.swift`
- Copy: ttf de fuentes a `apps/mobile/targets/widgets/`

- [ ] **Step 1: Config del target**

`targets/widgets/expo-target.config.js`:
```js
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'CalisteniaWidgets',
  deploymentTarget: '16.2',
  entitlements: {
    'com.apple.security.application-groups': ['group.tech.guille.calistenia'],
  },
}
```

Copiar fuentes (apple-targets añade al target todos los recursos de la carpeta):
```bash
cp node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf apps/mobile/targets/widgets/
cp node_modules/@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf apps/mobile/targets/widgets/
cp node_modules/@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf apps/mobile/targets/widgets/
```
(Si pnpm no expone esos paths en la raíz, buscarlos con `find . -name "BebasNeue_400Regular.ttf" -not -path "*/.pnpm/*" | head`.)

- [ ] **Step 2: Modelo + tema**

`targets/widgets/SnapshotModel.swift`:
```swift
import Foundation

struct WidgetSnapshot: Codable {
  struct WorkoutToday: Codable {
    var title: String
    var type: String
    var done: Bool
    var exerciseCount: Int
    var programPhase: Int
  }
  struct WeekDay: Codable {
    var id: String
    var done: Bool
    var type: String
  }
  var date: String
  var programName: String?
  var workoutToday: WorkoutToday?
  var week: [WeekDay]
  var streak: Int
  var weeklyDone: Int
  var weeklyGoal: Int
  var lang: String
}

enum SnapshotStore {
  static let appGroup = "group.tech.guille.calistenia"

  static func load() -> WidgetSnapshot? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "widget_snapshot"),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  static func localToday() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
  }
}

enum L10n {
  static func t(_ key: String, _ lang: String) -> String {
    let es = ["today": "ENTRENAMIENTO DE HOY", "done": "COMPLETADO", "rest": "DÍA DE DESCANSO",
              "none": "ELIGE UN PROGRAMA", "stale": "ABRE LA APP PARA ACTUALIZAR",
              "streak": "RACHA", "set": "SERIE", "resting": "DESCANSANDO"]
    let en = ["today": "TODAY'S WORKOUT", "done": "COMPLETED", "rest": "REST DAY",
              "none": "PICK A PROGRAM", "stale": "OPEN THE APP TO UPDATE",
              "streak": "STREAK", "set": "SET", "resting": "RESTING"]
    return (lang == "en" ? en : es)[key] ?? key
  }
}
```

`targets/widgets/WidgetTheme.swift` — registra fuentes en runtime (CTFontManager funciona en extensiones sin tocar Info.plist):
```swift
import SwiftUI
import CoreText

enum Theme {
  static let bg = Color(red: 0.075, green: 0.067, blue: 0.059)       // #13110f
  static let lime = Color(red: 0.64, green: 0.90, blue: 0.21)         // #a3e635
  static let emerald = Color(red: 0.06, green: 0.73, blue: 0.51)      // #10b981
  static let muted = Color(red: 0.54, green: 0.53, blue: 0.51)
  static let fg = Color(red: 0.98, green: 0.98, blue: 0.976)

  private static let registered: Void = {
    for file in ["BebasNeue_400Regular", "JetBrainsMono_400Regular", "JetBrainsMono_700Bold"] {
      if let url = Bundle.main.url(forResource: file, withExtension: "ttf") {
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
  }()

  static func bebas(_ size: CGFloat) -> Font { _ = registered; return .custom("Bebas Neue", size: size) }
  static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
    _ = registered
    return .custom(bold ? "JetBrains Mono Bold" : "JetBrains Mono", size: size)
  }
}
```

- [ ] **Step 3: Widget de hoy**

`targets/widgets/TodayWidget.swift`:
```swift
import WidgetKit
import SwiftUI

struct TodayEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let isStale: Bool
}

struct TodayProvider: TimelineProvider {
  func makeEntry() -> TodayEntry {
    let snap = SnapshotStore.load()
    let stale = snap == nil || snap!.date != SnapshotStore.localToday()
    return TodayEntry(date: Date(), snapshot: snap, isStale: stale)
  }
  func placeholder(in context: Context) -> TodayEntry { makeEntry() }
  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) { completion(makeEntry()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    // Una entrada ahora + refresh a medianoche para que el "done" de ayer no mienta
    let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
    completion(Timeline(entries: [makeEntry()], policy: .after(midnight)))
  }
}

struct TodayWidgetView: View {
  var entry: TodayEntry
  @Environment(\.widgetFamily) var family

  var lang: String { entry.snapshot?.lang ?? "es" }

  var titleAndColor: (String, Color) {
    guard let snap = entry.snapshot, !entry.isStale else { return (L10n.t("stale", lang), Theme.muted) }
    guard let w = snap.workoutToday else { return (L10n.t("none", lang), Theme.muted) }
    if w.done { return (L10n.t("done", lang), Theme.emerald) }
    if w.type == "rest" { return (L10n.t("rest", lang), Theme.muted) }
    return (w.title.isEmpty ? L10n.t("today", lang) : w.title.uppercased(), Theme.lime)
  }

  var body: some View {
    let (title, color) = titleAndColor
    VStack(alignment: .leading, spacing: 0) {
      if entry.snapshot != nil && !entry.isStale {
        Text(L10n.t("today", lang))
          .font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted)
      }
      Text(title)
        .font(Theme.bebas(family == .systemSmall ? 22 : 28))
        .foregroundColor(color).lineLimit(1).minimumScaleFactor(0.6)
        .padding(.top, 2)
      Spacer()
      HStack(alignment: .center) {
        if family != .systemSmall, let snap = entry.snapshot, !entry.isStale {
          HStack(spacing: 6) {
            ForEach(snap.week, id: \.id) { day in
              Circle()
                .strokeBorder(day.done ? Theme.lime : Theme.muted.opacity(day.type == "rest" ? 0.3 : 0.7), lineWidth: 1.5)
                .background(Circle().fill(day.done ? Theme.lime : .clear))
                .frame(width: 8, height: 8)
            }
          }
        }
        Spacer()
        HStack(alignment: .lastTextBaseline, spacing: 4) {
          Text(entry.isStale ? "–" : "\(entry.snapshot?.streak ?? 0)")
            .font(Theme.bebas(20)).foregroundColor(Theme.fg)
          Text(L10n.t("streak", lang)).font(Theme.mono(7)).kerning(1.5).foregroundColor(Theme.muted)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .containerBackground(Theme.bg, for: .widget)
    .widgetURL(URL(string: "calistenia://"))
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TodayWidget", provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Entrenamiento de hoy")
    .description("Qué toca hoy, semana y racha.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
```

`targets/widgets/WidgetsBundle.swift`:
```swift
import WidgetKit
import SwiftUI

@main
struct CalisteniaWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    // SessionLiveActivity se añade en el Task 9
  }
}
```

Nota: `.containerBackground(_:for:)` exige iOS 17; con deploymentTarget 16.2 hay que envolverlo:
```swift
// En TodayWidgetView.body, sustituir la línea .containerBackground por:
.modifier(WidgetBackground())
```
y añadir al final de `WidgetTheme.swift`:
```swift
struct WidgetBackground: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(Theme.bg, for: .widget)
    } else {
      content.background(Theme.bg)
    }
  }
}
```

- [ ] **Step 4: Verificar que el target genera**

Run: `cd apps/mobile && npx expo prebuild -p ios --no-install && grep -q CalisteniaWidgets ios/*.xcodeproj/project.pbxproj && echo TARGET-OK`
Expected: `TARGET-OK`. (No compila Swift aún — eso es el Task 11. Si apple-targets pide `appleTeamId` en app.json para firmar, añadir `"ios": { "appleTeamId": "<TEAM_ID>" }`… solo necesario para dispositivo; simulador no lo exige.)

- [ ] **Step 5: Commit**

```bash
git add -f apps/mobile/targets
git commit -m "feat(mobile): target WidgetKit iOS con TodayWidget (SwiftUI)"
```
(El `-f` es por el `*.ttf`/assets si el gitignore raíz los pilla; verificar antes con `git status apps/mobile/targets`.)

---

### Task 7: Sync del snapshot desde WorkoutContext

**Files:**
- Create: `apps/mobile/src/lib/sync-widget-snapshot.ts`
- Modify: `apps/mobile/src/contexts/WorkoutContext.tsx`

- [ ] **Step 1: Helper de sync**

`apps/mobile/src/lib/sync-widget-snapshot.ts`:
```ts
import { localDay, todayStr } from '@calistenia/core/lib/dateUtils'
import { buildWidgetSnapshot } from './widget-snapshot'
import { writeWidgetSnapshot } from './widget-bridge'
import type { Settings, WeekDay, Workout } from '@calistenia/core/types'

const DAY_IDS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

export function syncWidgetSnapshot(args: {
  lang: string
  programName: string | null
  settings: Settings
  weekDays: WeekDay[]
  getWorkout: (phase: number, dayId: string) => Workout | null
  isWorkoutDone: (key: string) => boolean
  streak: number
  weeklyDone: number
}): void {
  const todayId = DAY_IDS[localDay()]
  const phase = args.settings.phase || 1
  const workout = args.programName ? args.getWorkout(phase, todayId) : null
  const todayMeta = args.weekDays.find(d => d.id === todayId)

  void writeWidgetSnapshot(buildWidgetSnapshot({
    today: todayStr(),
    lang: args.lang.startsWith('en') ? 'en' : 'es',
    programName: args.programName,
    programPhase: phase,
    todayId,
    todayType: todayMeta?.type || 'strength',
    weekDays: args.weekDays.map(d => ({ id: d.id, type: d.type })),
    workout: workout ? { title: workout.title, exerciseCount: workout.exercises.length } : null,
    isDone: args.isWorkoutDone,
    streak: args.streak,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.settings.weeklyGoal || 5,
  }))
}
```

- [ ] **Step 2: Engancharlo en WorkoutProvider**

En `apps/mobile/src/contexts/WorkoutContext.tsx`, dentro de `WorkoutProvider` (tiene a mano `programs/activeProgram/weekDays/getWorkout/settings/progress/isWorkoutDone/getLongestStreak/getWeeklyDoneCount`), añadir:

```tsx
import { useTranslation } from 'react-i18next'
import { syncWidgetSnapshot } from '@/lib/sync-widget-snapshot'
```
y el efecto (después de los useMemo existentes):
```tsx
  const { i18n } = useTranslation()

  // Snapshot para widgets: en hidratación, al marcar sesiones (progress cambia),
  // al cambiar de programa/ajustes. writeWidgetSnapshot deduplica por JSON.
  useEffect(() => {
    if (!programsReady) return
    syncWidgetSnapshot({
      lang: i18n.language,
      programName: activeProgram?.name ?? null,
      settings,
      weekDays,
      getWorkout,
      isWorkoutDone,
      streak: getLongestStreak(),
      weeklyDone: getWeeklyDoneCount(),
    })
  }, [programsReady, activeProgram, settings, weekDays, progress, i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps
```

(Los getters van fuera de deps a propósito — son estables o derivados de `progress`, que ya está en deps; mismo patrón que el resto del archivo.)

- [ ] **Step 3: Verificar**

- `pnpm run typecheck` → sin errores.
- Smoke web (no debe romper): con el Metro y PB temporal que ya corren, abrir expo web y comprobar en consola que no hay errores nuevos (en web `writeWidgetSnapshot` es no-op por Platform).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/sync-widget-snapshot.ts apps/mobile/src/contexts/WorkoutContext.tsx
git commit -m "feat(mobile): sync del snapshot de widgets desde WorkoutContext"
```

---

### Task 8: Fachada `live-session` (iOS bridge / Android notifee)

**Files:**
- Create: `apps/mobile/src/lib/live-session.ts`
- Modify: `apps/mobile/index.js`

- [ ] **Step 1: Implementar la fachada**

`apps/mobile/src/lib/live-session.ts`:
```ts
/**
 * Timer de sesión en vivo fuera de la app.
 * iOS: Live Activity (ActivityKit vía widget-bridge). Android: notificación
 * persistente de foreground service con cronómetro (notifee).
 * Todas las funciones son best-effort: nunca lanzan.
 */
import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'
import type { LiveActivityState } from './live-activity-state'
import { getWidgetBridge } from '../../modules/widget-bridge'

const NOTIF_ID = 'live-session'
let active = false
let workoutTitle = ''
let lastState: LiveActivityState | null = null

/** true si el timer en vivo gestiona el aviso de fin de descanso (Android). */
export function liveSessionHandlesRest(): boolean {
  return active && Platform.OS === 'android'
}

async function getNotifee() {
  try {
    // Lazy: notifee es módulo nativo; en Expo Go no existe
    return (await import('@notifee/react-native')).default
  } catch {
    return null
  }
}

async function displayAndroid(state: LiveActivityState): Promise<void> {
  const notifee = await getNotifee()
  if (!notifee) return
  const { AndroidImportance } = await import('@notifee/react-native')
  await notifee.createChannel({ id: NOTIF_ID, name: 'Sesión en curso', importance: AndroidImportance.LOW })
  const resting = state.phase === 'rest' && !!state.restEndsAt
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: workoutTitle,
    body: state.setTotal > 0
      ? `${state.exerciseName} — SERIE ${state.setIndex}/${state.setTotal}`
      : state.exerciseName,
    android: {
      channelId: NOTIF_ID,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(resting
        ? { showChronometer: true, chronometerDirection: 'down' as const, timestamp: state.restEndsAt! }
        : {}),
    },
  })
}

export async function startLiveSession(title: string, state: LiveActivityState): Promise<void> {
  try {
    workoutTitle = title
    lastState = state
    if (Platform.OS === 'ios') {
      active = getWidgetBridge()?.startActivity(title, JSON.stringify(state)) ?? false
    } else if (Platform.OS === 'android') {
      await displayAndroid(state)
      active = true
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}

export async function updateLiveSession(state: LiveActivityState): Promise<void> {
  try {
    if (!active) return
    // Orden de efectos React: RestScreen (hijo) llama updateLiveRest ANTES de que
    // el efecto de useLiveSession (padre) emita el update de fase con restEndsAt
    // null — preservar el countdown ya empujado para no pisarlo.
    if (state.phase === 'rest' && state.restEndsAt == null && lastState?.phase === 'rest' && lastState.restEndsAt) {
      state = { ...state, restEndsAt: lastState.restEndsAt }
    }
    lastState = state
    if (Platform.OS === 'ios') getWidgetBridge()?.updateActivity(JSON.stringify(state))
    else if (Platform.OS === 'android') await displayAndroid(state)
  } catch (e) {
    Sentry.captureException(e)
  }
}

/** Resync del countdown cuando el usuario ajusta el descanso (−15/+15/+30 o nuevo rest). */
export async function updateLiveRest(restEndsAt: number): Promise<void> {
  if (!lastState) return
  await updateLiveSession({ ...lastState, phase: 'rest', restEndsAt })
}

export async function endLiveSession(): Promise<void> {
  try {
    if (!active) return
    active = false
    lastState = null
    if (Platform.OS === 'ios') {
      getWidgetBridge()?.endActivity()
    } else if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      await notifee?.stopForegroundService()
      await notifee?.cancelNotification(NOTIF_ID)
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}
```

- [ ] **Step 2: Foreground service en index.js**

En `apps/mobile/index.js`, dentro del bloque android existente del Task 5 (mismo try/catch):
```js
    const notifee = require('@notifee/react-native').default
    // El service vive mientras la notificación ongoing exista
    notifee.registerForegroundService(() => new Promise(() => {}))
```

- [ ] **Step 3: Verificar** — `pnpm run typecheck` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/live-session.ts apps/mobile/index.js
git commit -m "feat(mobile): fachada live-session (Live Activity iOS / notifee Android)"
```

---

### Task 9: Live Activity UI (SwiftUI)

**Files:**
- Create: `apps/mobile/targets/widgets/CalisteniaActivityAttributes.swift` (copia exacta del de modules/widget-bridge/ios/)
- Create: `apps/mobile/targets/widgets/SessionLiveActivity.swift`
- Modify: `apps/mobile/targets/widgets/WidgetsBundle.swift`

- [ ] **Step 1: Duplicar attributes**

```bash
cp apps/mobile/modules/widget-bridge/ios/CalisteniaActivityAttributes.swift apps/mobile/targets/widgets/CalisteniaActivityAttributes.swift
```

- [ ] **Step 2: UI de la activity**

`targets/widgets/SessionLiveActivity.swift`:
```swift
import WidgetKit
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct SessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CalisteniaActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(Theme.bg)
        .activitySystemActionForegroundColor(Theme.lime)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.exerciseName.uppercased())
              .font(Theme.bebas(22)).foregroundColor(Theme.fg).lineLimit(1)
            if context.state.setTotal > 0 {
              Text("SERIE \(context.state.setIndex)/\(context.state.setTotal)")
                .font(Theme.mono(9)).kerning(2).foregroundColor(Theme.muted)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestCountdown(state: context.state, size: 26)
        }
      } compactLeading: {
        Image(systemName: context.state.phase == "rest" ? "timer" : "figure.strengthtraining.functional")
          .foregroundColor(Theme.lime)
      } compactTrailing: {
        RestCountdown(state: context.state, size: 13)
      } minimal: {
        Image(systemName: "timer").foregroundColor(Theme.lime)
      }
      .widgetURL(URL(string: "calistenia://session"))
    }
  }
}

@available(iOS 16.2, *)
struct RestCountdown: View {
  let state: CalisteniaActivityAttributes.ContentState
  let size: CGFloat

  var body: some View {
    if state.phase == "rest", let end = state.restEndsAt {
      Text(timerInterval: Date()...Date(timeIntervalSince1970: end / 1000), countsDown: true)
        .font(Theme.bebas(size)).foregroundColor(Theme.lime)
        .monospacedDigit().multilineTextAlignment(.trailing)
    } else if size > 20 {
      Image(systemName: "figure.strengthtraining.functional")
        .font(.system(size: size * 0.8)).foregroundColor(Theme.lime)
    } else {
      EmptyView()
    }
  }
}

@available(iOS 16.2, *)
struct LockScreenView: View {
  let context: ActivityViewContext<CalisteniaActivityAttributes>

  var resting: Bool { context.state.phase == "rest" && context.state.restEndsAt != nil }

  var body: some View {
    HStack(alignment: .center) {
      VStack(alignment: .leading, spacing: 3) {
        Text(context.attributes.workoutTitle.uppercased())
          .font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted).lineLimit(1)
        Text(context.state.exerciseName.uppercased())
          .font(Theme.bebas(26)).foregroundColor(resting ? Theme.muted : Theme.lime)
          .lineLimit(1).minimumScaleFactor(0.7)
        if context.state.setTotal > 0 {
          Text("SERIE \(context.state.setIndex)/\(context.state.setTotal)")
            .font(Theme.mono(10)).kerning(2).foregroundColor(Theme.muted)
        }
      }
      Spacer()
      if resting, let end = context.state.restEndsAt {
        VStack(alignment: .trailing, spacing: 2) {
          Text(L10n.t("resting", "es")).font(Theme.mono(8)).kerning(2).foregroundColor(Theme.muted)
          Text(timerInterval: Date()...Date(timeIntervalSince1970: end / 1000), countsDown: true)
            .font(Theme.bebas(34)).foregroundColor(Theme.lime)
            .monospacedDigit().multilineTextAlignment(.trailing).frame(maxWidth: 90)
        }
      }
    }
    .padding(16)
  }
}
#endif
```

- [ ] **Step 3: Añadir al bundle**

En `targets/widgets/WidgetsBundle.swift`:
```swift
@main
struct CalisteniaWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    if #available(iOS 16.2, *) {
      SessionLiveActivity()
    }
  }
}
```

(Nota: `WidgetBundle` no acepta `if #available` en todas las versiones de Swift — si no compila, usar el patrón de bundles anidados:
```swift
@main
struct CalisteniaWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    SessionActivityBundle().body
  }
}
struct SessionActivityBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.2, *) { return SessionLiveActivity() }
  }
}
```
o simplemente declarar `SessionLiveActivity()` directo, ya que el deploymentTarget del target es 16.2 y el `@available` sobra.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/targets/widgets
git commit -m "feat(mobile): Live Activity de sesión (lock screen + Dynamic Island)"
```

---

### Task 10: Integración en SessionView

**Files:**
- Create: `apps/mobile/src/lib/use-live-session.ts`
- Modify: `apps/mobile/src/components/SessionView.tsx`

- [ ] **Step 1: Hook observador**

`apps/mobile/src/lib/use-live-session.ts`:
```ts
/**
 * Observa las transiciones de SessionView (sin tocar su máquina de estados)
 * y mantiene viva la Live Activity / notificación persistente.
 * El restEndsAt fino lo empuja RestScreen vía updateLiveRest() (módulo-level,
 * sin prop drilling) porque los ajustes −15/+15/+30 no son transiciones.
 */
import { useEffect, useRef } from 'react'
import { mapPhaseToActivity } from './live-activity-state'
import { startLiveSession, updateLiveSession, endLiveSession } from './live-session'

type Phase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

export function useLiveSession(args: {
  workoutTitle: string
  phase: Phase
  exerciseName: string
  setNumber: number
  totalSets: number
}): void {
  const started = useRef(false)

  useEffect(() => {
    const cmd = mapPhaseToActivity({
      phase: args.phase,
      exerciseName: args.exerciseName,
      setNumber: args.setNumber,
      totalSets: args.totalSets,
      // restEndsAt lo precisa RestScreen con updateLiveRest(); aquí solo
      // marcamos la fase — el countdown llega ~un frame después
      restEndsAt: null,
    })

    if (cmd.kind === 'end') {
      if (started.current) {
        started.current = false
        void endLiveSession()
      }
      return
    }
    if (!started.current) {
      started.current = true
      void startLiveSession(args.workoutTitle, cmd.state)
    } else {
      void updateLiveSession(cmd.state)
    }
  }, [args.phase, args.exerciseName, args.setNumber, args.totalSets, args.workoutTitle])

  // Fin por desmontaje (abandonar sesión, navegar fuera con endSession)
  useEffect(() => () => {
    if (started.current) {
      started.current = false
      void endLiveSession()
    }
  }, [])
}
```

- [ ] **Step 2: Llamarlo desde SessionView**

En `apps/mobile/src/components/SessionView.tsx`:

1. Imports (junto a los de `@/lib/...`):
```ts
import { useLiveSession } from '@/lib/use-live-session'
import { updateLiveRest, liveSessionHandlesRest } from '@/lib/live-session'
```

2. En el cuerpo de `SessionView`, justo después de `const durationMin = …` (línea ~752), añadir:
```ts
  // Live Activity / notificación persistente — observa, no muta
  useLiveSession({
    workoutTitle: workout.title,
    phase,
    exerciseName: phase === 'section-transition'
      ? (transitionType === 'warmup-to-main' ? t('warmupCooldown.transitions.mainTitle', { defaultValue: 'Ejercicios principales' }) : t('warmupCooldown.transitions.cooldownTitle', { defaultValue: 'Vuelta a la calma' }))
      : currentStep?.exercise.name ?? '',
    setNumber: currentStep?.setNumber ?? 0,
    totalSets: currentStep?.totalSets ?? 0,
  })
```
(Comprobar las claves i18n reales del componente de transición existente en el propio archivo — usar las mismas que pinta `SectionTransition`; si no existen como claves, pasar el literal que ya use ese componente.)

3. En `RestScreen` — resync del countdown en los **mismos puntos** donde ya se reprograma la notificación:

En el efecto de notificación (líneas ~80-88), añadir tras `scheduleRestEnd(...).then(...)`:
```ts
    updateLiveRest(endAtRef.current)
```

En `adjustTime` (líneas ~124-140), añadir tras el `scheduleRestEnd(...).then(...)`:
```ts
    updateLiveRest(endAtRef.current)
```

4. Android: evitar la notificación puntual redundante (la persistente ya tiene cronómetro). En el efecto de notificación y en `adjustTime` de `RestScreen`, envolver la llamada a `scheduleRestEnd` con el guard:
```ts
    if (!liveSessionHandlesRest()) {
      scheduleRestEnd(/* …igual que ahora… */).then(id => { notifIdRef.current = id })
    }
```
(En iOS sigue programándose — el banner de "¡Vamos!" al acabar el descanso convive bien con la activity. En Expo Go Android `liveSessionHandlesRest()` es false y todo queda como hoy.)

- [ ] **Step 3: Verificar**

- `pnpm run typecheck` → sin errores.
- `pnpm --filter @calistenia/mobile test` → pasan.
- Smoke web: sesión completa en expo web (todo no-op, sin errores en consola).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/use-live-session.ts apps/mobile/src/components/SessionView.tsx
git commit -m "feat(mobile): live session enganchada a SessionView con resync de descanso"
```

---

### Task 11: Builds nativas + verificación manual

**Files:** los que haga falta arreglar (Swift/config) — commits de fix puntuales.

- [ ] **Step 1: Prebuild + build iOS (simulador)**

```bash
cd apps/mobile
npx expo prebuild --clean
npx expo run:ios   # sin sandbox; compila el target CalisteniaWidgets también
```
Expected: build OK y app instalada en el simulador. Errores de Swift se arreglan aquí (son el riesgo concentrado del plan: API exacta de apple-targets, nombres PostScript de fuentes — verificar con `fc-scan` o imprimiendo `UIFont.familyNames` si un `Font.custom` no aplica).

- [ ] **Step 2: Checklist iOS (simulador, dark)**

Con el PB temporal de siempre (NUNCA el pb_data real) y usuario test@test.local:
1. Añadir el widget TodayWidget (small y medium) a la home → pinta hoy/semana/racha con Bebas/lime.
2. Empezar sesión → Live Activity aparece en lock screen; ejercicio Bebas + SERIE X/Y.
3. Completar serie → fase rest → countdown corre **con la app en background y pantalla bloqueada**.
4. +30s / −15s en el descanso → el countdown de la activity salta al nuevo fin.
5. Saltar descanso → vuelve a `work` sin countdown.
6. Dynamic Island (simulador iPhone 15): compact muestra timer en rest; expanded muestra ejercicio + serie + countdown.
7. Terminar sesión (nota → celebrate) → activity desaparece; widget pasa a COMPLETADO (emerald).
8. Matar la app a mitad de descanso → la activity se auto-descarta (staleDate, esperar ~10 min o verificar staleDate en consola).
9. Cambiar la fecha del simulador a mañana → widget muestra "ABRE LA APP PARA ACTUALIZAR".

- [ ] **Step 3: Build + checklist Android (emulador)**

```bash
npx expo run:android
```
1. Añadir TodayWidget a la home → render correcto con fuentes custom.
2. Empezar sesión → notificación persistente con título del workout y SERIE X/Y.
3. Rest → cronómetro en cuenta atrás en la notificación; ajustar +30s → resincroniza; la notificación puntual de expo-notifications NO se duplica.
4. Terminar sesión → notificación desaparece; widget COMPLETADO.
5. Tap en widget y en notificación → abren la app.
6. Matar el proceso a mitad de sesión (swipe en recientes) → el foreground service muere y la notificación desaparece (sin zombi).

- [ ] **Step 4: Regresiones**

- `pnpm run typecheck` y `pnpm --filter @calistenia/mobile test`.
- Expo Go (iOS): la app sigue arrancando (widgets/notifee en no-op silencioso).
- `npx expo export --platform ios --platform android` → bundles Hermes OK.

- [ ] **Step 5: Commit de fixes + actualizar memoria del proyecto**

Commits puntuales de lo arreglado en builds. Añadir a la memoria del proyecto (project_monorepo_rn.md) los gotchas reales que salgan (nombres de fuentes PostScript, API de apple-targets, etc.).

---

## Riesgos conocidos (para quien ejecute)

1. **APIs de terceros**: las firmas exactas de `react-native-android-widget` (opción `fonts`, `requestWidgetUpdate`) y `@bacons/apple-targets` (`expo-target.config.js`) pueden variar entre versiones — ante un error, leer el README del paquete instalado en node_modules antes de improvisar.
2. **Nombres PostScript de fuentes** en Swift ("Bebas Neue", "JetBrains Mono"): verificar en build si `Font.custom` no aplica.
3. **Headless JS del widget Android** ejecuta `index.js` completo (instrument + init-core): si el render del widget crashea, mirar ahí primero.
4. **Expo Go deja de servir para probar widgets** (no para el resto): el dev loop de widgets es `expo run:ios/android`.
