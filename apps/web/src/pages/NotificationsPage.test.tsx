/**
 * Bandeja de solicitudes de seguimiento (#422).
 *
 * Lo que importa: una `follow_request` pendiente pinta Aceptar/Rechazar y los
 * botones llaman a `acceptRequest`/`rejectRequest` con el id de la FILA de
 * `follows` (no con el id del actor); una ya resuelta no pinta botones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const h = vi.hoisted(() => ({
  notifications: [] as unknown[],
  follows: {
    pendingIncoming: [] as unknown[],
    acceptRequest: vi.fn(async () => true),
    rejectRequest: vi.fn(async () => true),
  },
}))

vi.mock('../contexts/NotificationsContext', () => ({
  useNotificationsContext: () => ({
    notifications: h.notifications,
    loading: false,
    loadNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuthState: () => ({ user: { id: 'me' } }),
}))
vi.mock('@calistenia/core/hooks/useFollows', () => ({
  useFollows: () => h.follows,
}))
vi.mock('@calistenia/core/lib/dateUtils', () => ({ timeAgoShort: () => 'ahora' }))

import NotificationsPage from './NotificationsPage'

const notif = (type: string, actorId: string) => ({
  id: `n-${actorId}`, userId: 'me', type, actorId, actorName: actorId,
  referenceId: actorId, referenceType: 'user', read: false, data: {}, created: '2026-08-22',
})
const request = (rowId: string, uid: string) => ({
  id: rowId, created: '2026-08-22',
  user: { id: uid, displayName: uid, username: '', avatarUrl: null },
})

function mount() {
  return render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
}

describe('NotificationsPage · solicitudes de seguimiento', () => {
  beforeEach(() => {
    h.notifications = []
    h.follows.pendingIncoming = []
    h.follows.acceptRequest.mockClear()
    h.follows.rejectRequest.mockClear()
  })

  it('accepts with the follows ROW id, not the actor id', async () => {
    h.notifications = [notif('follow_request', 'ana')]
    h.follows.pendingIncoming = [request('row-1', 'ana')]
    mount()

    // Sección de bandeja + la propia notificación: dos botones Aceptar.
    const accepts = screen.getAllByRole('button', { name: 'privacy.accept' })
    expect(accepts).toHaveLength(2)
    await userEvent.click(accepts[1])
    expect(h.follows.acceptRequest).toHaveBeenCalledWith('row-1')
    expect(h.follows.rejectRequest).not.toHaveBeenCalled()
  })

  it('rejects via rejectRequest', async () => {
    h.follows.pendingIncoming = [request('row-2', 'bea')]
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'privacy.reject' }))
    expect(h.follows.rejectRequest).toHaveBeenCalledWith('row-2')
  })

  it('shows no actions for a follow_request already resolved', () => {
    h.notifications = [notif('follow_request', 'ana'), notif('follow_accepted', 'carl')]
    mount()
    expect(screen.getByText('notif.followRequest:ana')).toBeTruthy()
    expect(screen.getByText('notif.followAccepted:carl')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'privacy.accept' })).toBeNull()
    expect(screen.queryByText('privacy.requestsTitle')).toBeNull()
  })
})
