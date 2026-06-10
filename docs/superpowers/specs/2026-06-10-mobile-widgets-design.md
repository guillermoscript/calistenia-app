# Widgets móviles + Live Activities — Diseño

**Fecha**: 2026-06-10
**Estado**: Aprobado por Guillermo (scope v1, enfoque técnico y UX validados en sesión)
**Apps**: `apps/mobile` (Expo SDK 56, RN 0.85, NativeWind)

## Objetivo

Llevar la app fuera de la app: presencia en lock screen, Dynamic Island y home screen
para los dos momentos de mayor valor — **durante la sesión** (rest timer con el móvil
bloqueado) y **antes de la sesión** (qué toca hoy, racha, semana). La arquitectura debe
dejar lista la tubería de datos para todo el catálogo futuro de widgets (sección final).

## Scope v1 (decidido)

1. **Rest timer en vivo** — Live Activity (iOS) / notificación persistente (Android),
   visible durante **toda la sesión** (no solo en descansos).
2. **Widget "Hoy + semana + racha"** — home screen, tamaños small y medium.

Ambas plataformas a la vez. Todo lo demás queda como roadmap (ver catálogo).

## Restricciones

- Los widgets son código nativo fuera del bundle JS: **no funcionan en Expo Go**.
  Dev loop: `expo run:ios` / `expo run:android` (prebuild/CNG); EAS builds ya configurados
  (`apps/mobile/eas.json`). El simulador iOS soporta WidgetKit y Live Activities — la
  cuenta Apple Developer de pago solo hace falta para dispositivo real/TestFlight.
- Live Activities requieren iOS 16.1+; en versiones anteriores, no-op silencioso.
- Un fallo de widget/activity **jamás** interrumpe la sesión de entreno: todo el puente
  nativo va en try/catch silencioso con report a Sentry.
- No tocar la máquina de estados de SessionView (regla de arquitectura existente:
  SessionView es dueño de stepIdx/phase; los widgets solo observan).

## Enfoque técnico (Opción A — híbrido, decidido)

| Pieza | Tecnología |
|---|---|
| Widget Android | `react-native-android-widget` (config plugin; widgets en JSX → RemoteViews) |
| Timer Android | `notifee` — foreground service + notificación ongoing con cronómetro nativo |
| Widget iOS | `@bacons/apple-targets` — target WidgetKit con SwiftUI propio |
| Live Activity iOS | ActivityKit en Swift + módulo Expo local para start/update/end desde JS |
| Datos compartidos | Módulo Expo local `widget-bridge` (App Group UserDefaults / SharedPreferences) |

Se descartó "todo a mano" (deuda de mantenimiento en Kotlin para un solo dev) y los
paquetes llave en mano de Live Activities (UI genérica que rompe la identidad visual).

## Arquitectura

### 1. Tubería de datos: `apps/mobile/modules/widget-bridge`

Módulo Expo local con API mínima:

```ts
setSnapshot(json: string): void   // escribe + dispara refresh de widgets
```

- iOS: `UserDefaults(suiteName: "group.tech.guille.calistenia")` + `WidgetCenter.shared.reloadAllTimelines()`.
  Requiere capability App Groups en app y target del widget (entitlements vía config plugin).
- Android: `SharedPreferences` + `requestWidgetUpdate` de react-native-android-widget.

### 2. Snapshot (contrato TS ↔ nativo)

```ts
type WidgetSnapshot = {
  date: string                       // YYYY-MM-DD local; el widget lo compara con "hoy"
  programName: string | null
  workoutToday: {
    title: string
    type: string                     // strength | rest | cardio | yoga | circuit
    done: boolean
    exerciseCount: number
    phase: number
  } | null
  week: { id: DayId; done: boolean; type: string }[]
  streak: number
  weeklyDone: number
  weeklyGoal: number
  lang: 'es' | 'en'
}
```

**Quién escribe**: un helper `syncWidgetSnapshot()` llamado en eventos clave (no por render):
hidratación del WorkoutContext, sesión completada, cambio de programa/ajustes. Los datos
ya existen ahí (`weekDays`, `isWorkoutDone`, `getLongestStreak`, `getWeeklyDoneCount`).

**Dato viejo**: si `snapshot.date != hoy`, el widget pinta estado neutro
("Abre la app para actualizar") en vez de datos falsos. Timeline iOS programa una entrada
a medianoche para forzar esa transición sin abrir la app.

### 3. Widget "Hoy + semana + racha"

- **Small**: racha en Bebas gigante + línea mono "HOY: <TÍTULO>" (o COMPLETADO / DESCANSO).
- **Medium**: réplica del hero del dashboard — label mono 9px "ENTRENAMIENTO DE HOY"
  (tracking 3px), título Bebas en lime, WeekStrip de 7 días con checks, racha.
- **Estados** (mismos que la Home): pendiente (lime), completado (emerald + check),
  descanso (luna), sin programa ("ELIGE UN PROGRAMA"), snapshot viejo (neutro).
- **Tap**: deep link `calistenia://` → Home. En v1 no arranca sesión directamente.
- **Fuentes**: Bebas Neue / DM Sans / JetBrains Mono embebidas también en el target
  del widget iOS (los targets no heredan los assets de la app). Fallback a sistema si fallan.
- Fondo dark consistente con el tema; textos i18n según `snapshot.lang`
  (strings duplicados en nativo para es/en — el widget no tiene acceso a i18next).

### 4. Rest timer en vivo

**Estado compartido de la activity**:

```ts
{ exerciseName: string; setIndex: number; setTotal: number;
  phase: 'work' | 'rest'; restEndsAt: string | null }   // ISO date
```

**iOS (ActivityKit)**:
- Arranca al iniciar sesión; `update` en cada transición; `end` al terminar/abandonar.
- Lock screen: ejercicio en Bebas + "SERIE X/Y" mono; en `rest`, countdown grande con
  `Text(timerInterval:)` — el timer corre en el sistema, sin updates JS ni push.
- Dynamic Island: compact = icono + countdown; expanded = vista completa.
- `staleDate` = fin estimado de descanso + margen amplio → si la app muere a mitad de
  sesión, el sistema marca/descarta la activity (no queda timer zombi).

**Android (notifee)**:
- Notificación ongoing de foreground service: título = ejercicio, texto = SERIE X/Y;
  en descanso, cronómetro nativo en cuenta atrás (`usesChronometer` + countdown).
- **Sustituye** la notificación puntual de fin de descanso de expo-notifications
  (queda redundante). Sonidos/haptics in-app no cambian.

**Integración**: hook `useLiveSession()` montado junto a SessionView que observa las
transiciones de la máquina de estados existente (start → set done → rest → work → end)
y llama al módulo. La máquina no se modifica.

### 5. Manejo de errores

- Bridge y activity: try/catch silencioso + `reportError` (Sentry). Nunca bloquean UI.
- iOS < 16.1 o Live Activities deshabilitadas por el usuario: no-op.
- Permiso de notificaciones denegado en Android: el foreground service no muestra
  notificación; la sesión funciona igual (comportamiento actual).

### 6. Verificación

1. `pnpm run typecheck`.
2. Build dev simulador iOS + emulador Android (prebuild limpio desde config plugins).
3. Flujo manual: empezar sesión → activity/notificación aparece → completar serie →
   countdown corre con pantalla bloqueada → fin de descanso → vuelve a `work` →
   terminar sesión → activity muere → widget muestra COMPLETADO.
4. Widget con snapshot viejo (cambiar fecha del simulador) → estado neutro.
5. Matar la app a mitad de sesión → activity se descarta vía staleDate.

## Catálogo futuro (roadmap priorizado)

Todos beben del mismo snapshot/tubería; cada uno es incremental una vez montada la v1.

**Tier 1 — solo necesitan datos que el móvil ya tiene**
1. Racha en peligro (widget que muta a ámbar si no entrenaste y es tarde).
2. Próximos 7 días (calendario de tipos de día).
3. Heatmap mensual de consistencia (medium/large).
4. Briefing pre-entreno (hint de sobrecarga del primer ejercicio).
5. Quick actions (long-press icono): Empezar sesión.
6. StandBy iOS (reloj de descanso gigante en horizontal) — gratis con la Live Activity.

**Tier 2 — requieren portar features web al móvil**
7. Cardio GPS en vivo (Live Activity distancia/ritmo/tiempo) — tras portar cardio.
8. Circuito/HIIT en vivo (intervalo + ronda + countdown) — tras portar circuitos.
9. Macros del día + botón "registrar comida" (widget interactivo) — tras portar nutrición.
10. Sueño (horas anoche / countdown a hora de dormir) — tras portar sleep.
11. Rutina lumbar quick-start — tras portar lumbar.
12. Sesión libre AI de un toque ("GENERA MI SESIÓN") — tras portar free session.

**Tier 3 — requieren backend/social en móvil o red en el widget**
13. Reto activo (posición + progreso + días restantes).
14. Leaderboard semanal mini / "te han pasado".
15. Amigos que ya entrenaron hoy (avatares con check).
16. Carrera: countdown + plan del día.
17. Notificaciones ricas accionables (resumen semanal, retos) — familia aparte de los widgets.

**Tier 4 — otra plataforma**
18. Apple Watch / Wear OS (complications + timer en muñeca) — proyecto propio.

## Fuera de scope v1

- Widgets interactivos (App Intents / acciones en el propio widget).
- Push updates de Live Activities (no hacen falta: la app está en foreground durante la sesión).
- Configuración de widgets por el usuario (elegir qué muestra cada tamaño).
- Web/PWA: sin equivalente.
