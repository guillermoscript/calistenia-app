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

/**
 * Aviso de programa eliminado (#633).
 *
 * `programs.name` es un campo `json {es, en}`, y el hook lo guarda ENTERO en
 * `data.programName` porque el servidor no sabe en qué idioma tiene la app el
 * destinatario. Aquí se comprueba lo que se rompería si alguien lo tratara como
 * un string: interpolar el mapa daría literalmente «[object Object]» (#602).
 *
 * El mock de `t` devuelve `clave:params`, así que el nombre que llega al copy es
 * observable en el texto pintado.
 */
describe('NotificationsPage · programa eliminado', () => {
  beforeEach(() => {
    h.notifications = []
    h.follows.pendingIncoming = []
  })

  const deleted = (programName: unknown) => ({
    id: 'n-prog', userId: 'me', type: 'program_deleted', actorId: 'me', actorName: 'me',
    referenceId: 'prog-1', referenceType: 'program', read: false,
    data: { programName }, created: '2026-08-22',
  })

  it('localiza el mapa i18n del nombre en vez de interpolar el objeto', () => {
    h.notifications = [deleted({ es: 'Fuerza Total', en: 'Full Strength' })]
    mount()

    // `i18n.language` es 'es' en el mock → gana la rama española.
    expect(screen.getByText('notif.programDeleted:Fuerza Total')).toBeTruthy()
    expect(screen.queryByText(/\[object Object\]/)).toBeNull()
  })

  it('acepta un nombre legado en string plano', () => {
    // Filas anteriores a `1774378015_i18n_program_fields.js`: el campo json
    // guarda un string pelado y `localize()` lo devuelve tal cual.
    h.notifications = [deleted('Programa Viejo')]
    mount()
    expect(screen.getByText('notif.programDeleted:Programa Viejo')).toBeTruthy()
  })

  it('no se rompe si el programa no tenía nombre', () => {
    // `localize(undefined)` devuelve '': el copy deja el nombre al final justo
    // para sostenerse sin él.
    h.notifications = [deleted(undefined)]
    mount()
    expect(screen.getByText('notif.programDeleted:')).toBeTruthy()
  })
})
