# Feature Spec: Estiramientos Pre y Post en Rutinas/Sesiones

**Fecha:** 2026-03-31  
**Estado:** Borrador  
**Objetivo principal:** Incorporar estiramientos antes y despues de entrenar para mejorar preparacion fisica, sostenibilidad de la practica y prevencion de lesiones.

---

## 1) Contexto

Hoy las rutinas y sesiones priorizan el bloque principal de ejercicios, pero no tienen una estructura formal para estiramientos pre y post entrenamiento.

Esto genera tres problemas:

1. Usuarios que entrenan "en frio" sin preparacion especifica.
2. Falta de enfriamiento y descarga muscular despues de entrenar.
3. Menor consistencia en habitos de cuidado fisico, con mayor riesgo de molestias o sobrecargas.

---

## 2) Objetivos del feature

1. Permitir agregar un tipo de ejercicio nuevo: **Estiramiento**.
2. Diferenciar claramente estiramientos **pre** y **post**.
3. Integrar estos bloques tanto en:
   - rutinas de programa, y
   - sesiones libres.
4. Guiar al usuario para sostener una practica mas segura y duradera.
5. Reducir la probabilidad de lesiones por mala preparacion o recuperacion incompleta.

---

## 3) Alcance

### Incluido
- Estiramientos como entidad de entrenamiento de primera clase.
- Bloque pre-entrenamiento (activacion/movilidad dinamica).
- Bloque post-entrenamiento (descarga/estiramiento estatico).
- Configuracion en editor de rutina y experiencia en sesion.
- Registro basico de cumplimiento (si se hizo o se omitio).

### No incluido (por ahora)
- Diagnostico medico o recomendaciones clinicas personalizadas.
- Reemplazo del calentamiento cardiovascular general.
- Motor avanzado de adaptacion por dolor en tiempo real.

---

## 4) Definicion funcional

Se agrega el tipo de ejercicio **Estiramiento** con dos variantes:

1. **Pre-estiramiento**
   - Objetivo: preparar articulaciones, tejidos y patron motor.
   - Enfoque: movilidad dinamica y activacion suave.
   - Duracion orientativa total: 3 a 8 minutos.

2. **Post-estiramiento**
   - Objetivo: bajar carga, mejorar recuperacion y reducir rigidez.
   - Enfoque: estiramiento estatico, respiracion y vuelta a calma.
   - Duracion orientativa total: 5 a 12 minutos.

---

## 5) Experiencia de usuario

## 5.1 En editor de rutina/programa
- Cada dia de entrenamiento puede tener tres bloques:
  1. Pre-estiramiento
  2. Bloque principal
  3. Post-estiramiento
- El creador puede:
  - agregar/editar/quitar estiramientos pre y post,
  - ordenar ejercicios dentro de cada bloque,
  - definir tiempos sugeridos.
- Se pueden usar plantillas recomendadas segun tipo de dia (push, pull, legs, lumbar, full, skill, cardio).

## 5.2 En sesion activa (usuario final)
- La sesion inicia mostrando primero el bloque pre-estiramiento.
- Al completar el bloque principal, se muestra automaticamente el post-estiramiento.
- Si el usuario omite un bloque, queda registrado como "omitido" y se muestra recordatorio breve de seguridad.

## 5.3 En sesiones libres
- El usuario puede crear una sesion rapida y elegir:
  - solo principal,
  - principal + pre,
  - principal + post,
  - principal + pre + post.

---

## 6) Reglas de negocio

1. **Pre-estiramiento no debe ser pasivo largo**
   - Priorizar movilidad dinamica.
   - Evitar retenciones largas en frio.

2. **Post-estiramiento prioriza descarga**
   - Mantener tiempos estables y respiracion controlada.

3. **Minimos sugeridos por bloque**
   - Pre: al menos 2 ejercicios.
   - Post: al menos 2 ejercicios.

4. **Bloques opcionales, pero recomendados**
   - No se bloquea el entrenamiento si se omiten.
   - Se informa el impacto de omitir para reforzar adherencia.

5. **Compatibilidad con enfoque del dia**
   - Los estiramientos sugeridos deben coincidir con la zona dominante del entrenamiento del dia.

---

## 7) Propuesta de contenido inicial (MVP)

### 7.1 Push day
- Pre: movilidad de hombro, activacion escapular, apertura toracica dinamica.
- Post: pectoral, deltoide anterior, triceps.

### 7.2 Pull day
- Pre: movilidad toracica, activacion dorsal/escapular, cuello-hombro suave.
- Post: dorsal, biceps, antebrazo, trapecio.

### 7.3 Legs day
- Pre: cadera, tobillo, bisagra de cadera dinamica.
- Post: cuadriceps, isquios, gluteo, psoas.

### 7.4 Lumbar/core day
- Pre: movilidad de columna y cadera controlada.
- Post: descarga lumbar, gluteo medio, psoas y respiracion.

### 7.5 Full/skill day
- Pre: rutina global corta (hombro + cadera + columna).
- Post: descarga global por cadenas mas exigidas.

---

## 8) Datos y seguimiento (producto)

Para medir adopcion y efectividad del feature, se deberia registrar:

- Si el bloque pre fue completado u omitido.
- Si el bloque post fue completado u omitido.
- Tiempo dedicado a cada bloque.
- Ejercicios de estiramiento mas usados.
- Dias/tipos de rutina con mayor omision.

Esto permite mejorar recomendaciones y detectar friccion real.

---

## 9) KPI y criterios de exito

### KPI de adopcion
- % de sesiones con pre-estiramiento completado.
- % de sesiones con post-estiramiento completado.

### KPI de comportamiento
- Reduccion de sesiones donde el usuario termina de forma abrupta (sin cierre).
- Mejora en consistencia semanal (streak/adherencia).

### KPI de bienestar (proxy)
- Disminucion de reportes de molestias recurrentes (si existe captura de dolor/fatiga).

---

## 10) Riesgos y mitigaciones

1. **Riesgo:** el usuario lo percibe como "mas tiempo".
   - **Mitigacion:** plantillas cortas (3-5 min) y opcion de version rapida.

2. **Riesgo:** confusion entre calentamiento y estiramiento.
   - **Mitigacion:** copy claro: pre = activar, post = recuperar.

3. **Riesgo:** baja adherencia en usuarios avanzados.
   - **Mitigacion:** permitir personalizacion y atajos, sin forzar bloqueo.

---

## 11) Plan de rollout

### Fase 1 (MVP)
- Crear tipo de ejercicio estiramiento.
- Habilitar bloques pre/post en rutinas y sesiones.
- Incluir plantillas base por tipo de dia.

### Fase 2
- Recomendaciones segun historial de omision y tipo de entrenamiento.
- Mejorar contenido guiado (duracion y tecnica sugerida).

### Fase 3
- Personalizacion por preferencias y condicion fisica declarada.
- Ajustes inteligentes para reducir fatiga acumulada.

---

## 12) Definicion de "Done"

Se considera completado cuando:

1. Se puede agregar estiramiento pre y post a cualquier rutina o sesion.
2. El flujo de sesion respeta el orden pre -> principal -> post.
3. El usuario puede omitir bloques sin romper la sesion.
4. Queda trazabilidad minima de uso (completado/omitido y tiempo).
5. Hay un set inicial de plantillas utiles por tipo de dia.

---

## 13) Mensaje de producto recomendado

"Entrena fuerte, recupera mejor. Ahora cada rutina puede incluir estiramientos pre y post para rendir mas y reducir riesgo de lesion."
