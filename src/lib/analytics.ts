import { OpenPanel } from '@openpanel/web'

export const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: '18cdafce-bf86-444d-8cd8-3490d9ba8dc7',
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
