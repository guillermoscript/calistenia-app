/**
 * URLs públicas de la app. CÓDIGO PURO.
 *
 * El origen de la web es el destino de TODO lo que se comparte —invitaciones,
 * perfiles, sesiones, retos, batallas— también desde el móvil, que no tiene
 * páginas propias que enseñarle a quien recibe el enlace.
 *
 * OJO: esto NO es la URL de PocketBase ni la del AI API. Esas dependen del
 * entorno (dev apunta a localhost) y las inyecta cada app por `initCore()`;
 * esta es fija porque el enlace compartido tiene que funcionar en el móvil de
 * otra persona, donde un `localhost` no significa nada.
 *
 * Estaba copiada en seis sitios entre las dos apps, unas veces como `BASE_URL`
 * y otras como `WEB_ORIGIN` (#468).
 */
export const WEB_BASE_URL = 'https://gym.guille.tech'

/**
 * Rutas públicas de marketing: las únicas con copia pre-renderizada por idioma
 * (`apps/web/scripts/prerender-marketing.mjs` genera `/es/…` y `/en/…`). La web
 * reutiliza esta lista para normalizar la URL al arrancar.
 */
export function isMarketingPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/^\/(es|en)(?=\/|$)/, '') || '/'
  return path === '/'
    || path === '/features'
    || path.startsWith('/features/')
    || path === '/download'
    || path === '/descargar'
}

/**
 * URL pública para compartir. Solo las rutas de MARKETING llevan `/es` o `/en`
 * delante, para que la vista previa salga en el idioma de quien comparte.
 *
 * Las rutas de la app (`/invite/…`, `/u/…`, `/race/…`, `/session/…`,
 * `/shared/…`…) se quedan SIN prefijo a propósito:
 *   - los App Links de Android (`pathPrefix` en `apps/mobile/app.json`) y los
 *     Universal Links de iOS casan con `/invite`, `/race`…: con `/es/invite`
 *     el enlace deja de abrir la app a quien la tiene instalada;
 *   - el hook de vista previa de carreras (`pb_hooks/race_og_tags.pb.js`) solo
 *     casa con `^/race/:id`;
 *   - esas páginas no tienen copia pre-renderizada por idioma, así que el
 *     prefijo no mejora ninguna vista previa.
 */
export function localizedWebUrl(pathname: string, language?: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (!isMarketingPath(path)) return `${WEB_BASE_URL}${path}`
  const locale = language?.toLowerCase().startsWith('en') ? 'en' : 'es'
  return `${WEB_BASE_URL}/${locale}${path}`
}
