// Genera ds-safelist.txt: el vocabulario Tailwind que el agente de diseño puede
// usar al construir páginas nuevas con este design system.
//
// Por qué existe: Tailwind v4 purga contra el código de la app, así que el CSS
// compilado solo contiene las clases que apps/web ya usa hoy. Un diseño nuevo
// que use `grid-cols-7` o `text-7xl` saldría sin estilo. Este archivo se pasa a
// Tailwind como fuente extra para que esas utilidades existan en el bundle.
import { writeFileSync } from 'node:fs'

const out = []
const add = (...cls) => out.push(...cls.flat())

/* ── Colores semánticos ───────────────────────────────────────────────────── */
const COLORS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'lime', 'lime-foreground',
  'border', 'input', 'ring',
  'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-accent', 'sidebar-border',
]
// Sin variantes `dark:`: los tokens semánticos ya voltean solos bajo `.dark`
// (ver el bloque .dark de apps/web/src/index.css), así que duplicarlos solo
// engorda el bundle que se carga en cada diseño renderizado.
const ALPHA = ['', '/10', '/20', '/30', '/50', '/80', '/90']
for (const c of COLORS) {
  for (const a of ALPHA) {
    add(`bg-${c}${a}`, `text-${c}${a}`, `border-${c}${a}`, `ring-${c}${a}`)
    add(`hover:bg-${c}${a}`, `hover:text-${c}${a}`, `hover:border-${c}${a}`)
  }
  add(`fill-${c}`, `stroke-${c}`, `focus-visible:ring-${c}`, `data-[state=active]:bg-${c}`, `data-[state=active]:text-${c}`)
}
// Paleta de scores (SCORE_COLORS en packages/core/lib/style-tokens.ts) y grises crudos
for (const hue of ['green', 'lime', 'yellow', 'orange', 'red', 'zinc', 'emerald', 'sky', 'violet', 'amber']) {
  for (const step of [100, 300, 400, 500, 600, 700, 900]) {
    for (const a of ['', '/10', '/20', '/30']) {
      add(`bg-${hue}-${step}${a}`, `text-${hue}-${step}${a}`, `border-${hue}-${step}${a}`)
    }
  }
}
add('bg-white', 'bg-black', 'text-white', 'text-black', 'bg-transparent', 'border-transparent', 'text-transparent')

/* ── Espaciado ────────────────────────────────────────────────────────────── */
const SPACE = ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '40', '48', '56', '64', '72', '80', '96']
for (const s of SPACE) {
  for (const p of ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap', 'gap-x', 'gap-y', 'space-x', 'space-y']) {
    add(`${p}-${s}`)
  }
  add(`w-${s}`, `h-${s}`, `size-${s}`, `min-w-${s}`, `min-h-${s}`, `max-w-${s}`, `max-h-${s}`)
  add(`top-${s}`, `right-${s}`, `bottom-${s}`, `left-${s}`, `inset-${s}`, `inset-x-${s}`, `inset-y-${s}`)
  add(`sm:p-${s}`, `md:p-${s}`, `lg:p-${s}`, `sm:gap-${s}`, `md:gap-${s}`, `lg:gap-${s}`)
}
add('mx-auto', 'my-auto', 'm-auto', 'ml-auto', 'mr-auto', 'w-auto', 'h-auto')
add('w-full', 'h-full', 'w-screen', 'h-screen', 'min-h-screen', 'min-w-full', 'max-w-full', 'max-h-full')
add('w-fit', 'h-fit', 'w-min', 'w-max', 'h-min', 'h-max', 'min-h-0', 'flex-1', 'flex-auto', 'flex-none')
for (const m of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', 'prose', 'screen-sm', 'screen-md', 'screen-lg', 'screen-xl']) add(`max-w-${m}`)

/* ── Tipografía ───────────────────────────────────────────────────────────── */
for (const s of ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']) {
  add(`text-${s}`, `sm:text-${s}`, `md:text-${s}`, `lg:text-${s}`)
}
add('font-bebas', 'font-sans', 'font-mono')
for (const w of ['thin', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']) add(`font-${w}`)
for (const t of ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']) add(`tracking-${t}`)
for (const l of ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose', '3', '4', '5', '6', '7', '8', '9', '10']) add(`leading-${l}`)
add('uppercase', 'lowercase', 'capitalize', 'normal-case', 'italic', 'not-italic')
add('text-left', 'text-center', 'text-right', 'text-justify', 'text-balance', 'text-pretty', 'text-nowrap', 'whitespace-nowrap', 'whitespace-pre-line')
add('underline', 'no-underline', 'line-through', 'underline-offset-2', 'underline-offset-4', 'tabular-nums', 'truncate', 'break-words', 'break-all')
for (const n of [1, 2, 3, 4, 5, 6]) add(`line-clamp-${n}`)
add('antialiased', 'align-middle', 'align-top', 'align-baseline')

/* ── Layout ───────────────────────────────────────────────────────────────── */
add('flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline', 'hidden', 'contents', 'table')
add('sm:flex', 'md:flex', 'lg:flex', 'sm:hidden', 'md:hidden', 'lg:hidden', 'sm:block', 'md:block', 'lg:block', 'md:inline')
add('flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse', 'flex-wrap', 'flex-nowrap', 'shrink', 'shrink-0', 'grow', 'grow-0')
add('sm:flex-row', 'md:flex-row', 'lg:flex-row', 'sm:flex-col', 'md:flex-col')
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  add(`grid-cols-${n}`, `grid-rows-${n}`, `col-span-${n}`, `row-span-${n}`, `col-start-${n}`, `row-start-${n}`)
  add(`sm:grid-cols-${n}`, `md:grid-cols-${n}`, `lg:grid-cols-${n}`, `xl:grid-cols-${n}`)
}
add('grid-cols-none', 'col-span-full', 'row-span-full', 'grid-flow-col', 'grid-flow-row', 'auto-cols-fr', 'auto-rows-fr')
for (const a of ['start', 'end', 'center', 'baseline', 'stretch']) add(`items-${a}`, `self-${a}`, `content-${a}`)
for (const j of ['start', 'end', 'center', 'between', 'around', 'evenly', 'stretch']) add(`justify-${j}`, `justify-items-${j}`, `justify-self-${j}`)
add('place-items-center', 'place-content-center', 'place-self-center')
add('static', 'relative', 'absolute', 'fixed', 'sticky', 'inset-0', 'top-0', 'right-0', 'bottom-0', 'left-0', 'inset-auto')
for (const z of [0, 10, 20, 30, 40, 50]) add(`z-${z}`)
add('overflow-hidden', 'overflow-auto', 'overflow-x-auto', 'overflow-y-auto', 'overflow-visible', 'overflow-clip', 'overflow-x-hidden', 'overflow-y-hidden', 'scrollbar-none')
add('isolate', 'pointer-events-none', 'pointer-events-auto', 'select-none', 'cursor-pointer', 'cursor-default', 'cursor-not-allowed')

/* ── Bordes, sombras, formas ──────────────────────────────────────────────── */
for (const r of ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']) {
  add(`rounded-${r}`, `rounded-t-${r}`, `rounded-b-${r}`, `rounded-l-${r}`, `rounded-r-${r}`, `rounded-tl-${r}`, `rounded-tr-${r}`, `rounded-bl-${r}`, `rounded-br-${r}`)
}
add('rounded')
for (const w of ['', '-0', '-2', '-4', '-8']) add(`border${w}`, `border-t${w}`, `border-r${w}`, `border-b${w}`, `border-l${w}`, `border-x${w}`, `border-y${w}`)
add('border-solid', 'border-dashed', 'border-dotted', 'divide-y', 'divide-x')
for (const s of ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', 'inner']) add(s ? `shadow-${s}` : 'shadow')
for (const r of ['0', '1', '2', '4', '8', 'inset']) add(`ring-${r}`)
add('ring-offset-2', 'ring-offset-background', 'outline-none', 'focus-visible:outline-none')
for (const o of [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100]) add(`opacity-${o}`, `hover:opacity-${o}`)
add('aspect-square', 'aspect-video', 'aspect-auto', 'object-cover', 'object-contain', 'object-center')
add('backdrop-blur', 'backdrop-blur-sm', 'backdrop-blur-md', 'backdrop-blur-lg', 'blur-sm', 'blur')
add('bg-gradient-to-r', 'bg-gradient-to-b', 'bg-gradient-to-br', 'bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-cover', 'bg-center', 'bg-no-repeat')

/* ── Movimiento ───────────────────────────────────────────────────────────── */
// Keyframes propias del sistema (apps/web/tailwind.config.js)
add('animate-fade-in', 'animate-scale-in', 'animate-slide-up', 'animate-slide-down', 'animate-slide-in-right')
add('animate-gentle-float', 'animate-dot-pulse', 'animate-workday-pulse', 'animate-accordion-down', 'animate-accordion-up')
add('animate-spin', 'animate-pulse', 'animate-bounce', 'animate-none')
add('transition', 'transition-all', 'transition-colors', 'transition-opacity', 'transition-transform', 'transition-none')
for (const d of [75, 100, 150, 200, 300, 500, 700, 1000]) add(`duration-${d}`, `delay-${d}`)
add('ease-in', 'ease-out', 'ease-in-out', 'ease-linear')
for (const s of ['95', '100', '105', '110', '0']) add(`scale-${s}`, `hover:scale-${s}`, `active:scale-${s}`)
add('rotate-45', 'rotate-90', 'rotate-180', '-rotate-90', 'translate-y-0', '-translate-y-1', 'hover:-translate-y-1', 'translate-x-0')

/* ── Estados ──────────────────────────────────────────────────────────────── */
add('disabled:opacity-50', 'disabled:pointer-events-none', 'disabled:cursor-not-allowed')
add('group', 'group-hover:opacity-100', 'group-hover:translate-x-1', 'peer')
add('sr-only', 'not-sr-only')

const unique = [...new Set(out)].sort()
writeFileSync(new URL('./ds-safelist.txt', import.meta.url), unique.join('\n') + '\n')
console.log(`ds-safelist.txt: ${unique.length} clases`)
