# Bloquear usuarios — Diseño

**Fecha:** 2026-07-14
**Estado:** Aprobado por Guillermo (enforcement server-side completo, incluye leaderboard y retos)

## Objetivo

Bloqueo de usuarios estilo red social estándar: al bloquear a alguien se deja de seguir mutuamente y desaparece toda su actividad para ti (y la tuya para él) — feed, comentarios, reacciones, leaderboard, retos y notificaciones — con enforcement en el servidor (reglas API de PocketBase + hooks), no solo filtrado en cliente. Aplica a web y mobile.

## Contexto actual (verificado 2026-07-14)

- No existe ninguna funcionalidad de bloqueo (greenfield).
- `follows` (`pb_migrations/1774000032_created_follows.js`): `follower`/`following`, índice único por par. Hook core `packages/core/hooks/useFollows.ts`.
- Feed 100% dirigido por el cliente: `packages/core/hooks/useActivityFeed.ts` lee `follows` y luego `sessions` + `cardio_sessions` de `[yo, ...seguidos]`.
- Colecciones sociales legibles por **cualquier usuario autenticado** (`@request.auth.id != ""`): `sessions` (migración `1774000035`), `cardio_sessions`, `circuit_sessions`, `comments`, `feed_reactions`, `comment_reactions`, `user_stats`, `challenge_participants`.
- `comments.session_id`, `feed_reactions.session_id` y `comment_reactions.comment_id` son **texto**, no relación → no se puede llegar al dueño del contenido vía traversal en una regla.
- Fan-out de notificaciones server-side en `pb_hooks/notification_service.pb.js` + `pb_hooks/utils/notifications.js` (`getFollowers`, `notifyFollowers`, `createNotification`), corre con privilegios admin.
- Perfiles ajenos: web `apps/web/src/pages/UserProfilePage.tsx` (ruta `/u/:userId`), mobile `apps/mobile/src/app/u/[id].tsx`. Botón seguir/dejar de seguir vía `useFollows`.
- Búsqueda de amigos: web `apps/web/src/pages/FriendsPage.tsx` carga **todos** los users con `getFullList` y filtra en cliente; mobile `apps/mobile/src/app/friends.tsx`.
- SDK PocketBase `^0.27.0` en todos los packages.

## Decisiones de diseño

1. **Enforcement server-side completo** (elegido por Guillermo frente a "solo cliente" e "híbrido").
2. **El bloqueo también aplica a leaderboard y retos** (elegido por Guillermo).
3. Bloqueo **bidireccional en efectos**: ninguno de los dos ve el contenido del otro ni puede interactuar. Solo el blocker puede deshacerlo.
4. Desbloquear **no restaura** los follows (comportamiento estándar de redes sociales).
5. **No se tocan las reglas de `users`**: restringir su lectura rompería los `expand` de `author`/`actor`/`reactor` en toda la app (comentarios antiguos, notificaciones). El perfil del bloqueado sigue resolviendo pero sin contenido; la búsqueda de amigos filtra en cliente.
6. El bloqueado **no puede saber quién lo bloqueó** vía API (list/view de `user_blocks` solo para el blocker). La inferencia indirecta (deja de ver contenido) es inevitable y aceptada, como en cualquier red social.

## 1. Modelo de datos

### 1.1 Colección nueva `user_blocks`

Migración nueva siguiendo el patrón terso de `follows` (guard de idempotencia + down):

- Campos: `blocker` (relation → `_pb_users_auth_`, required, maxSelect 1, cascadeDelete), `blocked` (ídem).
- Índices: único `(blocker, blocked)` + índices simples en `blocker` y `blocked`.
- Reglas:
  - `listRule` / `viewRule`: `blocker = @request.auth.id`
  - `createRule`: `@request.auth.id != "" && @request.body.blocker = @request.auth.id && @request.body.blocked != @request.auth.id`
  - `updateRule`: `null`
  - `deleteRule`: `blocker = @request.auth.id`

### 1.2 Campo oculto `blocked_users` en `users`

Multi-relación (`maxSelect` sin límite) a `_pb_users_auth_`, con `hidden: true`:

- No aparece en respuestas API ni puede escribirse por usuarios normales — solo los hooks del servidor (privilegios admin) lo sincronizan.
- **Sí es utilizable en reglas API** (comportamiento documentado de PocketBase para campos hidden).
- Migración: `app.findCollectionByNameOrId("users")` + añadir campo. **Nunca recrear la colección ni tocar field IDs existentes** (regla del proyecto: cambios de tipo/recreación pierden datos).

**Por qué el campo espejo:** las reglas de PocketBase no pueden expresar "no existe fila en `user_blocks` entre A y B" — `@collection.user_blocks.blocker != X` con semántica all-match se evalúa sobre *todas* las filas de la colección y falla en cuanto exista cualquier bloqueo de otro usuario. En cambio, sobre una multi-relación directa, `campo.id != X` significa "X no está en la lista" (lista vacía = pasa), que es exactamente la no-existencia que se necesita. `user_blocks` es la fuente de verdad y la superficie API; `blocked_users` es un índice derivado para las reglas.

## 2. Reglas API (enforcement de lectura)

A `listRule` y `viewRule` de estas colecciones se les añade la cláusula doble (ni el dueño me bloqueó, ni yo al dueño), donde `<owner>` es el campo dueño de cada colección:

```
&& <owner>.blocked_users.id != @request.auth.id && @request.auth.blocked_users.id != <owner>.id
```

| Colección | Campo dueño | Efecto |
|---|---|---|
| `sessions` | `user` | Feed de workouts limpio en ambas direcciones |
| `cardio_sessions` | `user` | Feed de cardio |
| `circuit_sessions` | `user` | Circuitos |
| `comments` | `author` | Sus comentarios desaparecen para ti y los tuyos para él |
| `feed_reactions` | `reactor` | Sus reacciones desaparecen |
| `comment_reactions` | `reactor` | Ídem en comentarios |
| `user_stats` | `user` | **Leaderboard gateado server-side** (lee de aquí) |
| `challenge_participants` | `user` | Participantes de retos |
| `challenges` | `creator` | Retos creados por el bloqueado desaparecen (título, métrica, fechas) |

Una migración por grupo (o una sola) que haga `findCollectionByNameOrId` y reasigne `listRule`/`viewRule` concatenando la cláusula a la regla existente. El down restaura las reglas previas verbatim.

**Nota de rendimiento:** cada cláusula añade dos joins a la lectura. A la escala actual (decenas de usuarios) es despreciable; si algún día pesa, el campo espejo permite optimizar sin cambiar el modelo.

## 3. Enforcement de escritura (hooks de validación)

Las escrituras cruzadas no son expresables en reglas porque `session_id`/`comment_id` son texto. Se valida en `pb_hooks` (nuevo `user_blocks.pb.js` o extensión de los hooks existentes), rechazando con error 4xx si existe bloqueo en cualquier dirección entre actor y dueño del contenido:

- `onRecordCreate` de `comments`: resolver dueño vía `session_id` con la misma cascada try/catch que usa `notification_service.pb.js` (`sessions` → `cardio_sessions`; **no** hay convención de prefijos). Hoy esa cascada no incluye `circuit_sessions` — añadirla al helper de resolución para cubrir comentarios/reacciones sobre circuitos.
- `onRecordCreate` de `feed_reactions`: ídem.
- `onRecordCreate` de `comment_reactions`: dueño = `author` del comentario referenciado.
- `onRecordCreate` de `follows`: rechazar si hay bloqueo entre `follower` y `following` en cualquier dirección (impide re-seguir a quien te bloqueó o a quien bloqueaste sin desbloquear).
- `onRecordCreate` de `challenge_participants`: rechazar si hay bloqueo entre `user` y el `creator` del reto (`challenge` es relación → resolver el record del reto).

Helper compartido `isBlocked(a, b)` (consulta `user_blocks` en ambas direcciones) en `pb_hooks/utils/` para reuso entre validación y notificaciones.

**Nota para el plan:** los hooks existentes del proyecto solo usan `onRecordAfterCreateSuccess` (efectos secundarios); el rechazo pre-commit con `onRecordCreate` es un patrón **nuevo** en este codebase. El implementador debe verificar la firma exacta del JSVM de PocketBase (lanzar `BadRequestError`/throw antes de `e.next()` rechaza la creación) contra la versión de PB desplegada antes de escribir los cinco hooks.

## 4. Efectos del bloqueo (hook de dominio)

En `pb_hooks/user_blocks.pb.js`. Los efectos van en hooks **pre-commit** (`onRecordCreate` / `onRecordDelete`), no en `*AfterSuccess`: los hooks `AfterSuccess` de PocketBase corren cuando el record ya está persistido y la respuesta enviada, no pueden rechazar ni revertir (el propio `notification_service.pb.js` solo loguea errores ahí). En cambio, en `onRecordCreate` el código tras `e.next()` corre **dentro de la transacción de guardado** usando `e.app` — un throw revierte todo, incluida la creación del bloqueo.

**`onRecordCreate` de `user_blocks`** (tras `e.next()`, vía `e.app`):
1. Borrar `follows` en ambas direcciones (blocker↔blocked).
2. Añadir `blocked` al campo `blocked_users` del record del blocker (idempotente).
3. Borrar `notifications` existentes entre el par en ambas direcciones (`user`=A y `actor`=B, y viceversa).

Si cualquier paso falla, la transacción entera se revierte: o el bloqueo queda completo (record + follows + campo espejo + notifs) o no queda nada — atomicidad real, no compensación.

**Crítico para el implementador:** los tres pasos deben usar `e.app` (el app transaccional del evento) en TODAS sus lecturas/escrituras — cualquier llamada con el `$app` global escapa silenciosamente de la transacción y rompe la atomicidad.

**Edge case menor (aceptado):** `blocker`/`blocked` tienen `cascadeDelete`; si PB borra en cascada las filas de `user_blocks` al eliminar un usuario sin re-disparar `onRecordDelete`, quedaría un ID huérfano en el campo oculto `blocked_users`. Impacto nulo en reglas (apunta a un user inexistente); no se mitiga.

**`onRecordDelete` de `user_blocks`** (tras `e.next()`, vía `e.app`): quitar `blocked` del campo `blocked_users` del blocker, en la misma transacción. No restaura follows ni notificaciones.

**Guard de notificaciones:** `isBlocked()` se aplica **dentro de los helpers compartidos** `createNotification()` y `notifyFollowers()` en `pb_hooks/utils/notifications.js` — no en los call sites de `notification_service.pb.js` — para que todos los llamadores actuales (incluido `referral_side_effects.pb.js`, que llama a `helpers.createNotification` directamente) y futuros lo hereden. Es cinturón extra: los follows borrados y las creaciones rechazadas ya cortan casi todo el fan-out, pero el guard cubre carreras y tipos futuros.

## 5. Core (`packages/core`)

Nuevo hook `hooks/useBlocks.ts`, patrón `useFollows` (TanStack Query, mutaciones optimistas):

- Query `qk.blocks(userId)`: `getFullList` de `user_blocks` con `expand: blocked`, devuelve `{ blocked, blockedIds, isBlocked(id) }`.
- `block(targetId)`: crea `user_blocks`; el servidor hace el resto. On success: invalidar `qk.follows`, `qk.feed.*`, comentarios, reacciones, leaderboard y notificaciones.
- `unblock(targetId)`: borra el record propio. Misma invalidación.
- Tipos en `packages/core/types` (`UserBlock`).

Cambios mínimos en hooks existentes (solo donde las reglas no llegan):

- Búsqueda de usuarios (web `FriendsPage.tsx` / mobile `friends.tsx`): excluir `blockedIds` del resultado. (Quien me bloqueó no es excluible en búsqueda sin tocar reglas de `users`; aceptado — al intentar seguirlo el server lo rechaza.)
- `useActivityFeed`: sin cambios obligatorios (las reglas filtran), pero excluir `blockedIds` de `allUserIds` como micro-optimización si resulta trivial.

## 6. UI (web + mobile)

### Perfil de otro usuario
- Web `UserProfilePage.tsx` y mobile `u/[id].tsx`: acción "Bloquear usuario" (menú overflow o botón secundario discreto, coherente con el design system de cada app) con diálogo de confirmación que explica el efecto.
- Si ya está bloqueado: estado "Bloqueado" en lugar del botón seguir + acción "Desbloquear". El contenido del perfil (stats/actividad) aparecerá vacío por las reglas; mostrar un empty state coherente en vez de spinners.

### Gestión de bloqueados
- Web: `/settings/blocked` (junto a `/settings/notifications` existente). Mobile: pantalla stacked `blocked-users` accesible desde Perfil/ajustes (patrón de `notification-settings`).
- Lista de usuarios bloqueados (avatar + nombre) con botón "Desbloquear". Empty state si no hay.

### i18n
Cadenas nuevas ES/EN en ambas apps: bloquear, desbloquear, confirmación, pantalla de gestión, empty states.

## 7. Manejo de errores

- Crear bloqueo duplicado → el índice único lo rechaza; la UI trata el error como éxito idempotente (ya bloqueado).
- Rechazos de hooks de validación (comentar/reaccionar/seguir con bloqueo) → mensaje genérico "No se pudo completar la acción" — no revelar que hay bloqueo.
- Mutaciones optimistas con rollback on error (patrón ya usado en `useFollows`).

## 8. Testing y verificación

- **Core:** tests de `useBlocks` (query, block/unblock optimista, invalidaciones), siguiendo la infraestructura de tests existente de core.
- **Reglas/hooks (manual, PB local + usuarios de test locales):**
  1. A bloquea a B → follows mutuos borrados, notificaciones entre ambos borradas.
  2. B deja de ver sessions/cardio/comments/reactions/stats de A y viceversa (feed, leaderboard, retos).
  3. B no puede comentar/reaccionar contenido de A ni re-seguirla (y viceversa).
  4. A desbloquea → contenido reaparece para ambos, follows NO se restauran.
  5. Usuarios no involucrados no se ven afectados.
- **Typecheck/build:** `pnpm -r typecheck` + build web.
- **Despliegue:** push a main auto-aplica `pb_migrations` a prod. Los cambios en `pb_hooks` requieren que el proceso PB de prod recargue hooks (reinicio del contenedor si no hay hot-reload).

## Fuera de alcance

- Reportar usuarios / moderación.
- Ocultar el perfil del bloqueado a nivel de reglas de `users` (decisión §Decisiones-5).
- Restaurar follows al desbloquear.
- Realtime: las suscripciones existentes son fetch-on-load; no se añade invalidación push del feed del bloqueado.
