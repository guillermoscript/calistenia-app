import { describe, it, expect, vi } from 'vitest'
import {
  diffCollection,
  emptyPlan,
  executePlans,
  isNoop,
  planWriteCount,
  phaseKey,
  dayConfigKey,
  exerciseKey,
  makeExerciseKeyOf,
  type CollectionWriter,
  type ExistingRecord,
  type DesiredRow,
  type DiffPlan,
} from './programEditorDiff'

const ES = { locale: 'es' as const }
const I18N = { locale: 'es', translatableFields: ['name', 'exercise_name'] as const }

/** Registro de fase tal y como lo devuelve PocketBase. */
function phaseRecord(id: string, phaseNumber: number, name: string, weeks: string): ExistingRecord {
  return { id, phase_number: phaseNumber, name: { es: name }, weeks, sort_order: phaseNumber }
}

/** Fila de fase tal y como la construye el editor al guardar. */
function phaseRow(phaseNumber: number, name: string, weeks: string): DesiredRow {
  return {
    key: phaseKey(phaseNumber),
    data: { phase_number: phaseNumber, name: { es: name }, weeks, sort_order: phaseNumber },
  }
}

const byPhase = (r: ExistingRecord) => phaseKey(r.phase_number as number)

describe('diffCollection', () => {
  it('sin cambios no produce ninguna escritura ni borrado', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6'), phaseRecord('b', 2, 'Fuerza', '7-13')]
    const desired = [phaseRow(1, 'Base', '1-6'), phaseRow(2, 'Fuerza', '7-13')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan).toEqual(emptyPlan())
    expect(isNoop(plan)).toBe(true)
  })

  it('editar una fase la actualiza y no borra nada', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6')]
    const desired = [phaseRow(1, 'Base renombrada', '1-6')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toCreate).toEqual([])
    expect(plan.toDelete).toEqual([])
    expect(plan.toUpdate).toEqual([{ id: 'a', data: { name: { es: 'Base renombrada' } } }])
  })

  it('el update solo lleva los campos que cambiaron', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6')]
    const desired = [phaseRow(1, 'Base', '1-8')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toUpdate).toEqual([{ id: 'a', data: { weeks: '1-8' } }])
  })

  it('una fase nueva se crea sin tocar las existentes', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6')]
    const desired = [phaseRow(1, 'Base', '1-6'), phaseRow(2, 'Fuerza', '7-13')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toUpdate).toEqual([])
    expect(plan.toDelete).toEqual([])
    expect(plan.toCreate).toEqual([
      { phase_number: 2, name: { es: 'Fuerza' }, weeks: '7-13', sort_order: 2 },
    ])
  })

  it('una fase eliminada en el editor se marca para borrar', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6'), phaseRecord('b', 2, 'Fuerza', '7-13')]
    const desired = [phaseRow(1, 'Base', '1-6')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toCreate).toEqual([])
    expect(plan.toUpdate).toEqual([])
    expect(plan.toDelete).toEqual(['b'])
  })

  it('un programa sin nada en el servidor se crea entero', () => {
    const desired = [phaseRow(1, 'Base', '1-6'), phaseRow(2, 'Fuerza', '7-13')]

    const plan = diffCollection([], desired, byPhase, I18N)

    expect(plan.toCreate).toHaveLength(2)
    expect(plan.toUpdate).toEqual([])
    expect(plan.toDelete).toEqual([])
  })

  it('registros duplicados en el servidor: reutiliza el primero y borra el resto', () => {
    // Restos de un guardado que falló a medias.
    const existing = [
      phaseRecord('a', 1, 'Base', '1-6'),
      phaseRecord('duplicado', 1, 'Base', '1-6'),
    ]
    const desired = [phaseRow(1, 'Base', '1-6')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toCreate).toEqual([])
    expect(plan.toUpdate).toEqual([])
    expect(plan.toDelete).toEqual(['duplicado'])
  })
})

describe('diffCollection — campos traducibles', () => {
  it('no reescribe cuando solo cambia el locale de lectura', () => {
    const existing: ExistingRecord[] = [
      { id: 'a', phase_number: 1, name: { es: 'Base', en: 'Base phase' }, weeks: '1-6', sort_order: 1 },
    ]
    const desired: DesiredRow[] = [
      { key: phaseKey(1), data: { phase_number: 1, name: { es: 'Base' }, weeks: '1-6', sort_order: 1 } },
    ]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(isNoop(plan)).toBe(true)
  })

  it('al editar en un locale conserva las traducciones de los demás', () => {
    const existing: ExistingRecord[] = [
      { id: 'a', phase_number: 1, name: { es: 'Base', en: 'Base phase' }, weeks: '1-6', sort_order: 1 },
    ]
    const desired: DesiredRow[] = [
      { key: phaseKey(1), data: { phase_number: 1, name: { es: 'Cimientos' }, weeks: '1-6', sort_order: 1 } },
    ]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toUpdate).toEqual([
      { id: 'a', data: { name: { es: 'Cimientos', en: 'Base phase' } } },
    ])
  })

  it('acepta el formato legacy de string plano sin marcar cambio espurio', () => {
    const existing: ExistingRecord[] = [
      { id: 'a', phase_number: 1, name: 'Base', weeks: '1-6', sort_order: 1 },
    ]
    const desired: DesiredRow[] = [
      { key: phaseKey(1), data: { phase_number: 1, name: { es: 'Base' }, weeks: '1-6', sort_order: 1 } },
    ]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(isNoop(plan)).toBe(true)
  })
})

describe('diffCollection — normalización de escalares', () => {
  it('no marca cambio si PocketBase devolvió un número como string', () => {
    const existing: ExistingRecord[] = [{ id: 'a', phase_number: 1, sets: '3', rest_seconds: '60' }]
    const desired: DesiredRow[] = [
      { key: phaseKey(1), data: { phase_number: 1, sets: 3, rest_seconds: 60 } },
    ]

    const plan = diffCollection(existing, desired, byPhase, ES)

    expect(isNoop(plan)).toBe(true)
  })

  it('trata null y cadena vacía como equivalentes', () => {
    const existing: ExistingRecord[] = [{ id: 'a', phase_number: 1, note: null }]
    const desired: DesiredRow[] = [{ key: phaseKey(1), data: { phase_number: 1, note: '' } }]

    const plan = diffCollection(existing, desired, byPhase, ES)

    expect(isNoop(plan)).toBe(true)
  })

  it('sí detecta un cambio real de número', () => {
    const existing: ExistingRecord[] = [{ id: 'a', phase_number: 1, sets: '3' }]
    const desired: DesiredRow[] = [{ key: phaseKey(1), data: { phase_number: 1, sets: 4 } }]

    const plan = diffCollection(existing, desired, byPhase, ES)

    expect(plan.toUpdate).toEqual([{ id: 'a', data: { sets: 4 } }])
  })

  it('distingue booleanos de verdad', () => {
    const existing: ExistingRecord[] = [{ id: 'a', phase_number: 1, is_timer: false }]
    const desired: DesiredRow[] = [{ key: phaseKey(1), data: { phase_number: 1, is_timer: true } }]

    const plan = diffCollection(existing, desired, byPhase, ES)

    expect(plan.toUpdate).toEqual([{ id: 'a', data: { is_timer: true } }])
  })
})

describe('identidad de ejercicios por contenido', () => {
  // Los ejercicios se identifican por QUÉ ejercicio son dentro de su día, no
  // por la posición. Con clave posicional, mover un ejercicio escribía el
  // contenido del vecino encima de su fila, y un fallo a mitad de esas
  // escrituras destruía datos sin haber borrado nada.
  const exRecord = (
    id: string,
    phase: number,
    dayId: string,
    pos: number,
    exerciseId: string,
    name = exerciseId,
  ): ExistingRecord => ({
    id,
    phase_number: phase,
    day_id: dayId,
    sort_order: pos,
    exercise_id: exerciseId,
    exercise_name: { es: name },
  })

  const exRow = (
    phase: number,
    dayId: string,
    pos: number,
    exerciseId: string,
    name = exerciseId,
    occurrence = 0,
  ): DesiredRow => ({
    key: exerciseKey(phase, dayId, exerciseId, occurrence),
    data: {
      phase_number: phase,
      day_id: dayId,
      sort_order: pos,
      exercise_id: exerciseId,
      exercise_name: { es: name },
    },
  })

  it('reordenar solo cambia sort_order, sin mover contenido entre filas', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'dominadas'),
      exRecord('y', 1, 'lun', 2, 'flexiones'),
    ]
    // El usuario los intercambia.
    const desired = [exRow(1, 'lun', 1, 'flexiones'), exRow(1, 'lun', 2, 'dominadas')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(plan.toCreate).toEqual([])
    expect(plan.toDelete).toEqual([])
    // Cada fila conserva SU ejercicio; solo se renumera.
    expect(plan.toUpdate).toEqual([
      { id: 'y', data: { sort_order: 1 } },
      { id: 'x', data: { sort_order: 2 } },
    ])
  })

  it('#463: borrar el primer ejercicio no reescribe el contenido de los demás', () => {
    // Este es el caso que destruía datos con la clave posicional: al borrar A,
    // B pasaba a la posición 1 y su contenido se escribía encima de la fila de
    // A. Si fallaba justo después, A había desaparecido y B estaba duplicado.
    const existing = [
      exRecord('r1', 1, 'lun', 1, 'A'),
      exRecord('r2', 1, 'lun', 2, 'B'),
      exRecord('r3', 1, 'lun', 3, 'C'),
    ]
    const desired = [exRow(1, 'lun', 1, 'B'), exRow(1, 'lun', 2, 'C')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    // Solo se renumeran B y C; se borra la fila de A y de nadie más.
    expect(plan.toCreate).toEqual([])
    expect(plan.toUpdate).toEqual([
      { id: 'r2', data: { sort_order: 1 } },
      { id: 'r3', data: { sort_order: 2 } },
    ])
    expect(plan.toDelete).toEqual(['r1'])

    // Ninguna actualización escribe el nombre de un ejercicio sobre la fila de
    // otro: ningún update toca exercise_id ni exercise_name.
    for (const upd of plan.toUpdate) {
      expect(upd.data).not.toHaveProperty('exercise_id')
      expect(upd.data).not.toHaveProperty('exercise_name')
    }

    // Y aunque solo se aplicase parte del plan antes de fallar, no se pierde
    // ningún ejercicio: los deletes van al final y los updates no destruyen.
    const trasFalloParcial = existing.map(r => {
      const upd = plan.toUpdate[0]
      return upd && upd.id === r.id ? { ...r, ...upd.data } : r
    })
    const nombres = trasFalloParcial.map(r => (r.exercise_name as { es: string }).es)
    expect(nombres).toContain('A')
    expect(nombres).toContain('B')
    expect(nombres).toContain('C')
  })

  it('insertar al principio no arrastra el contenido de los siguientes', () => {
    const existing = [
      exRecord('r1', 1, 'lun', 1, 'A'),
      exRecord('r2', 1, 'lun', 2, 'B'),
      exRecord('r3', 1, 'mar', 3, 'C'),
      exRecord('r4', 1, 'mar', 4, 'D'),
    ]
    // Se mete X al principio del lunes: todo lo demás se desplaza.
    const desired = [
      exRow(1, 'lun', 1, 'X'),
      exRow(1, 'lun', 2, 'A'),
      exRow(1, 'lun', 3, 'B'),
      exRow(1, 'mar', 4, 'C'),
      exRow(1, 'mar', 5, 'D'),
    ]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    // Solo se crea X; el resto se renumera sin tocar su contenido.
    expect(plan.toCreate).toHaveLength(1)
    expect((plan.toCreate[0] as { exercise_id: string }).exercise_id).toBe('X')
    expect(plan.toDelete).toEqual([])
    for (const upd of plan.toUpdate) {
      expect(Object.keys(upd.data)).toEqual(['sort_order'])
    }

    // Los días que el usuario no tocó no generan ninguna escritura de contenido.
    const final = existing
      .map(r => {
        const upd = plan.toUpdate.find(u => u.id === r.id)
        return upd ? { ...r, ...upd.data } : r
      })
      .concat(plan.toCreate.map((d, i) => ({ id: `nuevo${i}`, ...d }) as ExistingRecord))

    const rendered = final
      .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
      .map(r => `${r.day_id}#${r.sort_order}:${r.exercise_id}`)
    expect(rendered).toEqual(['lun#1:X', 'lun#2:A', 'lun#3:B', 'mar#4:C', 'mar#5:D'])
  })

  it('el mismo ejercicio repetido en un día son filas distintas', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'dominadas'),
      exRecord('y', 1, 'lun', 2, 'dominadas'),
    ]
    const desired = [
      exRow(1, 'lun', 1, 'dominadas', 'dominadas', 0),
      exRow(1, 'lun', 2, 'dominadas', 'dominadas', 1),
    ]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(isNoop(plan)).toBe(true)
  })

  it('quitar una de las dos repeticiones borra una sola fila', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'dominadas'),
      exRecord('y', 1, 'lun', 2, 'dominadas'),
    ]
    const desired = [exRow(1, 'lun', 1, 'dominadas', 'dominadas', 0)]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(plan.toCreate).toEqual([])
    expect(plan.toDelete).toEqual(['y'])
  })

  it('el mismo ejercicio en días distintos no se confunde', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'sentadillas'),
      exRecord('y', 1, 'mar', 2, 'sentadillas'),
    ]
    const desired = [exRow(1, 'lun', 1, 'sentadillas'), exRow(1, 'mar', 2, 'sentadillas')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(isNoop(plan)).toBe(true)
  })

  it('el mismo día en fases distintas no se confunde', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'fondos'),
      exRecord('y', 2, 'lun', 2, 'fondos'),
    ]
    const desired = [exRow(1, 'lun', 1, 'fondos'), exRow(2, 'lun', 2, 'fondos')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(isNoop(plan)).toBe(true)
  })

  it('cambiar los datos de un ejercicio lo actualiza en su propia fila', () => {
    const existing = [{ ...exRecord('x', 1, 'lun', 1, 'dominadas'), sets: 3 }]
    const desired = [
      {
        key: exerciseKey(1, 'lun', 'dominadas', 0),
        data: {
          phase_number: 1,
          day_id: 'lun',
          sort_order: 1,
          exercise_id: 'dominadas',
          exercise_name: { es: 'dominadas' },
          sets: 4,
        },
      },
    ]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(plan.toUpdate).toEqual([{ id: 'x', data: { sets: 4 } }])
    expect(plan.toDelete).toEqual([])
  })

  it('alargar un día solo crea la fila nueva', () => {
    const existing = [exRecord('x', 1, 'lun', 1, 'A')]
    const desired = [exRow(1, 'lun', 1, 'A'), exRow(1, 'lun', 2, 'B')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(plan.toUpdate).toEqual([])
    expect(plan.toDelete).toEqual([])
    expect(planWriteCount(plan)).toBe(1)
  })

  it('mover un ejercicio de día lo recrea, sin tocar a los demás', () => {
    const existing = [
      exRecord('x', 1, 'lun', 1, 'dominadas'),
      exRecord('y', 1, 'mar', 2, 'flexiones'),
    ]
    // Las dominadas pasan del lunes al martes.
    const desired = [exRow(1, 'mar', 1, 'flexiones'), exRow(1, 'mar', 2, 'dominadas')]

    const plan = diffCollection(existing, desired, makeExerciseKeyOf(), I18N)

    expect(plan.toCreate).toHaveLength(1)
    expect((plan.toCreate[0] as { exercise_id: string }).exercise_id).toBe('dominadas')
    expect(plan.toDelete).toEqual(['x'])
    // La fila del martes que no se movió solo se renumera.
    expect(plan.toUpdate).toEqual([{ id: 'y', data: { sort_order: 1 } }])
  })
})

describe('campos condicionales', () => {
  /**
   * El diff solo mira los campos presentes en la fila deseada. Como el guardado
   * ya no borra y recrea, los campos que dejan de aplicar hay que escribirlos
   * explícitamente vacíos o se quedaría el valor viejo. Este test fija ese
   * contrato: si la fila deseada los trae, el diff los limpia.
   */
  it('limpia los campos de cardio cuando el día deja de ser cardio', () => {
    const existing: ExistingRecord[] = [
      {
        id: 'd1',
        phase_number: 1,
        day_id: 'lun',
        day_type: 'cardio',
        cardio_activity_type: 'running',
        cardio_target_distance_km: 5,
      },
    ]
    const desired: DesiredRow[] = [
      {
        key: dayConfigKey(1, 'lun'),
        data: {
          phase_number: 1,
          day_id: 'lun',
          day_type: 'push',
          cardio_activity_type: '',
          cardio_target_distance_km: 0,
        },
      },
    ]

    const plan = diffCollection(
      existing,
      desired,
      r => dayConfigKey(r.phase_number as number, r.day_id as string),
      ES,
    )

    expect(plan.toUpdate).toEqual([
      {
        id: 'd1',
        data: { day_type: 'push', cardio_activity_type: '', cardio_target_distance_km: 0 },
      },
    ])
  })

  it('un campo ausente de la fila deseada no se toca (por eso se escriben siempre)', () => {
    const existing: ExistingRecord[] = [
      { id: 'd1', phase_number: 1, day_id: 'lun', cardio_target_distance_km: 5 },
    ]
    // Fila deseada SIN el campo: el diff no puede saber que hay que limpiarlo.
    const desired: DesiredRow[] = [
      { key: dayConfigKey(1, 'lun'), data: { phase_number: 1, day_id: 'lun' } },
    ]

    const plan = diffCollection(
      existing,
      desired,
      r => dayConfigKey(r.phase_number as number, r.day_id as string),
      ES,
    )

    expect(isNoop(plan)).toBe(true)
  })
})

describe('claves naturales', () => {
  it('phaseKey normaliza el tipo del número de fase', () => {
    expect(phaseKey(1)).toBe(phaseKey('1'))
  })

  it('dayConfigKey distingue día y fase', () => {
    expect(dayConfigKey(1, 'lun')).not.toBe(dayConfigKey(2, 'lun'))
    expect(dayConfigKey(1, 'lun')).not.toBe(dayConfigKey(1, 'mar'))
  })

  it('exerciseKey distingue ejercicio y repetición', () => {
    expect(exerciseKey(1, 'lun', 'dominadas')).not.toBe(exerciseKey(1, 'lun', 'flexiones'))
    // Y la repetición desempata el mismo ejercicio dentro de un día.
    expect(exerciseKey(1, 'lun', 'dominadas', 0)).not.toBe(exerciseKey(1, 'lun', 'dominadas', 1))
  })
})

/**
 * El corazón del issue #463: da igual lo que falle al escribir, mientras los
 * borrados se ejecuten después nunca se puede vaciar un programa.
 */
describe('#463 — un fallo a mitad no puede vaciar el programa', () => {
  it('los borrados van en una lista aparte de las escrituras', () => {
    const existing = [
      phaseRecord('a', 1, 'Base', '1-6'),
      phaseRecord('b', 2, 'Fuerza', '7-13'),
      phaseRecord('c', 3, 'Peak', '14-20'),
    ]
    // El editor se queda con 2 fases y renombra la primera.
    const desired = [phaseRow(1, 'Cimientos', '1-6'), phaseRow(2, 'Fuerza', '7-13')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    // El plan describe las escrituras y los borrados por separado, así que
    // quien lo ejecuta puede hacer los borrados al final.
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toDelete).toEqual(['c'])

    // Ninguna fase que el editor sigue queriendo aparece en la lista de
    // borrado: lo único que se borra es lo que sobra de verdad.
    expect(plan.toDelete).not.toContain('a')
    expect(plan.toDelete).not.toContain('b')
  })

  it('un guardado que solo añade no borra absolutamente nada', () => {
    const existing = [phaseRecord('a', 1, 'Base', '1-6')]
    const desired = [phaseRow(1, 'Base', '1-6'), phaseRow(2, 'Fuerza', '7-13')]

    const plan = diffCollection(existing, desired, byPhase, I18N)

    expect(plan.toDelete).toEqual([])
  })
})

describe('executePlans — orden de operaciones', () => {
  /** Writer que apunta el orden de las llamadas en un registro compartido. */
  function trackingWriter(log: string[], label: string, failOn?: (n: number) => boolean): CollectionWriter {
    let creates = 0
    return {
      create: vi.fn(async () => {
        creates++
        if (failOn?.(creates)) {
          log.push(`${label}:create#${creates}:FALLO`)
          throw new Error(`fallo de red en el create ${creates}`)
        }
        log.push(`${label}:create#${creates}`)
      }),
      update: vi.fn(async () => { log.push(`${label}:update`) }),
      delete: vi.fn(async () => { log.push(`${label}:delete`) }),
    }
  }

  const planOf = (over: Partial<DiffPlan>): DiffPlan => ({ ...emptyPlan(), ...over })

  it('escribe primero y borra después', async () => {
    const log: string[] = []
    const writer = trackingWriter(log, 'fases')
    const plan = planOf({
      toCreate: [{ phase_number: 2 }],
      toUpdate: [{ id: 'a', data: { weeks: '1-8' } }],
      toDelete: ['c'],
    })

    await executePlans([{ writer, plan }])

    // El borrado es siempre lo último.
    expect(log[log.length - 1]).toBe('fases:delete')
    expect(log).toContain('fases:create#1')
    expect(log).toContain('fases:update')
  })

  it('#463: si falla un create, no se ejecuta ningún borrado', async () => {
    const log: string[] = []
    // Falla la segunda creación, como el «create N» del issue.
    const writer = trackingWriter(log, 'ejercicios', n => n === 2)
    const plan = planOf({
      toCreate: [{ n: 1 }, { n: 2 }, { n: 3 }],
      toDelete: ['viejo-1', 'viejo-2'],
    })

    await expect(executePlans([{ writer, plan }])).rejects.toThrow(/fallo de red/)

    // Lo único que importa: el programa del usuario sigue entero.
    expect(writer.delete).not.toHaveBeenCalled()
    expect(log).not.toContain('ejercicios:delete')
  })

  it('#463: el fallo en una colección impide los borrados de todas las demás', async () => {
    const log: string[] = []
    const fases = trackingWriter(log, 'fases')
    const ejercicios = trackingWriter(log, 'ejercicios', n => n === 1)

    await expect(
      executePlans([
        { writer: fases, plan: planOf({ toDelete: ['fase-vieja'] }) },
        { writer: ejercicios, plan: planOf({ toCreate: [{ n: 1 }] }) },
      ]),
    ).rejects.toThrow()

    // El borrado de la otra colección tampoco llegó a ejecutarse.
    expect(fases.delete).not.toHaveBeenCalled()
  })

  it('un plan vacío no llama a nada', async () => {
    const log: string[] = []
    const writer = trackingWriter(log, 'fases')

    await executePlans([{ writer, plan: emptyPlan() }])

    expect(writer.create).not.toHaveBeenCalled()
    expect(writer.update).not.toHaveBeenCalled()
    expect(writer.delete).not.toHaveBeenCalled()
  })

  it('las escrituras de una colección van en paralelo, no en serie', async () => {
    let enCurso = 0
    let maxSimultaneas = 0
    const writer: CollectionWriter = {
      create: vi.fn(async () => {
        enCurso++
        maxSimultaneas = Math.max(maxSimultaneas, enCurso)
        await Promise.resolve()
        enCurso--
      }),
      update: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    }

    await executePlans([
      { writer, plan: planOf({ toCreate: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] }) },
    ])

    expect(maxSimultaneas).toBeGreaterThan(1)
  })
})
