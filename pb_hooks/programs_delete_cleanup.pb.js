/// <reference path="../pb_data/types.d.ts" />

/**
 * Cierre de las inscripciones de un programa borrado (#605).
 *
 * Al borrar un `programs`, PocketBase deja la relación `user_programs.program`
 * vacía (`cascadeDelete: false` desde `1773251039_created_user_programs.js`, y
 * `required: false` desde `1784900000_user_programs_program_optional.js`). La
 * fila sobrevive, que es lo que se quiere —es el historial del usuario, no un
 * detalle del programa del autor—, pero sobrevivía con `is_current = true`: un
 * «programa activo» que ya no existe. `fetchProgramDetail` se estrellaba contra
 * él y esos usuarios se quedaban sin «hoy toca» en home y en el onboarding, sin
 * forma de salir desde la app (el programa ya no está en el catálogo, así que
 * tampoco pueden abandonarlo).
 *
 * El cliente NO puede arreglarlo: el `deleteRule` de `user_programs` es
 * `user = @request.auth.id`, así que el autor solo alcanza su propia fila. Las
 * de los demás daban 403 dentro de un `catch {}`. Con `$app` esto salta las API
 * rules y cierra las de TODOS los inscritos.
 *
 * Y además AVISA (#633). Cerrar la inscripción en silencio arreglaba el programa
 * fantasma pero dejaba al inscrito igual de perdido: su «hoy toca» desaparecía
 * sin una sola explicación. Cada inscripción cerrada genera una notificación
 * `program_deleted` con el nombre del programa capturado antes del borrado.
 */

console.log("[programs_delete_cleanup] hook file loaded")

onRecordDelete(function (e) {
  // TODO lo que usa este callback vive DENTRO del callback, a propósito: el JSVM
  // ejecuta cada handler en un runtime aislado que NO ve el scope de este fichero.
  // Una constante declarada arriba sería `undefined` aquí, el callback lanzaría un
  // ReferenceError y el hook moriría EN SILENCIO. Nada de `Intl` tampoco: goja no
  // lo trae, y `getId()` no existe (se usa `getString("id")`).

  // Tope de lote: un programa muy seguido no debería atragantar una sola pasada.
  // Si se toca el tope se registra, en vez de tragárselo — sin la línea nadie
  // sabría que quedaron inscripciones sin cerrar.
  var ENROLLMENT_BATCH = 500

  // Los ids se recogen ANTES del borrado y se sellan DESPUÉS, y esto no es un
  // capricho de estilo:
  //   - antes: mientras el programa existe, la relación todavía apunta a él y el
  //     filtro `program = {:pid}` encuentra las filas. Después del borrado la
  //     columna está vacía y no hay forma de saber cuáles eran.
  //   - después: si el borrado falla (otra relación que lo bloquee), la excepción
  //     sale por `e.next()` y no llegamos a marcar como abandonada a gente cuyo
  //     programa sigue vivo.
  // Por eso el hook es `onRecordDelete` (envuelve el borrado) y no
  // `onRecordAfterDeleteSuccess`, que llega cuando la relación ya está vacía.
  var enrollmentIds = []

  // Estos tres se leen del registro ANTES de `e.next()` por el mismo motivo que
  // los ids: después del borrado no hay registro del que leerlos, y la
  // notificación de #633 tiene que poder decir QUÉ programa desapareció.
  var programId = ""
  var authorId = ""
  var programName = ""

  try {
    programId = e.record ? e.record.getString("id") : ""
    if (programId) {
      authorId = e.record.getString("created_by")

      // `programs.name` es un campo `json {es, en}` desde
      // `1774378015_i18n_program_fields.js`. Dos trampas encadenadas:
      //   - `record.get()` sobre un `json` devuelve JSONRaw, que en goja es un
      //     array de BYTES (y `Array.isArray` dice true). Se lee con
      //     `getString()` y se parsea.
      //   - lo que se guarda es el OBJETO ENTERO, no una traducción elegida
      //     aquí. El servidor no sabe en qué idioma tiene la app el
      //     destinatario, y concatenar el campo en un string daría
      //     «[object Object]» (#602). Lo localiza el cliente con `localize()`.
      var rawName = e.record.getString("name")
      if (rawName) {
        try {
          var parsed = JSON.parse(rawName)
          // Un `json` i18n da un objeto; una fila que la migración envolvió da
          // un string. Cualquier otra cosa (un nombre que da la casualidad de
          // que parece un número) se queda con el texto crudo.
          programName =
            (parsed !== null && typeof parsed === "object") || typeof parsed === "string"
              ? parsed
              : rawName
        } catch (nameErr) {
          // Fila anterior a la migración i18n: string pelado que no es JSON
          // válido. Se guarda tal cual; `localize()` trata las dos formas.
          programName = rawName
        }
      }

      var rows = $app.findRecordsByFilter(
        "user_programs",
        "program = {:pid}",
        "",
        ENROLLMENT_BATCH,
        0,
        { pid: programId },
      )
      for (var i = 0; i < (rows ? rows.length : 0); i++) {
        enrollmentIds.push(rows[i].getString("id"))
      }
      if (enrollmentIds.length === ENROLLMENT_BATCH) {
        console.log(
          "[programs_delete_cleanup] programa " + programId +
          ": tope de lote alcanzado (" + ENROLLMENT_BATCH + "), puede quedar backlog",
        )
      }
    }
  } catch (err) {
    // Un fallo aquí no puede costarle al autor el borrado de su programa; lo peor
    // que pasa es que las inscripciones se queden sin marcar, y eso se ve en el log.
    console.log("[programs_delete_cleanup] no se pudieron leer las inscripciones:", err)
  }

  // OJO CON `e.next()`. Los hooks de PocketBase son una cadena tipo middleware:
  // un handler que no lo llama corta la cadena, los handlers que OTROS ficheros
  // registraron para la misma colección no corren y AQUÍ ADEMÁS el borrado no
  // llega a ocurrir — todo ello sin un solo error en el log (así se perdieron los
  // tres de `workout_stats.pb.js` en #412). El bloque de arriba va entero dentro
  // de un try/catch justo para que nada se salte esta línea.
  e.next()

  if (enrollmentIds.length === 0) return

  try {
    // `new DateTime()` = ahora, en el tipo que espera un campo `date` de PB
    // (`new Date()` de JS no vale).
    var endedAt = new DateTime()
    var closed = 0
    var notified = 0

    // El `require` va aquí dentro, no arriba del fichero: el handler corre en un
    // runtime JSVM aislado que no ve el scope del módulo. En su propio try para
    // que un fallo al cargarlo no impida cerrar las inscripciones —el aviso es
    // deseable, el cierre es lo que arregla el programa fantasma de #605.
    var notify = null
    try {
      notify = require(`${__hooks}/utils/notifications.js`)
    } catch (reqErr) {
      console.log("[programs_delete_cleanup] utils/notifications.js no cargó:", reqErr)
    }

    for (var j = 0; j < enrollmentIds.length; j++) {
      // Cada fila en su propio try/catch: una mala no se lleva por delante al resto.
      try {
        var row = $app.findRecordById("user_programs", enrollmentIds[j])
        row.set("status", "abandoned")
        row.set("is_current", false)
        row.set("ended_at", endedAt)
        // `$app.save` salta las API rules: es justo lo que el cliente no podía hacer.
        $app.save(row)
        closed++

        // El aviso (#633) va DESPUÉS del save y dentro del mismo try, a propósito:
        // si la inscripción no se pudo cerrar, no se le cuenta al usuario un
        // cierre que no ocurrió.
        //
        // El autor no recibe nada por su propia inscripción: acaba de borrar el
        // programa él mismo.
        //
        // `createSelfNotification` (actor = el propio destinatario) y no
        // `createNotification` con el autor de actor, por dos motivos concretos:
        // esta última descarta el par bloqueado, así que un inscrito que hubiera
        // bloqueado al autor se quedaría otra vez sin enterarse; y `created_by`
        // es `required: false` mientras que `notifications.actor` es
        // `required: true`, así que un programa sembrado sin autor haría fallar
        // el save. Es el mismo patrón que `streak` y `achievement`, y de paso no
        // le enseña la identidad del autor a quien lo tenga bloqueado.
        var recipientId = row.getString("user")
        if (notify && recipientId && recipientId !== authorId) {
          notify.createSelfNotification(
            recipientId,
            "program_deleted",
            programId,
            "program",
            { programName: programName },
          )
          notified++
        }
      } catch (rowErr) {
        console.log("[programs_delete_cleanup] inscripción " + enrollmentIds[j] + " falló:", rowErr)
      }
    }

    console.log(
      "[programs_delete_cleanup] " + closed + "/" + enrollmentIds.length +
      " inscripciones cerradas tras borrar un programa (" + notified + " avisadas)",
    )
  } catch (err) {
    console.log("[programs_delete_cleanup] error al cerrar inscripciones:", err)
  }
}, "programs")
