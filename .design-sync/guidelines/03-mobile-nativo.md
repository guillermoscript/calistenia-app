# App nativa (React Native)

**Los componentes de este design system son los de la web.** La app nativa es
Expo / React Native con NativeWind, y sus componentes no pueden renderizarse en
el navegador, así que no forman parte del bundle. Este documento existe para que
puedas **maquetar pantallas y mockups móviles fieles a la marca** usando los
componentes web, y para que cualquier diseño que se lleve luego a nativo respete
las reglas de la plataforma.

## Los tokens son los mismos

La app nativa usa exactamente los mismos valores HSL que la web (mismos
`background`, `card`, `lime`, `border`…), así que el color de un mockup móvil se
construye con los tokens de este sistema sin traducción.

Para props nativas que no aceptan clases (color de iconos, color de placeholder)
la app mantiene equivalentes en hex:

| Uso | Hex |
|---|---|
| Lima | `#a3e635` |
| Icono atenuado | `#888899` |
| Placeholder de input | `#71717a` |
| Destructivo | `#ef4444` |

El tema de navegación nativo solo redefine seis colores: `background`, `border`,
`card`, `notification` (= destructive), `primary` y `text`.

## Reglas propias de nativo

Estas no aplican a la web, pero condicionan cualquier diseño destinado a móvil:

- **Cada peso de fuente es una familia aparte.** En React Native no se combina
  `font-bold` con las fuentes personalizadas: Android haría «synthetic bold»
  sobre la regular y se ve mal. Se usan clases de familia dedicadas
  (`font-sans-bold`, `font-mono-bold`…). Si diseñas pensando en nativo, decide
  el peso como *familia*, no como modificador.
- **Los overlays son `Modal` nativos**, no paneles JS. En Xiaomi/MIUI con
  edge-to-edge los insets de un sheet en JS colapsan a 0 y choca con la barra de
  navegación de Android.
- **Densidad pensada para el pulgar.** La app se usa a mitad de serie: objetivos
  grandes, controles en la zona baja de la pantalla, y la información crítica
  legible de un vistazo.

## Equivalencias al maquetar móvil con componentes web

| Intención | Qué usar aquí |
|---|---|
| Bottom sheet nativo | `Sheet` con `side="bottom"` |
| Barra de pestañas inferior | `Tabs` con la `TabsList` al pie |
| Fila de lista pulsable | `Card` con filete, o `Button variant="ghost"` a ancho completo |
| Cabecera de pantalla | kicker en `font-mono` MAYÚSCULAS + título en `font-bebas` |
| Chip de estado | `Badge` (lima para completado) |

Un lienzo móvil realista son **390×844** px.
