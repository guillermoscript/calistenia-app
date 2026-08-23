# Assets de publicidad

Dos juegos de piezas, construidos con la tipografía de la app (Bebas Neue, DM Sans,
JetBrains Mono). Los ángulos de copy salen de `10-publicidad-venezuela-primeros-100.md`.

## `src-fliers/` — fliers sociales (paleta apagada)

El juego vigente. Nace de que el lima de la app, `#C6F42F`, tiene un croma altísimo
(oklch ~0.91 **0.21** 122) y cansa la vista en piezas a pantalla completa. La paleta se
calcula en `palette.py`: mismo tono, croma por debajo de la mitad.

| Artboard | Formato | Uso |
|---|---|---|
| `Main` | 1080×1920 | Historia de marca — Instagram, WhatsApp, TikTok |
| `Producto` | 1080×1920 | Qué es la app en tres puntos |
| `Consejo` | 1080×1920 | Plantilla reutilizable: se le cambia el texto cada semana |
| `Cuadrado` | 1080×1080 | Feed de Instagram y Facebook |
| `Impreso` | 559×794 (A5) | Impresión, en la variante clara (un negro a sangre se bebe el tóner) |
| `DirGrafito` · `DirPapel` · `DirMono` | 760×1000 | Las tres direcciones de color, para elegir viendo |

Paleta en uso (Grafito), toda por encima de AA sobre el fondo:

| Token | Hex | oklch |
|---|---|---|
| fondo | `#13130F` | 0.185 0.008 100 |
| carta | `#21211C` | 0.245 0.009 100 |
| borde | `#34332D` | 0.320 0.010 100 |
| hueso | `#EEEDE7` | 0.945 0.008 95 |
| apagado | `#9D9B96` | 0.690 0.008 95 |
| acento | `#ABBA71` | 0.760 0.098 118 |

## `src/` — kit original (lima de la app)

Más ruidoso y atado a ángulos concretos de campaña. Conserva el mockup del dashboard y
el banner OG, que no tienen equivalente en el juego nuevo.

| Artboard | Formato | Uso |
|---|---|---|
| `Main` · `Reto` | 1080×1920 | Ángulo coste y reto de 30 días |
| `Mockup` | 1080×1350 | Feed 4:5 con el dashboard real dentro del teléfono |
| `Datos` | 1080×1080 | Ángulo PWA "no gastes datos" |
| `Banner` | 1200×630 | Previsualización de enlace (Open Graph) |
| `Flier` | 559×794 | A5 para parques |
| `Kit` | 1080×1460 | Paleta, tipografía y banco de titulares |

## Huecos que hay que rellenar

- `src-fliers/Consejo`: el titular y el cuerpo son un ejemplo; la pieza existe para reescribirlos.
- `src-fliers/Impreso` y `src/Flier`: el recuadro punteado espera un QR a `gym.guille.tech`.
- `src/Reto`: `[NOMBRE DEL ATLETA]` y `[FECHA]`.
- `src/Mockup`: las cifras del teléfono son de ejemplo.

## Regenerar

Los ficheros de `src*/` llevan el marcador `/*FONTS*/` para poder editarlos sin arrastrar
136 KB de base64. `build.py` sustituye ese marcador por las fuentes incrustadas, reduce el
logo desde `apps/web/public/logo-bg-less.png` y deja todo en `build*/` (ignorado por git).

```bash
python3 docs/business/ads/palette.py              # paleta oklch -> hex + contrastes
python3 docs/business/ads/check.py src-fliers     # data-props, sintaxis JS, layout
python3 docs/business/ads/build.py src-fliers     # -> build-fliers/
python3 docs/business/ads/check.py                # el juego original
python3 docs/business/ads/build.py                # -> build/
```

Después se siembra el lienzo con el helper del skill `/design` pasando los artboards de
`build*/`, su `logo.png` y su `canvas.json`.

`mkfonts.py` solo hace falta si cambian las fuentes de marca: descarga las variantes latin
de Google Fonts y las incrusta como `data:` URI. Es necesario porque la exportación a PNG
del lienzo no incrusta Google Fonts, y sin esto los anuncios saldrían con la tipografía de
respaldo en vez de Bebas Neue.
