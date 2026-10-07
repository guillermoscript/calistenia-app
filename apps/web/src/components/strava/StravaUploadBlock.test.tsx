import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
vi.mock('@calistenia/core/lib/pocketbase', () => ({ pb: { send: vi.fn() } }))
import { StravaApiError } from '@calistenia/core/lib/strava'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const statusHook = vi.fn()
const uploadHook = vi.fn()
vi.mock('@calistenia/core/hooks/useStrava', () => ({
  useStravaStatus: () => statusHook(),
  useStravaUpload: () => uploadHook(),
}))

import { StravaUploadBlock } from './StravaUploadBlock'

const send = vi.fn()
function setup(status: unknown, upload: unknown = null, sending = false) {
  statusHook.mockReturnValue({ status, loading: false })
  uploadHook.mockReturnValue({ upload, send, sending })
  render(<MemoryRouter><StravaUploadBlock userId="u1" sessionId="s1" /></MemoryRouter>)
}

describe('StravaUploadBlock', () => {
  beforeEach(() => { send.mockReset() })

  it('no pinta nada si Strava no está configurado', () => {
    setup({ configured: false, connected: false, athlete_id: null })
    expect(screen.queryByTestId('strava-upload-block')).toBeNull()
  })

  it('sin conexión invita a conectar desde el perfil', () => {
    setup({ configured: true, connected: false, athlete_id: null })
    expect(screen.getByText(/strava.needConnect/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/profile')
  })

  it('conectado y sin subida muestra el botón de subir', () => {
    setup({ configured: true, connected: true, athlete_id: 1 })
    send.mockResolvedValue({})
    fireEvent.click(screen.getByText('strava.upload'))
    expect(send).toHaveBeenCalled()
  })

  it('done enlaza a la actividad en una pestaña nueva', () => {
    setup({ configured: true, connected: true, athlete_id: 1 },
      { status: 'done', activity_id: 5, url: 'https://www.strava.com/activities/5', error: null })
    const link = screen.getByText('strava.viewOn')
    expect(link).toHaveAttribute('href', 'https://www.strava.com/activities/5')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('un error de reconexión muestra strava.reauth', async () => {
    setup({ configured: true, connected: true, athlete_id: 1 })
    send.mockRejectedValue(new StravaApiError(409, 'strava_reauth_required', 'x'))
    fireEvent.click(screen.getByText('strava.upload'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('strava.reauth'))
  })
})
