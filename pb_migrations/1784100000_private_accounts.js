/// <reference path="../pb_data/types.d.ts" />

/**
 * Cuentas privadas con aprobación (#422).
 *
 * #386 cerró QUÉ CAMPOS se publican de cada usuario (las views `public_*` de
 * `1783500000` + las tablas base owner-only de `1783500001`). Lo que quedó sin
 * decidir era QUÉ FILAS: hasta ahora cualquier cuenta autenticada que no
 * estuviera en un bloqueo mutuo podía listar la actividad de cualquier otra.
 *
 * La decisión, documentada en #422, copia a Strava y a Hevy: **público por
 * defecto, privado opt-in con aprobación**. Nadie nota nada el día del
 * despliegue —todos los usuarios nacen públicos y todos los follows existentes
 * se dan por aceptados— y quien quiera cerrar su cuenta tiene por dónde.
 *
 * ESTA MIGRACIÓN ES INVISIBLE PARA EL USUARIO. Sin ninguna cuenta en privado,
 * la rama `user.is_private != true` de las reglas se cumple siempre y el
 * alcance efectivo es idéntico al de ayer. Es a propósito: se puede desplegar
 * suelta, sin coordinar con el móvil ya instalado.
 *
 * ── Por qué `status` no basta por sí solo ──────────────────────────────────
 *
 * `follows.createRule` solo exigía `follower = @request.auth.id` y no decía
 * nada del resto del cuerpo. Añadir un campo `status` sin tocar la regla deja
 * la aprobación de adorno: el atacante POSTea su propia fila ya `accepted` y
 * entra. Comprobado contra una copia de `pb_data` antes de escribir esto —
 * la petición se acepta y la lectura pasa a devolver filas.
 *
 * Por eso hay DOS barreras, y ninguna sobra:
 *
 *  1. El hook `follow_requests.pb.js` fija el `status` en el servidor según la
 *     privacidad del destino e IGNORA lo que venga en el cuerpo. Es la barrera
 *     real.
 *  2. Esta `createRule`, que rechaza un `accepted` forjado contra una cuenta
 *     privada aunque el hook fallara o se retirara.
 *
 * La regla acepta a propósito el `status` VACÍO o ausente: `useFollows.ts:107`
 * —y por tanto la app ya publicada en Play— crea follows sin ese campo. Una
 * regla que lo exigiera rompería el botón de seguir de todos los builds
 * antiguos, en silencio y con `.catch`, que es exactamente el modo de fallo de
 * `1783500001` que no queremos repetir. El hook la normaliza.
 *
 * ── Sobre `@collection.follows` repetido ───────────────────────────────────
 *
 * Las tres condiciones de la rama de seguidores van contra el MISMO
 * `@collection.follows` sin alias, y eso en PocketBase es UN SOLO JOIN: las
 * tres tienen que cumplirse en la misma fila. Es lo que hace que la regla sea
 * segura, y está verificado empíricamente (#422): con `A→V pending` y
 * `A→W accepted` en la tabla, A recibe 0 filas de V. Si fueran joins
 * independientes, `follower`/`following` saldrían de la primera fila y
 * `status` de la segunda, y la regla filtraría.
 *
 * NO añadir un `:alias` a ninguna de las tres. Un alias crea precisamente el
 * join independiente que abre el agujero.
 *
 * Solo se añaden campos y se reescriben reglas: ningún `field.id` existente se
 * toca (ver la nota de seguridad de migraciones del repo).
 */

/** Cláusula de bloqueo estándar del repo (ver 1778000002). */
const BLOCK = 'user.blocked_users.id != @request.auth.id && ' +
  '@request.auth.blocked_users.id != user.id'

/** Regla anterior de las views: la de `1783500000_public_read_views.js`. */
const PREV_VIEW_RULE = '@request.auth.id != "" && ' + BLOCK

/**
 * Regla nueva. El orden de las ramas importa para el coste, no para el
 * resultado: el dueño y las cuentas públicas se resuelven sin tocar `follows`,
 * y el join solo se paga cuando el objetivo es privado de verdad.
 */
const VIEW_RULE = '@request.auth.id != "" && ' + BLOCK + ' && (' +
  'user.id = @request.auth.id || ' +
  'user.is_private != true || (' +
  '@collection.follows.follower ?= @request.auth.id && ' +
  '@collection.follows.following ?= user.id && ' +
  '@collection.follows.status ?= "accepted"' +
  '))'

const VIEWS = [
  "public_sessions",
  "public_cardio_sessions",
  "public_circuit_sessions",
  "public_sets_log",
  "public_prs",
  "public_user_stats",
]

const PREV_FOLLOWS_CREATE = '@request.auth.id != "" && @request.body.follower = @request.auth.id'

const FOLLOWS_CREATE = '@request.auth.id != "" && ' +
  '@request.body.follower = @request.auth.id && (' +
  // Ausente o vacío: cliente antiguo. El hook lo normaliza.
  '@request.body.status = "" || ' +
  '@request.body.status = "pending" || ' +
  // `accepted` directo solo contra cuentas públicas: es el follow instantáneo
  // de siempre. Contra una privada hay que pasar por la solicitud.
  '(@request.body.status = "accepted" && @request.body.following.is_private != true)' +
  ')'

migrate((app) => {
  // ── 1. users.is_private ───────────────────────────────────────────────────
  // Sin default explícito: PocketBase sirve `false` cuando el valor falta, y
  // las reglas usan `!= true`, así que las filas viejas ya se comportan como
  // públicas sin necesidad de backfill.
  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.find((f) => f.name === "is_private")) {
    users.fields.add(new Field({
      name: "is_private",
      type: "bool",
      required: false,
    }))
    app.save(users)
  }

  // ── 2. follows.status ─────────────────────────────────────────────────────
  const follows = app.findCollectionByNameOrId("follows")
  if (!follows.fields.find((f) => f.name === "status")) {
    follows.fields.add(new Field({
      name: "status",
      type: "select",
      required: false, // ver la cabecera: los clientes antiguos no lo mandan
      maxSelect: 1,
      values: ["pending", "accepted"],
    }))
    app.save(follows)
  }

  // Backfill: todo lo que ya existía se da por aceptado. Nadie pierde acceso
  // a nada que ya tuviera.
  app.db()
    .newQuery("UPDATE follows SET status = 'accepted' WHERE status IS NULL OR status = ''")
    .execute()

  // Los dos índices por columna suelta ya existen (idx_follows_follower /
  // idx_follows_following); la bandeja de solicitudes filtra por
  // `following = me && status = 'pending'` y se apoya en el segundo.

  // ── 3. createRule endurecida ──────────────────────────────────────────────
  follows.createRule = FOLLOWS_CREATE
  app.save(follows)

  // ── 4. reglas de lectura de las seis views ────────────────────────────────
  for (const name of VIEWS) {
    const view = app.findCollectionByNameOrId(name)
    view.listRule = VIEW_RULE
    view.viewRule = VIEW_RULE
    app.save(view)
  }
}, (app) => {
  for (const name of VIEWS) {
    const view = app.findCollectionByNameOrId(name)
    view.listRule = PREV_VIEW_RULE
    view.viewRule = PREV_VIEW_RULE
    app.save(view)
  }

  const follows = app.findCollectionByNameOrId("follows")
  follows.createRule = PREV_FOLLOWS_CREATE
  const status = follows.fields.find((f) => f.name === "status")
  if (status) follows.fields.removeById(status.id)
  app.save(follows)

  const users = app.findCollectionByNameOrId("users")
  const isPrivate = users.fields.find((f) => f.name === "is_private")
  if (isPrivate) users.fields.removeById(isPrivate.id)
  app.save(users)
})
