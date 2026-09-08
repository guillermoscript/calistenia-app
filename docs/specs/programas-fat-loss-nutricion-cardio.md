# Párrafo de nutrición y receta de cardio para los programas `fat_loss`

Fuente única de verdad para los tres programas oficiales de pérdida de grasa.
Decidido en [#718](https://github.com/guillermoscript/calistenia-app/issues/718);
lo consumen [#720](https://github.com/guillermoscript/calistenia-app/issues/720)
(Principiante · Quema Grasa),
[#722](https://github.com/guillermoscript/calistenia-app/issues/722)
(Intermedio · Definición) y
[#724](https://github.com/guillermoscript/calistenia-app/issues/724)
(Avanzado · Cutting Élite).

**Regla de uso:** el texto se copia **tal cual**, sin reescribirlo por programa.
La receta de cardio sí se adapta: cada programa tiene su tabla más abajo.

---

## 1. Por qué existe este documento

Los tres programas están etiquetados `goal_type: 'fat_loss'` y ninguno decía nada
sobre el déficit calórico, la proteína, los pasos ni un cardio de verdad. El
entrenamiento de Quema Grasa gasta ~1,4 k kcal a la semana; Cutting Élite promete
«cardio + alta frecuencia» y son unos 106 minutos de *finishers* repartidos en 12
semanas. La grasa la decide el déficit; sin esa frase el nombre del programa es
marketing.

Como los tres los arreglan agentes distintos y en paralelo, el texto se decide
aquí una vez y no se vuelve a redactar.

---

## 2. El párrafo, listo para copiar

Va **al final** de `program.instructions` del JSON del programa, después de lo
que ya haya (progresión, descarga, para quién es), separado por una línea en
blanco.

`instructions` se pinta con `whitespace-pre-line` en web
(`apps/web/src/pages/ProgramDetailPage.tsx:581`) y como `<Text>` plano en móvil
(`apps/mobile/src/app/program/[id].tsx:295`). **No hay markdown y no hay enlaces
clicables**: los saltos de línea (`\n`) sí se respetan, un `[Nutrición](/nutrition)`
saldría en crudo. Por eso el texto manda al usuario a la pestaña por su nombre.

### Español (`instructions.es`)

```
Nutrición y cardio (esto es lo que decide la grasa):
· Entrenar protege tu músculo; la grasa la pierdes por el déficit. Come entre 300 y 500 kcal por debajo de tu gasto diario: es medio kilo o menos por semana, y con eso basta.
· Proteína: entre 1,6 y 2,2 gramos por kilo de peso al día, repartida en 3 o 4 comidas. Es lo que evita que lo que pierdas sea músculo en vez de grasa.
· Camina entre 7.000 y 10.000 pasos al día. Fuera del entrenamiento es donde se te va la mayor parte de la energía del día.
· Suma 2 o 3 sesiones de cardio suave de 20 a 30 minutos a la semana (andar rápido, bici, trote cómodo), aparte de este programa: en días sueltos o después de la fuerza, nunca antes.
· Abre Nutrición en el menú de la app: te calcula tus calorías y tu proteína con tu peso, tu altura y tu actividad, y ahí mismo apuntas las comidas.
```

### English (`instructions.en`)

```
Nutrition and cardio (this is what actually decides fat loss):
· Training protects your muscle; the deficit is what loses the fat. Eat 300 to 500 kcal below what you burn in a day — that is about a pound a week or less, and that is enough.
· Protein: 1.6 to 2.2 grams per kilo of body weight per day, spread across 3 or 4 meals. That is what keeps the weight you lose from being muscle instead of fat.
· Walk 7,000 to 10,000 steps a day. Most of the energy you burn in a day happens outside your workouts.
· Add 2 or 3 easy cardio sessions of 20 to 30 minutes a week (brisk walking, cycling, easy jogging) on top of this program — on their own days or after your strength work, never before it.
· Open Nutrition in the app menu: it works out your calories and protein from your weight, height and activity, and you log your meals right there.
```

### Escapado para el JSON

Al pegarlo en `programs/<slug>.json` los saltos de línea van como `\n`. Ejemplo
de cómo queda el final del campo:

```json
"instructions": {
  "es": "…texto que ya había…\n\nNutrición y cardio (esto es lo que decide la grasa):\n· Entrenar protege tu músculo; …",
  "en": "…existing text…\n\nNutrition and cardio (this is what actually decides fat loss):\n· Training protects your muscle; …"
}
```

### Lo que comprueba el validador

`scripts/check-program-content.mjs` (regla `fat_loss_nutrition`, en `STRICT_RULES`)
solo exige que `instructions.es` contenga «déficit» y que `instructions.en`
contenga «deficit». El párrafo de arriba lo cumple. **No cambies esas dos
palabras.**

Ojo con el efecto colateral: la lista `PROMISES` del mismo validador tiene una
entrada `cardio` que se dispara con la palabra «cardio» en el texto y exige que
el programa tenga al menos un bloque de cardio codificado. Es decir, **el párrafo
y la receta de la sección 3 entran juntos o no entran**: pegar solo el texto deja
el programa avisando por promesa incumplida.

---

## 3. La receta de cardio, codificada en el JSON

### 3.1 Decisión: bloques `is_timer`, **no** `day_type: 'circuit'`

Los bugs de circuitos ([#601](https://github.com/guillermoscript/calistenia-app/issues/601),
[#625](https://github.com/guillermoscript/calistenia-app/issues/625),
[#640](https://github.com/guillermoscript/calistenia-app/issues/640)) están
cerrados y los circuitos funcionan **en la app**, pero no se pueden sembrar desde
`programs/*.json`:

`pb_migrations/1784800000_program_day_config_circuit.js` añadió seis campos de
configuración (`circuit_mode`, `circuit_rounds`, `circuit_work_seconds`,
`circuit_rest_seconds`, `circuit_rest_between_exercises`,
`circuit_rest_between_rounds`) a `program_day_config`, pero
`scripts/generate-program-seed-migration.mjs:490` escribe solo
`day_id`, `day_name`, `day_focus`, `day_type`, `day_color` y `sort_order`. Un día
sembrado con `day_type: 'circuit'` llega a producción **sin** tiempos de trabajo:
`packages/core/hooks/usePrograms.ts:105` deja `workSeconds` y `restSeconds` en
`undefined` (solo `rounds` cae a 3 y `restBetweenRounds` a 60).

**Conclusión: ninguna issue de contenido usa `day_type: 'circuit'`.** Si algún día
se quiere, primero hay que enseñar al generador de siembra a escribir esos seis
campos — eso es otra issue, no ésta.

### 3.2 Qué cuenta como «bloque de cardio» para el validador

`scripts/check-program-content.mjs:440` cuenta un bloque cuando un ejercicio
cumple **las cuatro** condiciones a la vez:

| Condición | Valor |
|---|---|
| `priority` de trabajo | `primary`, `secondary`, `accessory`, `high`, `med` o `low` — **nunca `warmup` ni `cooldown`** |
| `is_timer` | `true`, con `timer_seconds > 0` |
| Categoría o id | categoría `full` en el catálogo, **o** id que case con `/burpee\|jump\|jack\|climber\|skater\|high_knee\|bear_crawl\|rope\|jog\|run\|sprint\|cardio\|hiit/` |
| Duración total | `sets × timer_seconds ≥ 300` (5 minutos) |

`CARDIO.blocksPerWeek = 2`: hacen falta **2 bloques por fase** (cada fase es una
semana tipo). El validador no distingue nivel, así que 2 es el suelo para los
tres; esta receta pide 3 en intermedio y avanzado porque es lo que la promesa del
programa exige, no porque el validador lo obligue.

> **La trampa que hay que evitar.** El umbral se mide **por ejercicio**, no por
> día. Tres ejercicios de 4 × 45 s en el mismo *finisher* son 540 s de cardio y
> cuentan **cero** bloques (cada uno suma 180 s). Es exactamente lo que ya le
> pasa a Cutting Élite: tiene 12 *finishers* tipo `sets: 1, timer_seconds: 120` y
> el validador le cuenta 0 bloques en las tres fases.
>
> Por eso cada *finisher* de esta receta es **un único ejercicio ancla** con
> `sets × timer_seconds ≥ 450`, con 150 s de margen sobre el suelo. Si quieres
> añadir un segundo ejercicio corto al lado, adelante: no resta, simplemente no
> suma bloque.

### 3.3 Dónde va el bloque

- Al **final del día**, después del trabajo de fuerza y antes del enfriamiento.
  Nunca antes de la fuerza.
- En **días distintos** dentro de la misma fase (dos días separados en
  principiante; tres en intermedio y avanzado). Repetir el bloque el mismo día no
  añade el segundo bloque semanal desde el punto de vista del usuario, aunque el
  validador lo cuente.
- `priority: "secondary"`, que es lo que ya usan los *finishers* actuales de
  Cutting.
- `sort_order` continuando el del día.

### 3.4 Impacto: el cerrojo de las contraindicaciones

La regla `contraindications` (también en `STRICT_RULES`) exige que un programa que
use un id que case con `/jump|plyo|burpee|skater|nordic|hop\b/` declare `knee` en
sus `contraindications` de `scripts/lib/program-catalog.mjs`.

| Programa | `contraindications` hoy | ¿puede usar cardio de impacto? |
|---|---|---|
| `principiante-quema-grasa` | `['knee','ankle']` | **Sí** |
| `intermedio-definicion` | `['wrist','shoulder','elbow']` | **No** |
| `avanzado-cutting` | `['wrist','shoulder','elbow']` | **No** |

Por eso las recetas de Definición y Cutting de abajo son **de bajo impacto**: no
usan ningún id con salto. Así ninguna de las dos issues necesita tocar
`program-catalog.mjs`, que es de otra issue.

> Aviso aparte, que **no** crea #718 y que hay que arreglar antes de que la ola 4
> ponga `--strict` en CI: esos dos programas **ya** avisan hoy por esta regla, con
> ejercicios que ya tienen (`nordic_curl` y `skaters` en Definición, `burpees` y
> `nordic_full` en Cutting). O #722/#724 los sustituyen, o alguien añade `knee` a
> los dos esqueletos. Anotado en #713.

### 3.5 Ids del catálogo, verificados

Comprobados contra `packages/core/data/exercise-catalog.json` (1.576 ejercicios).
**El id `jogging` que menciona la issue no existe: el correcto es `run`.**

| id | Categoría | Dificultad | Nombre es | Material | ¿Impacto? |
|---|---|---|---|---|---|
| `high_knees` | `full` | beginner | Rodillas Altas | ninguno | no |
| `mountain_climbers` | `core` | beginner | Escaladores | ninguno | no |
| `run` | `full` | intermediate | Correr | ninguno | no |
| `shuttle_run` | `full` | intermediate | Carrera de Ida y Vuelta | ninguno | no |
| `back_and_forth_step` | `full` | intermediate | Paso adelante y atrás | ninguno | no |
| `ski_step` | `full` | intermediate | Paso de esquí | ninguno | no |
| `crab_walk` | `full` | intermediate | Marcha del Cangrejo | ninguno | no |
| `jump_rope` | `full` | beginner | Salto de Cuerda | ninguno¹ | **sí** |
| `jumping_jacks` | `full` | beginner | Saltos de Tijera | ninguno | **sí** |
| `star_jumps` | `full` | beginner | Saltos de Estrella | ninguno | **sí** |
| `burpees` | `full` | intermediate | Burpees | ninguno | **sí** |
| `skater_hops` | `full` | intermediate | Saltos de patinador | ninguno | **sí** |

¹ El catálogo declara `equipment: ['ninguno']` para `jump_rope` aunque hace falta
una cuerda. No hay que declarar material por usarlo, pero conviene decirlo en el
`note` del ejercicio.

Ninguno es `advanced`, así que ninguno dispara la regla `level_cap` en ningún
nivel.

Para comprobarlos tú mismo, o para buscar otros:

```console
$ node scripts/find-exercise.mjs --check jump_rope high_knees mountain_climbers run shuttle_run jogging
jump_rope                          full       ninguno                Salto de Cuerda
high_knees                         full       ninguno                Rodillas Altas
mountain_climbers                  core       ninguno                Escaladores
run                                full       ninguno                Correr
shuttle_run                        full       ninguno                Carrera de Ida y Vuelta
jogging                            ✗ NO RESUELVE
```

`node scripts/find-exercise.mjs <término>` busca por nombre; `--cat <categoría>` y
`--eq <material>` filtran.

---

## 4. Receta por programa

Las tres tablas suben la duración fase a fase. Mismo id en las tres fases: así no
se dispara `family_regression` y el usuario ve que progresa.

### 4.1 `principiante-quema-grasa` — 2 bloques por semana

| Fase | Día | `exercise_id` | `sets` | `timer_seconds` | `rest_seconds` | Total | Bloque |
|---|---|---|---|---|---|---|---|
| 1 | día de empuje | `jump_rope` | 3 | 150 | 60 | 450 s | ✅ |
| 1 | día de piernas | `high_knees` | 3 | 150 | 60 | 450 s | ✅ |
| 2 | día de empuje | `jump_rope` | 3 | 180 | 60 | 540 s | ✅ |
| 2 | día de piernas | `high_knees` | 3 | 180 | 60 | 540 s | ✅ |
| 3 | día de empuje | `jump_rope` | 3 | 210 | 60 | 630 s | ✅ |
| 3 | día de piernas | `high_knees` | 3 | 210 | 60 | 630 s | ✅ |

Entrada completa, lista para pegar (fase 1, ajusta `sort_order`):

```json
{
  "sort_order": 99,
  "name": "Cardio: saltar a la cuerda",
  "exercise_id": "jump_rope",
  "muscles": "Sistema cardiovascular, pantorrillas, coordinación",
  "sets": 3,
  "reps": "150 s",
  "rest_seconds": 60,
  "priority": "secondary",
  "is_timer": true,
  "timer_seconds": 150,
  "note": "Al terminar la fuerza. Ritmo cómodo, deberías poder hablar entrecortado. Si no tienes cuerda, salta el gesto sin ella. Si te cansas antes de tiempo, para el reloj y sigue en la siguiente serie."
}
```

### 4.2 `intermedio-definicion` — 3 bloques por semana, bajo impacto

| Fase | `exercise_id` | `sets` | `timer_seconds` | `rest_seconds` | Total | Bloque |
|---|---|---|---|---|---|---|
| 1 | `shuttle_run` | 3 | 150 | 60 | 450 s | ✅ |
| 1 | `mountain_climbers` | 3 | 150 | 60 | 450 s | ✅ |
| 1 | `high_knees` | 3 | 150 | 60 | 450 s | ✅ |
| 2 | los mismos tres | 3 | 180 | 60 | 540 s | ✅ |
| 3 | los mismos tres | 3 | 210 | 60 | 630 s | ✅ |

Tres días distintos de los cinco de la semana.

### 4.3 `avanzado-cutting` — 3 bloques por semana, bajo impacto

| Fase | `exercise_id` | `sets` | `timer_seconds` | `rest_seconds` | Total | Bloque |
|---|---|---|---|---|---|---|
| 1 | `run` | 3 | 180 | 60 | 540 s | ✅ |
| 1 | `shuttle_run` | 3 | 180 | 45 | 540 s | ✅ |
| 1 | `mountain_climbers` | 3 | 180 | 45 | 540 s | ✅ |
| 2 | los mismos tres | 3 | 210 | 45 | 630 s | ✅ |
| 3 | los mismos tres | 3 | 240 | 45 | 720 s | ✅ |

Estos bloques **sustituyen** a los *finishers* de `sets: 1` que hay ahora
(`burpees – AMRAP 2 min`, `mountain climbers – AMRAP 90s`, `tuck jumps – AMRAP
60s`…): son los que hacen que el programa prometa cardio y entregue 106 minutos en
12 semanas. Quitarlos también resuelve dos de los avisos de contraindicaciones.

Si en algún momento `avanzado-cutting` declara `knee`, la variante de impacto es
`burpees` y `skater_hops` con los mismos `sets`/`timer_seconds`.

---

## 5. Comprobación

Después de editar cada JSON:

```bash
node scripts/check-program-content.mjs <slug>
```

Tienen que desaparecer estos avisos del programa tocado:

- `fat_loss_cardio` — «fase N: 0 bloque(s) de cardio cronometrado ≥ 5 min…» en las tres fases.
- `fat_loss_nutrition` — «instructions de un fat_loss sin el párrafo de nutrición…» (solo lo tiene hoy `intermedio-definicion`).

Y no puede aparecer ninguno nuevo, en particular:

- `promised_exercise` con la etiqueta `cardio` — significaría que el párrafo está pegado y los bloques no.
- `contraindications` con `knee` — significaría que se coló un id de impacto en Definición o Cutting.

Con `--strict` (lo que la ola 4 pondrá en CI) esos avisos son errores.

### 5.1 Comprobado antes de publicar

La receta se aplicó en memoria a los tres JSON reales y se pasó `checkProgram`
con `strict: true` antes y después. Resultado:

| Programa | Errores antes | Errores después | Hallazgos nuevos |
|---|---|---|---|
| `principiante-quema-grasa` | 7 | 4 | 0 |
| `intermedio-definicion` | 6 | 2 | 0 |
| `avanzado-cutting` | 5 | 2 | 0 |

Resueltos en los tres: los tres `fat_loss_cardio` (uno por fase) y el
`promised_exercise` de `cardio`. En `intermedio-definicion`, además,
`fat_loss_nutrition`.

Cero hallazgos nuevos: la receta no toca el volumen fuera de rango, no dispara
`contraindications`, no rompe `timer` ni `muscles` y no mete nada `advanced`.

Los errores que quedan son los que ya tenía cada programa y que resuelven sus
propias issues (`level_cap` de `one_arm_towel_row`, `deload_promise`,
`contraindications` de `nordic_curl` / `skaters` / `burpees` / `nordic_full`).
