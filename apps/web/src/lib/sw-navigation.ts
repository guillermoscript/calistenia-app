// Navegaciones que el service worker NO resuelve con el shell de la SPA.
//
// Vive fuera de `sw.ts` para poder testearla: `sw.ts` toca `self` y el
// manifiesto de workbox al importarse.
//
// OJO: workbox prueba cada regex contra `pathname + search`, no solo contra
// el pathname. Una regla anclada con `$` al final de la ruta deja de casar en
// cuanto la URL lleva query. Eso rompió el login con Google en el móvil: Google
// vuelve a `/oauth-bridge.html?state=…&code=…`, el Custom Tab comparte el
// service worker de Chrome y recibía `index.html` en blanco en vez del bridge,
// así que el deep-link a la app nunca salía.
export const NAVIGATION_DENYLIST: RegExp[] = [
  // PocketBase: API y panel de admin.
  /^\/api\//,
  /^\/_\//,
  // Servidor de IA (chat MCP).
  /^\/mcp(\/|$)/,
  // Blog pre-renderizado. `scripts/prerender-blog.mjs` corre DESPUÉS de
  // `vite build`, así que su HTML no entra en el manifiesto del precache:
  // servir el shell aquí se cargaría el prerender.
  /^\/blog(\/|$)/,
  // Generados por ese mismo script, y por tanto tampoco precacheados.
  /^\/sitemap\.xml(\?|$)/,
  /^\/robots\.txt(\?|$)/,
  // Assets con hash del build.
  /^\/assets\//,
  // Cualquier cosa con extensión en el último segmento de la ruta (iconos,
  // media de ejercicios, las páginas sueltas de `public/` como
  // `oauth-bridge.html`), lleve query o no: nunca es una ruta de la SPA.
  /\/[^/?]+\.[^/?]+(\?|$)/,
]

/** `pathAndSearch` con la misma forma que usa workbox: `url.pathname + url.search`. */
export function isDeniedNavigation(pathAndSearch: string): boolean {
  return NAVIGATION_DENYLIST.some((re) => re.test(pathAndSearch))
}
