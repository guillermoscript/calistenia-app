import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Guardarraíl de CALISTENIA-APP-S.
//
// El bug: `getHistory` fallaba con un 504 del gateway, la página lo reportaba a
// Sentry y dejaba `history` en `[]` — así que el usuario veía «No hay sesiones
// de cardio» y creía haber perdido su historial. Un fallo de lectura NO es un
// historial vacío; es la misma clase de bug que #559, que se arregló en el
// contexto pero se seguía tragando en la UI.
//
// Usa el i18n real (no mockeado) para que el estado de error se lea traducido.

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

import i18n from '../../lib/i18n'
import CardioHistory from './CardioHistory'

beforeAll(async () => {
  await i18n.changeLanguage('es')
})

describe('CardioHistory — estado de error', () => {
  it('con error y sin sesiones NO dice «no hay sesiones»: dice que falló la carga', () => {
    render(<CardioHistory sessions={[]} loading={false} error onRetry={vi.fn()} />)

    expect(screen.getByText(i18n.t('cardio.historyError'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('cardio.noSessions'))).not.toBeInTheDocument()
  })

  it('el botón de reintentar avisa al padre', async () => {
    const onRetry = vi.fn()
    render(<CardioHistory sessions={[]} loading={false} error onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: i18n.t('cardio.retry') }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('sin error, la lista vacía sigue pintando el empty state de siempre', () => {
    render(<CardioHistory sessions={[]} loading={false} />)

    expect(screen.getByText(i18n.t('cardio.noSessions'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('cardio.historyError'))).not.toBeInTheDocument()
  })

  it('el estado de carga gana al de error: no parpadea el fallo mientras se reintenta', () => {
    render(<CardioHistory sessions={[]} loading error onRetry={vi.fn()} />)

    expect(screen.queryByText(i18n.t('cardio.historyError'))).not.toBeInTheDocument()
  })
})
