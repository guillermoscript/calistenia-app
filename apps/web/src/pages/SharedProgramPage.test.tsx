import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { localize } from '@calistenia/core/lib/i18n-db'

/**
 * La landing pública de un programa compartido (rama SIN login).
 *
 * Nació (#474) cubriendo que los campos de PocketBase pasaran por `localize()`:
 * con los campos en forma objeto —que es como están TODOS los programas de la
 * base real— `ex.muscles.split(',')` lanzaba TypeError y `{program.name}` como
 * hijo de React también. Aquello se testeaba aquí y no en el navegador porque
 * el fallo era LATENTE: `programs.viewRule` exigía sesión, el visitante anónimo
 * recibía 404 y la landing nunca llegaba a pintar los datos.
 *
 * #604 mató esa latencia por el otro extremo: los datos ya no salen de
 * `pb.collection('programs')` sino de `GET /api/programs/{id}/public`, la ruta
 * de `pb_hooks` que sí contesta sin sesión. Lo que se mockea ahora es el
 * `fetch` de esa ruta —el contrato de campos lo cubre
 * `tests/pb_hooks/public_program_preview.test.mjs` contra un PocketBase real—,
 * y las aserciones de `TranslatableField` siguen intactas: son la razón por la
 * que este archivo existe.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'name' in opts ? `${key}:${opts.name}` : key,
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

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: { baseUrl: 'http://pb.test' },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

const h = vi.hoisted(() => ({
  response: null as unknown,
  status: 200,
  captured: [] as string[],
}))

vi.mock('@calistenia/core/lib/sharedProgramHandoff', () => ({
  capturePendingSharedProgram: (id: string) => { h.captured.push(id) },
  consumePendingSharedProgram: () => null,
  clearPendingSharedProgram: () => {},
}))

const { default: SharedProgramPage } = await import('./SharedProgramPage')

function renderLanding(programId: string, onLogin: () => void = () => {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SharedProgramPage programId={programId} onBack={() => {}} onLogin={onLogin} />
    </QueryClientProvider>,
  )
}

describe('SharedProgramPage — landing anónima (#474, #604)', () => {
  beforeEach(() => {
    h.status = 200
    h.captured = []
    // Forma real de los datos: todos los programas de la base tienen `{es: …}`.
    h.response = {
      id: 'd97d78hsknhk63e',
      name: { es: 'Ashtanga Yoga — Principiante' },
      description: { es: 'Programa progresivo de Ashtanga Yoga.' },
      duration_weeks: 24,
      phase_count: 6,
      exercise_count: 42,
      author_name: 'Marta Yoga',
      exercises: [
        {
          name: { es: 'Surya Namaskar A' },
          sets: 5,
          reps: '1',
          muscles: { es: 'cuerpo completo,cuádriceps' },
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain('/api/programs/')
      expect(url).toContain('/public')
      return { ok: h.status === 200, json: async () => h.response }
    }))
  })

  it('traduce nombre y descripción del programa', async () => {
    renderLanding('d97d78hsknhk63e')

    expect(await screen.findByText('Ashtanga Yoga — Principiante')).toBeInTheDocument()
    expect(screen.getByText('Programa progresivo de Ashtanga Yoga.')).toBeInTheDocument()
  })

  it('traduce el nombre y los músculos de los ejercicios de la vista previa', async () => {
    renderLanding('d97d78hsknhk63e')

    expect(await screen.findByText('Surya Namaskar A')).toBeInTheDocument()
    // `muscles` se parte por comas y se une con ' · ' — eso es lo que lanzaba
    // TypeError cuando el campo llegaba como objeto en vez de string.
    expect(screen.getByText('cuerpo completo · cuádriceps')).toBeInTheDocument()
  })

  it('no deja ningún [object Object] en la página', async () => {
    const { container } = renderLanding('d97d78hsknhk63e')

    await screen.findByText('Ashtanga Yoga — Principiante')
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('sigue funcionando con campos en string plano (registros antiguos)', async () => {
    h.response = {
      id: 'p1',
      name: 'Intermedio – Balance Total',
      description: 'Programa intermedio 6 días/semana.',
      duration_weeks: 12,
      phase_count: 3,
      exercise_count: 1,
      author_name: '',
      exercises: [{ name: 'Dominadas', sets: 4, reps: '6-8', muscles: 'dorsal,bíceps' }],
    }

    renderLanding('p1')

    expect(await screen.findByText('Intermedio – Balance Total')).toBeInTheDocument()
    expect(screen.getByText('Dominadas')).toBeInTheDocument()
    expect(screen.getByText('dorsal · bíceps')).toBeInTheDocument()
  })

  it('enseña el total real de ejercicios, no el tamaño de la vista previa', async () => {
    // La ruta manda 8 ejercicios como mucho pero cuenta todos. Pintar
    // `exercises.length` diría "1 ejercicio" en un programa de 42.
    renderLanding('d97d78hsknhk63e')

    await screen.findByText('Ashtanga Yoga — Principiante')
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('atribuye el programa a su autor', async () => {
    renderLanding('d97d78hsknhk63e')

    expect(await screen.findByText('programs.sharedBy:Marta Yoga')).toBeInTheDocument()
  })

  it('un programa no compartible se pinta como no encontrado', async () => {
    // 404 es la respuesta tanto de un programa privado como de uno inexistente,
    // y la landing no puede distinguirlos: hacerlo filtraría qué ids existen.
    h.status = 404
    h.response = { error: 'not found' }

    renderLanding('privado')

    expect(await screen.findByText('programs.notFound')).toBeInTheDocument()
  })

  it('guarda el programa antes de mandar a registrarse', async () => {
    // Sin esto, quien completa el alta desde aquí aterriza en el dashboard y
    // pierde el programa que venía a ver — el último paso del embudo (#604).
    const onLogin = vi.fn()
    renderLanding('d97d78hsknhk63e', onLogin)

    const cta = await screen.findByText('programs.signUpToUse')
    cta.click()

    expect(h.captured).toEqual(['d97d78hsknhk63e'])
    expect(onLogin).toHaveBeenCalled()
  })
})
