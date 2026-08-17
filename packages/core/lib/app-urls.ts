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
