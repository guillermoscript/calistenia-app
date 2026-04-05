import { createContext, useContext, type ReactNode } from 'react'
import { useNotifications } from '../hooks/useNotifications'

type NotificationsContextType = ReturnType<typeof useNotifications>

const NotificationsContext = createContext<NotificationsContextType | null>(null)

export function NotificationsProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const notifications = useNotifications(userId)
  return (
    <NotificationsContext.Provider value={notifications}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotificationsContext(): NotificationsContextType {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationsProvider')
  return ctx
}
