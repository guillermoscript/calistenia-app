import { OpenPanel } from '@openpanel/web'

export const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: import.meta.env.VITE_OPENPANEL_CLIENT_ID ?? '95f75c3f-fb38-4c0b-a401-a3a63f8b91f5',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
})

// Lightweight health check — logs to console if analytics endpoint is unreachable.
// Runs once on load so you know if ad blockers or network issues are silently dropping events.
if (typeof window !== 'undefined') {
  fetch('https://openpanel.guille.tech/api', { method: 'HEAD', mode: 'no-cors' }).catch(() => {
    console.warn('[analytics] OpenPanel endpoint unreachable — events may be blocked by ad blocker or network issue')
  })
}
