import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
  }),
}))

import { QuickGuide } from './QuickGuide'

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <QuickGuide open={open} onOpenChange={setOpen} />
      <Where />
    </>
  )
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes><Route path="*" element={<Harness />} /></Routes>
    </MemoryRouter>,
  )
}

describe('QuickGuide (#856)', () => {
  it('explica las 5 pestañas con un botón por pestaña', async () => {
    mount()
    await userEvent.click(screen.getByText('abrir'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    for (const key of ['quickGuide.today', 'quickGuide.workout', 'quickGuide.nutrition', 'quickGuide.progress', 'quickGuide.community']) {
      expect(screen.getByText(key)).toBeTruthy()
    }
    expect(screen.getAllByRole('button', { name: /^quickGuide\.goTo:/ })).toHaveLength(5)
  })

  it('se abre y se cierra con teclado', async () => {
    mount()
    screen.getByText('abrir').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('dialog')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el botón de una pestaña cierra la guía y navega', async () => {
    mount()
    await userEvent.click(screen.getByText('abrir'))
    await userEvent.click(screen.getByRole('button', { name: 'quickGuide.goTo:nav.progress' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where').textContent).toBe('/progress')
  })
})
