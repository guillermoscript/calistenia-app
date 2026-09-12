# Declaraciones de Google Play — Health Connect, foreground services y targetSdk

Documento de referencia para los tres formularios de Play Console que bloquean
la publicación, y para la respuesta a los rechazos de la **v1.11.1 (vc35)**:

1. **Health Connect** — «Excessive data access for declared feature» (segundo
   rechazo por la política de acceso mínimo a datos).
2. **Foreground service** — «Play Console declaration and/or app description
   does not sufficiently demonstrate the use of permission».
3. **targetSdk** — Play exige Android 16 (API 36) desde el **2026-08-30**.

**Versión que corrige los tres: 1.12.1 (versionCode 37).**

> **TERCER rechazo (2026-08-31, contra vc38 = v1.12.2)**: «Excessive data
> access» otra vez, ahora por `HeartRate` y `StepsCadence/Steps`. El revisor no
> aceptó «mostrar el dato» (fila de pasos en «Reloj y salud», FC media/máx en el
> detalle de sesión) como función esencial de una app de entreno de calistenia.
> **Corrección: v1.12.3 (versionCode 39)** — se retiran `READ_STEPS` y
> `READ_HEART_RATE`; quedan **3 permisos**: `READ_SLEEP`, `READ_WEIGHT`,
> `READ_BODY_FAT`. Ojo: la app nunca pidió `StepsCadence` — que aparezca en el
> rechazo refuerza que el revisor lee la **declaración de App content**, no el
> manifiesto: al reenviar, vaciar en el paso 2 las justificaciones de Steps y
> HeartRate (desplegar TODAS las secciones, ver 4b).

---

## 1. Qué cambió respecto a la versión rechazada (vc35)

### Health Connect: de 7 permisos a 5

| Permiso eliminado en vc37 | Motivo |
|---|---|
| `READ_ACTIVE_CALORIES_BURNED` | Google lo marcó como no necesario. Se retiró el balance calórico «comes lo que quemas» de Nutrición y las kcal del reloj del detalle de sesión. |
| `READ_RESTING_HEART_RATE` | Google lo marcó como no necesario. Se retiró la fila «FC en reposo» de la pantalla «Reloj y salud» y del contexto de insights. |

Google también listó `HeartRateVariabilityRmssd` y `Vo2Max`, pero **esos dos ya
no estaban en el manifiesto de vc35** (se quitaron en v1.11.1, verificado con
`bundletool dump manifest`). Que los vuelvan a marcar significa que el revisor
leyó la **declaración de App content**, que seguía con la lista vieja. Por eso
el paso 6 del runbook (actualizar la declaración) no es opcional.

Historial completo de recortes:

| Versión | Permisos eliminados |
|---|---|
| 1.11.1 (vc35) | `READ_DISTANCE`, `READ_EXERCISE`, `READ_TOTAL_CALORIES_BURNED`, `READ_HEART_RATE_VARIABILITY`, `READ_VO2_MAX` |
| 1.12.1 (vc37) | `READ_ACTIVE_CALORIES_BURNED`, `READ_RESTING_HEART_RATE` |
| 1.12.3 (vc39) | `READ_STEPS`, `READ_HEART_RATE` (tercer rechazo: la fila de pasos y la FC por sesión no cuentan como función esencial) |

Quedan **3 permisos, todos de solo lectura**: `READ_SLEEP`, `READ_WEIGHT`,
`READ_BODY_FAT`. La app nunca escribe en Health Connect. Las columnas viejas de
`daily_health_cache` (y `hr_avg`/`hr_max` de las sesiones) se conservan sin
escribir.

### Foreground service: `dataSync` → `health`

El cronómetro del entreno en curso corría como FGS de tipo `dataSync`, que es el
tipo para subir/bajar datos y no describe un cronómetro de series. Ahora es
**`health`**, el tipo que Android reserva a «exercise trackers» (categoría
fitness). Cambios en el manifiesto:

| Antes (vc35) | Ahora (vc37) |
|---|---|
| `FOREGROUND_SERVICE_DATA_SYNC` | `FOREGROUND_SERVICE_HEALTH` + `HIGH_SAMPLING_RATE_SENSORS` (prerrequisito de runtime del tipo `health`; permiso normal, sin diálogo) |
| `foregroundServiceType="dataSync\|location"` | `foregroundServiceType="health\|location"` |

`FOREGROUND_SERVICE_LOCATION` (cardio con GPS) no cambia.

### targetSdk 35 → 36

`expo-build-properties` en `app.json` y `android/gradle.properties` (local,
gitignorado) pasan a `targetSdkVersion 36`. `pnpm build:aab` ahora verifica
targetSdk, permisos FGS y que ningún `<service>` siga en `dataSync`.

---

## 2. Health Connect — justificación por tipo de dato

Texto para el formulario (App content → Health Connect): cada permiso con la
función concreta y la pantalla donde el usuario ve el dato.

> **v1.12.3**: `READ_STEPS` y `READ_HEART_RATE` eliminados (tercer rechazo).
> En el paso 2 del formulario hay que **vaciar y guardar** sus justificaciones
> si siguen apareciendo; solo quedan las tres de abajo.

### `READ_SLEEP` — Sueño
Se importa a las **entradas de sueño de la app**, que aparecen en la pantalla
«Reloj y salud», en el calendario y en el seguimiento de descanso. Evita que el
usuario tenga que introducir a mano lo que su reloj ya midió. La app nunca
sobrescribe una entrada creada manualmente por el usuario.

### `READ_WEIGHT` — Peso
Se importa al **seguimiento de peso** de la app (histórico y gráfica de
evolución) y se muestra en la pantalla «Reloj y salud». Evita la doble entrada
manual cuando el usuario se pesa en una báscula conectada. Nunca sobrescribe una
entrada manual.

### `READ_BODY_FAT` — Grasa corporal
Se muestra junto al peso en la pantalla «Reloj y salud» y se guarda en el mismo
registro de **composición corporal**, para que la evolución de peso y grasa se
vean juntas. Nunca sobrescribe una entrada manual.

---

## 3. Manejo de datos

- **Solo lectura.** La app no solicita ni usa ningún permiso de escritura.
- **Sin analítica ni publicidad.** Los datos de Health Connect no se envían a
  proveedores de analítica, publicidad ni a terceros. La app lo indica de forma
  explícita en pantalla antes de pedir los permisos.
- **Almacenamiento.** Los datos se guardan en la cuenta del propio usuario en el
  backend de la app, para poder mostrarlos en el histórico y en el calendario.
  Se eliminan al borrar la cuenta desde la propia app.
- **Revocación.** La pantalla «Reloj y salud» incluye un enlace directo a
  «Gestionar permisos en Health Connect» para revocar el acceso en cualquier
  momento.

---

## 4. Foreground services — declaración

Formulario: App content → **Permisos de servicios en primer plano**. Se declara
UN uso por tipo. Hay que **quitar `dataSync`** del formulario (ya no está en el
manifiesto) y dejar solo estos dos.

### `FOREGROUND_SERVICE_HEALTH` — entreno en curso

- **Caso de uso**: seguimiento de ejercicio / fitness tracker.
- **Descripción para el formulario**:

  > Cuando el usuario inicia un entrenamiento (rutina de fuerza, circuito o
  > sesión libre), la app muestra una notificación persistente con el ejercicio
  > actual, la serie en curso y el cronómetro de descanso, con un botón para
  > pasar al siguiente ejercicio desde la pantalla de bloqueo. El servicio en
  > primer plano mantiene vivo ese cronómetro mientras la app está en segundo
  > plano o el teléfono bloqueado; sin él el sistema pausa el temporizador y el
  > usuario pierde la cuenta de descansos y series. Lo inicia el usuario al
  > pulsar «Empezar», es visible en todo momento como notificación, termina al
  > pulsar «Terminar» o descartar la sesión, y dura exactamente lo que dura el
  > entrenamiento.

### `FOREGROUND_SERVICE_LOCATION` — cardio con GPS

- **Caso de uso**: seguimiento de ubicación iniciado por el usuario.
- **Descripción para el formulario**:

  > Al iniciar una sesión de cardio (carrera, caminata, bici) la app registra la
  > ruta GPS, la distancia y el ritmo en tiempo real y los muestra en una
  > notificación persistente y en el mapa al terminar. El servicio en primer
  > plano con tipo location es obligatorio en Android 14+ para seguir recibiendo
  > posiciones con la pantalla apagada; sin él la ruta queda con huecos. Lo
  > inicia el usuario al pulsar «Empezar cardio», lo detiene al pulsar
  > «Terminar», y solo corre durante la sesión.

### Descripción de la ficha de Play

El rechazo dice que la **descripción de la ficha** no refleja la función que
necesita el FGS. Añadir a la descripción larga (Store listing → es-419) un
bloque como este, **antes** de reenviar:

> **Entrena con el móvil en el bolsillo.** Al empezar un entrenamiento, la
> notificación te muestra el ejercicio, la serie y el cronómetro de descanso, y
> puedes pasar al siguiente ejercicio desde la pantalla de bloqueo sin abrir la
> app.
>
> **Cardio con GPS.** Corre, camina o pedalea y la app registra tu ruta,
> distancia y ritmo en tiempo real, incluso con la pantalla apagada. Al terminar
> ves el mapa y el resumen de la sesión.

---

## 5. Guion del vídeo de demostración

Un solo vídeo, sin cortes, subido a YouTube (no listado) o Drive con enlace
público; el mismo enlace vale para las dos declaraciones. Grabar con
`adb shell screenrecord` o la grabadora del sistema, en un dispositivo con
Health Connect y un reloj con datos reales.

**Parte A — Foreground service `health` (entreno):**
1. Home → abrir un programa → **Empezar entrenamiento**.
2. Se ve la primera serie. Bajar la cortina: la **notificación** muestra
   ejercicio, «SERIE 1/3» y el botón de acción.
3. Ir al home del teléfono (app en segundo plano) y **bloquear la pantalla**.
   Encender: la notificación sigue en la pantalla de bloqueo con el cronómetro
   de descanso corriendo. Pulsar la acción «siguiente» desde ahí.
4. Volver a la app: el progreso ha avanzado. **Terminar** la sesión → la
   notificación desaparece.

**Parte B — Foreground service `location` (cardio):**
5. Pestaña Cardio → **Empezar** → aceptar ubicación. Caminar unos metros con la
   pantalla apagada; encender: la notificación muestra distancia y tiempo.
6. **Terminar** → se ve el mapa con la ruta y el resumen.

**Parte C — Health Connect** *(re-grabar con vc39: el diálogo cambió)*:
7. Perfil → **Reloj y salud** → «Conectar con Health Connect». El diálogo del
   sistema lista **exactamente 3 tipos de datos**.
8. Aceptar → «Sincronizar ahora» → aparecen las filas **Sueño, Peso,
   Grasa corporal**.
9. **Calendario / seguimiento** → la entrada de sueño y la de peso importadas.
   *(justifica SLEEP, WEIGHT, BODY_FAT)*
10. Volver a «Reloj y salud» → «Gestionar permisos en Health Connect».

---

## 4b. Lo que se aprendió al abrir los formularios (2026-08-27)

- **Play construye la lista de permisos «detectados» con la UNIÓN de los
  bundles de TODOS los tracks activos.** Con alpha en vc31 y beta en vc32, el
  formulario de Health Connect listaba los 12 permisos viejos (DISTANCE,
  EXERCISE, HRV, VO2…) aunque internal/prod ya iban con 7. Por eso el revisor
  «veía» HRV y VO₂. Hay que promover el vc recortado a **todos** los tracks:
  `pnpm play:promote --track alpha` / `--track beta` (script nuevo; reutiliza
  un versionCode ya subido sin volver a subir el AAB).
- **El API rechaza el commit del edit con 403 «You must let us know whether your
  app uses any Foreground Service permissions»** mientras la declaración de FGS
  esté incompleta. `play:publish` borra el edit al fallar → el AAB NO queda
  subido (el mensaje de «service account sin permiso» del script es engañoso en
  este caso). Orden obligatorio: **declaración de FGS guardada → publish**.
- **La declaración de FGS exige un enlace de vídeo por cada tarea marcada**;
  el botón «Guardar» está deshabilitado sin él. No se puede guardar a medias.
  El formulario no ofrece «no uso este permiso»: cada permiso detectado hay que
  justificarlo. Para los que solo viven en bundles viejos (DATA_SYNC hasta
  vc35, MEDIA_PLAYBACK hasta vc20), marcar «Otras tareas → Otro», poner el mismo
  vídeo y explicar que el permiso está eliminado en vc37 y solo queda en tracks
  que se están retirando.
- **Bundle nuevo con un FGS nuevo = círculo vicioso con el API**: el formulario
  no lista `FOREGROUND_SERVICE_HEALTH` hasta que Play conoce un bundle que lo
  pida, y el API no commitea ese bundle sin declararlo. Se rompe subiendo el
  AAB **por la consola** (Prueba interna → Crear nueva versión → arrastrar el
  .aab → Guardar como borrador → Guardar y publicar): la consola sí lo acepta,
  el permiso aparece en el formulario, se declara, y a partir de ahí
  `play:promote` funciona por API. Hecho así el 2026-08-27 con vc37.
- La declaración de Health Connect (Aplicaciones de salud, 3 pasos) **sí se
  guardó** el 2026-08-27 con las justificaciones de la sección 2 para los 5
  permisos y con «Gestión del sueño» añadido a las funciones. Queda en
  «Resumen de publicación» sin enviar.
- El aviso de targetSdk en Play Console da de plazo hasta el **1 de noviembre
  de 2026** (no el 30 de agosto que decía el correo genérico).

### Texto para DATA_SYNC (solo bundles viejos)

> Este permiso se usaba para la notificación persistente del entrenamiento en
> curso (ejercicio actual, serie y cronómetro de descanso). Reconocemos que
> dataSync no era el tipo adecuado: en la versión 1.12.1 (código 37) se ha
> ELIMINADO FOREGROUND_SERVICE_DATA_SYNC del manifiesto y ese servicio pasa a
> ser de tipo health (FOREGROUND_SERVICE_HEALTH). El permiso solo permanece en
> versiones anteriores que estamos retirando de todos los canales al promover
> el código 37. No hay ninguna tarea de sincronización de datos en la app.

## 6. Runbook de resubmisión

### Runbook v1.12.3 / vc39 (tercer rechazo)

1. Mergear el PR de `fix/play-rejection-3-hc-steps-hr`.
2. En `main` actualizado: `pnpm release:mobile patch` (1.12.2 → 1.12.3,
   vc38 → 39, changelog + tag) y `git push && git push origin mobile-v1.12.3`.
   El `AndroidManifest.xml` y `build.gradle` locales de `android/` ya quedaron
   en 3 permisos y vc39 (build:aab no ejecuta prebuild).
3. `pnpm build:aab` → verifica vc39, **3 permisos de salud**, FGS
   health|location, targetSdk 36.
4. `pnpm play:publish` (internal) → `pnpm play:promote --track alpha|beta`.
5. **App content → Health Connect, paso 2**: desplegar TODAS las secciones y
   **vaciar y guardar** las justificaciones de Steps y HeartRate si aparecen
   (y cualquier StepsCadence fantasma). Deben quedar exactamente 3.
6. QA en dispositivo: reconectar HC → el diálogo lista **exactamente 3 tipos**;
   el FGS `health` del entreno sigue arrancando (HIGH_SAMPLING_RATE_SENSORS
   sigue declarado, no dependía de READ_HEART_RATE).
7. `pnpm play:promote --track production --code 39` (lo lanza Guillermo con `!`)
   → responder al rechazo con el texto de la sección 7 → Enviar a revisión.

### Runbook del segundo rechazo (v1.12.1/vc37, ya ejecutado)

1. **Mergear el PR** de esta rama (`fix/play-rejection-hc-fgs-sdk36`).
2. En `main` actualizado:
   ```
   git checkout main && git pull
   pnpm release:mobile patch      # 1.12.0 → 1.12.1, vc36 → 37, changelog + tag
   node scripts/extract-changelog-entry.mjs 1.12.1 --lang es --format play | wc -c   # ≤ 500
   git push && git push origin mobile-v1.12.1
   ```
3. **Construir**: `pnpm build:aab` (verifica vc37, 5 permisos de salud, FGS
   health|location, targetSdk 36). Hecho el 2026-08-27:
   `~/Desktop/calistenia-v1.12.1-vc37.aab`.
4. **Grabar el vídeo** (sección 5) con ese build instalado por bundletool, y
   subirlo a YouTube (no listado) o Drive con enlace público.
5. **Play Console → App content → Foreground service permissions**: marcar
   «Otras tareas → Otro» en LOCATION (texto de la sección 4) y en DATA_SYNC
   (texto de 4b), pegar el enlace del vídeo en ambos y **Guardar**. Sin esto el
   paso siguiente falla con 403.
6. **Subir y promover**:
   ```
   pnpm play:publish                 # sube vc37 a internal
   pnpm play:promote --track alpha   # retira los bundles viejos con 12 permisos
   pnpm play:promote --track beta
   pnpm play:status
   ```
   Tras subir vc37, volver a la declaración de FGS: aparecerá
   FOREGROUND_SERVICE_HEALTH → «Otras tareas → Otro» con el texto de la sección
   4 y el mismo vídeo, y DATA_SYNC desaparecerá cuando ningún track lo tenga.
7. **QA en dispositivo antes de mandar a revisión**:
   - Revocar los permisos viejos en Health Connect y volver a conectar: el
     diálogo lista **exactamente 5 tipos**.
   - Empezar un entrenamiento, bloquear pantalla, comprobar que la notificación
     y el cronómetro siguen (el FGS `health` arranca sin `SecurityException`).
   - Empezar un cardio y comprobar la ruta con la pantalla apagada.
   - Revisión visual de barras de estado/navegación: con targetSdk 36 Android
     16 fuerza edge-to-edge y ya no admite el opt-out.
8. **Play Console**:
   - App content → **Health Connect**: ya guardado (4b); revisar que tras
     promover solo queden 5 permisos.
   - Store listing → descripción larga: bloque de la sección 4.
   - App access → confirmar que las **credenciales de prueba** siguen válidas
     (el rechazo del FGS pide «valid testing credentials»).
   - `pnpm play:promote --track production`, y en **Resumen de publicación**
     → **Enviar a revisión** (el targetSdk 36 solo cuenta en producción).

---

## 7. Respuesta al rechazo (texto para el formulario)

Texto para el TERCER rechazo (v1.12.3 / vc39):

> Hemos eliminado los permisos READ_HEART_RATE y READ_STEPS del manifiesto, del
> diálogo de permisos y de la declaración de Health Connect, junto con las
> funciones que los mostraban (frecuencia cardíaca por entrenamiento y total
> diario de pasos). La app no solicita StepsCadence ni lo ha solicitado en
> ninguna versión. La nueva versión (código 39) solicita únicamente 3 tipos de
> datos, todos de solo lectura y cada uno con la pantalla concreta que lo
> muestra: sueño (registro de sueño y calendario), peso y grasa corporal
> (seguimiento de composición corporal). La declaración de App content está
> actualizada para reflejar exactamente esos 3 tipos.

Texto del segundo rechazo (v1.12.1 / vc37), ya enviado:

> Hemos eliminado los permisos READ_ACTIVE_CALORIES_BURNED y
> READ_RESTING_HEART_RATE del manifiesto y del diálogo de permisos.
> READ_HEART_RATE_VARIABILITY y READ_VO2_MAX ya no estaban en el manifiesto de
> la versión 35; hemos actualizado la declaración de Health Connect para que
> refleje los 5 tipos de datos que la app solicita (pasos, frecuencia cardíaca,
> sueño, peso y grasa corporal), cada uno con la pantalla concreta que lo
> muestra. Respecto al servicio en primer plano, hemos sustituido el tipo
> dataSync por health (cronómetro del entrenamiento en curso) y mantenemos
> location (ruta GPS de cardio); la declaración incluye un vídeo que muestra
> ambas funciones con la app en segundo plano, y la descripción de la ficha
> describe ahora esas dos funciones. La nueva versión (código 37) tiene como
> destino Android 16 (API 36).

---

## 8. Si vuelven a rechazar

Apelar adjuntando el vídeo de la sección 5 y la correspondencia
permiso → función → pantalla de las secciones 2 y 4. Los 5 permisos de salud
restantes tienen todos una pantalla que los muestra; los dos tipos de FGS son
los dos únicos servicios que la app arranca.
