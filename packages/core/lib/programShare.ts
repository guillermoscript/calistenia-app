/**
 * El enlace de compartir un programa. CÓDIGO PURO (#604).
 *
 * Estaba escrito dos veces en la web y en ninguna en el móvil:
 *   - `apps/web/src/lib/share.ts` construía `${WEB_BASE_URL}/shared/${id}`;
 *   - `apps/web/src/pages/ProgramsPage.tsx` tenía su propia `shareProgram()`
 *     con `${window.location.origin}/shared/${id}` — y era ESA la que colgaba
 *     del botón de las tarjetas, así que la de `share.ts` no la usaba nadie.
 *
 * Las dos formas no eran equivalentes: `window.location.origin` en desarrollo
 * genera `http://localhost:5173/shared/...`, un enlace que no le sirve de nada
 * a la persona que lo recibe. El destino de todo lo que se comparte es
 * `WEB_BASE_URL`, por la misma razón que explica `app-urls.ts`: el enlace tiene
 * que abrir en el teléfono de otra persona.
 *
 * El texto se pasa desde fuera en vez de traducirse aquí: `t()` en core sin
 * i18next inicializado devuelve `undefined`, y este módulo lo consumen la web,
 * el móvil y los tests, cada uno con su instancia.
 */
import { WEB_BASE_URL } from './app-urls'

/** La URL pública de un programa. Es la que sirve `/shared/:id`. */
export function sharedProgramUrl(programId: string): string {
  return `${WEB_BASE_URL}/shared/${programId}`
}

export interface ProgramShareContent {
  /** Título de la hoja nativa: el nombre del programa, sin adornos. */
  title: string
  /** La frase que acompaña al enlace, ya traducida por quien llama. */
  text: string
  url: string
}

/**
 * Lo que se envía al compartir un programa, en el formato que aceptan tanto
 * `navigator.share` en la web como `Share.share` en React Native.
 */
export function buildProgramShareContent(
  programName: string,
  programId: string,
  text: string,
): ProgramShareContent {
  return {
    title: programName,
    text,
    url: sharedProgramUrl(programId),
  }
}
