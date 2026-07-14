# Bloqueo de Usuarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloqueo de usuarios estilo red social con enforcement server-side completo: al bloquear se dejan de seguir mutuamente y desaparece toda la actividad entre ambos (feed, comentarios, reacciones, leaderboard, retos, notificaciones) en web y mobile.

**Architecture:** Colección `user_blocks` (fuente de verdad, API del cliente) + campo oculto `blocked_users` en `users` (espejo sincronizado por hooks, usado por las reglas API). Efectos del bloqueo transaccionales en `onRecordCreate`/`onRecordDelete` de PocketBase (código tras `e.next()` usando `e.app` corre dentro de la transacción). Validación de escrituras cruzadas en hooks pre-commit. Cliente: hook `useBlocks` en core + UI en perfil y pantalla de gestión.

**Tech Stack:** PocketBase 0.36.8 (pb_migrations JS + pb_hooks JSVM), TanStack Query 5, React 19 (web Vite), Expo RN (mobile), vitest (core).

**Spec:** `docs/superpowers/specs/2026-07-14-block-users-design.md` — leerlo antes de empezar. Reglas de oro: NUNCA recrear colecciones existentes ni tocar field IDs (pérdida de datos); dentro de los hooks de `user_blocks` usar SIEMPRE `e.app`, nunca `$app`.

---

## Task 1: Migración — colección `user_blocks`

**Files:**
- Create: `pb_migrations/1778000000_created_user_blocks.js`

- [ ] **Step 1: Escribir la migración**

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Bloqueo de usuarios (spec 2026-07-14-block-users-design.md).
 * Fuente de verdad de bloqueos. El bloqueado NO puede consultar quién lo
 * bloqueó (list/view solo para el blocker). Los efectos (unfollow mutuo,
 * campo espejo, borrado de notifs) viven en pb_hooks/user_blocks.pb.js.
 */
migrate((app) => {
  try { app.findCollectionByNameOrId("user_blocks"); return } catch {}

  const collection = new Collection({
    name: "user_blocks",
    type: "base",
    fields: [
      { name: "blocker", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "blocked", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_user_blocks_pair ON user_blocks (blocker, blocked)",
      "CREATE INDEX idx_user_blocks_blocker ON user_blocks (blocker)",
      "CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked)"
    ],
    listRule: "blocker = @request.auth.id",
    viewRule: "blocker = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.blocker = @request.auth.id && @request.body.blocked != @request.auth.id',
    updateRule: null,
    deleteRule: "blocker = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_blocks")
  app.delete(collection)
})
```

- [ ] **Step 2: Aplicar y verificar**

Arrancar PB local (`./pocketbase serve` desde la raíz, puerto :8090 — las migraciones se auto-aplican al arrancar). Verificar en la salida que no hay error y que la colección existe:

Run: `sqlite3 pb_data/data.db "SELECT name FROM sqlite_master WHERE name LIKE 'user_blocks%'" | head -1`
Expected: `user_blocks`

- [ ] **Step 3: Commit**

```bash
git add pb_migrations/1778000000_created_user_blocks.js
git commit -m "feat(pb): colección user_blocks para bloqueo de usuarios"
```

---

## Task 2: Migración — campo oculto `blocked_users` en `users`

**Files:**
- Create: `pb_migrations/1778000001_add_blocked_users_field.js`

- [ ] **Step 1: Escribir la migración** (idioma de `1777000003_add_hr_to_sessions.js`: `new Field` + `fields.add`, NUNCA recrear la colección)

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Campo espejo OCULTO para las reglas de bloqueo. hidden:true → no aparece en
 * respuestas API ni puede escribirse por usuarios; solo los hooks del server
 * lo sincronizan (pb_hooks/user_blocks.pb.js). Las reglas API sí pueden leerlo.
 * Semántica clave: `blocked_users.id != X` = "X no está en la lista"
 * (all-match sobre multi-relación; lista vacía pasa).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users")
  if (collection.fields.find(f => f.name === "blocked_users")) return

  collection.fields.add(new Field({
    "hidden": true,
    "id": "relation_users_blocked_users",
    "name": "blocked_users",
    "type": "relation",
    "collectionId": "_pb_users_auth_",
    "cascadeDelete": false,
    "minSelect": 0,
    "maxSelect": 9999,
    "presentable": false,
    "required": false,
    "system": false
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users")
  collection.fields = collection.fields.filter(f => f.id !== "relation_users_blocked_users")
  app.save(collection)
})
```

- [ ] **Step 2: Aplicar y verificar**

Reiniciar `./pocketbase serve`. Verificar que el campo existe y está oculto: abrir el admin (`http://127.0.0.1:8090/_/`) → colección users → campo `blocked_users` presente. O por API: un `GET /api/collections/users/records` autenticado NO debe incluir `blocked_users` en la respuesta (hidden).

- [ ] **Step 3: Commit**

```bash
git add pb_migrations/1778000001_add_blocked_users_field.js
git commit -m "feat(pb): campo oculto blocked_users en users (espejo para reglas)"
```

---

## Task 3: Migración — reglas de lectura con cláusula de bloqueo

**Files:**
- Create: `pb_migrations/1778000002_block_read_rules.js`

- [ ] **Step 1: Escribir la migración.** Se asigna la regla completa (no concatenar sobre la existente) y el down restaura los valores actuales verbatim. Cláusula: ni el dueño me bloqueó, ni yo al dueño.

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Enforcement de lectura del bloqueo (spec 2026-07-14). A cada colección
 * social se le añade la cláusula doble sobre el campo espejo blocked_users:
 *   <owner>.blocked_users.id != @request.auth.id  → el dueño no me bloqueó
 *   @request.auth.blocked_users.id != <owner>.id  → yo no bloqueé al dueño
 * Multi-relación con != = all-match ("no contiene"); lista vacía pasa.
 * NO se tocan las reglas de `users` (rompería expands de author/actor).
 */
const TARGETS = [
  // [colección, campo dueño, regla previa para el down]
  ["sessions", "user", '@request.auth.id != ""'],
  ["cardio_sessions", "user", '@request.auth.id != ""'],
  ["circuit_sessions", "user", "@request.auth.id != ''"],
  ["comments", "author", '@request.auth.id != ""'],
  ["feed_reactions", "reactor", '@request.auth.id != ""'],
  ["comment_reactions", "reactor", '@request.auth.id != ""'],
  ["user_stats", "user", '@request.auth.id != ""'],
  ["challenge_participants", "user", '@request.auth.id != ""'],
  ["challenges", "creator", '@request.auth.id != ""'],
]

migrate((app) => {
  for (const [name, owner] of TARGETS) {
    const collection = app.findCollectionByNameOrId(name)
    const rule = '@request.auth.id != "" && ' +
      owner + '.blocked_users.id != @request.auth.id && ' +
      '@request.auth.blocked_users.id != ' + owner + '.id'
    collection.listRule = rule
    collection.viewRule = rule
    app.save(collection)
  }
}, (app) => {
  for (const [name, , prevRule] of TARGETS) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = prevRule
      collection.viewRule = prevRule
      app.save(collection)
    } catch (e) {}
  }
})
```

**ANTES de commitear:** verificar que las reglas previas del down coinciden con las vigentes reales:

Run: `grep -h "listRule" pb_migrations/1774000035_update_sessions_rules.js pb_migrations/1775100010_created_circuit_sessions.js pb_migrations/1774000046_created_comments.js pb_migrations/1774000039_created_feed_reactions.js pb_migrations/1775100003_created_comment_reactions.js pb_migrations/1774000038_created_challenge_participants.js pb_migrations/1774000037_created_challenges.js`

y para `user_stats` (fue cambiada dos veces): `grep -h "listRule" pb_migrations/1774000060_fix_indexes_and_privacy.js | head -2`. Si alguna difiere de la tabla TARGETS, corregir el tercer elemento.

- [ ] **Step 2: Aplicar y smoke-test**

Reiniciar `./pocketbase serve`. Login como cualquier usuario de test y listar sesiones — debe seguir funcionando igual (sin bloqueos activos, las cláusulas pasan en vacío):

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test-b@local.test","password":"TestUser123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "http://127.0.0.1:8090/api/collections/sessions/records?perPage=1" -H "Authorization: Bearer $TOKEN" | head -c 200
```
Expected: JSON con `"items":[...]` (no 400 de regla inválida).

- [ ] **Step 3: Commit**

```bash
git add pb_migrations/1778000002_block_read_rules.js
git commit -m "feat(pb): reglas de lectura con cláusula de bloqueo en 9 colecciones"
```

---

## Task 4: Helper compartido `pb_hooks/utils/blocks.js`

**Files:**
- Create: `pb_hooks/utils/blocks.js`

**Contexto crítico (gotcha de este repo, ver header de `pb_hooks/utils/notifications.js`):** cada handler de hook corre en un runtime JSVM AISLADO sin acceso a funciones top-level del `.pb.js`; los helpers compartidos viven en `pb_hooks/utils/` y cada handler hace `require(`${__hooks}/utils/blocks.js`)`.

- [ ] **Step 1: Escribir el helper**

```js
/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers de bloqueo de usuarios. Igual que utils/notifications.js: requerir
 * DENTRO de cada handler (runtimes JSVM aislados).
 *
 * `app` es el App a usar: $app en contexto normal, e.app dentro de hooks
 * transaccionales (¡nunca mezclar!).
 */

// ¿Existe bloqueo entre a y b en cualquier dirección?
function isBlocked(app, a, b) {
  if (!a || !b || a === b) return false
  try {
    var recs = app.findRecordsByFilter(
      "user_blocks",
      "(blocker = '" + a + "' && blocked = '" + b + "') || (blocker = '" + b + "' && blocked = '" + a + "')",
      "", 1, 0
    )
    return recs.length > 0
  } catch (e) {
    return false
  }
}

// Dueño (userId) de un session_id de comments/feed_reactions.
// Cascada try/catch como notification_service.pb.js, AMPLIADA con
// circuit_sessions (la del servicio de notifs no lo incluye hoy).
function findSessionOwner(app, sessionId) {
  if (!sessionId) return ""
  var cols = ["sessions", "cardio_sessions", "circuit_sessions"]
  for (var i = 0; i < cols.length; i++) {
    try {
      var rec = app.findRecordById(cols[i], sessionId)
      return rec.getString("user")
    } catch (e) { /* probar siguiente colección */ }
  }
  return ""
}

module.exports = {
  isBlocked: isBlocked,
  findSessionOwner: findSessionOwner,
}
```

- [ ] **Step 2: Commit**

```bash
git add pb_hooks/utils/blocks.js
git commit -m "feat(pb): helper isBlocked + findSessionOwner para hooks de bloqueo"
```

---

## Task 5: Hook de dominio — efectos transaccionales del bloqueo

**Files:**
- Create: `pb_hooks/user_blocks.pb.js`

**Contexto crítico:** `onRecordCreate`/`onRecordDelete` son hooks pre-commit; el código tras `e.next()` corre DENTRO de la transacción de guardado si usa `e.app`. Un `throw` revierte todo (record incluido). Este es un patrón NUEVO en este repo (los demás hooks usan `onRecordAfterCreateSuccess`); verificado contra `pb_data/types.d.ts` de PB 0.36.8. **Cualquier llamada con `$app` global aquí escapa de la transacción y rompe la atomicidad.**

- [ ] **Step 1: Escribir el hook**

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Efectos del bloqueo — TRANSACCIONALES (spec 2026-07-14).
 * En onRecordCreate/onRecordDelete, el código tras e.next() corre dentro de la
 * transacción de guardado usando e.app. Un throw revierte TODO (incluido el
 * record de user_blocks): o el bloqueo queda completo o no queda nada.
 * NUNCA usar $app aquí — escaparía de la transacción.
 */

onRecordCreate(function (e) {
  e.next()

  var txApp = e.app
  var blocker = e.record.getString("blocker")
  var blocked = e.record.getString("blocked")

  // 1. Unfollow mutuo
  var follows = txApp.findRecordsByFilter(
    "follows",
    "(follower = '" + blocker + "' && following = '" + blocked + "') || (follower = '" + blocked + "' && following = '" + blocker + "')",
    "", 10, 0
  )
  for (var i = 0; i < follows.length; i++) {
    txApp.delete(follows[i])
  }

  // 2. Sincronizar campo espejo blocked_users del blocker (idempotente)
  var blockerRec = txApp.findRecordById("users", blocker)
  var list = blockerRec.getStringSlice("blocked_users")
  if (list.indexOf(blocked) === -1) {
    list.push(blocked)
    blockerRec.set("blocked_users", list)
    txApp.save(blockerRec)
  }

  // 3. Borrar notificaciones existentes entre el par (ambas direcciones)
  var notifs = txApp.findRecordsByFilter(
    "notifications",
    "(user = '" + blocker + "' && actor = '" + blocked + "') || (user = '" + blocked + "' && actor = '" + blocker + "')",
    "", 500, 0
  )
  for (var j = 0; j < notifs.length; j++) {
    txApp.delete(notifs[j])
  }
}, "user_blocks")

onRecordDelete(function (e) {
  e.next()

  var txApp = e.app
  var blocker = e.record.getString("blocker")
  var blocked = e.record.getString("blocked")

  // Quitar del campo espejo. Si el user ya no existe (cascade delete de
  // cuenta), no hay nada que limpiar.
  try {
    var blockerRec = txApp.findRecordById("users", blocker)
    var list = blockerRec.getStringSlice("blocked_users")
    var idx = list.indexOf(blocked)
    if (idx !== -1) {
      list.splice(idx, 1)
      blockerRec.set("blocked_users", list)
      txApp.save(blockerRec)
    }
  } catch (err) { /* usuario borrado — no-op */ }
}, "user_blocks")
```

- [ ] **Step 2: Verificar en PB local**

Reiniciar `./pocketbase serve` (los pb_hooks se recargan al arrancar). Con dos usuarios de test A y B que se siguen (usar `node scripts/seed-social-notif-test.mjs` si hace falta seed):

```bash
# Token de A (ajustar identity/password a los usuarios seedeados)
TOKEN_A=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test-b@local.test","password":"TestUser123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
ID_A=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test-b@local.test","password":"TestUser123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['record']['id'])")
# ID_B: id del otro usuario seedeado (mirar en el admin o en la salida del seed)

# Bloquear
curl -s -X POST http://127.0.0.1:8090/api/collections/user_blocks/records \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"blocker\":\"$ID_A\",\"blocked\":\"<ID_B>\"}"
```

Expected: 200 con el record. Después verificar:
- `curl -s "http://127.0.0.1:8090/api/collections/follows/records" -H "Authorization: Bearer $TOKEN_A"` → sin follows entre A y B.
- En el admin, el user A tiene `blocked_users` = [B].
- Las notificaciones entre A y B desaparecieron.

Desbloquear (DELETE del record de user_blocks con TOKEN_A) → `blocked_users` de A vuelve a vacío, follows NO reaparecen.

- [ ] **Step 3: Commit**

```bash
git add pb_hooks/user_blocks.pb.js
git commit -m "feat(pb): efectos transaccionales del bloqueo (unfollow, espejo, notifs)"
```

---

## Task 6: Guards de escritura — rechazar interacciones entre bloqueados

**Files:**
- Create: `pb_hooks/block_guards.pb.js`

**Por qué hooks y no reglas:** `comments.session_id`, `feed_reactions.session_id` y `comment_reactions.comment_id` son TEXTO, no relación → las reglas API no pueden llegar al dueño del contenido. Estos guards corren ANTES de `e.next()`: un throw aborta la creación con 400.

- [ ] **Step 1: Escribir los guards**

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Rechaza escrituras cruzadas entre usuarios con bloqueo (spec 2026-07-14).
 * Corren ANTES de e.next() → throw aborta la creación (400).
 * Mensaje genérico: no revelar que existe un bloqueo.
 */

// Comentar contenido de alguien con quien hay bloqueo
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var author = e.record.getString("author")
  var owner = blocks.findSessionOwner(e.app, e.record.getString("session_id"))
  if (owner && blocks.isBlocked(e.app, author, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "comments")

// Reaccionar a una sesión
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var reactor = e.record.getString("reactor")
  var owner = blocks.findSessionOwner(e.app, e.record.getString("session_id"))
  if (owner && blocks.isBlocked(e.app, reactor, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "feed_reactions")

// Reaccionar a un comentario
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var reactor = e.record.getString("reactor")
  var owner = ""
  try {
    var comment = e.app.findRecordById("comments", e.record.getString("comment_id"))
    owner = comment.getString("author")
  } catch (err) { /* comentario inexistente — dejar que siga su curso normal */ }
  if (owner && blocks.isBlocked(e.app, reactor, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "comment_reactions")

// Re-seguir a alguien con quien hay bloqueo
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var follower = e.record.getString("follower")
  var following = e.record.getString("following")
  if (blocks.isBlocked(e.app, follower, following)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "follows")

// Unirse a un reto cuyo creador tiene bloqueo con el participante
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var participant = e.record.getString("user")
  var creator = ""
  try {
    var challenge = e.app.findRecordById("challenges", e.record.getString("challenge"))
    creator = challenge.getString("creator")
  } catch (err) { /* reto inexistente */ }
  if (creator && blocks.isBlocked(e.app, participant, creator)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "challenge_participants")
```

- [ ] **Step 2: Verificar en PB local**

Reiniciar PB. Con A bloqueando a B (Task 5):
- Como B, `POST /api/collections/follows/records` con `{follower: B, following: A}` → Expected: **400**.
- Como B, comentar una sesión de A (`POST /api/collections/comments/records` con un `session_id` de A) → Expected: **400**. (Nota: B ya no puede LISTAR las sesiones de A por Task 3, pero un id conocido debe rechazarse igualmente.)
- Como B, comentar una sesión de un tercer usuario C sin bloqueo → Expected: **200** (los guards no afectan a terceros).

- [ ] **Step 3: Commit**

```bash
git add pb_hooks/block_guards.pb.js
git commit -m "feat(pb): guards pre-commit contra interacciones entre bloqueados"
```

---

## Task 7: Guard de bloqueo en los helpers de notificaciones

**Files:**
- Modify: `pb_hooks/utils/notifications.js` (funciones `createNotification`, ~línea 92, y `notifyFollowers`, ~línea 152)

**Dónde va el guard y por qué:** DENTRO de los helpers compartidos (no en los call sites de `notification_service.pb.js`) para que todos los llamadores actuales — incluido `referral_side_effects.pb.js`, que llama a `helpers.createNotification` directamente — y futuros lo hereden.

- [ ] **Step 1: Añadir el guard a `createNotification`**

En `createNotification`, tras la línea `if (!userId || !actorId || userId === actorId) return`, añadir:

```js
  // Guard de bloqueo: nunca notificar entre usuarios con bloqueo (cinturón
  // extra; los guards de creación ya cortan casi todo el fan-out).
  try {
    var blocks = require(`${__hooks}/utils/blocks.js`)
    if (blocks.isBlocked($app, userId, actorId)) return
  } catch (e) { /* nunca romper notificaciones por un error del guard */ }
```

- [ ] **Step 2: Añadir el filtro a `notifyFollowers`**

En el bucle de `notifyFollowers`, tras `if (!fid || fid === actorId) continue`, añadir (el `require` va FUERA del bucle, al inicio de la función):

```js
function notifyFollowers(actorId, type, referenceId, data, push) {
  if (!actorId) return
  var blocks = null
  try { blocks = require(`${__hooks}/utils/blocks.js`) } catch (e) {}
  var followers = getFollowers(actorId)
  for (var i = 0; i < followers.length; i++) {
    var fid = followers[i]
    if (!fid || fid === actorId) continue
    if (blocks && blocks.isBlocked($app, fid, actorId)) continue
    createNotification(fid, type, actorId, referenceId, "user", data)
    if (push) {
      sendPush(fid, push.title, push.body, push.url, type)
    }
  }
}
```

(Sin esto, `sendPush` dispararía push a un bloqueado aunque `createNotification` lo filtre.)

- [ ] **Step 3: Verificar**

Reiniciar PB. Con A y C siguiéndose (sin bloqueo): C comenta una sesión de A → A recibe notificación (comportamiento intacto). Con A↔B bloqueados: ninguna acción de B genera notificación a A.

- [ ] **Step 4: Commit**

```bash
git add pb_hooks/utils/notifications.js
git commit -m "feat(pb): guard isBlocked en createNotification y notifyFollowers"
```

---

## Task 8: Core — query key, helper puro con test, y tipos

**Files:**
- Modify: `packages/core/lib/query-keys.ts` (bloque "— Social / feed —", ~línea 19)
- Create: `packages/core/lib/blocks.ts`
- Create: `packages/core/lib/blocks.test.ts`

- [ ] **Step 1: Añadir la query key**

En `packages/core/lib/query-keys.ts`, justo después de `follows: (userId...)` (línea 19):

```ts
  blocks: (userId: string | null) => ['blocks', userId] as const,
```

- [ ] **Step 2: Escribir el test que falla**

`packages/core/lib/blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { excludeBlocked } from './blocks'

describe('excludeBlocked', () => {
  const users = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('filtra los usuarios bloqueados', () => {
    expect(excludeBlocked(users, new Set(['b']))).toEqual([{ id: 'a' }, { id: 'c' }])
  })

  it('devuelve el mismo array si no hay bloqueados (sin copia)', () => {
    expect(excludeBlocked(users, new Set())).toBe(users)
  })

  it('array vacío queda vacío', () => {
    expect(excludeBlocked([], new Set(['b']))).toEqual([])
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `pnpm --filter @calistenia/core test -- blocks.test`
Expected: FAIL — `Cannot find module './blocks'` (o equivalente).

- [ ] **Step 4: Implementar**

`packages/core/lib/blocks.ts`:

```ts
/**
 * Helpers puros de bloqueo de usuarios. El enforcement principal son las
 * reglas API de PocketBase; esto cubre las superficies donde las reglas no
 * llegan (búsqueda de usuarios, que lee `users` sin cláusula de bloqueo).
 */

/** Excluye de `users` los ids presentes en `blockedIds`. */
export function excludeBlocked<T extends { id: string }>(
  users: T[],
  blockedIds: Set<string>,
): T[] {
  if (blockedIds.size === 0) return users
  return users.filter(u => !blockedIds.has(u.id))
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm --filter @calistenia/core test -- blocks.test`
Expected: PASS (3 tests). Correr también `pnpm --filter @calistenia/core test` completo — sin regresiones (el suite existente de query-keys no valida keys nuevas, pero comprobar).

- [ ] **Step 6: Commit**

```bash
git add packages/core/lib/query-keys.ts packages/core/lib/blocks.ts packages/core/lib/blocks.test.ts
git commit -m "feat(core): query key blocks + helper excludeBlocked con tests"
```

---

## Task 9: Core — hook `useBlocks`

**Files:**
- Create: `packages/core/hooks/useBlocks.ts`

Modelado 1:1 sobre `packages/core/hooks/useFollows.ts` (mutaciones optimistas, misma forma pública `Promise<boolean>`). Leer ese archivo antes de empezar.

- [ ] **Step 1: Escribir el hook**

```ts
import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'

export interface BlockedUser {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
  /** id del record de user_blocks — necesario para desbloquear */
  blockRecordId: string
}

interface UseBlocksReturn {
  blocked: BlockedUser[]
  blockedIds: Set<string>
  loading: boolean
  block: (targetUserId: string) => Promise<boolean>
  unblock: (targetUserId: string) => Promise<boolean>
  isBlocked: (targetUserId: string) => boolean
  reload: () => Promise<void>
}

/**
 * Bloqueos del usuario actual. El servidor hace el trabajo pesado al crear el
 * record (unfollow mutuo, campo espejo para reglas, borrado de notifs — ver
 * pb_hooks/user_blocks.pb.js); este hook solo gestiona el record y revienta
 * los cachés sociales para que el contenido (des)aparezca al instante.
 */
export function useBlocks(userId: string | null): UseBlocksReturn {
  const qc = useQueryClient()
  const key = qk.blocks(userId)
  const pendingRef = useRef<Set<string>>(new Set())

  const { data, isPending, refetch } = useQuery<BlockedUser[]>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return []
      const recs = await pb.collection('user_blocks').getFullList({
        filter: pb.filter('blocker = {:uid}', { uid: userId! }),
        expand: 'blocked',
        $autoCancel: false,
      })
      return recs.map((r: any) => {
        const u = r.expand?.blocked
        return {
          id: u?.id || r.blocked,
          displayName: u?.display_name || u?.name || u?.username || '?',
          username: u?.username || '',
          avatarUrl: u ? getUserAvatarUrl(u, '100x100') : null,
          blockRecordId: r.id,
        }
      })
    },
  })

  const blocked = data ?? []
  const blockedIds = useMemo(() => new Set(blocked.map(u => u.id)), [blocked])
  const blockedIdsRef = useRef(blockedIds)
  blockedIdsRef.current = blockedIds

  // El servidor borra follows y filtra lecturas — invalidar todo lo social
  // para que la UI refleje el cambio sin recargar.
  const invalidateSocial = useCallback(() => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.follows(userId) })
    qc.invalidateQueries({ queryKey: qk.feed.all })
    qc.invalidateQueries({ queryKey: qk.comments.all })
    qc.invalidateQueries({ queryKey: ['comment-reactions'] })
    qc.invalidateQueries({ queryKey: ['reactions'] })
    qc.invalidateQueries({ queryKey: qk.notifications.all })
    qc.invalidateQueries({ queryKey: ['leaderboard'] })
    qc.invalidateQueries({ queryKey: ['challenges'] })
    qc.invalidateQueries({ queryKey: ['challenge-leaderboard'] })
  }, [qc, key, userId])

  const blockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      await pb.collection('user_blocks').create({
        blocker: pb.authStore.record?.id ?? userId,
        blocked: targetUserId,
      })
      op.track('user_blocked', { target_id: targetUserId })
    },
    onSettled: invalidateSocial,
  })

  const unblockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const rec = blocked.find(u => u.id === targetUserId)
      const recordId = rec?.blockRecordId ?? (await pb.collection('user_blocks').getFirstListItem(
        pb.filter('blocker = {:me} && blocked = {:them}', { me: userId, them: targetUserId }),
        { $autoCancel: false },
      )).id
      await pb.collection('user_blocks').delete(recordId)
      op.track('user_unblocked', { target_id: targetUserId })
    },
    onSettled: invalidateSocial,
  })

  const block = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId || targetUserId === userId) return false
    if (blockedIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await blockMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      // 400 por índice único = ya estaba bloqueado → idempotente
      if (e?.status === 400) return true
      console.warn('Block error:', e?.status, e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, blockMutation])

  const unblock = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    if (!blockedIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await unblockMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      console.warn('Unblock error:', e?.status, e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, unblockMutation])

  const isBlocked = useCallback(
    (targetUserId: string): boolean => blockedIds.has(targetUserId),
    [blockedIds],
  )

  const reload = useCallback(async () => { await refetch() }, [refetch])

  return {
    blocked,
    blockedIds,
    loading: isPending,
    block,
    unblock,
    isBlocked,
    reload,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @calistenia/core exec tsc --noEmit 2>/dev/null || pnpm -r typecheck`
Expected: sin errores nuevos (usar el comando de typecheck que exista en el repo; `pnpm -r typecheck` es el estándar del proyecto).

- [ ] **Step 3: Commit**

```bash
git add packages/core/hooks/useBlocks.ts
git commit -m "feat(core): hook useBlocks (block/unblock + invalidación social)"
```

---

## Task 10: i18n — cadenas ES/EN

**Files:**
- Modify: `packages/core/locales/es/translation.json` (junto al bloque `friends.*`, ~línea 854)
- Modify: `packages/core/locales/en/translation.json` (misma zona — ambos ficheros tienen las MISMAS keys en el MISMO orden, 2688 líneas; mantener la paridad)

- [ ] **Step 1: Añadir las keys en ES** (formato flat con puntos, como `"friends.followBtn"`):

```json
  "blocks.blockBtn": "BLOQUEAR",
  "blocks.unblockBtn": "DESBLOQUEAR",
  "blocks.blockedState": "BLOQUEADO",
  "blocks.confirmTitle": "¿Bloquear usuario?",
  "blocks.confirmBody": "Dejarán de seguirse mutuamente y no verán la actividad del otro (feed, comentarios, reacciones, rankings).",
  "blocks.confirmAction": "Bloquear",
  "blocks.cancel": "Cancelar",
  "blocks.manageTitle": "USUARIOS BLOQUEADOS",
  "blocks.manageEntry": "Usuarios bloqueados",
  "blocks.empty": "No has bloqueado a nadie",
  "blocks.error": "No se pudo completar la acción",
```

- [ ] **Step 2: Añadir las keys en EN** (mismas keys, misma posición):

```json
  "blocks.blockBtn": "BLOCK",
  "blocks.unblockBtn": "UNBLOCK",
  "blocks.blockedState": "BLOCKED",
  "blocks.confirmTitle": "Block user?",
  "blocks.confirmBody": "You will unfollow each other and stop seeing each other's activity (feed, comments, reactions, rankings).",
  "blocks.confirmAction": "Block",
  "blocks.cancel": "Cancel",
  "blocks.manageTitle": "BLOCKED USERS",
  "blocks.manageEntry": "Blocked users",
  "blocks.empty": "You haven't blocked anyone",
  "blocks.error": "Could not complete the action",
```

- [ ] **Step 3: Validar JSON**

Run: `python3 -c "import json; json.load(open('packages/core/locales/es/translation.json')); json.load(open('packages/core/locales/en/translation.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add packages/core/locales/es/translation.json packages/core/locales/en/translation.json
git commit -m "feat(core): cadenas i18n ES/EN para bloqueo de usuarios"
```

---

## Task 11: Web — bloquear/desbloquear desde el perfil

**Files:**
- Modify: `apps/web/src/pages/UserProfilePage.tsx` (import de hooks ~línea 16, hook `useFollows` en ~línea 69, botón de follow en ~líneas 262–278)

- [ ] **Step 1: Importar y montar el hook**

Junto al import de `useFollows` (línea 16):

```tsx
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
```

Junto al `useFollows(currentUserId || null)` (línea 69):

```tsx
const { isBlocked, block, unblock } = useBlocks(currentUserId || null)
const blocked = userId ? isBlocked(userId) : false
```

- [ ] **Step 2: Añadir la acción de bloqueo bajo el botón de seguir**

Justo después del botón follow/unfollow existente (líneas 262–278), añadir. Si `blocked === true`, además NO renderizar el botón de seguir (solo el estado bloqueado):

```tsx
{blocked ? (
  <button
    className="mt-2 text-xs font-mono uppercase tracking-wider text-red-500 underline underline-offset-4"
    onClick={async () => {
      if (userId) await unblock(userId)
    }}
  >
    {t('blocks.blockedState')} — {t('blocks.unblockBtn')}
  </button>
) : (
  <button
    className="mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-red-500"
    onClick={async () => {
      if (!userId) return
      if (window.confirm(`${t('blocks.confirmTitle')}\n\n${t('blocks.confirmBody')}`)) {
        await block(userId)
      }
    }}
  >
    {t('blocks.blockBtn')}
  </button>
)}
```

**Nota de estilo:** ajustar las clases al design system del archivo (mirar los botones vecinos); lo importante es la lógica y las keys i18n. El perfil de un usuario bloqueado mostrará stats/actividad vacías por las reglas del servidor — verificar que la página ya renderiza estados vacíos sin romperse (no añadir spinners infinitos).

- [ ] **Step 3: Verificar en el navegador**

Run: `pnpm --filter web dev` (con PB local corriendo). Visitar `/u/<id-de-otro-usuario>`, bloquear → confirmación → el botón cambia a estado bloqueado, el follow desaparece. Desbloquear → vuelve el botón de seguir (sin follow activo).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/UserProfilePage.tsx
git commit -m "feat(web): bloquear/desbloquear usuario desde su perfil"
```

---

## Task 12: Web — página de bloqueados, ruta, entrada y filtro de búsqueda

**Files:**
- Create: `apps/web/src/pages/BlockedUsersPage.tsx`
- Modify: `apps/web/src/App.tsx` (lazy import junto a `NotificationSettingsPage` ~línea 57; ruta junto a `/settings/notifications` ~línea 701)
- Modify: `apps/web/src/pages/ProfilePage.tsx` (fila de navegación junto a `navigate('/reminders')` ~línea 745)
- Modify: `apps/web/src/pages/FriendsPage.tsx` (filtro de búsqueda, ~líneas 105–144)

- [ ] **Step 1: Crear la página** (modelar estructura/clases sobre `NotificationSettingsPage.tsx` — leerla primero y copiar su layout de página):

```tsx
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@calistenia/core/hooks/useAuth'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'

export default function BlockedUsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { blocked, unblock, loading } = useBlocks(user?.id ?? null)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label={t('blocks.cancel')}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-2xl">{t('blocks.manageTitle')}</h1>
      </div>

      {loading ? null : blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('blocks.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {blocked.map(u => (
            <li key={u.id} className="flex items-center justify-between rounded border border-border p-3">
              <div className="flex items-center gap-3">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted" />
                )}
                <div>
                  <p className="text-sm font-medium">{u.displayName}</p>
                  {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                </div>
              </div>
              <button
                className="text-xs font-mono uppercase tracking-wider text-red-500 underline underline-offset-4"
                onClick={() => unblock(u.id)}
              >
                {t('blocks.unblockBtn')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

(Ajustar el import de `useAuth` y las clases al patrón real de `NotificationSettingsPage.tsx` — es la referencia canónica de página de ajustes.)

- [ ] **Step 2: Registrar la ruta en `App.tsx`**

Junto a la línea 57:

```tsx
const BlockedUsersPage = lazy(() => import('./pages/BlockedUsersPage'))
```

Junto a la ruta de línea 701:

```tsx
<Route path="/settings/blocked" element={<BlockedUsersPage />} />
```

- [ ] **Step 3: Entrada en `ProfilePage.tsx`**

Duplicar la fila de navegación existente de `navigate('/reminders')` (~línea 745, copiar su JSX exacto) cambiando destino a `/settings/blocked` y label a `{t('blocks.manageEntry')}`.

- [ ] **Step 4: Filtrar bloqueados de la búsqueda en `FriendsPage.tsx`**

La búsqueda carga TODOS los users con `getFullList` y filtra en cliente (líneas 105–144). Añadir:

```tsx
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { excludeBlocked } from '@calistenia/core/lib/blocks'
```

Montar `const { blockedIds } = useBlocks(currentUserId || null)` junto al `useFollows` existente, y envolver el resultado del filtro de búsqueda:

```tsx
const visibleResults = excludeBlocked(searchResults, blockedIds)
```

usando `visibleResults` donde se renderizaba `searchResults`. (Los nombres exactos de las variables están en las líneas 105–144 — adaptar manteniendo la semántica: el filtro de bloqueados se aplica DESPUÉS del filtro por texto.)

- [ ] **Step 5: Verificar y typecheck**

Run: `pnpm --filter web dev` → `/settings/blocked` lista y desbloquea; la búsqueda de `/friends` no muestra bloqueados. Después `pnpm -r typecheck`.
Expected: typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/BlockedUsersPage.tsx apps/web/src/App.tsx apps/web/src/pages/ProfilePage.tsx apps/web/src/pages/FriendsPage.tsx
git commit -m "feat(web): página usuarios bloqueados + filtro de búsqueda"
```

---

## Task 13: Mobile — bloquear/desbloquear desde el perfil

**Files:**
- Modify: `apps/mobile/src/app/u/[id].tsx` (import `useFollows` línea 16, hook línea 73, botón follow ~líneas 216–249)

- [ ] **Step 1: Importar y montar**

```tsx
import { Alert } from 'react-native'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
```

Junto al `useFollows(currentUserId)` (línea 73):

```tsx
const { isBlocked, block, unblock } = useBlocks(currentUserId)
const blocked = userId ? isBlocked(userId) : false
```

- [ ] **Step 2: Acción de bloqueo bajo el botón de seguir** (líneas ~216–249; si `blocked`, ocultar el botón de seguir):

```tsx
{blocked ? (
  <Pressable
    onPress={() => {
      if (userId) unblock(userId)
    }}
  >
    <Text className="mt-2 text-xs uppercase tracking-wider text-red-500 underline">
      {t('blocks.blockedState')} — {t('blocks.unblockBtn')}
    </Text>
  </Pressable>
) : (
  <Pressable
    onPress={() => {
      if (!userId) return
      Alert.alert(t('blocks.confirmTitle'), t('blocks.confirmBody'), [
        { text: t('blocks.cancel'), style: 'cancel' },
        { text: t('blocks.confirmAction'), style: 'destructive', onPress: () => { void block(userId) } },
      ])
    }}
  >
    <Text className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
      {t('blocks.blockBtn')}
    </Text>
  </Pressable>
)}
```

(Usar los componentes `Text`/`Pressable` y clases NativeWind ya presentes en el archivo; `Alert.alert` ya se usa en otras pantallas del app.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck` (o el script de typecheck de apps/mobile).
Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/src/app/u/[id].tsx"
git commit -m "feat(mobile): bloquear/desbloquear usuario desde su perfil"
```

---

## Task 14: Mobile — pantalla de bloqueados, entrada y filtro de búsqueda

**Files:**
- Create: `apps/mobile/src/app/blocked-users.tsx`
- Modify: `apps/mobile/src/app/(tabs)/profile.tsx` (fila de navegación tras la de progress-photos, ~líneas 172–189)
- Modify: `apps/mobile/src/app/friends.tsx` (filtro de búsqueda de usuarios)

- [ ] **Step 1: Crear la pantalla** (modelar sobre `apps/mobile/src/app/notification-settings.tsx` — leerla primero para header/back/estilos; imports con alias `@/`):

```tsx
/**
 * Usuarios bloqueados — lista + desbloquear. Entrada desde Perfil.
 */
import { View, ScrollView, Pressable, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'

export default function BlockedUsersScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { blocked, unblock, loading } = useBlocks(user?.id ?? null)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color="#fff" />
        </Pressable>
        <Text className="font-display text-xl text-foreground">{t('blocks.manageTitle')}</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {loading ? null : blocked.length === 0 ? (
          <Text className="mt-8 text-center text-sm text-muted-foreground">{t('blocks.empty')}</Text>
        ) : (
          blocked.map(u => (
            <View key={u.id} className="mb-3 flex-row items-center justify-between rounded border border-border p-3">
              <View className="flex-row items-center gap-3">
                {u.avatarUrl ? (
                  <Image source={{ uri: u.avatarUrl }} className="h-10 w-10 rounded-full" />
                ) : (
                  <View className="h-10 w-10 rounded-full bg-muted" />
                )}
                <View>
                  <Text className="text-sm text-foreground">{u.displayName}</Text>
                  {u.username ? (
                    <Text className="text-xs text-muted-foreground">@{u.username}</Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => unblock(u.id)} hitSlop={8}>
                <Text className="text-xs uppercase tracking-wider text-red-500 underline">
                  {t('blocks.unblockBtn')}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
```

(Verificar contra `notification-settings.tsx` el nombre real del hook de usuario — `useAuthUser` viene de `@/lib/use-auth-user` como en `friends.tsx` — y la forma de su retorno.)

- [ ] **Step 2: Entrada en `(tabs)/profile.tsx`**

Duplicar el `Pressable` de progress-photos (líneas ~172–189, copiar JSX exacto: fila con icono + label + chevron) cambiando destino a `router.push('/blocked-users')` y label `{t('blocks.manageEntry')}`. Elegir un icono de lucide coherente (p.ej. `UserX`).

**GOTCHA typedRoutes:** con `typedRoutes: true`, la ruta nueva no existe en `.expo/types/router.d.ts` hasta regenerar (correr `expo start` una vez) — mientras tanto castear: `router.push('/blocked-users' as never)`. Tras la regen el cast es redundante.

- [ ] **Step 3: Filtro de búsqueda en `friends.tsx`**

Igual que en web (Task 12 Step 4): importar `useBlocks` + `excludeBlocked`, montar `blockedIds` y aplicar `excludeBlocked(...)` al array de resultados de búsqueda después del filtro por texto.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: limpio (con el cast `as never` si no se regeneraron los typedRoutes).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/blocked-users.tsx "apps/mobile/src/app/(tabs)/profile.tsx" apps/mobile/src/app/friends.tsx
git commit -m "feat(mobile): pantalla usuarios bloqueados + filtro de búsqueda"
```

---

## Task 15: Verificación final end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suites completas**

Run: `pnpm --filter @calistenia/core test && pnpm -r typecheck`
Expected: todo verde.

- [ ] **Step 2: Build web**

Run: `pnpm --filter web build`
Expected: build limpio.

- [ ] **Step 3: Checklist manual en web local** (PB :8090 + Vite :5173, usuarios A=test-b@local.test y B del seed `scripts/seed-social-notif-test.mjs`; A y B siguiéndose y con comentarios/reacciones cruzados previos):

1. Como A, bloquear a B desde `/u/<B>` → confirmación → estado bloqueado.
2. Feed de A (`/feed`): la actividad de B desapareció. Feed de B: la de A también.
3. Comentarios de B en sesiones visibles ya no aparecen para A (y viceversa).
4. Leaderboard: B no aparece para A ni A para B.
5. Retos: los retos creados por B y su participación no aparecen para A.
6. Como B: no puede volver a seguir a A (la acción falla sin revelar el motivo).
7. Notificaciones antiguas entre A y B desaparecieron; las nuevas acciones de B no generan notificaciones a A.
8. `/settings/blocked` de A lista a B; desbloquear → contenido de B reaparece en feed/leaderboard, follows NO restaurados.
9. Un tercer usuario C sin bloqueos ve todo con normalidad (sin efectos colaterales).

- [ ] **Step 4: Nota de despliegue**

Al mergear a main las migraciones se auto-aplican a prod, pero los cambios de `pb_hooks/` requieren que el proceso PocketBase de prod se reinicie/recargue. Verificar tras el deploy que el contenedor PB se reinició (mismo procedimiento que en Insights V2).

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** §1 modelo → Tasks 1–2; §2 reglas (9 colecciones incl. `challenges`) → Task 3; §3 guards de escritura (5 hooks incl. `challenge_participants`) → Task 6; §4 efectos transaccionales + guard en helpers compartidos → Tasks 5 y 7; §5 core → Tasks 8–9; §6 UI web+mobile+i18n → Tasks 10–14; §7 errores → manejados en useBlocks (400 idempotente) y guards (mensaje genérico); §8 testing → Tasks 8 (unit) y 15 (E2E manual).
- **Tipos consistentes:** `useBlocks` expone `{ blocked, blockedIds, loading, block, unblock, isBlocked, reload }` y así se consume en Tasks 11–14; `excludeBlocked(users, blockedIds)` coincide entre Task 8 y Tasks 12/14.
- **Sin placeholders:** todos los pasos con código completo; los puntos que dependen de leer el archivo vecino (clases CSS, nombre de variable local de búsqueda) están señalados con el archivo de referencia canónico exacto.
