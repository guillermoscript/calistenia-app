import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Solo hace falta t(); sin backend de i18next las claves salen tal cual, que es
// lo que asercionamos. Se interpolan los params para poder leer "Más métricas (7)".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
}))

const h = vi.hoisted(() => ({
  createChallenge: vi.fn(async () => 'new-challenge-id'),
}))

vi.mock('@calistenia/core/hooks/useChallenges', () => ({
  useChallenges: () => ({ createChallenge: h.createChallenge }),
}))

vi.mock('@calistenia/core/hooks/useFollows', () => ({
  useFollows: () => ({ following: [] }),
}))

import CreateChallengePage from './CreateChallengePage'

const USER_ID = 'user-1'
/** Slug real del catálogo: el prefill de `?exercise=` sólo aplica si resuelve. */
const CATALOG_SLUG = 'ab_wheel_rollout'

function renderPage(route = '/challenges/new') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CreateChallengePage userId={USER_ID} />
    </MemoryRouter>,
  )
}

/** Los botones de métrica son los de la rejilla; el resto del formulario no cuenta. */
function metricButtons() {
  const grid = document.getElementById('challenge-metric-grid')
  if (!grid) throw new Error('no se encontró la rejilla de métricas')
  return within(grid as HTMLElement).getAllByRole('button')
}

function metricButton(id: string) {
  const grid = document.getElementById('challenge-metric-grid') as HTMLElement
  return within(grid).getByRole('button', { name: new RegExp(`challenge\\.metric\\.${id}\\b`) })
}

function disclosureToggle() {
  return screen.getByRole('button', { name: /challenge\.(moreMetrics|fewerMetrics)/ })
}

beforeEach(() => {
  h.createChallenge.mockClear()
})

describe('CreateChallengePage — paso de métrica (#384)', () => {
  it('abre con cuatro opciones visibles, no con las once', () => {
    renderPage()
    expect(metricButtons()).toHaveLength(4)
    for (const id of ['most_sessions', 'longest_streak', 'most_pullups', 'most_pushups']) {
      expect(metricButton(id)).toBeInTheDocument()
    }
  })

  it('anuncia cuántas quedan escondidas y las despliega todas al pulsar', async () => {
    const user = userEvent.setup()
    renderPage()

    const toggle = disclosureToggle()
    expect(toggle).toHaveTextContent('challenge.moreMetrics:7')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(metricButtons()).toHaveLength(11)
    expect(disclosureToggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('deja alcanzables las once métricas, con la personalizada la última', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(disclosureToggle())

    const labels = metricButtons().map(b => b.textContent ?? '')
    for (const id of [
      'most_sessions', 'longest_streak', 'most_pullups', 'most_pushups',
      'exercise', 'total_workouts', 'total_exercise', 'total_distance',
      'most_lsit', 'most_handstand', 'custom',
    ]) {
      expect(labels.some(l => l.includes(`challenge.metric.${id}`))).toBe(true)
    }
    expect(labels[labels.length - 1]).toContain('challenge.metric.custom')
  })

  it('no enseña ninguna opción que no se pueda pulsar', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(metricButtons().every(b => !b.hasAttribute('disabled'))).toBe(true)

    await user.click(disclosureToggle())
    expect(metricButtons().every(b => !b.hasAttribute('disabled'))).toBe(true)
  })

  it('selecciona una métrica del desplegable y saca su input asociado', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(disclosureToggle())

    await user.click(metricButton('custom'))
    expect(metricButton('custom')).toHaveAttribute('aria-pressed', 'true')
    expect(metricButton('most_sessions')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByPlaceholderText('challenge.customMetricPlaceholder')).toBeInTheDocument()

    await user.click(metricButton('exercise'))
    expect(screen.getByPlaceholderText('challenge.exerciseSearchPlaceholder')).toBeInTheDocument()
  })

  it('plegar nunca esconde la métrica que está seleccionada', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(disclosureToggle())
    await user.click(metricButton('total_distance'))
    await user.click(disclosureToggle())

    expect(metricButtons()).toHaveLength(5)
    expect(metricButton('total_distance')).toHaveAttribute('aria-pressed', 'true')
    expect(disclosureToggle()).toHaveTextContent('challenge.moreMetrics:6')
  })

  it('con ?exercise=<slug> arranca desplegada y con `exercise` seleccionada', () => {
    renderPage(`/challenges/new?exercise=${CATALOG_SLUG}`)

    expect(disclosureToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(metricButtons()).toHaveLength(11)
    expect(metricButton('exercise')).toHaveAttribute('aria-pressed', 'true')
  })

  it('crea el reto con la métrica elegida en el desplegable', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByPlaceholderText('challenge.titlePlaceholder'), 'Reto de kilómetros')
    await user.click(disclosureToggle())
    await user.click(metricButton('total_distance'))
    await user.click(screen.getByRole('button', { name: 'challenge.createButton' }))

    expect(h.createChallenge).toHaveBeenCalledTimes(1)
    expect(h.createChallenge.mock.calls[0][0]).toMatchObject({
      title: 'Reto de kilómetros',
      metric: 'total_distance',
    })
  })
})
