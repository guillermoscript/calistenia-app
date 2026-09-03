/**
 * #694 — la tarjeta de permiso de notificaciones en la celebración del primer
 * entreno. `shouldShowPushPrompt`/`markPushPromptSeen`/`trackPushPrompt*` viven
 * en core (`push-prompt.ts`) y se mockean aquí para controlar el escenario sin
 * tocar `localStorage` de verdad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const h = vi.hoisted(() => ({
  shouldShow: true,
  markSeen: vi.fn(),
  trackViewed: vi.fn(),
  trackAnswered: vi.fn(),
}))

vi.mock('@calistenia/core/lib/push-prompt', () => ({
  shouldShowPushPrompt: () => h.shouldShow,
  markPushPromptSeen: h.markSeen,
  trackPushPromptViewed: h.trackViewed,
  trackPushPromptAnswered: h.trackAnswered,
}))

const p = vi.hoisted(() => ({
  vapidConfigured: true,
  permission: 'default' as NotificationPermission | 'unsupported',
  subscribeToPush: vi.fn(async () => true),
  requestNotificationPermission: vi.fn(async () => true),
}))

vi.mock('../../lib/push-subscription', () => ({
  getNotificationSupport: () => ({
    notifications: p.permission !== 'unsupported',
    pushManager: true,
    serviceWorker: true,
    vapidConfigured: p.vapidConfigured,
    permission: p.permission,
  }),
  requestNotificationPermission: p.requestNotificationPermission,
  subscribeToPush: p.subscribeToPush,
}))

import PushPermissionCard from './PushPermissionCard'

describe('PushPermissionCard (#694)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.shouldShow = true
    p.vapidConfigured = true
    p.permission = 'default'
    p.subscribeToPush.mockResolvedValue(true)
    p.requestNotificationPermission.mockResolvedValue(true)
  })

  it('se muestra cuando el permiso está sin decidir y no se ha visto antes', () => {
    render(<PushPermissionCard userId="u1" workoutKey="free_first_1" totalSessions={1} />)
    expect(screen.getByText('pushPrompt.title')).toBeTruthy()
    expect(h.trackViewed).toHaveBeenCalledWith({ workoutKey: 'free_first_1', totalSessions: 1 })
  })

  it('no se muestra cuando `shouldShowPushPrompt` da false (ya concedido o ya visto)', () => {
    h.shouldShow = false
    render(<PushPermissionCard userId="u1" workoutKey="free_first_1" totalSessions={3} />)
    expect(screen.queryByText('pushPrompt.title')).toBeNull()
    expect(h.trackViewed).not.toHaveBeenCalled()
  })

  it('aceptar con VAPID configurado suscribe y marca como concedido', async () => {
    render(<PushPermissionCard userId="u1" workoutKey="free_first_1" totalSessions={1} />)
    await userEvent.click(screen.getByText('pushPrompt.accept'))
    await waitFor(() => expect(p.subscribeToPush).toHaveBeenCalledWith('u1'))
    expect(p.requestNotificationPermission).not.toHaveBeenCalled()
    expect(h.markSeen).toHaveBeenCalledWith('u1')
    expect(h.trackAnswered).toHaveBeenCalledWith({ result: 'granted', workoutKey: 'free_first_1' })
    expect(screen.getByText('pushPrompt.granted')).toBeTruthy()
  })

  it('aceptar sin VAPID pide el permiso básico', async () => {
    p.vapidConfigured = false
    render(<PushPermissionCard userId="u1" workoutKey="free_first_1" totalSessions={1} />)
    await userEvent.click(screen.getByText('pushPrompt.accept'))
    await waitFor(() => expect(p.requestNotificationPermission).toHaveBeenCalled())
    expect(p.subscribeToPush).not.toHaveBeenCalled()
  })

  it('rechazar marca como visto, registra "dismissed" y oculta la tarjeta', async () => {
    render(<PushPermissionCard userId="u1" workoutKey="free_first_1" totalSessions={1} />)
    await userEvent.click(screen.getByText('pushPrompt.decline'))
    expect(h.markSeen).toHaveBeenCalledWith('u1')
    expect(h.trackAnswered).toHaveBeenCalledWith({ result: 'dismissed', workoutKey: 'free_first_1' })
    expect(screen.queryByText('pushPrompt.title')).toBeNull()
  })
})
