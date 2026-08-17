import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { localize } from '@calistenia/core/lib/i18n-db'

/**
 * La landing pública de un programa compartido (rama SIN login) era la única de
 * las cuatro vistas de detalle que no pasaba los campos de PocketBase por
 * `localize()`. Con los campos en forma objeto —que es como están TODOS los
 * programas de la base real— eso no era cosmético: `ex.muscles.split(',')`
 * lanzaba TypeError y `{program.name}` como hijo de React también.
 *
 * Se testea aquí, y no en el navegador, porque hoy `programs.viewRule` es
 * `@request.auth.id != ""`: un visitante anónimo recibe 404 y la landing nunca
 * llega a pintar los datos, así que el fallo es LATENTE y no se puede provocar
 * end-to-end sin relajar la regla. Este test sí lo provoca (#474).
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// La rama con login delega en ProgramDetailPage, que arrastra media app.
// Este test sólo ejercita la rama anónima, así que se stubea.
vi.mock('./ProgramDetailPage', () => ({
  default: () => <div>program-detail-page-stub</div>,
}))

// El hook real depende de i18next inicializado; se delega en el `localize` real
// para que lo que se comprueba sea que la página PASA los campos por él.
vi.mock('@calistenia/core/hooks/useLocalize', () => ({
  useLocalize: () => (field: unknown) => localize(field as never, 'es'),
}))

const h = vi.hoisted(() => ({
  program: {} as Record<string, unknown>,
  exercises: [] as Record<string, unknown>[],
  phaseTotal: 0,
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  isPocketBaseAvailable: () => Promise.resolve(true),
  pb: {
    filter: (expr: string) => expr,
    collection: (name: string) => ({
      getOne: () => Promise.resolve(h.program),
      getList: () =>
        Promise.resolve(
          name === 'program_phases'
            ? { items: [], totalItems: h.phaseTotal }
            : { items: h.exercises, totalItems: h.exercises.length },
        ),
    }),
  },
}))

const { default: SharedProgramPage } = await import('./SharedProgramPage')

describe('SharedProgramPage — landing anónima con campos TranslatableField (#474)', () => {
  beforeEach(() => {
    // Forma real de los datos: todos los programas de la base tienen `{es: …}`.
    h.program = {
      id: 'd97d78hsknhk63e',
      name: { es: 'Ashtanga Yoga — Principiante' },
      description: { es: 'Programa progresivo de Ashtanga Yoga.' },
      duration_weeks: 24,
      created_by: '',
    }
    h.exercises = [
      {
        exercise_name: { es: 'Surya Namaskar A' },
        sets: 5,
        reps: '1',
        muscles: { es: 'cuerpo completo,cuádriceps' },
      },
    ]
    h.phaseTotal = 6
  })

  it('traduce nombre y descripción del programa', async () => {
    render(<SharedProgramPage programId="d97d78hsknhk63e" onBack={() => {}} onLogin={() => {}} />)

    expect(await screen.findByText('Ashtanga Yoga — Principiante')).toBeInTheDocument()
    expect(screen.getByText('Programa progresivo de Ashtanga Yoga.')).toBeInTheDocument()
  })

  it('traduce el nombre y los músculos de los ejercicios de la vista previa', async () => {
    render(<SharedProgramPage programId="d97d78hsknhk63e" onBack={() => {}} onLogin={() => {}} />)

    expect(await screen.findByText('Surya Namaskar A')).toBeInTheDocument()
    // `muscles` se parte por comas y se une con ' · ' — eso es lo que lanzaba
    // TypeError cuando el campo llegaba como objeto en vez de string.
    expect(screen.getByText('cuerpo completo · cuádriceps')).toBeInTheDocument()
  })

  it('no deja ningún [object Object] en la página', async () => {
    const { container } = render(
      <SharedProgramPage programId="d97d78hsknhk63e" onBack={() => {}} onLogin={() => {}} />,
    )

    await screen.findByText('Ashtanga Yoga — Principiante')
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('sigue funcionando con campos en string plano (registros antiguos)', async () => {
    h.program = {
      id: 'p1',
      name: 'Intermedio – Balance Total',
      description: 'Programa intermedio 6 días/semana.',
      duration_weeks: 12,
    }
    h.exercises = [{ exercise_name: 'Dominadas', sets: 4, reps: '6-8', muscles: 'dorsal,bíceps' }]

    render(<SharedProgramPage programId="p1" onBack={() => {}} onLogin={() => {}} />)

    expect(await screen.findByText('Intermedio – Balance Total')).toBeInTheDocument()
    expect(screen.getByText('Dominadas')).toBeInTheDocument()
    expect(screen.getByText('dorsal · bíceps')).toBeInTheDocument()
  })
})
