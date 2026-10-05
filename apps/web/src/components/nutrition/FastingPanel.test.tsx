import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { useFasting } from '@calistenia/core/hooks/useFasting'
import { FastingError, toLocalDateTimeInput } from '@calistenia/core/lib/fasting'
import FastingPanel from './FastingPanel'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))

type State = ReturnType<typeof useFasting>
const now = new Date('2026-10-04T18:00:00Z').getTime()
const active = { id: 'fast-1', userId: 'user-1', startedAt: '2026-10-03T18:00:00.000Z', endedAt: null, goalHours: 24, notes: 'Water' }
function state(overrides: Partial<State> = {}): State {
  return {
    sessions: [], activeSession: null, settings: { goalHours: 16, weeklyGoal: 3 }, isLoading: false, isSaving: false, error: null,
    refresh: vi.fn(async () => {}), saveSettings: vi.fn(async () => {}), startFast: vi.fn(async () => active),
    finishFast: vi.fn(async () => ({ ...active, endedAt: new Date(now).toISOString() })),
    saveFast: vi.fn(async () => active), deleteFast: vi.fn(async () => {}), ...overrides,
  }
}

describe('FastingPanel', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(now))
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('derives elapsed time from timestamps and keeps a reached goal active', () => {
    vi.useFakeTimers()
    const fasting = state({ sessions: [active], activeSession: active })
    render(<FastingPanel fasting={fasting} />)
    expect(screen.getByTestId('fasting-timer')).toHaveTextContent('24:00:00')
    expect(screen.getByText('fasting.goalReachedManual')).toBeInTheDocument()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5000)
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId('fasting-timer')).toHaveTextContent('24:00:05')
    expect(fasting.finishFast).not.toHaveBeenCalled()
  })

  it('starts with the selected preset without changing an existing session', async () => {
    const fasting = state()
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: '36 h' }))
    fireEvent.click(screen.getByRole('button', { name: 'fasting.startNowWithGoal' }))
    await waitFor(() => expect(fasting.startFast).toHaveBeenCalledWith({ goalHours: 36 }))
    expect(fasting.saveSettings).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation to finish and saves end time and notes', async () => {
    const fasting = state({ sessions: [active], activeSession: active })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.finish', exact: true }))
    expect(fasting.finishFast).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('fasting.notes'), { target: { value: 'Feeling well' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'fasting.confirmFinish' }))
    await waitFor(() => expect(fasting.finishFast).toHaveBeenCalledWith('fast-1', { endedAt: new Date(now).toISOString(), notes: 'Feeling well' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('records a historical session separately from the active timer', async () => {
    const fasting = state({ sessions: [active], activeSession: active })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.addPast' }))
    const dialog = screen.getByRole('dialog')
    const start = '2026-10-01T18:00:00.000Z'
    const end = '2026-10-02T10:00:00.000Z'
    fireEvent.change(within(dialog).getByLabelText('fasting.startedAt'), { target: { value: toLocalDateTimeInput(start) } })
    fireEvent.change(within(dialog).getByLabelText('fasting.endedAt'), { target: { value: toLocalDateTimeInput(end) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'fasting.save' }))
    await waitFor(() => expect(fasting.saveFast).toHaveBeenCalledWith({ id: undefined, startedAt: start, endedAt: end, goalHours: 16, notes: '' }))
    expect(fasting.startFast).not.toHaveBeenCalled()
    expect(fasting.finishFast).not.toHaveBeenCalled()
  })

  it('keeps entered data visible after a failed save so the user can correct it', async () => {
    const fasting = state({ saveFast: vi.fn(async () => { throw new FastingError('overlap') }) })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.addPast' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('fasting.notes'), { target: { value: 'Keep this note' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'fasting.save' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('fasting.error.overlap'))
    expect(within(dialog).getByLabelText('fasting.notes')).toHaveValue('Keep this note')
  })

  it('deletes the chosen session only after confirmation', async () => {
    const completed = { ...active, endedAt: new Date(now).toISOString() }
    const fasting = state({ sessions: [completed] })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.deleteSession' }))
    expect(fasting.deleteFast).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'fasting.delete', exact: true }))
    await waitFor(() => expect(fasting.deleteFast).toHaveBeenCalledWith('fast-1'))
  })

  it('preserves original seconds when editing only session notes', async () => {
    const completed = { ...active, startedAt: '2026-10-02T18:00:43.000Z', endedAt: '2026-10-03T18:00:58.000Z' }
    const fasting = state({ sessions: [completed] })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.editSession' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('fasting.notes'), { target: { value: 'Updated note' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'fasting.save' }))
    await waitFor(() => expect(fasting.saveFast).toHaveBeenCalledWith({ id: 'fast-1', startedAt: completed.startedAt, endedAt: completed.endedAt, goalHours: 24, notes: 'Updated note' }))
  })

  it('can finish a fast within its first minute without rounding end before start', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 59000)
    const recent = { ...active, startedAt: new Date(now + 43000).toISOString() }
    const fasting = state({ sessions: [recent], activeSession: recent })
    render(<FastingPanel fasting={fasting} />)
    fireEvent.click(screen.getByRole('button', { name: 'fasting.finish', exact: true }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'fasting.confirmFinish' }))
    await waitFor(() => expect(fasting.finishFast).toHaveBeenCalledWith('fast-1', { endedAt: new Date(now + 59000).toISOString(), notes: 'Water' }))
  })

  it('blocks concurrent start submissions while the first request is pending', async () => {
    let resolve!: (session: typeof active) => void
    const fasting = state({ startFast: vi.fn(() => new Promise<typeof active>(r => { resolve = r })) })
    render(<FastingPanel fasting={fasting} />)
    const button = screen.getByRole('button', { name: 'fasting.startNowWithGoal' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fasting.startFast).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    await act(async () => resolve(active))
    expect(button).not.toBeDisabled()
  })

  it('shows a load failure without inventing an empty history or enabling writes', async () => {
    const fasting = state({ error: new FastingError('load') })
    render(<FastingPanel fasting={fasting} />)
    expect(screen.getByRole('alert')).toHaveTextContent('fasting.error.load')
    expect(screen.queryByText('fasting.empty')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fasting.startNowWithGoal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'fasting.addPast' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'fasting.retry' }))
    await waitFor(() => expect(fasting.refresh).toHaveBeenCalledTimes(1))
  })
})
