# Piezas de marketing, social y fliers

## Antes de nada: marketing no es UI de producto

La guía de marca (`01`) prohíbe degradados, glows y texturas. **Esa regla es
para la interfaz de la app**, donde cualquier adorno estorba a alguien que mira
la pantalla a mitad de serie.

**La superficie de marketing sí los usa**, y de hecho la imagen social oficial
de la marca (`og.png` en el repo) los lleva: fondo casi negro con una trama de
hairlines y un glow lima suave en una esquina. Si aplicas aquí las reglas de UI,
sale una pieza que no se parece a la marca.

Lo que **sigue prohibido también en marketing**:

- **Texto con degradado.** Los titulares son color plano: blanco o lima.
- Glassmorphism y desenfoques.
- Neón cian o morado.
- Sombras genéricas bajo tarjetas.
- Cualquier tipografía que no sea Bebas Neue, DM Sans o JetBrains Mono.

## Lienzos

| Uso | Tamaño | Nota |
|---|---|---|
| Feed cuadrado | 1080 × 1080 | El de partida |
| Feed retrato | 1080 × 1350 | Ocupa más pantalla en móvil; el mejor para feed |
| Stories / Reels | 1080 × 1920 | Deja **250 px libres arriba y 320 px abajo**: la UI de la app tapa esas zonas |
| Open Graph / X | 1200 × 630 | El de `og.png` |
| Mockup de pantalla móvil | 390 × 844 | Ver `03-mobile-nativo.md` |

Construye a tamaño real con `width` y `height` fijos en px, no con porcentajes:
la pieza se captura tal cual.

**Las medidas van en `style` inline, no en clases.** El CSS de este sistema está
pregenerado, así que las utilidades de valor arbitrario (`w-[1080px]`,
`text-[150px]`, `leading-[0.92]`) no existen y no hacen nada — el elemento sale
sin tamaño y sin que nada avise. Para un flier eso significa prácticamente todas
las medidas: lienzo, tamaño del titular e interlineado. Ver la regla completa en
la cabecera del README.

## El lockup

La firma de la marca es **la marca gráfica + «CALISTENIA» en Bebas**, en
horizontal, alineadas por el centro vertical.

- La marca gráfica está en `--brand-mark` (atleta en front lever, lima sobre
  transparente).
- **Respeta su proporción: `--brand-mark-aspect` es `428 / 512`.** Deformarla se
  nota inmediatamente.
- **No la recolorees ni le pongas fondo de color.** Su lima está horneado en el
  PNG (`#bff71a`) y ya casi coincide con el token `--lime`.
- El texto «CALISTENIA» va en `font-bebas`, mayúsculas, blanco, con
  `tracking-wide` o `tracking-wider`.
- Altura de la marca ≈ la altura de las mayúsculas del texto, o un poco más.

```jsx
<div className="flex items-center gap-3">
  <div
    className="h-9"
    style={{
      aspectRatio: 'var(--brand-mark-aspect)',
      backgroundImage: 'var(--brand-mark)',
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    }}
  />
  <span className="font-bebas font-normal text-3xl tracking-wider text-white">CALISTENIA</span>
</div>
```

## La receta base

Es la de `og.png`, y funciona en cualquier lienzo:

1. **Superficie**: `bg-background` (casi negro) + `--brand-grid` repetida +
   `--brand-glow` en una esquina.
2. **Lockup** arriba a la izquierda.
3. **Titular** en Bebas, enorme, dos líneas, en mayúsculas, **con punto final**.
   La primera línea en blanco, la segunda en `text-lime`. El contraste entre las
   dos líneas es lo que da el golpe.
4. **Pie**: una pastilla lima con texto oscuro en DM Sans semibold, y al lado una
   línea de apoyo en `text-muted-foreground` separada por `·`.

```jsx
<div
  className="relative flex flex-col justify-between overflow-hidden bg-background p-16"
  style={{ width: 1080, height: 1080, backgroundImage: 'var(--brand-glow), var(--brand-grid)' }}
>
  {/* lockup */}
  <div className="flex items-center gap-3">
    <div className="h-9" style={{ aspectRatio: 'var(--brand-mark-aspect)', backgroundImage: 'var(--brand-mark)', backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }} />
    <span className="font-bebas font-normal text-3xl tracking-wider text-white">CALISTENIA</span>
  </div>

  {/* titular — el tamaño y el interlineado van inline: no hay clase que los dé */}
  <h1 className="font-bebas font-normal tracking-wide" style={{ fontSize: 150, lineHeight: 0.92 }}>
    <span className="block text-white">SIN GIMNASIO.</span>
    <span className="block text-lime">SIN EXCUSAS.</span>
  </h1>

  {/* pie */}
  <div className="flex items-center gap-5">
    <span className="rounded-full bg-lime px-5 py-2 font-semibold text-lime-foreground">
      Android + Web
    </span>
    <span className="text-xl text-muted-foreground">
      Entrenamiento guiado · Nutrición con IA · Progreso real
    </span>
  </div>
</div>
```

## Variantes de composición

- **Cifra protagonista.** Una métrica gigante en Bebas (`style={{ fontSize: 280 }}`) con un
  kicker mono encima: «RACHA ACTUAL» / «12» / «días seguidos». Es la más
  reconocible del sistema porque repite el idioma de las tarjetas de estadística
  de la app.
- **Antes / después** o **dos columnas**, separadas por un filete vertical de
  1px en `border-border` — no por un cambio de fondo.
- **Cita o testimonio**: texto en DM Sans a `text-4xl` con `leading-snug`, y la
  atribución en mono MAYÚSCULAS pequeña. Sin comillas decorativas gigantes.
- **Captura de la app** dentro de un marco de 390 × 844 con `rounded-3xl` y
  filete `border-border`, sobre la superficie de marca.

## Copy

Voz de cuaderno de entrenamiento: **segura, seca, sin relleno**. Español.
Frases cortas, en mayúsculas en el titular, terminadas en punto. Imperativos y
cifras concretas funcionan; los signos de exclamación y el lenguaje de coach
motivacional no.

## Nota sobre el lima

Hay **tres** limas ligeramente distintos en la marca hoy:

| Origen | Valor |
|---|---|
| Token `--lime` (oscuro) | `hsl(74 90% 57%)` ≈ `#c6f42f` |
| Token `--lime` (claro) | `hsl(74 90% 38%)` ≈ `#8fb80a` |
| Horneado en la marca gráfica | `#bff71a` |
| `COLORS.lime` de la app nativa | `#a3e635` |

Para todo lo que dibujes, **usa el token** (`bg-lime`, `text-lime`). La marca
gráfica se queda con el suyo; están lo bastante cerca como para que no choquen.

## Exportar

El design system produce HTML, no imágenes. Para tener el archivo final se
captura la pieza al tamaño exacto del lienzo. Las fuentes vienen de Google
Fonts, así que la captura necesita red.
