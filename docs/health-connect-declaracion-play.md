# Declaraciones de Google Play — Health Connect, foreground services y targetSdk

Documento de referencia para los tres formularios de Play Console que bloquean
la publicación, y para la respuesta a los rechazos de la **v1.11.1 (vc35)**:

1. **Health Connect** — «Excessive data access for declared feature» (segundo
   rechazo por la política de acceso mínimo a datos).
2. **Foreground service** — «Play Console declaration and/or app description
   does not sufficiently demonstrate the use of permission».
3. **targetSdk** — Play exige Android 16 (API 36) desde el **2026-08-30**.

**Versión que corrige los tres: 1.12.1 (versionCode 37).**

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

Quedan **5 permisos, todos de solo lectura**: `READ_STEPS`, `READ_HEART_RATE`,
`READ_SLEEP`, `READ_WEIGHT`, `READ_BODY_FAT`. La app nunca escribe en Health
Connect. Las columnas viejas de `daily_health_cache` se conservan sin escribir.

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

### `READ_STEPS` — Pasos
Se muestran como el total diario de pasos en la pantalla **«Reloj y salud»**.
Permiten al usuario ver su actividad diaria fuera de los entrenamientos
registrados en la app.

### `READ_HEART_RATE` — Frecuencia cardíaca
Las muestras de FC se cruzan con la ventana temporal de cada entrenamiento
registrado en la app (fuerza, cardio y circuitos) para calcular y mostrar la
**FC media y FC máxima de esa sesión** en la pantalla de detalle del
entrenamiento. Es la función central de la integración con el reloj: sin este
dato la app no puede mostrar la intensidad real del entrenamiento.

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

**Parte C — Health Connect:**
7. Perfil → **Reloj y salud** → «Conectar con Health Connect». El diálogo del
   sistema lista **exactamente 5 tipos de datos**.
8. Aceptar → «Sincronizar ahora» → aparecen las filas **Pasos, Sueño, Peso,
   Grasa corporal**.
9. **Historial** → abrir un entrenamiento hecho con el reloj puesto → mostrar
   **FC MEDIA / FC MÁX**. *(justifica HEART_RATE)*
10. **Calendario / seguimiento** → la entrada de sueño y la de peso importadas.
    *(justifica SLEEP, WEIGHT, BODY_FAT)*
11. Volver a «Reloj y salud» → «Gestionar permisos en Health Connect».

---

## 6. Runbook de resubmisión

1. **Mergear el PR** de esta rama (`fix/play-rejection-hc-fgs-sdk36`).
2. En `main` actualizado:
   ```
   git checkout main && git pull
   pnpm release:mobile patch      # 1.12.0 → 1.12.1, vc36 → 37, changelog + tag
   node scripts/extract-changelog-entry.mjs 1.12.1 --lang es --format play | wc -c   # ≤ 500
   git push && git push origin mobile-v1.12.1
   ```
3. **Construir y subir**:
   ```
   pnpm build:aab        # verifica vc37, 5 permisos de salud, FGS health|location, targetSdk 36
   pnpm play:publish     # sube a internal
   pnpm play:status
   ```
4. **QA en dispositivo antes de mandar a revisión**:
   - Revocar los permisos viejos en Health Connect y volver a conectar: el
     diálogo lista **exactamente 5 tipos**.
   - Empezar un entrenamiento, bloquear pantalla, comprobar que la notificación
     y el cronómetro siguen (el FGS `health` arranca sin `SecurityException`).
   - Empezar un cardio y comprobar la ruta con la pantalla apagada.
   - Revisión visual de barras de estado/navegación: con targetSdk 36 Android
     16 fuerza edge-to-edge y ya no admite el opt-out.
5. **Grabar el vídeo** de la sección 5 con ese build.
6. **Play Console (solo Guillermo)**:
   - App content → **Health Connect**: dejar solo los 5 tipos y pegar la
     sección 2. Quitar explícitamente HRV, VO₂ máx, calorías activas y FC en
     reposo.
   - App content → **Foreground service permissions**: quitar `dataSync`;
     declarar `health` y `location` con los textos de la sección 4 y el enlace
     del vídeo.
   - Store listing → descripción larga: añadir el bloque de la sección 4.
   - App access → confirmar que las **credenciales de prueba** siguen válidas
     (el rechazo del FGS pide «valid testing credentials»).
   - Promover vc37 a **producción** (el requisito de targetSdk 36 solo se
     cumple con una versión en producción) y **enviar a revisión**.

---

## 7. Respuesta al rechazo (texto para el formulario)

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
