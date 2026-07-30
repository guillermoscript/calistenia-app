# Marca y dirección estética — Calistenia

## Para quién

Gente que entrena calistenia, usando la app **en el móvil, a menudo a mitad de
entreno**: con una mano, de un vistazo, a veces en un gimnasio con mala luz.
Los trabajos principales son ver el entreno de hoy, empezar a entrenar,
registrar series y mirar lo social. **La velocidad y la legibilidad ganan a la
decoración.**

## Personalidad

Atlética · utilitaria · disciplinada. La voz de un **cuaderno de entrenamiento
o de una máquina de gimnasio**, no de una app de estilo de vida. Segura, seca,
sin relleno. Copy en español primero.

## Dirección estética

**Brutalista-atlético, «hoja de especificaciones» oscura primero.** La
tipografía hace el trabajo:

- **Bebas Neue** (`font-bebas`) — mayúsculas condensadas grandes para títulos y
  cifras.
- **JetBrains Mono** (`font-mono`) — kickers y etiquetas pequeñas en MAYÚSCULAS
  con mucho tracking (`tracking-wider`/`tracking-widest`), tamaños de 9–11px.
- **DM Sans** (`font-sans`) — cuerpo de texto.

Reglas de superficie y color:

- **El lima es el único acento y el color de interacción.** Marca completado y
  activo. Estados de pulsación con `bg-lime/10`, bordes activos con
  `border-lime/40`. **Los botones primarios NO son lima** — son casi-negro
  sobre claro y casi-blanco sobre oscuro (`variant="default"`).
- Superficies casi negras en modo oscuro: `bg-background` (3.9% de luminancia),
  `bg-card` (7%).
- **Filetes de 1px** (`border-border`) estructuran la interfaz — matrices y
  divisores. No tarjetas redondeadas con sombras.
- Idioma de cabecera repetido en toda la app: kicker en mono + título en Bebas.

## Anti-referencias — NO hacer

- Glassmorphism o desenfoques.
- Degradados, y especialmente texto con degradado.
- Tarjetas redondeadas con sombras genéricas. Tarjetas anidadas.
- Cian y morado neón de «IA».
- Un color de icono distinto por elemento. Agrupa el color por significado: como
  mucho un tono por sección (lima = entrenamiento, `sky` = social, neutro =
  utilidad).
- Easing con rebote o elástico.

Nota sobre el modo claro: existe pero es secundario. `card` (100%) y
`background` (97%) son casi idénticos, así que **no te apoyes solo en el
contraste de fondo** — usa filetes y el acento.

## Principios

1. **Tipografía y filetes antes que contenedores.** Estructura con la jerarquía
   Bebas/mono y bordes de 1px; no metas todo en tarjetas con sombra.
2. **El lima significa «interactúa».** Resérvalo para acentos y estados
   activos/pulsados; da identidad a cada sección con un tono como máximo.
3. **Primero el pulgar, y de un vistazo.** Objetivos grandes, densidad de
   información compacta, controles alcanzables; el camino más usado es el más
   rápido.
4. **El movimiento es rápido y funcional.** Deslizamiento para paneles, ease-out
   suave, sin rebote. Respeta `prefers-reduced-motion`. Un movimiento con
   propósito vale más que muchos.
5. **Nada puede atrapar al usuario.** En cualquier overlay, deja siempre una
   salida que no sea un gesto: fondo pulsable, ✕ o botón de cancelar.
