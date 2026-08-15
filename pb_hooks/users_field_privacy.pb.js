/// <reference path="../pb_data/types.d.ts" />

/**
 * Privacidad por campo en `users` (#411).
 *
 * `users` tiene que seguir siendo legible entre usuarios: el muro, el buscador
 * de amigos, los comentarios y `expand=user` necesitan `display_name`, `avatar`
 * y `level`. Pero una API rule no sabe acotar columnas, así que la regla de
 * `1783400002_block_read_rules_users.js` servía la FILA ENTERA a cualquier
 * autenticado no bloqueado que supiera el id del otro: altura, peso, cintura,
 * peso objetivo, objetivo, plan de entrenamiento, zona horaria, `tier`, `role`
 * y hasta el código de referido.
 *
 * Las API rules no filtran por campo, pero `onRecordEnrich` sí: se dispara para
 * CADA registro justo antes de serializarlo —en `list`, en `view`, en los
 * `expand` y en los mensajes de realtime— y `record.hide()` recorta esa
 * respuesta concreta sin tocar ni el esquema ni los datos.
 *
 * Por eso esto es un hook y no una migración con backfill: los campos siguen
 * donde estaban, el dueño los lee y los escribe igual que siempre —incluida la
 * app ya instalada en Play, que no se entera de nada— y lo único que cambia es
 * lo que ve un tercero. Mover los campos habría repetido el problema de
 * despliegue de `1783500001_lock_base_collections.js` (#386): dejar ciegos a los
 * builds antiguos, en silencio, porque esas lecturas llevan `.catch`.
 *
 * LISTA BLANCA, a propósito: se publica lo que está en PUBLIC y se esconde todo
 * lo demás. Un campo nuevo en `users` nace privado y hay que añadirlo a mano
 * para publicarlo. Con una lista negra pasa lo contrario, y es exactamente así
 * como `hr_avg`/`hr_max` acabaron expuestos en las colecciones de sesión (#386).
 *
 * Los campos `system` (id, email, password, tokenKey, verified,
 * emailVisibility) los gobierna PocketBase —el email por `emailVisibility`— y
 * este hook no los toca.
 *
 * OJO: todo va DENTRO del handler a propósito. Los handlers del JSVM corren en
 * un runtime aislado y no ven el scope del fichero: sacar la lista o el bucle
 * aquí arriba da `ReferenceError` en tiempo de petición, no al arrancar. Es la
 * misma razón por la que utils/blocks.js se requiere dentro de cada handler.
 */
onRecordEnrich(function (e) {
  // Lo único que las pantallas cross-user consumen de otra persona.
  //  - display_name/avatar/level: muro, buscador de amigos, comentarios, ranking.
  //  - name: el fallback de display_name en el buscador (FriendsPage.tsx y
  //    apps/mobile/src/app/friends.tsx: `u.display_name || u.name`). Sin él, quien
  //    no haya puesto nombre visible sale como "?".
  //  - created/updated: marcas de tiempo del registro; PocketBase NO las marca
  //    `system`, así que hay que nombrarlas o se recortarían también.
  //  - is_private (#422): el perfil ajeno tiene que saber si pintar "Seguir" o
  //    "Solicitar", y el estado vacío tiene que poder decir "cuenta privada" en
  //    vez de un ranking a cero. Que se sepa que una cuenta es privada no es la
  //    fuga —lo es su contenido— y es lo que hacen Instagram y Strava.
  var PUBLIC = ["display_name", "avatar", "level", "name", "created", "updated", "is_private"]

  // Sin petición (enriquecidos internos) o sin auth se recorta igual: cierra en fallo.
  var auth = e.requestInfo ? e.requestInfo.auth : null
  var privileged = false

  if (auth) {
    if (auth.id === e.record.id) {
      // El dueño ve su fila entera. Sin esto se rompen su onboarding y su perfil,
      // que es el fallo caro: son escrituras del propio usuario sobre estos campos.
      privileged = true
    } else if (e.requestInfo.hasSuperuserAuth()) {
      // El cron de recordatorios lee `timezone` de todo el mundo con token de
      // superusuario (mcp-server/src/api/admin-pb.ts). Sin esta exención mandaría
      // los push en UTC y sin dar error.
      privileged = true
    } else if (auth.getString("role") === "admin") {
      // AdminPage lista `role` y `tier` de otros usuarios.
      privileged = true
    }
  }

  if (!privileged) {
    // Se deriva del esquema real en vez de mantener una lista a mano: así el
    // recorte no se queda atrás cuando alguien añada un campo a `users`.
    var fields = e.record.collection().fields
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i]
      if (field.getSystem()) continue
      var name = field.getName()
      if (PUBLIC.indexOf(name) !== -1) continue
      e.record.hide(name)
    }
  }

  // Los hooks de PocketBase son una cadena: sin `e.next()` se quedan sin correr
  // los de los OTROS ficheros, y en silencio (#412).
  e.next()
}, "users")
