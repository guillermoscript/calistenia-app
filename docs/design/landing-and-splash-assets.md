# Landing y splash — dirección visual

## Estado

- Las creatividades de Google Play quedan como exploración v1. No se consideran aprobadas para publicación por la pérdida de calidad de las capturas.
- Las capturas reales de ejercicios y nuevas capturas de Play Store se producirán más adelante directamente desde el dispositivo, en resolución final.
- Las imágenes editoriales generadas para la landing sí se integran como ambientación visual, detrás de la UI y el copy.
- La variante `splash-icon-v2.png` se deja preparada, pero no reemplaza la imagen actual hasta aprobación.

## Landing responsive

La landing usa las imágenes en `apps/web/public/landing/` como fondos editoriales. En desktop ocupan principalmente la mitad visual de cada sección; en mobile bajan de opacidad y cambian el recorte para que no compitan con el texto, los CTAs ni los paneles de producto.

Assets actuales:

- `hero-v1.png`: hero horizontal, recortado con foco hacia el atleta en mobile.
- `training-v1.png`: entrenamiento guiado.
- `nutrition-v1.png`: alimentación y objetivo.
- `progress-v1.png`: progreso visible.

La validación objetivo es 390 px de ancho, sin overflow horizontal, con botones apilados, texto legible y suficiente contraste sobre las imágenes.

## Sharing y Open Graph por idioma

Las URLs públicas de marketing se normalizan con prefijo de idioma: `/es/` o `/en/`, incluyendo `/features/*` y `/download`. La URL explícita tiene prioridad sobre el idioma detectado del navegador y el selector de la cabecera cambia ambas cosas: idioma de la app y URL.

El build genera shells estáticos para esas rutas en `dist/es/` y `dist/en/`. Cada shell contiene `title`, description, canonical, `og:locale`, `og:image` y Twitter Card localizados; esto es necesario porque WhatsApp, Telegram, Facebook y otros crawlers no leen el `localStorage` del visitante ni esperan a que arranque React. Los enlaces compartidos desde web y móvil también incluyen el idioma del emisor.

URLs recomendadas para campañas y shares:

- Español: `https://gym.guille.tech/es/`
- English: `https://gym.guille.tech/en/`

## Splash v2

`apps/mobile/assets/images/splash-icon-v2.png` propone el mismo atleta de marca con un halo lima muy sutil sobre negro profundo. Se mantiene como variante no activa para comparar contra el splash actual antes de cambiar `apps/mobile/app.json`.

## Siguiente fase

1. Aprobar el tratamiento visual de la landing en desktop y mobile.
2. Aprobar o descartar el splash v2.
3. Capturar las pantallas reales en resolución final.
4. Generar las instrucciones visuales de ejercicios prioritarios desde esas capturas reales.
