# Declaración de Health Connect — Google Play Console

Documento de referencia para el formulario de declaración de Health Connect y
para la respuesta al rechazo de la v1.11.0 (política de acceso mínimo a datos).

**Versión que corrige el rechazo: 1.11.1 (versionCode 35).**

---

## 1. Qué cambió respecto a la versión rechazada

Se eliminaron 5 permisos del manifiesto y del diálogo de permisos:

| Permiso eliminado | Motivo |
|---|---|
| `READ_DISTANCE` | Sin ninguna funcionalidad que lo consumiera. |
| `READ_EXERCISE` | Sin ninguna funcionalidad que lo consumiera. |
| `READ_TOTAL_CALORIES_BURNED` | Se leía pero nunca se mostraba al usuario. |
| `READ_HEART_RATE_VARIABILITY` | La métrica se retiró de la app. |
| `READ_VO2_MAX` | La métrica se retiró de la app. |

Quedan 7 permisos, todos de **solo lectura**. La app nunca escribe en Health Connect.

---

## 2. Justificación por tipo de dato

Texto para el formulario: cada permiso con la función concreta y la pantalla
donde el usuario ve el dato.

### `READ_STEPS` — Pasos
Se muestran como el total diario de pasos en la pantalla **"Reloj y salud"**,
junto al resto del resumen del día. Permiten al usuario ver su actividad diaria
fuera de los entrenamientos registrados en la app.

### `READ_ACTIVE_CALORIES_BURNED` — Calorías activas
Dos usos visibles:
1. Se muestran como calorías activas del día en la pantalla **"Reloj y salud"**.
2. Alimentan el **balance calórico de la pestaña Nutrición**: la app resta las
   calorías quemadas de las consumidas para mostrar el balance real del día, que
   es la función principal del seguimiento nutricional.
3. Se adjuntan a cada entrenamiento como calorías reales gastadas en el detalle
   de la sesión, en lugar de una estimación.

### `READ_HEART_RATE` — Frecuencia cardíaca
Las muestras de FC se cruzan con la ventana temporal de cada entrenamiento
registrado en la app (fuerza, cardio y circuitos) para calcular y mostrar la
**FC media y FC máxima de esa sesión** en la pantalla de detalle del
entrenamiento. Sin este dato, la app no puede mostrar la intensidad real del
entrenamiento; es la función central de la integración con el reloj.

### `READ_RESTING_HEART_RATE` — Frecuencia cardíaca en reposo
Se muestra como FC en reposo del día en la pantalla **"Reloj y salud"**. Es el
indicador de recuperación que el usuario consulta junto al sueño para decidir si
entrenar fuerte o descansar.

### `READ_SLEEP` — Sueño
Se importa a las **entradas de sueño de la app**, que aparecen en la pantalla
"Reloj y salud", en el calendario y en el seguimiento de descanso. Evita que el
usuario tenga que introducir a mano lo que su reloj ya midió. La app nunca
sobrescribe una entrada creada manualmente por el usuario.

### `READ_WEIGHT` — Peso
Se importa al **seguimiento de peso** de la app (histórico y gráfica de
evolución) y se muestra en la pantalla "Reloj y salud". Evita la doble entrada
manual cuando el usuario pesa en una báscula conectada. Nunca sobrescribe una
entrada manual.

### `READ_BODY_FAT` — Grasa corporal
Se muestra junto al peso en la pantalla "Reloj y salud" y se guarda en el mismo
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
- **Revocación.** La pantalla "Reloj y salud" incluye un enlace directo a
  "Gestionar permisos en Health Connect" para revocar el acceso en cualquier
  momento.

---

## 4. Guion del vídeo de demostración (si lo piden)

Grabar en un dispositivo con Health Connect y un reloj con datos reales:

1. Perfil → **Reloj y salud** → "Conectar con Health Connect". Se ve el diálogo
   del sistema con **exactamente los 7 tipos de datos** declarados.
2. Aceptar → "Sincronizar ahora" → aparecen las filas: **Pasos, Calorías
   activas, FC en reposo, Sueño, Peso, Grasa corporal**.
3. Pestaña **Nutrición** → mostrar el balance calórico del día con las calorías
   activas descontadas. *(justifica ACTIVE_CALORIES)*
4. **Historial** → abrir un entrenamiento hecho con el reloj puesto → mostrar
   **FC MEDIA / FC MÁX** y las calorías reales en el detalle. *(justifica
   HEART_RATE)*
5. **Calendario / seguimiento** → mostrar la entrada de sueño y la de peso
   importadas del reloj. *(justifica SLEEP, WEIGHT, BODY_FAT)*
6. Volver a "Reloj y salud" → "Gestionar permisos en Health Connect" para
   mostrar la revocación.

---

## 5. Runbook de resubmisión

Orden obligatorio. El paso 1 es una **dependencia dura**: los scripts de
publicación (`build:aab`, `play:publish`, `play:status`) no existen en `main`,
viven en el PR #591.

1. **Mergear el PR #591** (`feat(release): publicar en Google Play desde local
   con la API de Play`). Está en verde y ya se probó de punta a punta: publicó
   la v1.11.0.
2. **Mergear el PR #593** (este recorte de permisos).
3. En `main` actualizado:
   ```
   git checkout main && git pull
   pnpm release:mobile patch      # 1.11.0 → 1.11.1, vc34 → 35, changelog + tag
   git push && git push origin mobile-v1.11.1
   ```
4. **Construir y subir**:
   ```
   pnpm build:aab
   pnpm play:publish              # sube a internal
   pnpm play:status               # verificar que el track quedó en vc35
   ```
   Requiere `~/keystores/calistenia-play-service-account.json` (presente) y el
   keystore de firma. Recuerda que la ficha solo tiene el locale `es-419`: las
   notas en inglés no se envían.
5. **QA en dispositivo antes de mandar a revisión** — el punto crítico es
   revocar los permisos viejos en Health Connect y volver a conectar, para
   confirmar que **el diálogo del sistema lista exactamente 7 tipos de datos**.
6. **Paso manual en Play Console (solo lo puede hacer Guillermo)**:
   - App content → **Health Connect / Salud conectada** → actualizar la
     declaración quitando los 5 permisos eliminados y pegando la justificación
     por tipo de dato de la sección 2 de este documento.
   - Responder al rechazo indicando qué permisos se eliminaron.
   - **Enviar a revisión.** Sin este paso, subir el AAB no reabre la revisión.

---

## 6. Si vuelven a rechazar

Solo entonces apelar, adjuntando el vídeo del punto 4 y esta correspondencia
permiso → función. Los 7 restantes tienen todos una pantalla que los muestra;
el rechazo anterior se explica por los 5 que ya se han eliminado.
