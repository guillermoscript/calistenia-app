/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Mapeo HTTP del API de batallas (#481): lectura del body, transacciones que
 * conservan el rechazo, ledger de idempotencia, mapeo de errores y el wrapper
 * `route()` que elimina el envelope repetido de las rutas.
 *
 * IMPORTANTE: `route()` compone closures, y las closures NO sobreviven al paso
 * por `routerAdd` — PocketBase serializa el callback y lo re-evalúa en un runtime
 * aislado (ver tests/pb_hooks/README.md). Por eso los handlers compuestos viven
 * en `utils/battles/routes.js` (dentro del sistema de módulos, donde las
 * closures funcionan) y `battle_api.pb.js` solo registra callbacks de una línea
 * que hacen `require` y delegan.
 */

var state = require(`${__hooks}/utils/battles/state.js`)

// ── Request bodies ───────────────────────────────────────────────────────────

function readBody(e) {
  try {
    var info = e.requestInfo()
    return (info && info.body) || {}
  } catch (err) {
    return {}
  }
}

// ── Transactions ─────────────────────────────────────────────────────────────

/**
 * Run `fn` in a transaction without losing the refusal that aborted it.
 *
 * A JS exception thrown inside `runInTransaction` crosses the Go boundary and comes
 * back out as a generic error, which would turn every deliberate 403/409 into a 500.
 * So the callback catches its own error, stashes it, and throws a plain marker purely
 * to force the rollback; the real refusal is re-thrown here, on the JS side, intact.
 */
function runGuarded(app, fn) {
  var captured = null
  try {
    app.runInTransaction(function (txApp) {
      try {
        fn(txApp)
      } catch (err) {
        captured = err && err.isBattleApiError ? err : toApiError(err)
        throw new Error('battle_api_rollback')
      }
    })
  } catch (err) {
    if (!captured) {
      captured = toApiError(err)
    }
  }
  if (captured) throw captured
}

function toApiError(err) {
  var message = err && err.message ? String(err.message) : String(err)
  // A unique-index violation is what two devices racing the same join look like.
  if (/UNIQUE constraint failed/i.test(message)) {
    return new state.ApiError(409, 'conflict', 'This action was already applied')
  }
  console.log('[battle_api] unexpected transaction error:', message)
  return new state.ApiError(500, 'internal_error', 'Unexpected server error')
}

/**
 * Turn a refusal into its HTTP response. Anything that is not an ApiError is an
 * unexpected failure: log it (a swallowed error here would be indistinguishable from
 * a working endpoint) and return a generic 500 rather than leaking internals.
 */
function respondError(e, err) {
  if (err && err.isBattleApiError) {
    return e.json(err.status, { error: err.code, message: err.message })
  }
  console.log('[battle_api] unhandled error:', err)
  return e.json(500, { error: 'internal_error', message: 'Unexpected server error' })
}

// ── Idempotency ledger ───────────────────────────────────────────────────────

/**
 * Idempotency ledger. Returns false when this `(battle, key)` pair already ran, in
 * which case the caller must skip its side effects and return the CURRENT snapshot —
 * replaying a stored snapshot would hand the client stale state, which is exactly what
 * the reconnect contract forbids.
 *
 * Progress writes deliberately skip this: they are already idempotent because the
 * monotonic clamp makes a replayed value a no-op, and a ledger row per progress tick
 * would grow without bound.
 */
function claimIdempotencyKey(txApp, battleId, userId, endpoint, key) {
  if (!key) return true
  if (typeof key !== 'string' || key.length > 128) {
    state.fail(400, 'invalid_idempotency_key', 'idempotency_key must be a string of at most 128 characters')
  }
  try {
    var existing = txApp.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (existing) return false
  } catch (err) { /* no previous claim */ }

  var collection = txApp.findCollectionByNameOrId('battle_mutations')
  var record = new Record(collection)
  record.set('battle', battleId)
  record.set('user', userId)
  record.set('mutation_key', key)
  record.set('endpoint', endpoint)
  record.set('response', {})
  txApp.save(record)
  return true
}

/**
 * Guardar el resultado de una mutación en su fila del ledger (#357).
 *
 * El resto de endpoints no lo necesitan: su respuesta es el snapshot de ESTA batalla, y
 * al reintentar se recalcula fresco — que es justo lo que exige el contrato de
 * reconexión. La revancha es la excepción, porque su respuesta es una batalla DISTINTA:
 * sin guardar cuál, el segundo toque no tiene forma de saber a dónde ir salvo creando
 * otra, que es exactamente lo que la clave de idempotencia existe para impedir.
 */
function recordMutationResponse(txApp, battleId, key, payload) {
  if (!key) return
  try {
    var row = txApp.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (!row) return
    row.set('response', payload)
    txApp.save(row)
  } catch (err) {
    // El ledger ya impidió la doble ejecución; no poder anotar la respuesta degrada la
    // repetición pero no puede tumbar una mutación que ya ocurrió.
    console.log('[battle_api] could not record mutation response:', err)
  }
}

/** Lo guardado por `recordMutationResponse`, o `null` si no hay nada legible. */
function findMutationResponse(app, battleId, key) {
  if (!key) return null
  try {
    var row = app.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (!row) return null
    return state.jsonField(row, 'response', null)
  } catch (err) {
    return null
  }
}

// ── Route envelope ───────────────────────────────────────────────────────────

var GUARDS = {
  creator: function (app, battle, ctx) { state.requireCreator(battle, ctx.userId) },
  participant: function (app, battle, ctx) { ctx.participant = state.requireParticipant(app, battle, ctx.userId) },
  viewer: function (app, battle, ctx) { ctx.participant = state.requireViewer(app, battle, ctx.userId) },
}

/**
 * El envelope común de las rutas de batalla, una sola vez:
 * auth → pathValue → readBody → runGuarded(findBattle + guard + handler) →
 * snapshot fresco → catch respondError.
 *
 * `opts`:
 *   - guard: 'creator' | 'participant' | 'viewer' — autorización dentro de la
 *     transacción, contra el registro recién cargado.
 *   - public: true — sin auth (solo la landing de invitación).
 *   - pathId: false — la ruta no lleva `{id}` (join resuelve la batalla del token).
 *   - load: false — no cargar/guardar batalla antes del handler (join, landing).
 *   - tx: false — sin transacción; el handler recibe `$app` (lecturas: snapshot, landing).
 *   - status: código de la respuesta snapshot (rematch responde 201).
 *
 * `handler(ctx, app, battle)` puede:
 *   - mutar dentro de la transacción y dejar que el wrapper responda el snapshot;
 *   - `ctx.battleId = ...` para redirigir el snapshot (join, rematch);
 *   - `ctx.extend.clave = valor` para añadir claves top-level al snapshot;
 *   - `ctx.after = function (fresh) {...}` para efectos post-commit (avisos);
 *   - `ctx.respond = function () {...}` para respuestas que no son snapshot.
 *
 * OJO: un handler nunca "devuelve" la respuesta. `e.json()` escribe la respuesta
 * como efecto y devuelve undefined en goja, así que el wrapper no puede saber por
 * el valor de retorno si el handler ya respondió — llamar a `e.json()` dentro del
 * handler Y dejar que el wrapper responda concatena dos documentos JSON en el
 * mismo body. Toda respuesta que no sea el snapshot va SIEMPRE vía `ctx.respond`.
 */
function route(opts, handler) {
  return function (e) {
    try {
      var ctx = {
        e: e,
        userId: opts.public ? '' : state.requireUserId(e),
        battleId: opts.pathId === false ? '' : e.request.pathValue('id'),
        body: readBody(e),
        participant: null,
        extend: {},
        after: null,
        respond: null,
      }

      if (opts.tx === false) {
        var loaded = null
        if (opts.load !== false) {
          loaded = state.findBattle($app, ctx.battleId)
          if (opts.guard) GUARDS[opts.guard]($app, loaded, ctx)
        }
        handler(ctx, $app, loaded)
      } else {
        runGuarded($app, function (txApp) {
          var battle = null
          if (opts.load !== false) {
            battle = state.findBattle(txApp, ctx.battleId)
            if (opts.guard) GUARDS[opts.guard](txApp, battle, ctx)
          }
          handler(ctx, txApp, battle)
        })
      }

      if (ctx.respond) return ctx.respond()

      var fresh = state.findBattle($app, ctx.battleId)
      if (ctx.after) ctx.after(fresh)

      var scoring = require(`${__hooks}/utils/battles/scoring.js`)
      var snapshot = scoring.snapshotOf($app, fresh, ctx.userId)
      for (var key in ctx.extend) snapshot[key] = ctx.extend[key]
      return e.json(opts.status || 200, snapshot)
    } catch (err) {
      return respondError(e, err)
    }
  }
}

module.exports = {
  readBody: readBody,
  runGuarded: runGuarded,
  respondError: respondError,
  claimIdempotencyKey: claimIdempotencyKey,
  recordMutationResponse: recordMutationResponse,
  findMutationResponse: findMutationResponse,
  route: route,
}
