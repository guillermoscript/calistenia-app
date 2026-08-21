# Auditoría de calidad de código — calistenia-app (2026-08-15)

Solo lectura. Ningún fichero del código fue modificado. 16 agentes en paralelo (Opus para core, duplicación cross-app, composición, backend y sesión móvil; Sonnet para el barrido por feature), cada uno con un paquete de trabajo cerrado y las guías de referencia cargadas (`vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-native-skills` + SoC / DRY / SOLID / KISS / spaghetti). Yo he cruzado los 16 informes y **he re-verificado a mano en el código cada hallazgo marcado con ✅** antes de incluirlo aquí. Los informes completos por área (con `file:line` y evidencia citada para cada hallazgo, ~300 en total) están en `agents/`.

---

## 1. Resumen ejecutivo

**Nota global: C+ / B−.** Los cimientos son buenos: `packages/core` es un paquete compartido serio (78 hooks, ~110 módulos de lib, la mayoría con tests, `platform.ts` bien invertido, factoría `qk` de query keys usada de verdad —0 literales `queryKey:` en web, 1 en móvil—, locales en sincronía perfecta 4331/4331). El problema no es la falta de abstracciones, sino que **la capa de orquestación de sesión/realtime nunca se migró a core y las apps se saltan repetidamente abstracciones que core ya exporta**. Resultado medido: **~2.800-3.000 líneas de lógica de negocio agnóstica de plataforma viven en `apps/*`, 330 de ellas byte-idénticas entre web y móvil**, y esa duplicación **ya ha producido divergencias de comportamiento reales en producción** (ver §2).

| Área | Nota | Diagnóstico en una línea |
|---|---|---|
| Web · sesión/entreno | C+ | Contextos y `SessionView` son clones del móvil mantenidos a mano; timers hand-rolled con `usePausableCountdown` ya en core |
| Web · programas/ejercicios | C+ | `inferCategory()` ×3 y `mapPBRecord()` ×2 **ya divergidos**; `ProgramEditorPage` 933 L cuando móvil ya lo partió en steps |
| Web · nutrición/despensa | B− | `MealLoggerContent` 1.441 L; ~9.855 L de `ai-elements` vendorizadas y casi muertas; motor canvas dentro de un componente |
| Web · social/retos | B+ | Arquitectura hooks-first consistente; un bug real de medallas y dos páginas outlier con fetch inline |
| Web · dashboard/perfil/progreso | C+ | Recordatorios triplicados web/móvil/scheduler; onboarding duplicado literal; `ProfilePage` 840 L con I/O de PB inline |
| Web · cardio/carreras/landing | B− | Landing ejemplar; cardio no usa `processCardioFix` de core (móvil sí); **restos de debug en producción** |
| Móvil · sesión/entreno | C+ | `buildSteps` ×3 con divergencia real; `SessionView` 1.128 L; sin un único dueño del estado de sesión |
| Móvil · nutrición/despensa | B− | `nutrition.tsx` 1.100 L reimplementa `useMealLoggerActions` que existe para eso; god hook de 603 L |
| Móvil · social/batallas/carreras | B− | Ranking crudo en vez de `battleDisplayRanks()` (empates mal); `lib/race/*` byte-idéntico a web |
| Móvil · home/perfil/onboarding/ui | C+ | `reminders.tsx` 1.165 L clon del web; `@gorhom/bottom-sheet` montado y sin usar; tabs JS en vez de nativas |
| Core · hooks | B− | 59/70 vía TanStack Query (bien); god hooks (`useProgress` 869 L); **bucle infinito de refetch** en `useChallenges`; filtros PB interpolados |
| Core · lib/data/types | B | Lógica pura y disciplinada; catálogo de 3,3 MB importado estáticamente (chunk de 2,6 MB) e indexado 3 veces |
| Backend · pb_hooks/migraciones/mcp-server | C+ | Un hook rompe la cadena `e.next()`; fan-out de push síncrono en un hook de escritura; mcp-server sin capa de datos (167 llamadas PB en tools) y con fórmula TDEE divergida de core |
| Composición de componentes (web+móvil) | C | 11 primitivos «shadcn» de web son stubs `<div>` con `any`; web sin variantes `lime`/`danger`; `SessionView` web recibe 26 props con el provider ya montado |
| Duplicación cross-app (web↔móvil↔core) | C+ | Cimientos A, disciplina de frontera D |
| Higiene de repo / tooling | C+ | Web `strict:false` (498 `any` vs 68 móvil); core sin `tsconfig`; web sin ESLint pero con 31 `eslint-disable` |

---

## 2. Bugs reales encontrados de paso (verificados por mí ✅)

La auditoría era de smells, pero la duplicación y la falta de separación han dejado defectos observables. Ordenados por impacto en usuario:

| # | Bug | Dónde | Causa raíz (smell) |
|---|---|---|---|
| B1 ✅ | **Bucle infinito de refetch** de retos para participantes no creadores: el efecto de auto-cierre hace `update()` (403 silenciado), `expiredIds` es un array nuevo en cada fetch y siempre invalida → query→efecto→invalidate→… | `packages/core/hooks/useChallenges.ts:173-198` | Escritura dentro de `useEffect` + `eslint-disable` que oculta la dep `qc` |
| B2 ✅ | `sets: 0` produce **1 paso en móvil y 0 en web** | `apps/mobile/src/lib/session-machine.ts:16` vs `apps/web/src/components/SessionView.tsx:59-62` | `buildSteps` triplicado (tercera copia en `web/contexts/ActiveSessionContext.tsx:282` con comentario «debe coincidir con…») |
| B3 ✅ | **Empates en batallas se pintan como #2/#3** en marcador vivo, pantalla de espera e historial; solo `BattleResults` usa `display_rank` | `apps/mobile/src/components/battle/BattleStandingsList.tsx:189`, `BattleFinishedWaiting.tsx:61-65`, `useBattleHistory.ts:55` | `battleDisplayRanks()` existe en core pero solo lo consumen `BattleResults` y la share card |
| B4 ✅ | Panel rojo `[v2] {debug}` con coordenadas GPS crudas **visible para todos los usuarios**; tag `build-v3` en el título de la página CARDIO | `apps/web/src/components/race/RouteDrawer.tsx:289-292`; `apps/web/src/pages/CardioSessionPage.tsx:152` | Restos de depuración («can remove later») |
| B5 ✅ | Medallas 🥇🥈🥉 **nunca se pintan** en la web (Leaderboard + widget): `MEDALS = ['', '', '']` (bytes verificados: cadenas vacías) | `apps/web/src/pages/LeaderboardPage.tsx:12`, `components/friends/LeaderboardWidget.tsx:5` | Constante duplicada 6× (4 correctas, 2 rotas) |
| B6 ✅ | Las 7 claves de storage de sesión activa (`calistenia_strength_active`, `_cardio_active`, `_cardio_unsaved`, `_circuit_active`, `_circuit_unsaved`, `_free_session_queue`, `_lumbar_checks`) **no están en `USER_SCOPED_STORAGE_KEYS`** → una sesión activa/no guardada sobrevive a un cambio de cuenta | `packages/core/lib/storage-keys.ts` vs los 4 contextos web+móvil | Claves declaradas ad-hoc en apps saltándose el registro que el propio fichero exige («IMPORTANTE: agrégala aquí») |
| B7 ✅ | `referral_side_effects.pb.js` **nunca llama a `e.next()`** (0 ocurrencias; el resto de hooks sí) → el día que otro fichero registre un hook sobre `referrals` morirá en silencio (el patrón #412 documentado en `workout_stats.pb.js:21-27`) | `pb_hooks/referral_side_effects.pb.js:11-93` | Cadena de hooks rota |
| B8 ✅ | Los 3 pushes de batalla llaman a `sendPush()` **sin `actorId`** → el guard de bloqueo no se aplica y el nombre del otro usuario va en el título (la fuga que #386 cerró) | `pb_hooks/utils/battles.js:569-575, 593-599, 658-664` | Contrato de la firma no forzado |
| B9 ✅ | Reacción/comentario sobre una sesión de **circuito no notifica a nadie**: el servicio de notificaciones inlinea la cascada `sessions→cardio_sessions` 3 veces sin `circuit_sessions`, mientras `utils/blocks.js:64` ya tiene `findSessionOwner` con las 3 | `pb_hooks/notification_service.pb.js:103-114, 188-195, 202-206` | Helper reimplementado inline |
| B10 ✅ | El tool `cal_calculate_macros` del asistente **reimplementa la fórmula TDEE de core con constantes distintas** (déficit −400 vs −500×pace, recomp mantenimiento vs −200, proteína 1,6 vs 1,8) y **escribe en la misma colección `nutrition_goals`** que lee la app | `mcp-server/src/tools/smart.ts:993-1041` vs `packages/core/lib/nutritionGoal.ts:66-91` | Fork; mcp-server no depende de `@calistenia/core` |
| B11 | Web **no usa `processCardioFix()`** de core (móvil sí): dos copias inline, una sin manejo de gap/jitter, constantes ya divergiendo | `apps/web/src/contexts/CardioSessionContext.tsx:277-373` vs `packages/core/lib/cardio-fix.ts` | El docblock de core dice «lo usan móvil *y la web*» — falso |
| B12 | `SharedProgramPage` (landing pública, sin login) **no pasa `name`/`description`/`exercise_name` por `localize()`** → `[object Object]` para campos `TranslatableField` en forma objeto | `apps/web/src/pages/SharedProgramPage.tsx:89-118` | Fetch de detalle de programa cuadruplicado (core lo tiene privado, no exportado) |
| B13 | `mapPBRecord()` duplicado con prioridades distintas: la versión del detalle **omite `difficulty`** | `apps/web/src/pages/ExerciseDetailPage.tsx:210-228` vs `ExerciseLibraryPage.tsx:252-269` | DRY |
| B14 | Identidad del catálogo: 3 campos distintos en 5 sitios; `LogWorkoutPage.tsx:73-76` documenta que usar `rec.id` «fragmenta el historial en silencio» y `FreeSessionPage.tsx:153` + `useExerciseCatalog.ts:39` hacen exactamente eso | 5 ficheros web | DRY |
| B15 | Cola de circuitos sin guardar re-`create()` a ciegas sin `client_id` → duplicados cuando el fallo fue «sin respuesta» (`status: 0`) — el hazard que `core/lib/offlineQueue.ts` documenta y resuelve (#301) | `apps/mobile/src/contexts/CircuitSessionContext.tsx:419-425` (y clon web) | Abstracción de core ignorada |
| B16 | Suscripción realtime de notificaciones **se filtra** por race async subscribe/unsubscribe (login→logout→login acumula listeners del usuario anterior) | `packages/core/hooks/useNotifications.ts:172-185` | Cleanup sin flag `cancelled` |
| B17 | `saveProgram` borra fases/días/ejercicios y los recrea **uno a uno sin transacción** (~190 round-trips); un fallo a mitad deja el programa vaciado | `packages/core/hooks/useProgramEditor.ts:507-627` | Correctness + `async-parallel` |
| B18 | Filtros PB con **interpolación cruda** en `useProgress.ts:678`, `useReactions.ts:100`, `useComments.ts:28`, `useRacePRs.ts:55,131`, `AdminPage.tsx:69` y 10 sitios en pb_hooks (`utils/blocks.js:17`, `utils/notifications.js:210-211`…), mientras los ficheros vecinos usan `pb.filter()`/`{:param}` | varios | Inconsistencia |
| B19 | Re-verificación del token fantasma (#254) es **web-only**: `typeof document` la convierte en no-op silencioso en RN; `CorePlatform` no tiene adaptador de foreground/AppState | `packages/core/hooks/useAuth.ts:162-168` | DIP: falta el slot `lifecycle` en `platform.ts` |
| B20 | `useProgress`: `qk.sessions()` en la lista de deps devuelve un array nuevo → **todos los `useCallback` del hook se rehacen en cada render** (`useNutrition.ts:161-166` ya lo arregló y dejó el comentario) | `packages/core/hooks/useProgress.ts:335,419,450,461,860` | `rerender-dependencies` |

---

## 3. Patrones sistémicos (lo que se repite en todas las áreas)

### 3.1 Separación de responsabilidades: la lógica de negocio se queda en la pantalla
- **`pb.collection(` en las apps**: web 91 llamadas / 32 ficheros, móvil 71 / 18 (core 387). Los outliers son siempre los mismos: `UserProfilePage.tsx:87-205` (5 fetches secuenciales en un `useEffect`) y su gemelo `app/u/[id].tsx:98-160` (waterfall sin `Promise.all`), `InviteLandingPage.tsx:60-156`, `RoutineViewPage.tsx:72-159`, `ProfilePage.tsx` (7 llamadas inline, 24 `useState`), `profile.tsx` móvil, `nutrition.tsx:279-301` móvil, `app/program/[id].tsx` móvil (`any` + 4 `catch {}` silenciosos), `OnboardingFlow.tsx` en ambas apps (5 handlers de guardado idénticos).
- **God components/screens** (SRP): `MealLoggerContent.tsx` 1.441 L, `SessionView.tsx` web 1.336 / móvil 1.128 (6 useState + 8 useRef + 3 shared values + 7 useEffect + 5 componentes en un fichero), `reminders.tsx` 1.165, `nutrition.tsx` 1.100, `ProgramEditorPage.tsx` 933, `RemindersPage.tsx` 907, `ProfilePage.tsx` 840, `CardioSessionContext.tsx` web 749 (5 concerns: persistencia, cola, wake lock, GPS, timer) / móvil 683 (`value` sin memoizar a 2 Hz; `RaceContext` sí lo memoiza y lo comenta), `CommentsSheet.tsx` 708.
- **God hooks en core**: `useProgress` 869 L / 17 miembros públicos / 47 `any` / 9 catches silenciosos; `useProgramEditor` 668; `useNutrition` 640; `use-meal-logger.ts` móvil 603 (cámara + EXIF + IA + edición + guardado + analytics).
- **Cálculo en JSX**: IIFEs en `DashboardPage.tsx:310-389`, `nutrition.tsx:689-762`, `PantryPlanSection.tsx:158-181`, `WeeklyMealPlan.tsx:454-471`.

### 3.2 DRY: tres capas de duplicación
1. **Web ↔ móvil byte-idéntico o casi** (mapa completo en `agents/cross-app-dry.md`): `lib/race/{raceApi,raceRealtime,errors}.ts` 100 % (330 L, ✅ `cmp` sin diferencias), `detectDayType` 100 %, `use-pantry-depletion.ts` 93 %, `CircuitSessionContext` 92 %, `RaceContext` 89 %, `WorkoutContext` 88 %, `ActiveSessionContext` 80 %, `raceTracker` 78 %, `OnboardingFlow` 68 %, `CardioSessionContext` 67 %, `EmojiPicker` 63 %, `CircuitBuilder` 52 %. Además: recordatorios (`RemindersPage` ↔ `reminders.tsx` ↔ `reminder-scheduler.ts`), TheMealDB fetch+scoring (`recipe-detail.tsx` ↔ `RecipeDetailDialog.tsx`), loader de perfil público, `parseNum` ×8, `BASE_URL='https://gym.guille.tech'` en 5+ ficheros web y también en móvil, `MEDALS` ×6, `MILESTONES` de racha con persistencia incompatible.
2. **Dentro de la misma app**: `inferCategory()` ×3 (web), `mapPBRecord()` ×2, fetch de detalle de programa ×4 (una copia privada en core `usePrograms.ts:219-233` sin exportar), MM:SS ×5 en web pese a `formatCountdown` en core, `relativeTime()` ×2 pese a `timeAgo` en core, `workoutKey → título` ×3 en móvil (con 2 claves i18n distintas), búsqueda de catálogo ×3 en móvil (una es el hook compartido que nadie usa en `library.tsx`), Wake Lock ×3 en web, `Confetti` copiado con comentario que lo admite, `flushUnsaved` definido y luego reimplementado inline en el efecto de montaje (mismo fichero, web y móvil), `handleRetryLoad` = efecto de montaje en `FreeSessionPage`, 8 rutas de `battle_api.pb.js` con el mismo envelope de 12 líneas, 14 sitios `generateObject/Text` en mcp-server con el mismo sobre.
3. **App ↔ core (abstracción existente ignorada — el peor caso)**: `usePausableCountdown` (web `RestTimer`, `Timer` —con drift real por `setInterval` decreciente—, `RestScreen`), `processCardioFix`, `battleDisplayRanks`, `useMealLoggerActions` (documentado «usado por móvil», móvil no lo usa), `offlineQueue`, `formatCountdown`, `timeAgo`, `moveItem` (`CircuitBuilder` móvil reimplementa `moveExercise`), `progressUtils`, `storage-keys`, `style-tokens` (mapas de color/label sombra), `calcMacros` (`EditMealSheet` lo hand-rollea).

### 3.3 SOLID
- **OCP**: `PostWorkoutActions.tsx:202-259` móvil — config-driven al construir pero `switch` a mano al renderizar, `default` pinta «repetir» para cualquier id desconocido; `snapshotOf` en `utils/battles.js:677-683` hace N+1 lookups de usuario en cada tick del marcador.
- **ISP / prop drilling**: `ActiveSessionPage.tsx:76-101` lee 13 valores de `useActiveSession()` y los pasa como 26 props a `SessionView`, que los baja dos niveles más a `CelebrateScreen → PostWorkoutActions` con el provider ya montado (`state-lift-state`). `ActiveSessionContext` móvil expone identidad + progreso en un solo `useMemo` → `ActiveSessionBar`, `ActiveBattleBar` y Home se re-renderizan en cada serie (`state-context-interface`).
- **DIP**: `User` en `core/types/index.ts:203-209` no tiene `referral_code`/`display_name` → `(user as any)` ×5 solo en cardio; `RouteDrawer.tsx:166,236` cuela un `ResizeObserver` por `(map as any).__ro`; `lib/health/bridge.ts`+`sync.ts` con ~23 `any`; mcp-server sin capa de datos (167 `pb.collection` en 12 ficheros de tools, 85 tools) ni dependencia de `@calistenia/core`.
- **SRP en backend**: `utils/battles.js` 1.099 L / 55 exports (estado, validación, scoring, serialización, 3 notificadores, tokens de invitación, idempotencia, expiración, transacciones, mapeo HTTP).

### 3.4 KISS / código muerto
- `apps/web/src/components/ai-elements/`: 45 de 48 ficheros (~9.000-9.855 L) sin importar por nadie; concentran gran parte de los 498 `any` de web (`prompt-input.tsx` 33, `commit.tsx` 22…). Nutrición hand-rollea su propio chat en vez de usarlos.
- 11 primitivos «shadcn» de `apps/web/src/components/ui/` (`select`, `dropdown-menu`, `popover`, `hover-card`, `command`, `accordion`, `collapsible`, `carousel`, `avatar`, `input-group`, `switch`) son `<div className={cn("", className)}>` tipados `any` tras `forwardRef` (✅ `select.tsx` verificado); 10 sin importadores; `spinner` se importa 2 veces y renderiza un div vacío invisible.
- `@gorhom/bottom-sheet`: `BottomSheetModalProvider` montado en `_layout.tsx:18,71` con **cero consumidores** (✅ grep) y contradiciendo el propio `apps/mobile/CLAUDE.md` («no gorhom» por MIUI).
- `reminder-scheduler.ts` web: cabecera «LEGADO, solo se usa para LIMPIAR», solo `cancelAllScheduled` se llama; 180 líneas muertas.
- 15 exports de `core/lib` con cero consumidores confirmados (`METRIC_LABELS` @deprecated + su reemplazo `getMetricLabels()` — ninguno usado; `METRIC_UNITS`…), lista en `agents/core-lib.md`.
- `apps/web/src/components/onboarding/state.ts` reimplementa `core/lib/onboarding-state.ts` con **otro esquema de claves** de localStorage; móvil usa core.
- Clusters de `useState` que son un reducer: `ProfilePage` 24, `CalendarPage.tsx:61-69` 9 slices por fecha rellenados en una sola llamada, `NutritionGoalSetup` 9, `CircuitBuilder` móvil 7.
- Derivación en `useEffect` en vez de en render: `program-editor.tsx:58-60`, `program/[id].tsx:39,122-125` (`discipline` se guarda mal y se parchea después), `ExerciseCard.tsx:51,86-111` web (`setsLogged` nunca se reconcilia con `logs` → 0/N tras remontar).

### 3.5 Spaghetti / consistencia
- **i18n**: ficheros enteros sin `t()` — `InviteLandingPage`, `InstallPrompt`, `ProgramSelectorModal`, `WgerResultCard`, `SharedLanding` (la landing pública más visible), `CoachPanel`; y ~20 literales en español sueltos en ficheros que sí usan `t()` en las 4 áreas de UI. El guard #445 (`usage.test.ts`) escanea `t('…')` y **no ve nodos de texto JSX crudos**, así que este hueco es estructural. Presets de batalla hardcodeados a `.name.es` aunque existe `{es,en}`. `toLocaleDateString('es')` fijo en `UserProfilePage.tsx:547`.
- **Silent catches**: 145 en core/hooks; `catch {}` que oculta fallos reales de captura de share (`NutritionShareButton.tsx:186-188`); `Linking.openURL().catch(() => {})`.
- **`any`**: 498 web / 247 core / 87 mcp-server / 68 móvil (tabla en `agents/repo-hygiene.md`).
- **`window.confirm()`** para bloquear usuario y unirse a preset (`UserProfilePage.tsx:325`, `ChallengesPage.tsx:57`) — el que congela Chrome (memoria #345).
- **Fix aplicado a medias**: `FriendsPage.tsx:94-104` quitó `document.execCommand` con comentario «[M1 fix]»; `ReferralsPage.tsx:188-198` conserva la copia. Mismo patrón con `useNutrition` (deps memoizadas) vs `useProgress` (no), `RaceContext` (value memoizado) vs `CardioSessionContext` (no), `NutritionDashboard.MealCard` (memo + callbacks estables) vs `saved-recipes.tsx:147-154` / `PantryTable.tsx:97-104` (memo anulado por closures nuevas).
- **3 arrays de navegación** hand-mantenidos en `App.tsx` (`NAV_ITEMS`/`MOBILE_TABS`/`NAV_SECTIONS`) + dos `*RestoreNavigator` idénticos.

### 3.6 Rendimiento React / RN (reglas Vercel citadas)
- `rerender-lazy-state-init`: `useRef(buildSteps(...)).current`, `useRef(new ExerciseTimingTracker(...))`, `useRef(loadFromStorage()).current` en `SessionView.tsx:743-793`, `ActiveSessionContext.tsx:126`, `CircuitSessionContext.tsx:173` móvil — el argumento se evalúa **en cada render** (rebuild de pasos + `JSON.parse` del workout persistido en cada serie).
- `rerender-memo` / `list-performance-inline-objects`: `getExerciseLogs()` devuelve `slice()` nuevo → `memo(ExerciseScreen)` inútil (`SessionView.tsx:1041` + `useProgress.ts:753-756`).
- `list-performance-*`: `renderItem` inline sin fila memoizada en `history.tsx:186-231` (45 L, `titleFor` ×2 por fila), `free-session.tsx:385-416/471-493` (lista de ~1.5k del catálogo), `social.tsx:221-231`, `CommentsSheet.tsx:363-403`, `ShoppingListView.tsx:251-316` (cada tecla del input re-renderiza todas las filas); `keyExtractor` con índice en `history.tsx:78`; `library.tsx:200` lo hace bien y es el modelo.
- `bundle-*`: `exercise-catalog.json` (3,3 MB / 71 k líneas) importado estáticamente en `catalogMedia.ts:11`, `resolveExerciseId.ts:15`, `variants.ts:9`, ~5 páginas web y `mobile/lib/catalog.ts`; chunk `exercise-catalog-*.js` de **2,6 MB** en `apps/web/dist`; y **3 módulos lo re-aplanan e indexan por separado** al cargar. `library.tsx:34-57` filtra ~1.5k ítems con `localize()` ×2 por tecla sin debounce.
- `navigation-native-navigators`: `(tabs)/_layout.tsx` usa Tabs JS de expo-router. `react-state-minimize`: `circuit.tsx:56,69-80` re-renderiza toda la pantalla cada segundo por un reloj. `rerender-move-effect-to-event`: 3 `useEffect` consecutivos con la misma dep para 3 sonidos (`circuit.tsx:84-103`, «uno por useEffect, como en web»).
- `async-parallel`: waterfalls en `u/[id].tsx:98-160`, `saveProgram`, `insight` generators.
- Fan-out de push **síncrono** dentro de `onRecordAfterCreateSuccess`: hasta 500 seguidores × (2 queries + save + `$http.send` timeout 10 s) manteniendo abierta la petición de creación (`utils/notifications.js:187-201`).

### 3.7 Tooling que permite todo lo anterior
- `apps/web/tsconfig.json:8` `strict: false` (móvil `true`) → 498 vs 68 `any`.
- `packages/core` **sin `tsconfig.json` ni script `typecheck`**: solo se comprueba transitivamente bajo dos regímenes de strictness distintos.
- Web **sin ESLint** (0 deps) pero con **31 `eslint-disable`** muertos; `ci.yml:29` lo reconoce.
- mcp-server con `package-lock.json` propio + `npm ci` fuera del `pnpm-lock.yaml`; `typescript` ^5.9 vs ~6.0 (móvil), `vitest` ^4 vs ^3 (mcp-server).
- Tests: core 43 % ficheros test/src (bien), web 12 %, mcp-server 5 % (`tools/` 0 tests, 22/26 `api/` sin tests), móvil 3 %.
- `apps/mobile/google-services.json` trackeado con API key de Firebase (Medio: es config de cliente, no un secreto de servidor; el adminsdk sí está ignorado); ~10 dumps de Playwright/logs/seeds sueltos en la raíz.

---

## 4. Plan priorizado (impacto × facilidad)

**Nivel 0 — bugs de una tarde (arreglar ya):** B4 (borrar debug), B5 (`MEDALS`), B7 (`e.next()`), B8 (`actorId`), B9 (`findSessionOwner`), B1 (gate del invalidate + set de ids intentados), B16 (flag `cancelled`), B18 (`pb.filter`/`{:param}` en los ~15 sitios), B20 (`useMemo(qk.sessions)` como en `useNutrition`), B6 (añadir las 7 claves al registro), `@gorhom` fuera.

**Nivel 1 — extracciones mecánicas a core (1-2 días, cierran bugs reales):**
1. `lib/race/{raceApi,raceRealtime,errors}.ts` → `core/lib/race/` (byte-idéntico; el precedente `raceClock.ts → serverClock.ts` con shim ya está hecho).
2. Web adopta `processCardioFix` (B11).
3. `use-pantry-depletion.ts`, `detectDayType`, TheMealDB scoring, `parseNum`, `MEDALS`, `BASE_URL`, `MILESTONES` → core.
4. `buildSteps` + `session-machine.ts` → core (B2); `formatCountdown`/`usePausableCountdown` en `RestTimer`/`Timer`/`RestScreen`.
5. Exportar `fetchProgramDetail` de `usePrograms.ts` y usarlo en los 4 sitios (B12); `inferCategory` + `mapPBRecord` únicos (B13/B14).
6. `useMealLoggerActions` en `nutrition.tsx` móvil; `battleDisplayRanks` en standings/waiting/history (B3).
7. mcp-server: importar `calculateMacros` de core (B10) y parametrizar `buildInsightContext(tz, pb)`.

**Nivel 2 — descomposición de god components (por feature, con test de humo):** `SessionView` (web+móvil) → `components/session/*` + reducer sobre `session-machine`; `MealLoggerContent`; `nutrition.tsx`; `ProgramEditorPage` → steps como móvil; `ProfilePage`/`profile.tsx` → hook `useProfileForm`; `RemindersPage`/`reminders.tsx` → `core/hooks/useReminderTimeline`; `useProgress` → `useProgress` + `useProgressMutations` + `usePRs`; `CardioSessionContext` → `useSessionPersistence`/`useUnsavedQueue`/`useWakeLock`/`useGpsTracking`.

**Nivel 3 — cambio de arquitectura (después de 1-2):** añadir `lifecycle` (foreground/background) a `CorePlatform` y mover los 4 contextos de sesión (Active/Circuit/Cardio/Race, ~1.600 L duplicadas) a una capa compartida en core con `storage` + `lifecycle` inyectados; cierra también B19. Capa de datos (`api/repos/*`) + `runStructuredGeneration()` en mcp-server y dependencia de `@calistenia/core`.

**Transversal (tooling, para que no vuelva a pasar):** `strict: true` en web (aunque sea con allowlist), `tsconfig` + `typecheck` en core, ESLint en web (o borrar los 31 `eslint-disable`), extender el guard i18n a nodos de texto JSX crudos, `import()` dinámico del catálogo (o `bundle-conditional`), borrar `ai-elements` sin usar y los 11 stubs de `ui/`, alinear `typescript`/`vitest`, mover mcp-server a pnpm.

---

## 5. Lo que está bien (para no tirarlo)
- `packages/core` como paquete: `platform.ts` (casi cero fugas de `window`/`AsyncStorage`), `qk` de query keys respetado, locales en lockstep, tests colocalizados, presets table-driven (`challenge-presets`, `battle-presets`, `circuit-presets`), `battle.ts` con tie-break documentado por issue, `cardio-fix.ts`, `offlineQueue.ts`, `storage-keys.ts` (el registro existe, solo falta usarlo).
- Ejemplos de referencia dentro del repo para cada refactor propuesto: `SleepPage` (vista fina sobre `useSleep`), `PantryPage`/`ShoppingListView` web, `CalendarPage` (reutiliza `fetchMonthActivity`), `CircuitView.tsx:100-109` (usa `usePausableCountdown` con comentario #402), `library.tsx:200` (fila memoizada), `NutritionDashboard.MealCard`, `RaceContext` (value memoizado y comentado), `useNutrition` (deps memoizadas con el porqué), `mobile/ui/text.tsx` + `button.tsx` (composición con `use()`, variantes CVA), `web/ui/kicker.tsx`, `components/landing/*` (composición de calidad de referencia), `App.tsx` (lazy routes + preload idle de Leaflet), `lib/auth.ts`/`avatar.ts` móvil, `image-upload.ts`, `style-selfcheck.ts` + `metro.config.js` (fixes en la capa correcta de incidentes reales), FriendsPage (a11y de teclado real), pb_hooks disciplinados con las gotchas del JSVM y 21 suites de test, migraciones con rollback (179/195) e ids de campo preservados, `.gitignore` + gitleaks en CI, `.strict()` en todas las entradas de mcp-server.

---

## 6. Método e índice
- Cada agente recibió el mismo paquete (`PREAMBLE.md`): objetivo, guías a leer primero, método (leer los ficheros más grandes enteros, grep de patrones en el resto), formato (cada hallazgo con `file:line` + cita + categoría + dirección de fix), condiciones de parada. Modelos: Opus en `core-hooks`, `cross-app-dry`, `composition`, `backend`, `mobile-training`; Sonnet en el resto.
- Yo re-verifiqué a mano en el código los 10 hallazgos ✅ de §2 y los stubs de `ui/`, `@gorhom`, `strict`, `tsconfig` de core y ESLint de web; el resto se apoya en la evidencia citada por cada agente (visible en su informe).
- Informes por área en `agents/`: `web-training`, `web-programs`, `web-nutrition`, `web-social`, `web-dashboard`, `web-cardio-landing`, `mobile-training`, `mobile-nutrition`, `mobile-social-battle`, `mobile-home-profile`, `core-hooks`, `core-lib`, `backend`, `cross-app-dry` (mapa de gemelos + tabla de `pb.collection` por fichero + ranking de extracciones), `composition` (tabla componente/booleanos/forwardRef/veredicto), `repo-hygiene` (matrices de tooling, marcadores y versiones).
