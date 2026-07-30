# design-sync — notas del repo

Proyecto: **Calistenia Design System** — https://claude.ai/design/p/c84e2378-9de4-4569-85ba-1efc907b6e97
Primera sincronización: 2026-07-30. Shape `package` (no hay Storybook).

## Cómo re-sincronizar

```sh
# 1. Recrear el symlink si es un clon nuevo (ver más abajo por qué)
mkdir -p apps/web/node_modules/@calistenia && ln -sfn ../.. apps/web/node_modules/@calistenia/web

# 2. Re-copiar los scripts del skill e instalar sus deps si .ds-sync/ no existe
#    (typescript DEBE ser la 5.x — ver abajo)

# 3. Regenerar las entradas del build
node .design-sync/build-types.mjs && node .design-sync/build-css.mjs && node .design-sync/gen-docs.mjs

# 4. Driver (Playwright ya está instalado en .ds-sync: la verificación es real).
#    Bajar el ancla del proyecto a .design-sync/.cache/remote-sync.json antes,
#    para que el diff diga qué subir de verdad y no haya que re-subir los 560.
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules apps/web/node_modules --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

En un clon nuevo hay que reinstalar las deps del conversor:
`npm i esbuild ts-morph @types/react typescript@5.9.3 playwright@1.59.1` dentro
de `.ds-sync/`, y luego `npx playwright install chromium`.

## Trampas del repo

- **`@calistenia/web` es una app Vite privada, no una librería.** No tiene
  `dist` de componentes ni campo `types`, así que el conversor sintetiza la
  entrada desde `src/`. Y como pnpm no auto-enlaza una app privada, hace falta
  el symlink `apps/web/node_modules/@calistenia/web → ../..`; sin él el
  conversor muere con `ENOENT … @calistenia/web/package.json`. El enlace vive en
  `node_modules`, así que **hay que recrearlo en cada clon**.
- **`srcDir` tiene que ser `src/components/ui`, no `src`.** Con `src` el
  synth-entry barre los 31 primitivos *y* `main.tsx`, que importa
  `virtual:pwa-register` (virtual de Vite) e `index.css` con
  `@import "tailwindcss"` — esbuild no resuelve ninguno de los dos y el build
  falla.
- **Sin declaraciones no hay contrato de props.** La app usa `noEmit: true`, así
  que el conversor emitía `[key: string]: unknown` para los 129 componentes.
  `build-types.mjs` + `tsconfig.dts.json` emiten los `.d.ts` a
  `apps/web/ds-types`. **El directorio NO puede empezar por punto**: el
  extractor recorre `apps/web/**/*.d.ts` con un glob que ignora ocultos, y con
  `.ds-types` no encontraba nada (síntoma: `[DTS] parsed 1 .d.ts files`).
- **El extractor descarta props declaradas fuera del paquete** — no solo las de
  React, también las de Radix. Eso se comía `value` en `TabsTrigger`/`SelectItem`,
  `open` en `Dialog`, `side` en `PopoverContent`, `value` en `Progress`… Están
  restauradas a mano en `cfg.dtsPropsFor` (125/129 con contrato real; los 4
  restantes son `DialogOverlay`/`DialogPortal`/`SheetOverlay`/`SheetPortal`,
  fontanería que `*Content` ya monta).
  Detalle relacionado: los componentes que declaran una interfaz `<Name>Props`
  con nombre (`Badge`) extraen bien los variants de cva; los que usan una
  intersección inline (`Alert`) los pierden.
- **La agrupación no sale del árbol de ficheros.** Los 31 archivos están planos
  en `src/components/ui/`, y `ui` está en el `GENERIC_DIR` del conversor, así
  que los 129 caían en un grupo `general`. Los grupos los fija el frontmatter
  `category` de los docs que genera `gen-docs.mjs`.
- **Las etiquetas de grupo tienen que ser slug-safe.** El conversor las
  slugifica y destroza los acentos (`Navegación` → `navegaci-n`), por eso los
  siete grupos están en inglés (`actions`, `forms`, `surfaces`, `overlays`,
  `navigation`, `sidebar`, `feedback`). El contenido de los docs sigue en
  español.
- **`docsDir` y `guidelinesGlob` se resuelven contra `PKG_DIR`**, que es el
  symlink dentro de `node_modules` — de ahí los cinco `../` para llegar a la
  raíz del repo. No es un error tipográfico.
- **Tailwind v4 purga contra el código de la app**, así que el CSS compilado
  solo trae lo que la app ya usa. `build-css.mjs` añade
  `.design-sync/ds-safelist.txt` como fuente extra (~4.100 clases → 854 KB).
  Comprobado: **`@source` sí convive con `@config`** (el canario es
  `grid-cols-11`, que no existe en la app).
- **Las fuentes de marca no están en el CSS**, vienen de un `<link>` a Google
  Fonts en `apps/web/index.html`. `build-css.mjs` antepone el `@import` remoto
  al CSS compilado; eso produce `[FONT_REMOTE]`, que es informativo.
- **`typescript` en `.ds-sync` debe ser 5.x.** `npm i typescript` instala la 7
  (el port nativo), cuya API no expone `createSourceFile` igual, y el chequeo de
  parseo de `.d.ts` de `package-validate.mjs` lo traga en silencio
  (`.d.ts parse check skipped`). Con `typescript@5.9.3` pasa.
- **El driver corre `package-validate.mjs` sin `--no-render-check`.** Sin
  Playwright eso hace fallar la etapa `validate` con exit 1. Hay que pasarle el
  flag al driver, que lo propaga.
- **Mobile no puede ir como componentes.** `apps/mobile` es Expo / React Native
  con NativeWind: no compila a un bundle de navegador. Va como documentación en
  `guidelines/03-mobile-nativo.md` (tokens compartidos, equivalencias web para
  maquetar móvil, reglas propias de RN).
- Ruido ajeno al sync: `packages/core/locales/es/translation.json` tiene claves
  duplicadas y esbuild avisa de ellas en cada build. Es un problema previo del
  repo (una de las dos claves gana en silencio), no lo causa esta herramienta.

## Segunda pasada (2026-07-30, con Playwright ya instalado)

Se instaló `playwright@1.59.1` + chromium en `.ds-sync`, así que **el driver ya
corre sin `--no-render-check`** y la verificación es real. Lo que salió:

- **25 componentes salían `bad`**: contenedores y disparadores que renderizan una
  caja vacía (`CardHeader`, `PopoverTrigger`, las piezas de `Sidebar`…). No eran
  tarjetas mínimas honestas, eran cajas vacías. Se autoraron previews que los
  muestran **dentro de la composición de su familia** — que es su único render
  verdadero. Ahora hay 37 previews y `bad` está vacío.
- Las piezas de `Sidebar` necesitan `SidebarProvider` **y** `collapsible="none"`
  (si no, `Sidebar` se posiciona `fixed` y no se ve), más `min-h-0` en el
  provider para que su `min-h-svh` no estire la tarjeta.
- **`GRID_OVERFLOW`** en `Alert` y `Tabs` → resuelto con `cardMode: "column"`.

### Dos errores de marca que solo se ven midiendo

- **Bold sintético en Bebas.** `CardTitle` lleva `font-semibold`; Bebas tiene un
  solo peso, así que el navegador lo emborronaba. A ojo en una captura **no se
  distingue** — se detectó leyendo `getComputedStyle().fontWeight` en el
  navegador. Arreglado añadiendo `font-normal` a todo uso de `font-bebas`, y es
  ahora la regla 4 de `conventions.md`.
- **Los valores arbitrarios de Tailwind no existen en este CSS.** El CSS va
  pregenerado, así que `grid-cols-[1fr_auto]`, `text-[150px]`, `w-[1080px]` y
  `leading-[0.92]` no se emiten y **no hacen nada, sin avisar**. Solo sobreviven
  los que la app ya usa (`text-[9px]`, `text-[10px]`, `text-[11px]`). La regla
  está en `conventions.md`: escala nombrada, o `style` inline para números
  puntuales. Comprobar con:
  `grep -F ".clase-escapada" ds-bundle/_ds_bundle.css`.

### Hallazgos en el repo (no tocados, para que decidas)

- **`CardAction` es un `div` sin estilos** (`cn("")` en `card.tsx`): no alinea ni
  posiciona nada. Solo se usa como passthrough en `ai-elements/`. O se termina
  (posicionarlo arriba a la derecha) o induce a error. El doc del componente ya
  explica cómo maquetar la cabecera a mano.
- **`type="number"` con decimales en español**: `defaultValue="78,2"` deja el
  campo **vacío** porque solo se admite el punto. La app usa `type="number"` para
  peso en `WeightTracker` y `OneRepMaxCalculator` (`step="0.5"`) — conviene
  probarlo escribiendo «78,2». Recomendación en el doc de `Input`: `inputMode="decimal"`
  sin `type="number"`.
- Tres limas distintos conviven (token claro/oscuro, el horneado en el logo y el
  de la app nativa). Tabla en `guidelines/04-social-y-fliers.md`.

### Activos de marca

`gen-brand-assets.mjs` emite `--brand-mark`, `--brand-grid` y `--brand-glow`
desde `assets/brand-mark.png` (el logo recortado, a 512px y cuantizado a 16
colores: 303 KB → 16 KB). **`cfg.tokensGlob` no sirve para esto**: solo se
consulta si hay `cfg.tokensPkg` y resuelve dentro de ese paquete
(`lib/css.mjs`). Se anexan al `cssEntry` desde `build-css.mjs`, que es lo que
los mete en `_ds_bundle.css` — el único CSS que alcanza a los diseños
renderizados.

Probado de extremo a extremo: se montó un flier de 1080×1080 cargando solo
`styles.css` + el bundle, y salió correcto (Bebas 150px peso 400, marca
cargada, fondo `rgb(10,10,10)`, cero errores de página). El PNG quedó en
`flier-1080.png` (sin commitear).

## Avisos conocidos (esperados — un aviso que no esté aquí es nuevo)

- `[TOKENS_MISSING]` con 6 variables: `--radix-accordion-content-height` y
  `--tw` las inyecta el runtime; `--spread`, `--color-background`,
  `--shiki-dark` y `--shiki-dark-bg` vienen de `streamdown`/`shiki`, no de los
  primitivos. Nada que arreglar.
- `[FONT_REMOTE]` con "DM Sans" y "Bebas Neue" — correcto, se sirven desde
  Google Fonts.
- `[RENDER_SKIPPED]` — mientras no haya Playwright.

## Riesgos de cara al próximo sync

- **Las 37 previews pasan el render check pero NO están calificadas una a una.**
  `bad` está vacío y se revisaron las hojas de contacto 1, 2 y 7 más las fichas
  de `Card`, `Dialog` y `Sheet`; el resto se dio por bueno desde las hojas de
  contacto. No hay `.design-sync/.cache/review/<Name>.grade.json` escritos, así
  que el próximo `resync` los pedirá en `verification.pendingGrade`. Calificarlos
  desde `ds-bundle/_screenshots/review/*.png` es la tarea pendiente natural.
- **El catálogo se renderiza en modo claro**, aunque la marca es oscuro-primero.
  Es cosa del contenedor de las tarjetas, no de los componentes. Si se quiere el
  catálogo en oscuro habría que envolver cada preview en `<div className="dark">`
  (37 archivos) — decisión pendiente.
- `CarouselNext`/`CarouselPrevious`: las diapositivas se apilan en vertical
  porque embla necesita JS para maquetar. Se ve el contenido, no el carrusel.
- **`guidelines/02-tokens.md` lleva los valores HSL copiados a mano** de
  `apps/web/src/index.css`. Si esos tokens cambian, el doc miente sin que nada
  lo detecte. Revísalo cuando toques el bloque `:root`/`.dark`.
- **La tabla `FAMILIES` de `gen-docs.mjs` es manual.** Si añades o quitas un
  export en `src/components/ui/`, el script imprime `✗ SIN DOC` y ese componente
  caería en el grupo `general`. Actualiza la tabla y regenera.
- **`cfg.dtsPropsFor` está escrito a mano contra la API de Radix de hoy.** Un
  salto de versión mayor de Radix podría cambiar props sin que ningún chequeo lo
  note: el contrato seguiría pareciendo válido y sería falso.
- **`TW_VERSION` en `build-css.mjs` debe seguir a
  `apps/web` → `devDependencies.tailwindcss`** (hoy 4.3.2). Si se desincroniza,
  el CSS del design system se compila con otra versión que la app.
- **La cobertura del CSS es «lo que la app usa» + el safelist.** Una clase fuera
  de ambos conjuntos renderiza sin estilo en los diseños. Si el agente pide algo
  que falta, añádelo a `gen-safelist.mjs`.
- `build-css.mjs` usa `pnpm dlx @tailwindcss/cli`, así que **el build de CSS
  necesita red** la primera vez en cada máquina.
