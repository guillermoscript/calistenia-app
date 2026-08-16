# Evolución del esquema y versiones del cliente

Cómo cambiar la base de datos y parchear la app sin romper a quien todavía no ha
actualizado.

## El problema

En web despliegas y en minutos todo el mundo corre el código nuevo. **En móvil
eso es imposible.** Desde el día que la app está en Play tienes N versiones del
cliente vivas a la vez, algunas de hace meses, y no existe ningún botón que las
mate. La mayoría de la gente auto-actualiza en 2–4 semanas, pero la cola larga
se queda anclada durante meses.

De ahí sale la única regla que gobierna todo lo demás:

> **Lo que se puede arreglar en el servidor, se arregla en el servidor. Un fallo
> de seguridad que requiere que el usuario actualice NO está arreglado.**

Las capas, por latencia y alcance real:

| Capa | Tarda | Alcanza a |
|---|---|---|
| PocketBase (API rules, `pb_hooks`, migraciones) | minutos | **100%**, hasta el versionCode 1 |
| Web (SPA + service worker en modo prompt) | minutos | ~100% (la pestaña abierta recibe el toast de "nueva versión") |
| Móvil (Play) | build local + revisión + **semanas** de adopción | nunca el 100% |

### No hay OTA, y eso cambia las cuentas

Los builds se hacen en local (`expo prebuild` + `gradlew`), sin EAS, y **no hay
`expo-updates` instalado**. Se evaluó y se descartó a propósito: sin usuarios,
un canal de updates añade superficie nativa y una petición de red en cada
foreground a cambio de nada.

La consecuencia hay que tenerla presente, porque no es menor: **no existe
ninguna vía rápida para parchear JavaScript en el móvil.** Cualquier fix de
cliente, por trivial que sea, cuesta build + subida a Play + semanas de
adopción. De ahí que las dos reglas de este documento se aprieten todavía más:

1. Lo que se pueda mover al servidor, se mueve al servidor — es la única capa
   con latencia de minutos y cobertura del 100%.
2. Las esperas de la fase *expand → contract* se miden en meses, no en semanas.

El día que haya usuarios y una espera de tres semanas duela de verdad, añadir
OTA son unas horas: `expo-updates` + `runtimeVersion: { policy: "appVersion" }`
+ un canal. Los builds se pueden seguir haciendo en local; publicar el parche es
lo único que necesita un servidor de updates (EAS Update tiene tier gratuito, o
se autoaloja el protocolo). **Los APK ya publicados nunca recibirán OTA**: sin
`expo-updates` compilado dentro, no hay nada que escuche.

## Las piezas que hay montadas

| Pieza | Dónde | Para qué |
|---|---|---|
| Cabeceras `X-App-*` | `packages/core/lib/pocketbase.ts` | Cada request dice qué build es |
| Telemetría de versión | `pb_hooks/client_telemetry.pb.js` → `users.app_build` | Saber qué builds siguen vivos |
| `GET /api/app-config` | `pb_hooks/app_config.pb.js` + colección `app_config` | Version gate + feature flags |
| Decisión de bloqueo | `packages/core/lib/app-config.ts` (`evaluateUpdate`) | Pura y testeada; **falla abierto** |
| Pantalla de bloqueo | `apps/mobile/src/components/UpdateGate.tsx` | Forzar o sugerir actualización |
| Guardarraíl | `scripts/check-schema-contract.mjs` (en CI) | Frenar migraciones destructivas |
| Informe | `scripts/client-versions.mjs` | Responder "¿ya puedo contraer?" |

No hay pieza de OTA: ver más arriba.

## Escenario A — hay un agujero de seguridad

En este orden, siempre:

1. **Cierra en el servidor.** Migración de API rules o un hook en `pb_hooks`,
   despliegue. Minutos, y cubre a todos los clientes instalados.
   *Ojo:* al endurecer una regla, PocketBase **no devuelve error** — devuelve 0
   filas. El cliente viejo no ve un 403, ve una lista vacía.
2. **Invalida lo expuesto.** Si se filtraron tokens o datos, rota los secretos;
   cambiar el `tokenKey` de un usuario revoca sus JWT.
3. **Kill switch** si el cierre no basta: pon el flag correspondiente a `false`
   en `app_config.flags` y léelo con `isFlagEnabled` en el punto de uso.
4. **Parche de cliente.** Web: deploy, y la pestaña abierta recibe el toast de
   nueva versión. Móvil: build local + Play, o sea semanas — por eso los pasos
   1 a 3 son los que de verdad cierran el incidente, no éste.
5. **Sube el suelo** solo si el cliente viejo sigue siendo peligroso: pon
   `min_supported_build` en `app_config` al primer build seguro. Los anteriores
   verán la pantalla bloqueante.

## Escenario B — un cambio de esquema que las versiones viejas no soportan

**No se versiona la base de datos.** Los datos son uno solo; duplicar el esquema
por versión de app es inmantenible en cuanto hay tres versiones vivas. Lo que se
hace es **expand → contract**, y las fases 4–5 pueden ir meses después:

```
1. EXPAND     Añades lo nuevo, OPCIONAL. El servidor escribe en ambos sitios
              (dual write). El cliente viejo sigue leyendo lo viejo.
              → Desplegable hoy, no rompe nada.

2. BACKFILL   Migración que rellena lo nuevo con los datos históricos.

3. DUAL READ  Publicas el cliente nuevo, que lee el campo nuevo.
              Ambos mundos conviven.

4. ESPERAR    Semanas o meses. Se mide, no se supone (ver más abajo).

5. CONTRACT   Borras el campo viejo y el dual write.
```

### Qué rompe y qué no

| Cambio | ¿Rompe a los clientes viejos? | Cómo se hace |
|---|---|---|
| Añadir campo opcional | No | Directo |
| Añadir campo `required` | **Sí** — el cliente viejo no lo manda → 400 | Opcional + default en un hook; `required` en la fase contract |
| Renombrar campo | **Sí** | Campo nuevo + dual write + borrar en contract |
| Borrar campo | **Sí** | Solo en contract |
| Cambiar tipo de campo | Sí, y **destruye datos** si no preservas `field.id` | Campo nuevo + backfill |
| **Cambiar el significado de un campo** | Sí, y es el peor | Campo nuevo, siempre |
| Endurecer una API rule | **Sí, en silencio** (0 filas, sin error) | Ver escenario A |

El de "cambiar el significado" merece énfasis. Si `score` pasa de repeticiones a
segundos, el cliente viejo **no falla: miente**. Pinta números plausibles y
equivocados. Un fallo ruidoso siempre es preferible, así que la regla es campo
nuevo y nunca reinterpretar uno existente.

En PocketBase hay dos trampas más, ambas silenciosas:

- Un campo `number` con `required: true` **rechaza el valor 0**.
- En el JSVM, `record.get()` sobre un campo `json` devuelve bytes; usa
  `getString()` y parsea a mano.

### Cuándo se puede contraer

Con datos, no con intuición:

```bash
node scripts/client-versions.mjs https://gym.guille.tech <email> '<pass>' --min 31
```

Imprime la distribución de builds entre los usuarios activos de los últimos 30
días y el veredicto. El criterio es **≤ 1% de usuarios activos por debajo del
build objetivo**, con un suelo duro de 6–12 meses para no dejar tirado a nadie
con un móvil viejo.

Cuando llegue el momento, la migración destructiva lleva la nota que pide el
guardarraíl, **con el porcentaje medido dentro**:

```js
// CONTRACT-OK: `foo` no tiene lectores desde el build 28 y client-versions.mjs
// da 0.0% de activos por debajo del build 31 (medido 2026-09-01).
```

## Operar el version gate

La colección `app_config` se edita desde el admin de PocketBase y surte efecto
en la siguiente petición: sin build, sin deploy, sin revisión de Play.

| Campo | Efecto |
|---|---|
| `min_supported_build` | Por debajo → **pantalla bloqueante**. `0` = desactivado |
| `latest_build` | Por debajo → aviso descartable |
| `latest_version` | Texto de la versión en el aviso |
| `store_url` | Destino del botón "Actualizar" |
| `message_key` | Clave i18n del motivo (`update.reasonSecurity`, `update.reasonIncompatible`) |
| `flags` | Feature flags remotos, leídos con `isFlagEnabled` |

Es texto traducible por **clave**, no por contenido: el servidor no sabe en qué
idioma tiene la app cada usuario.

### Invariantes de seguridad

Están en `evaluateUpdate` y tienen tests. No las relajes sin entenderlas:

1. **Falla abierto.** Sin config, sin red o sin poder identificar el build →
   `'ok'`. Un bug en el gate no puede dejar a nadie fuera de su propia app.
2. **`min_supported_build = 0` desactiva el bloqueo**, y es el valor sembrado.
   El gate no hace nada hasta que alguien sube ese número a mano.
3. **La web manda `build: 0`** y por tanto nunca se bloquea: ya se actualiza
   sola con el service worker.
4. La config se cachea en disco (un kill switch que se esquiva con el modo avión
   no es un kill switch) pero **el caché caduca a los 30 días**, para que bajar
   el mínimo libere también a quien lleva tiempo sin conectar.

## Puesta en marcha

No hay ningún paso manual con cuentas externas. Al desplegar `main`:

1. Las migraciones crean `app_config` (gate **desactivado**) y las columnas de
   telemetría en `users`. No bloquean a nadie ni cambian ningún comportamiento.
2. Las columnas de `users` se rellenan solas conforme la gente vuelve a
   autenticar — pero **solo desde el primer build que lleve las cabeceras
   `X-App-*` dentro**. Los APK ya instalados (vc30 y anteriores) seguirán sin
   identificarse: en `client-versions.mjs` salen como `sin build`, y el gate
   nunca los bloquea porque `build 0` significa "cliente sin identificar".
3. El primer dato útil llega tras publicar un build nuevo y esperar a que se
   adopte. Hasta entonces, `min_supported_build` se queda en 0.

Para probar el gate de punta a punta antes de tener usuarios: pon
`min_supported_build` por encima del build de tu dispositivo en el admin de
PocketBase, abre la app y comprueba que sale la pantalla bloqueante. Luego
devuélvelo a 0.
