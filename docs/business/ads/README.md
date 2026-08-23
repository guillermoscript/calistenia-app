# Kit de publicidad

Siete piezas para redes, enlace e impresión, construidas con los tokens reales de la app
(`apps/web/src/index.css`) y su tipografía (Bebas Neue, DM Sans, JetBrains Mono).
Los ángulos de copy salen de `10-publicidad-venezuela-primeros-100.md`.

| Artboard | Formato | Uso |
|---|---|---|
| `Main` | 1080×1920 | Status de WhatsApp, story de Instagram, portada de TikTok — ángulo coste |
| `Reto` | 1080×1920 | Reto de 30 días co-firmado con un atleta (fondo lima, contrasta en el feed) |
| `Mockup` | 1080×1350 | Feed vertical de Instagram con el dashboard real dentro del teléfono |
| `Datos` | 1080×1080 | Feed cuadrado IG/Facebook — ángulo PWA "no gastes datos" |
| `Banner` | 1200×630 | Previsualización de enlace (Open Graph, WhatsApp, Facebook) |
| `Flier` | 559×794 (A5) | Impresión para parques de barras, con hueco para el QR |
| `Kit` | 1080×1460 | Paleta, tipografía, banco de titulares y medidas |

## Huecos que hay que rellenar

- `Reto`: `[NOMBRE DEL ATLETA]` y `[FECHA]`.
- `Flier`: el recuadro punteado espera un QR a `gym.guille.tech`.
- `Mockup`: las cifras del teléfono (semana 3, racha 6, 14 sesiones, pesos) son de ejemplo.

## Regenerar el lienzo

Los ficheros de `src/` llevan el marcador `/*FONTS*/` para poder editarlos sin arrastrar
136 KB de base64. `build.py` sustituye ese marcador por las fuentes incrustadas y deja el
resultado en `build/` (ignorado por git).

```bash
python3 docs/business/ads/check.py    # data-props, referencias e imagen, layout del canvas
python3 docs/business/ads/build.py    # inyecta las fuentes en build/
```

Después se siembra el lienzo con el helper del skill `/design` pasando los siete artboards
de `build/`, `logo.png` y `build/canvas.json`.

`mkfonts.py` solo hace falta si cambian las fuentes de marca: descarga las variantes latin
de Google Fonts y las incrusta como `data:` URI. Es necesario porque la exportación a PNG
del lienzo no incrusta Google Fonts, y sin esto los anuncios saldrían con la tipografía de
respaldo en vez de Bebas Neue.
