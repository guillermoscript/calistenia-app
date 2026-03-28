import { OpenPanel } from '@openpanel/web'

export const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: '18cdafce-bf86-444d-8cd8-3490d9ba8dc7',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
})
