/// <reference path="../pb_data/types.d.ts" />

/**
 * Los seis campos de configuración de circuito que el editor YA escribe
 * (issue #601).
 *
 * `useProgramEditor.saveProgram` los manda desde hace tiempo
 * (`packages/core/hooks/useProgramEditor.ts`, bloque `isCircuit`) y los vuelve
 * a leer en `loadProgram`, pero nunca existieron en el esquema: PocketBase
 * DESCARTA EN SILENCIO los campos desconocidos del cuerpo de la petición, así
 * que el guardado devolvía 200, no fallaba nada visible, y al reabrir el editor
 * el día de circuito volvía a los valores por defecto (3 rondas, 40s de
 * trabajo, 20s de descanso…). Sin este esquema, la UI de circuitos de web y
 * móvil es decorativa.
 *
 * NINGUNO ES `required`, y no es por comodidad: en PocketBase un campo `number`
 * marcado como obligatorio RECHAZA EL 0 (lo trata como valor vacío). El editor
 * escribe 0 de forma legítima —`circuit_rest_between_exercises` vale 0 por
 * defecto, y los seis campos se ponen a 0/'' cuando el día deja de ser de tipo
 * `circuit`—, así que marcarlos obligatorios rompería el guardado de cualquier
 * día NO circuito. Por el mismo motivo `circuit_mode` acepta el valor vacío.
 *
 * `min: 0` sí se queda: rondas o segundos negativos no significan nada.
 *
 * Las filas existentes no necesitan backfill — hoy no hay ni un solo día de
 * tipo `circuit` en la base de datos, y el lector de `loadProgram` ya aplica
 * los mismos valores por defecto cuando el campo llega vacío.
 */
migrate((app) => {
  const dayConfig = app.findCollectionByNameOrId('pbc_4000000075')

  // Idempotente: re-ejecutar la migración no duplica ni pisa nada.
  const add = (field) => {
    if (dayConfig.fields.find((f) => f.name === field.name)) return
    dayConfig.fields.add(new Field(field))
  }

  // `circuit`: rondas de todos los ejercicios seguidos.
  // `timed`: bloques de trabajo/descanso por tiempo (tipo tabata).
  add({
    id: 'select_dayconfig_circ_mode',
    name: 'circuit_mode',
    type: 'select',
    maxSelect: 1,
    values: ['circuit', 'timed'],
    required: false,
    presentable: false,
    hidden: false,
    system: false,
  })

  const number = (id, name) =>
    add({
      id,
      name,
      type: 'number',
      onlyInt: true,
      min: 0,
      max: null,
      required: false,
      presentable: false,
      hidden: false,
      system: false,
    })

  number('number_dayconfig_circ_rounds', 'circuit_rounds')
  number('number_dayconfig_circ_work', 'circuit_work_seconds')
  number('number_dayconfig_circ_rest', 'circuit_rest_seconds')
  number('number_dayconfig_circ_rest_ex', 'circuit_rest_between_exercises')
  number('number_dayconfig_circ_rest_rd', 'circuit_rest_between_rounds')

  app.save(dayConfig)
}, (app) => {
  const dayConfig = app.findCollectionByNameOrId('pbc_4000000075')
  const names = [
    'circuit_mode',
    'circuit_rounds',
    'circuit_work_seconds',
    'circuit_rest_seconds',
    'circuit_rest_between_exercises',
    'circuit_rest_between_rounds',
  ]
  for (const name of names) {
    const field = dayConfig.fields.find((f) => f.name === name)
    if (field) dayConfig.fields.removeById(field.id)
  }
  app.save(dayConfig)
})
