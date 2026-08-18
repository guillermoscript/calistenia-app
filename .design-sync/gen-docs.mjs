// Genera .design-sync/docs/<Name>.md — un doc por componente.
//
// Dos trabajos:
//  1. El frontmatter `category` fija el grupo del componente en el panel de
//     Design System. Sin esto los 129 caen en un grupo plano `general`: los 31
//     archivos viven todos en src/components/ui/, y el conversor deriva el grupo
//     del último segmento de ruta no genérico — y `ui` es genérico.
//  2. El cuerpo es el .prompt.md que lee el agente de diseño. El conversor le
//     añade la tabla de props sintetizada automáticamente cuando el doc no trae
//     su propia sección `## Props` (lib/emit.mjs), así que aquí solo va lo que
//     no se deduce del tipo: para qué sirve, cómo se compone, y las
//     convenciones de marca.
//
// Regenerar tras añadir o quitar exports en apps/web/src/components/ui/.
import { mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, 'docs')
const BUNDLE = join(HERE, '..', 'ds-bundle', 'components')

/* ── Familias ──────────────────────────────────────────────────────────────
   root:    componente principal (da nombre a la familia)
   group:   grupo en el panel de Design System
   blurb:   qué es y cuándo usarlo
   example: composición canónica, con contenido real de calistenia
   members: sub-componentes → su papel en una línea                          */
const FAMILIES = [
  /* ── Acciones ─────────────────────────────────────────────────────────── */
  {
    root: 'Button', group: 'Actions',
    blurb: 'Acción primaria del sistema. `variant="default"` es casi-negro sobre claro (y casi-blanco en oscuro), y es el botón por defecto de casi toda la interfaz; `outline` para acciones secundarias y `ghost` para barras densas. El lima tiene dos variantes y ninguna es el botón por defecto: `limeSolid` es el CTA de la acción principal de una pantalla —empezar la sesión, guardar el plan, unirse a la carrera— y `lime` (filete + tinte) es su versión secundaria, la misma que marca lo activo o interactuado. Las dos usan los tokens `--lime`/`--lime-foreground`, nunca una escala de Tailwind ni `hsl(var(--lime))` a pelo: solo el token se adapta al modo claro. Para lo destructivo, `destructive` es el botón sólido y `danger` su filete rojo, para acciones como bloquear o abandonar que no deben pesar como el CTA.',
    example: `<Button>Empezar sesión</Button>
<Button variant="limeSolid">Empezar entreno</Button>
<Button variant="lime">Ver el plan</Button>
<Button variant="outline">Ver programa</Button>
<Button variant="ghost" size="icon-sm"><Plus /></Button>
<Button variant="destructive">Abandonar sesión</Button>
<Button variant="danger">Bloquear usuario</Button>`,
  },
  {
    root: 'ButtonGroup', group: 'Actions',
    blurb: 'Agrupa acciones relacionadas en un bloque con bordes compartidos. Útil para selectores de unidad (kg/lb) o de rango temporal en las vistas de progreso.',
    example: `<ButtonGroup>
  <ButtonGroupItem>Semana</ButtonGroupItem>
  <ButtonGroupItem data-active>Mes</ButtonGroupItem>
  <ButtonGroupItem>Año</ButtonGroupItem>
</ButtonGroup>`,
    members: {
      ButtonGroupItem: 'Un botón dentro del grupo. Hereda los bordes compartidos.',
      ButtonGroupText: 'Texto no interactivo dentro del grupo (sufijos tipo «kg», «reps»).',
    },
  },

  /* ── Formularios ──────────────────────────────────────────────────────── */
  {
    root: 'Input', group: 'Forms',
    blurb: 'Campo de texto de una línea. Empareja siempre con `Label` vía `htmlFor`/`id`. Para entradas numéricas de series y repeticiones usa `inputMode="numeric"`: el teclado móvil importa, la app se usa a mitad de entrenamiento.\n\nCuidado con los decimales en español: `type="number"` solo admite el punto como separador, así que un valor como `78,2` se descarta y el campo aparece **vacío**. Para pesos y medidas usa `inputMode="decimal"` **sin** `type="number"`, y así la coma se muestra tal cual.',
    example: `<div className="grid gap-2">
  <Label htmlFor="reps">Repeticiones</Label>
  <Input id="reps" type="number" inputMode="numeric" placeholder="12" />
</div>`,
  },
  {
    root: 'Textarea', group: 'Forms',
    blurb: 'Texto multilínea: notas de sesión, descripción de un programa, comentarios en el feed.',
    example: `<div className="grid gap-2">
  <Label htmlFor="notas">Notas de la sesión</Label>
  <Textarea id="notas" rows={4} placeholder="Cómo te has sentido, dolores, sensaciones…" />
</div>`,
  },
  {
    root: 'Label', group: 'Forms',
    blurb: 'Etiqueta de campo. Necesita `htmlFor` apuntando al `id` del control — sin eso no hay accesibilidad ni área de clic ampliada.',
    example: `<Label htmlFor="peso">Peso corporal (kg)</Label>
<Input id="peso" type="number" inputMode="decimal" />`,
  },

  /* ── Superficies ──────────────────────────────────────────────────────── */
  {
    root: 'Card', group: 'Surfaces',
    blurb: 'La superficie base del sistema: una unidad de contenido sobre el fondo. En esta app estructura casi todo — resumen de sesión, tarjeta de ejercicio, bloque de estadística. Composición habitual: `CardHeader` (con `CardTitle` y opcionalmente `CardDescription`) + `CardContent`; `CardFooter` solo cuando hay acciones.',
    example: `<Card>
  <CardHeader>
    <CardTitle>Dominadas</CardTitle>
    <CardDescription>4 series · 8 repeticiones</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">Último registro: 4×7 hace 3 días</p>
  </CardContent>
  <CardFooter>
    <Button size="sm">Registrar serie</Button>
  </CardFooter>
</Card>`,
    members: {
      CardHeader: 'Zona superior. Apila en columna (`flex flex-col`). Contiene `CardTitle` y, si hace falta, `CardDescription`.',
      CardTitle: 'Título de la tarjeta. Trae `font-semibold` de base, así que para títulos de impacto usa `className="font-bebas font-normal text-2xl tracking-wide"` — **`font-normal` es obligatorio**: Bebas tiene un solo peso y sin él el navegador le aplica bold sintético.',
      CardDescription: 'Subtítulo en tono atenuado, bajo el título.',
      CardAction: 'Envoltorio sin estilos propios (es un `div` pelado). **No alinea ni posiciona nada por sí mismo.** Para poner una acción arriba a la derecha, maqueta tú la cabecera: `<CardHeader className="flex-row items-start justify-between gap-2 space-y-0">` y mete la acción como segundo hijo. Nada de `grid-cols-[1fr_auto]`: los valores arbitrarios no existen en este CSS.',
      CardContent: 'Cuerpo de la tarjeta.',
      CardFooter: 'Zona inferior para acciones. Omítela si no hay ninguna.',
    },
  },
  {
    root: 'Separator', group: 'Surfaces',
    blurb: 'Línea divisoria de 1px en color `border`. Usa `orientation="vertical"` dentro de filas flex (necesita altura definida en el contenedor).',
    example: `<div className="flex items-center gap-3 text-sm">
  <span>12 sesiones</span>
  <Separator orientation="vertical" className="h-4" />
  <span>racha de 5 días</span>
</div>`,
  },
  {
    root: 'Skeleton', group: 'Surfaces',
    blurb: 'Marcador de carga. Debe imitar la forma del contenido que sustituye — mismo alto y ancho aproximado, no un bloque genérico.',
    example: `<Card>
  <CardHeader className="gap-2">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="h-4 w-48" />
  </CardHeader>
  <CardContent className="space-y-2">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </CardContent>
</Card>`,
  },
  {
    root: 'ScrollArea', group: 'Surfaces',
    blurb: 'Contenedor con scroll y barra estilizada. Necesita una altura acotada (`className="h-64"` o similar) o no habrá scroll.',
    example: `<ScrollArea className="h-64 rounded-md border p-4">
  <div className="space-y-2">
    {ejercicios.map((e) => <div key={e.id} className="text-sm">{e.nombre}</div>)}
  </div>
</ScrollArea>`,
    members: { ScrollBar: 'La barra de scroll. `ScrollArea` ya la incluye; solo se usa suelta para una horizontal explícita.' },
  },

  /* ── Overlays ─────────────────────────────────────────────────────────── */
  {
    root: 'Dialog', group: 'Overlays',
    blurb: 'Modal centrado para una decisión o un formulario corto que interrumpe el flujo. En móvil prefiere `Sheet`. Para confirmar una acción destructiva usa `ConfirmDialog`, que ya trae el patrón montado.',
    example: `<Dialog>
  <DialogTrigger asChild><Button>Registrar peso</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Registrar peso</DialogTitle>
      <DialogDescription>Se guarda en tu histórico de composición corporal.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor="kg">Peso (kg)</Label>
      <Input id="kg" type="number" inputMode="decimal" />
    </div>
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
      <Button>Guardar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`,
    members: {
      DialogTrigger: 'Abre el diálogo. Usa `asChild` para que tu propio botón sea el disparador.',
      DialogContent: 'El panel del modal. Incluye ya el overlay y el botón de cerrar.',
      DialogHeader: 'Agrupa `DialogTitle` y `DialogDescription`.',
      DialogTitle: 'Título del modal. Obligatorio para accesibilidad.',
      DialogDescription: 'Texto de apoyo bajo el título.',
      DialogFooter: 'Zona de acciones, alineadas a la derecha.',
      DialogClose: 'Cierra el modal. Con `asChild` envuelve tu botón de cancelar.',
      DialogOverlay: 'El fondo oscurecido. `DialogContent` ya lo monta; rara vez se usa suelto.',
      DialogPortal: 'Portal al final del body. `DialogContent` ya lo monta.',
    },
  },
  {
    root: 'ConfirmDialog', group: 'Overlays',
    blurb: 'Confirmación de acción destructiva, ya montada: título, descripción, cancelar y confirmar. Úsala en vez de componer un `Dialog` a mano para borrar, abandonar sesión o descartar cambios.',
    example: `<ConfirmDialog
  open={abierto}
  onOpenChange={setAbierto}
  title="¿Abandonar la sesión?"
  description="Perderás las series que no hayas registrado."
  confirmText="Abandonar"
  onConfirm={abandonar}
/>`,
  },
  {
    root: 'Sheet', group: 'Overlays',
    blurb: 'Panel que entra desde un borde. Es el patrón de overlay preferido en móvil. `side="bottom"` para acciones y formularios cortos; `side="right"` para navegación o filtros en escritorio.',
    example: `<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filtros</Button></SheetTrigger>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>Filtrar ejercicios</SheetTitle>
      <SheetDescription>Por grupo muscular y equipamiento.</SheetDescription>
    </SheetHeader>
    <div className="grid gap-4 py-4">{/* controles */}</div>
    <SheetFooter>
      <Button>Aplicar</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>`,
    members: {
      SheetTrigger: 'Abre el panel. Usa `asChild` con tu propio botón.',
      SheetContent: 'El panel. `side` decide el borde: `top`, `right`, `bottom`, `left`.',
      SheetHeader: 'Agrupa `SheetTitle` y `SheetDescription`.',
      SheetTitle: 'Título del panel. Obligatorio para accesibilidad.',
      SheetDescription: 'Texto de apoyo bajo el título.',
      SheetFooter: 'Zona de acciones al pie del panel.',
      SheetClose: 'Cierra el panel. Con `asChild` envuelve tu botón.',
      SheetOverlay: 'El fondo oscurecido. `SheetContent` ya lo monta.',
      SheetPortal: 'Portal al final del body. `SheetContent` ya lo monta.',
    },
  },
  {
    root: 'Tooltip', group: 'Overlays',
    blurb: 'Etiqueta breve al pasar el cursor o enfocar. **Requiere `TooltipProvider` en un ancestro** — sin él no aparece. Solo texto: nunca metas controles dentro. No es accesible por toque en móvil, así que no pongas ahí información imprescindible.',
    example: `<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon-sm"><Info /></Button>
    </TooltipTrigger>
    <TooltipContent>Récord personal: 4×9</TooltipContent>
  </Tooltip>
</TooltipProvider>`,
    members: {
      TooltipProvider: 'Obligatorio en un ancestro (normalmente en la raíz de la app). Sin él los tooltips no se muestran.',
      TooltipTrigger: 'El elemento que dispara el tooltip. Usa `asChild`.',
      TooltipContent: 'La burbuja de texto.',
    },
  },

  /* ── Navegación ───────────────────────────────────────────────────────── */
  {
    root: 'Tabs', group: 'Navigation',
    blurb: 'Alterna entre vistas hermanas sin cambiar de página. Cada `TabsTrigger` empareja con un `TabsContent` por `value`. Usa `defaultValue` para la pestaña inicial.',
    example: `<Tabs defaultValue="hoy">
  <TabsList>
    <TabsTrigger value="hoy">Hoy</TabsTrigger>
    <TabsTrigger value="planificar">Planificar</TabsTrigger>
  </TabsList>
  <TabsContent value="hoy">Comidas y entrenos de hoy.</TabsContent>
  <TabsContent value="planificar">Plan de la semana.</TabsContent>
</Tabs>`,
    members: {
      TabsList: 'La fila de pestañas. Contiene los `TabsTrigger`.',
      TabsTrigger: 'Una pestaña. Su `value` debe coincidir con el del `TabsContent`.',
      TabsContent: 'El panel de una pestaña. Se muestra cuando su `value` está activo.',
    },
  },

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  {
    root: 'Sidebar', group: 'Sidebar',
    blurb: 'Navegación lateral de la app en escritorio, colapsable. **Requiere `SidebarProvider` envolviendo la página** y `SidebarInset` para el contenido principal. El indicador lima de 2px en el elemento activo lo pinta el CSS del sistema vía `data-active="true"` — no lo replique a mano.',
    example: `<SidebarProvider>
  <Sidebar>
    <SidebarHeader>Calistenia</SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Entrenar</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>Hoy</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>Programas</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>Perfil</SidebarFooter>
  </Sidebar>
  <SidebarInset>{/* contenido de la página */}</SidebarInset>
</SidebarProvider>`,
    members: {
      SidebarProvider: 'Obligatorio: envuelve toda la página y aporta el estado de colapso.',
      SidebarInset: 'El contenido principal junto a la barra. Hermano de `Sidebar` dentro del provider.',
      SidebarTrigger: 'Botón que colapsa y expande la barra.',
      SidebarRail: 'Franja fina pulsable en el borde para colapsar.',
      SidebarHeader: 'Zona superior fija de la barra (logo, selector de cuenta).',
      SidebarContent: 'Zona central con scroll que contiene los grupos.',
      SidebarFooter: 'Zona inferior fija (perfil, ajustes).',
      SidebarSeparator: 'Línea divisoria dentro de la barra.',
      SidebarGroup: 'Una sección de la navegación.',
      SidebarGroupLabel: 'Título de la sección. Se atenúa al colapsar.',
      SidebarGroupContent: 'Contenido de la sección; normalmente un `SidebarMenu`.',
      SidebarGroupAction: 'Acción en la cabecera de la sección (por ejemplo, «añadir»).',
      SidebarMenu: 'Lista de elementos de navegación.',
      SidebarMenuItem: 'Un elemento de la lista. Envuelve a `SidebarMenuButton`.',
      SidebarMenuButton: 'El enlace pulsable. `isActive` pinta el indicador lima.',
      SidebarMenuAction: 'Acción secundaria a la derecha de un elemento.',
      SidebarMenuBadge: 'Contador o etiqueta a la derecha de un elemento.',
      SidebarMenuSkeleton: 'Marcador de carga con la forma de un elemento de menú.',
      SidebarMenuSub: 'Lista anidada bajo un elemento.',
      SidebarMenuSubItem: 'Un elemento de la lista anidada.',
      SidebarMenuSubButton: 'El enlace pulsable de un elemento anidado.',
      SidebarInput: 'Campo de búsqueda con el estilo de la barra.',
    },
  },

  /* ── Feedback ─────────────────────────────────────────────────────────── */
  {
    root: 'Badge', group: 'Feedback',
    blurb: 'Etiqueta compacta de estado o categoría. Es donde el lima sí es correcto: marca completado o activo. `variant="secondary"` para categorías neutras, `destructive` para fallos.',
    example: `<Badge className="bg-lime text-lime-foreground">Completado</Badge>
<Badge variant="secondary">Tirón</Badge>
<Badge variant="outline">Intermedio</Badge>`,
  },
  {
    root: 'Alert', group: 'Feedback',
    blurb: 'Mensaje en línea sobre el estado de la página o de una acción. No lo uses para notificaciones transitorias — eso es un toast (`sonner`).',
    example: `<Alert>
  <AlertTitle>Sesión sin terminar</AlertTitle>
  <AlertDescription>
    Tienes una sesión de ayer a medias. Puedes reanudarla o descartarla.
  </AlertDescription>
</Alert>
<Alert variant="destructive">
  <AlertTitle>No se pudo sincronizar</AlertTitle>
  <AlertDescription>Revisa tu conexión; los datos siguen guardados en el dispositivo.</AlertDescription>
</Alert>`,
    members: {
      AlertTitle: 'Titular del aviso, en una línea.',
      AlertDescription: 'El detalle y, si procede, qué hacer al respecto.',
    },
  },
  {
    root: 'Progress', group: 'Feedback',
    blurb: 'Barra de progreso determinada, con `value` de 0 a 100. Para progreso indeterminado usa `Spinner`. Emparéjala siempre con una cifra en texto: la barra sola no dice cuánto falta.',
    example: `<div className="grid gap-2">
  <div className="flex justify-between text-sm">
    <span>Semana 3 de 8</span>
    <span className="text-muted-foreground">37%</span>
  </div>
  <Progress value={37} />
</div>`,
  },
  {
    root: 'Spinner', group: 'Feedback',
    blurb: 'Indicador de carga indeterminada, para esperas cortas dentro de un botón o una zona pequeña. Si la espera sustituye a contenido con forma conocida, usa `Skeleton`.',
    example: `<Button disabled>
  <Spinner />
  Guardando…
</Button>`,
  },
  {
    root: 'Loader', group: 'Feedback',
    blurb: 'Estado de carga a nivel de página o de bloque grande, con el spinner ya centrado. Para cargas dentro de un control usa `Spinner`.',
    example: `<div className="min-h-64 grid place-items-center">
  <Loader />
</div>`,
  },
]

/* ── Emisión ──────────────────────────────────────────────────────────────── */
const md = (name, group, body) => `---\ncategory: ${group}\n---\n\n${body}\n`

if (existsSync(DOCS)) rmSync(DOCS, { recursive: true })
mkdirSync(DOCS, { recursive: true })

const written = new Set()
for (const fam of FAMILIES) {
  const members = fam.members ?? {}
  const memberNames = Object.keys(members)

  // Doc del componente raíz: qué es, composición canónica, y el mapa de piezas.
  let body = fam.blurb
  body += `\n\n## Composición\n\n\`\`\`jsx\n${fam.example}\n\`\`\`\n`
  if (memberNames.length) {
    body += `\n## Piezas\n\n${memberNames.map((m) => `- \`${m}\` — ${members[m]}`).join('\n')}\n`
  }
  writeFileSync(join(DOCS, `${fam.root}.md`), md(fam.root, fam.group, body))
  written.add(fam.root)

  // Doc de cada sub-componente: su papel, y el ejemplo de la familia como
  // contexto (el agente casi nunca debe usarlos suelto).
  for (const m of memberNames) {
    const sub = `${members[m]}\n\nParte de la familia \`${fam.root}\`. Se usa dentro de \`<${fam.root}>\`, no por separado.\n\n## Composición\n\n\`\`\`jsx\n${fam.example}\n\`\`\`\n`
    writeFileSync(join(DOCS, `${m}.md`), md(m, fam.group, sub))
    written.add(m)
  }
}

// Validación: cada componente emitido por el conversor necesita su doc, o cae
// en el grupo `general` y rompe la agrupación del panel.
let emitted = []
if (existsSync(BUNDLE)) {
  for (const g of readdirSync(BUNDLE)) {
    for (const c of readdirSync(join(BUNDLE, g))) emitted.push(c)
  }
}
const missing = emitted.filter((n) => !written.has(n))
const extra = [...written].filter((n) => emitted.length && !emitted.includes(n))

console.log(`docs: ${written.size} escritos (${FAMILIES.length} familias)`)
if (emitted.length) console.log(`bundle: ${emitted.length} componentes`)
if (missing.length) console.log(`✗ SIN DOC (caerán en 'general'): ${missing.join(', ')}`)
if (extra.length) console.log(`⚠ doc sin componente: ${extra.join(', ')}`)
if (!missing.length && emitted.length) console.log('✓ cobertura completa')
