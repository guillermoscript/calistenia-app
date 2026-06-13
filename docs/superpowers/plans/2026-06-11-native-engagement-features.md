# Plan: Features de engagement en la app nativa (free session · social · share)

Fecha: 2026-06-11
Rama sugerida: `feat/native-engagement`
Objetivo: cerrar la brecha entre `apps/web` y `apps/mobile` en las 3 features de
mayor engagement — **sesión libre**, **social** y **compartir** — reutilizando al
máximo lo que ya existe en `packages/core` y el backend.

---

## Hallazgo clave (por qué esto es más barato de lo que parece)

El grueso del trabajo **ya está compartido**. La brecha es casi toda **UI nativa**
(pantallas/componentes RN), un par de **dependencias** y la **config de deep links**.
No hace falta backend nuevo.

| Feature | Backend | Data layer (`packages/core`) | Engine RN | UI nativa |
|---|---|---|---|---|
| Free session | ✅ `/api/generate-free-session` + colección `sessions` | ✅ catálogo, tipos, `markWorkoutDone` | ✅ ya acepta `source:'free'` | ❌ falta entrada |
| Social | ✅ colecciones completas | ✅ hooks completos (sin usar en mobile) | n/a | ❌ falta todo |
| Share | ✅ páginas públicas + OG de races | parcial | n/a | ❌ casi todo + deep links |

### Estado actual de mobile (qué ya hay)
Tabs: `index` (home), `history`, `library`, `nutrition`, `programs`, `profile`.
Rutas: `cardio`, `exercise/[id]`, `program/[id]`, `race/[id]`, `race-create`,
`races-discover`, `session`, `login`.

### Infra compartida ya lista (no reconstruir)
- **Engine de sesión:** `apps/mobile/src/contexts/ActiveSessionContext.tsx` ya define
  `type SessionSource = 'program' | 'free'` y
  `startSession(workout: Workout, workoutKey: string, source: SessionSource)`.
  `SessionView.tsx` **no** tiene guard contra `'free'`. La máquina de fases
  (`exercise → rest → note → celebrate → section-transition`) funciona igual.
- **Persistencia de sesión completada:** `useProgress().markWorkoutDone(workoutKey, note, warmupCooldown, …)`
  en `packages/core/hooks/useProgress.ts` — escribe a colección `sessions`. Mobile ya
  la usa vía `WorkoutContext`.
- **Catálogo de ejercicios:** `apps/mobile/src/lib/catalog.ts` ya aplana
  `packages/core/data/exercise-catalog.json` + colección `exercises_catalog`.
- **Hooks sociales (en core, sin usar en mobile):** `useActivityFeed`, `useFollows`,
  `useReactions`, `useComments`, `useCommentReactions`, `useLeaderboard`, `useChallenges`.
- **SSE en RN:** ya existe polyfill (lo usa el OAuth en `lib/auth.ts`).
- **Páginas públicas web (landing para shares):** `/u/:userId`, `/u/:userId/routine`,
  `/session/:date/:workoutKey`, `/race/:id` (con OG en `pb_hooks/race_og_tags.pb.js`),
  `/invite/:code`.

---

## FASE A — Share + deep links  *(tamaño: M · primero: máximo ROI viral)*

Razón de ir primero: loop viral más barato, reutiliza páginas públicas web como
landing y no depende de las otras features.

### A0. Dependencias
- `expo-sharing` (compartir archivos/imágenes)
- `react-native-view-shot` (capturar una vista RN estilada → PNG). **Esto reemplaza el
  canvas del web** y es mucho más simple que skia.
- `expo-linking` ya está instalado (deep links).
- Verificar compatibilidad con Expo SDK 56 antes de fijar versiones.

### A1. Helper de share nativo
- Nuevo `apps/mobile/src/lib/share.ts` espejando `apps/web/src/lib/share.ts`:
  - `shareText({ message, url })` → `Share.share` nativo.
  - `shareImage(pngUri)` → `expo-sharing`.
  - Builders: `shareWorkoutSession`, `sharePR`, `shareCardio`, `shareProfile`,
    `shareRace`, `shareReferral` (mismo copy/URLs que web, apuntando a las páginas
    públicas listadas arriba + código de referido).

### A2. Share cards (portar diseño de web a RN + view-shot)
Portar layout (no canvas) de:
- `apps/web/src/components/PRShareCard.tsx` → `apps/mobile/src/components/share/PRShareCard.tsx`
- `apps/web/src/components/WorkoutShareCard.tsx` → `…/WorkoutShareCard.tsx`
- `apps/web/src/components/cardio/CardioShareCard.tsx` → `…/CardioShareCard.tsx`
- (opcional) `RaceShareCard.tsx`

Patrón: componente RN estilado fuera de pantalla → `captureRef()` → PNG → `shareImage`.

### A3. Puntos de disparo (donde enganchar el share)
- **Fin de sesión** (fase `celebrate` en `SessionView.tsx`, línea ~887): botón "Compartir".
- **PR celebration:** portar `apps/web/src/components/PRCelebration.tsx` como overlay RN
  (los `PREvent` ya llegan a mobile vía `useProgress`/`SessionView`).
- **Streak milestone:** portar `apps/web/src/components/StreakMilestone.tsx` (7/14/30/60/100).
- **Race results:** ya hay `Share.share` básico en `RaceLobby`; subir a share card.

### A4. Deep links (multiplicador de engagement — hoy AUSENTE)
- `apps/mobile/app.json`: el `scheme: "calistenia"` ya existe. Añadir:
  - iOS: `ios.associatedDomains` = `["applinks:<DOMINIO_WEB>"]`.
  - Android: `android.intentFilters` para el host web (autoVerify).
- Publicar en el dominio web:
  - `/.well-known/apple-app-site-association` (appID + paths `/u/*`, `/session/*`, `/race/*`, `/invite/*`).
  - `/.well-known/assetlinks.json` (package + sha256 del cert).
- Config de `expo-router` linking: mapear esas URLs públicas → rutas de la app
  (ej. `/race/:id` web → `race/[id]` app), con fallback a store si no hay app.

### Aceptación Fase A
- Compartir desde fin de sesión genera PNG y abre hoja nativa de compartir (iOS+Android).
- Abrir un link `…/race/:id` en móvil con app instalada abre la app en esa race.
- Link compartido sin app → cae en la página pública web (ya existe).

---

## FASE B — Social  *(tamaño: M · data layer ya hecho, solo UI)*

Los hooks de `packages/core/hooks/` ya traen todo. Sin realtime (fetch-on-load, ok).
Colecciones PB existentes: `follows`, `feed_reactions`, `comments`, `comment_reactions`,
`notifications`, `challenges`, `challenge_participants`, `user_stats`, `sessions`, `users`.

### B1. Núcleo del loop social (prioridad alta)
- **Feed:** nuevo tab o pantalla `social.tsx` usando `useActivityFeed(userId)`
  (sesiones de seguidos + propias, paginado 20). Portar tarjeta de actividad del web.
- **Reactions:** barra de 5 emojis con `useReactions`. Portar `EmojiPicker.tsx`.
- **Comments:** bottom sheet con `useComments` + `useCommentReactions` (replies 1 nivel).
  Portar `apps/web/src/components/social/CommentsSheet.tsx` a RN (usar
  `@gorhom/bottom-sheet` o el sheet ya presente en `components/ui`).

### B2. Amigos (prioridad media)
- Pantalla `friends.tsx`: `useFollows` (following/followers, follow/unfollow).
- Add-friend (buscar por `username`/`display_name` en `users`).
- Portar referencia: `apps/web/src/pages/FriendsPage.tsx`, `AddFriendPage.tsx`.

### B3. Leaderboard + Challenges (prioridad media-baja)
- `leaderboard.tsx`: `useLeaderboard` (10 categorías: sesiones semana/mes, streak, XP, PRs).
- `challenges.tsx`: `useChallenges` (listar/unirse; crear puede esperar).

### B4. Notificaciones
- Pantalla de notificaciones leyendo colección `notifications` (tipos `reaction`,
  `comment`, `comment_reply`). `expo-notifications` ya instalado para push.
- Badge en tab (reusar lógica de `NotificationBadge.tsx`).

### Aceptación Fase B
- Feed muestra actividad de seguidos; reaccionar y comentar persiste y refleja al recargar.
- Seguir/dejar de seguir funciona; aparece en feed.
- Leaderboard y challenges renderizan datos reales de los hooks.

---

## FASE C — Free session  *(tamaño: L · engine listo, falta entrada + AI)*

El engine y la persistencia **ya funcionan** (ver "Infra compartida"). Falta construir
la pantalla que arma un `Workout` y llama
`startSession(workout, 'free_' + Date.now(), 'free')`, y al terminar
`markWorkoutDone('free_'+ts, …)` (ya pasa por la fase `celebrate`).

### C1. Picker manual  *(enviar primero — 80% del valor, esfuerzo M)*
- Nueva ruta `apps/mobile/src/app/free-session.tsx` + entrada (botón en home/programs).
- Buscar/filtrar `exercises_catalog` vía `lib/catalog.ts` (categorías push/pull/legs/
  core/lumbar/skill/movilidad + equipo).
- Cola editable (añadir/quitar/reordenar) → construir `Workout` → `startSession(..., 'free')`.
- Referencia: `apps/web/src/pages/FreeSessionPage.tsx` (tab manual) + `SessionPreview.tsx`.

### C2. Prompt warm-up / cool-down
- Modal que ofrece plantillas de `packages/core/data/stretch-templates.ts` según tipo de día.
- Referencia: `WarmupCooldownPrompt` del web. (Datos ya soportados por
  `WarmupCooldownData` en el context.)

### C3. Tab IA  *(la pieza más pesada — puede ir en segundo PR)*
- Llamar `POST ${AI_API_URL}/api/generate-free-session` con
  `{ messages, userContext: { goal, level, equipment, location, availableTime, age?, weight?, height?, sex? } }`.
- Parsear stream SSE y la tool `create_session` → `{ exercises, exercise_count, invalid_ids? }`.
  Usar el polyfill SSE existente.
- Pre-llenar `userContext` desde `users` + `nutrition_goals` (como en `SessionForm.tsx`).
- Resolver IDs IA contra el catálogo local → preview editable → `startSession(..., 'free')`.
- Referencia: `apps/web/src/components/free-session/{AISessionTab,SessionForm,SessionPreview}.tsx`
  y backend `mcp-server/src/api/free-session-generator.ts`.

### Aceptación Fase C
- Picker manual: armar sesión, correrla en `SessionView`, completar, y verla en `history`
  con `workout_key` `free_*`.
- Tab IA: generar sesión, refinar ("más core"), iniciar.

---

## Riesgos / decisiones de arquitectura (revisar antes de mergear)
1. **Streaming SSE en RN (C3):** confirmar que el polyfill maneja el stream del
   endpoint nuevo, no solo el de auth. Si da problemas, fallback a respuesta no-streaming.
2. **`react-native-view-shot` + fuentes custom (Bebas/DM Sans/Mono):** asegurar que las
   fuentes cargan antes de capturar el PNG (si no, cae a system font). Recordatorio de
   memoria: no usar `font-bold` con fuentes custom.
3. **Deep links:** AASA/assetlinks deben servirse desde el dominio web real con el appID
   y sha256 correctos; verificar tras deploy (no se puede testear solo en dev).
4. **Privacidad del feed:** confirmar reglas de lectura de `sessions`/`follows` antes de
   exponer actividad ajena en mobile (auditar `listRule`/`viewRule`).
5. **`SessionView` con `source:'free'`:** verificar que no asume metadata de programa
   (día/fase) en ninguna rama; añadir guards donde aplique.

---

## Orden recomendado
1. **Fase A (Share + deep links)** — viral, barato, independiente.
2. **Fase B1 (Feed + reactions + comments)** — loop social con hooks ya listos.
3. **Fase C1 (Free session manual)** — utilidad/retención, esfuerzo medio.
4. **Fase B2–B4** (amigos, leaderboard, challenges, notifs).
5. **Fase C3 (Tab IA)** — la pieza más pesada, al final.

Resumen de esfuerzo: 2×M + 1×L, casi todo UI. Backend y data layer ya existen.
