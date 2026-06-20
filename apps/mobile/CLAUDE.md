# CLAUDE.md — Native app (`apps/mobile`)

Guía para agentes que trabajan en la app nativa (Expo). El `README.md` de esta
carpeta es la plantilla por defecto de `create-expo-app` e **ignóralo**: este
archivo es la fuente de verdad. Comentarios y textos de UI van en **español**
(ver "Convenciones").

## Visión general

App Expo del monorepo (pnpm workspaces). Stack:

- **Expo SDK 56**, **React Native 0.85**, **React 19**.
- **expo-router** — rutas basadas en archivos en `src/app/`.
- **NativeWind v4** — estilos con `className` (Tailwind). No uses `StyleSheet`
  salvo en archivos que ya lo usen.
- **TanStack Query v5** — caché/estado de servidor.
- **PocketBase** — backend (SDK `pb`, singleton en core).
- **`@calistenia/core`** (`workspace:*`) — lógica de negocio compartida entre
  web y mobile: types, hooks, lib, data, locales. **Sin dependencias de DOM ni
  React Native**; lo específico de plataforma se inyecta vía `initCore()`.
  **Regla**: si añades lógica reutilizable (cálculos, hooks de datos, helpers),
  ponla en `packages/core`, no la dupliques aquí.

Bottom sheets nativos: usa un `<Modal animationType="slide">` nativo
(ver `src/components/social/CommentsSheet.tsx`), **no** gorhom — en Xiaomi/MIUI
edge-to-edge los insets del sheet JS de gorhom colapsan a 0 y chocan con la
barra de navegación de Android; la ventana del Modal nativo queda por encima.

## Mapa de directorios (`apps/mobile/src/`)

- `app/` — rutas de expo-router (file-based). Grupo `(tabs)/`
  (`index`, `history`, `library`, `nutrition`, `profile`, `programs`) y rutas
  apiladas (`cardio`, `session`, `social`, `friends`, `race`, `reminders`, …).
  `app/_layout.tsx` es la raíz.
- `components/` — componentes UI. Subcarpetas: `ui/` (primitivos), `cardio/`,
  `home/`, `nutrition/`, `session/`, `social/`, `race/`, `share/`,
  `onboarding/`, `free-session/`, `ai-elements/`.
- `contexts/` — hubs de estado (ver "Módulos críticos").
- `lib/` — "platform glue": adaptadores entre RN/Expo y core (storage, sonidos,
  haptics, i18n, notifications, GPS tracker, push, Sentry/analytics init…).
- `widgets/` — widgets de pantalla de inicio Android (`TodayWidget`,
  `CardioWidget`, `NutritionWidget`, `NutritionRingWidget`).

`src/lib/init-core.ts` llama a `initCore()` y **debe ser el primer import de
`app/_layout.tsx`**: los módulos de core leen el adapter de plataforma al
evaluarse.

## Comandos (ejecutar desde `apps/mobile/`)

| Propósito | Comando | Esperado |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 (`tsc --noEmit`) |
| Tests | `npm run test` | `vitest run`, todos pasan |
| Lint | `npm run lint` | `expo lint`, exit 0 |
| Arrancar | `npm run start` | Metro arranca |
| Run Android/iOS | `npm run android` / `npm run ios` | build nativo |

Instalar deps: `pnpm install` desde la raíz del repo.

## Módulos críticos y peligros conocidos

- `components/SessionView.tsx` — timer + UI de la sesión + audio/haptics +
  compartir. La lógica pura de pasos/fases vive en `lib/session-machine.ts`
  (testeada); `RestScreen`/`ExerciseTimer` en `components/session/`. Cambios
  aquí son delicados; toca lo mínimo.
- `contexts/ActiveSessionContext.tsx` — hub de la sesión de fuerza.
  **SessionView es dueño del estado local (`stepIdx`/`phase`) y lo empuja al
  context; el context nunca se lee de vuelta durante la sesión, solo para
  restaurar tras navegar fuera.** No inviertas ese flujo.
- `contexts/WorkoutContext.tsx` — programa activo, progreso, settings, fases,
  días de la semana (port 1:1 del de web).
- `contexts/CardioSessionContext.tsx` — GPS en segundo plano
  (expo-location + Foreground Service en Android) + notificación en vivo. El
  procesamiento de fixes GPS es pipeline puro en `packages/core/lib/cardio-fix.ts`.
- `contexts/RaceContext.tsx` — carreras multijugador en tiempo real (PB realtime,
  countdown, push periódico).
- **Re-renders**: los contexts de alta frecuencia re-renderizan a TODOS sus
  consumidores en cada tick (cardio ~1s, race ~500ms). No metas componentes
  caros como consumidores directos; memoiza y aísla.

## Testing

- `npm run test` ejecuta **vitest en el entorno node por defecto**. NO hay
  config de vitest, NO hay `@testing-library/react-native`, NO hay jest-expo.
- **No se pueden renderizar componentes ni contexts de React** en los tests.
- La única estrategia válida es **extraer funciones puras y testearlas**.
  Ejemplares: `src/lib/__tests__/session-machine.test.ts` y
  `live-activity-state.test.ts` importan funciones puras y asercian sobre su
  retorno.
- Tests de core viven en `packages/core/lib/*.test.ts`. Core **no tiene script
  de test propio**; se ejecutan con el binario de vitest del workspace mobile
  (p. ej. desde `packages/core/`:
  `../../apps/mobile/node_modules/.bin/vitest run`).

## Convenciones

- **Idioma**: comentarios y textos en **español**. Los textos de UI usan claves
  i18n (`react-i18next`, `t('...')`), no strings literales.
- **Commits**: Conventional Commits con scope —
  `feat(mobile): …`, `fix(cardio): …`, `refactor(mobile): …`,
  `docs(mobile): …`.
- **Estilos**: NativeWind `className`. No introduzcas `StyleSheet` salvo en
  archivos que ya lo usen.
- **Fuentes (design system)**: en RN cada peso es una familia aparte. **No
  combines `font-bold`/`font-semibold` con las fuentes personalizadas**
  (Bebas / DM Sans / JetBrains Mono): Android haría "synthetic bold" sobre la
  regular. Usa las clases de familia de `tailwind.config.js`
  (`font-sans-bold`, `font-mono-bold`, etc.) y `src/lib/fonts.ts`.

## Design Context

### Users
People training calisthenics, using the app **on a phone, often mid-workout** —
one-handed, glanceable, sometimes in a gym with poor light. Plus Guillermo, the
solo dev, who uses it daily. Primary jobs: see today's workout, start training,
log/track, check social. Speed and legibility beat decoration.

### Brand Personality
Athletic · utilitarian · disciplined. The voice of a **training log / piece of
gym equipment**, not a lifestyle app. Confident, terse, no fluff. Spanish-first
copy (i18n es/en in `packages/core/locales`).

### Aesthetic Direction
**Brutalist-athletic, dark-first "spec sheet".** Type does the work:
- **Bebas Neue** (`font-bebas`) — big condensed caps for titles/numbers.
- **JetBrains Mono** (`font-mono`) — small UPPERCASE kickers/labels with wide
  letter-spacing (`tracking-[2px|3px]`), `text-[9px]–[11px]`.
- **DM Sans** (`font-sans` / `font-sans-medium`) — body. **Never** `font-bold`
  with the custom fonts (use the dedicated `-medium`/`-bold` family classes).
- **Lime** is the single accent + interaction color (`--lime`; press states use
  `active:bg-lime/10`, active borders `border-lime/40`). Near-black surfaces
  (`bg-background` 3.9%, `bg-card` 7% in dark). Thin 1px `border-border` hairlines
  structure the UI (matrices/dividers), not drop-shadowed cards.
- Header idiom across screens: mono kicker + Bebas title (e.g. Home date+greeting,
  Profile "CUENTA"/"PERFIL", the QuickMenu "ACCESO RÁPIDO"/"MENÚ").

**Anti-references (do NOT do):** glassmorphism/blur, gradients (esp. gradient
text), rounded cards with generic drop shadows, nested cards, AI cyan/purple
neon, rainbow per-item icon colors (group color by meaning instead — e.g. the
QuickMenu uses 3 section hues: lime=training, sky=social, neutral=utility),
bounce/elastic easing. Light mode exists but is secondary — note `card` (100%)
and `background` (97%) are nearly identical, so don't rely on bg contrast alone;
use hairlines + accent.

### Design Principles
1. **Type and hairlines over containers.** Structure with Bebas/mono hierarchy
   and 1px borders; don't box everything in shadowed cards.
2. **Lime means "interact."** Reserve lime for accents and press/active states;
   give sections identity with at most one hue each.
3. **Thumb-first & glanceable.** Big targets, compact information density,
   reachable controls; the most-used path is the fastest.
4. **Motion is fast and functional.** Native slide for sheets, smooth ease-out
   (no bounce), honor `useReducedMotion`. One purposeful motion beats many.
5. **Robust on Android/MIUI.** Native Modal for overlays; always keep a
   non-gesture escape (backdrop / ✕ / hardware back) so nothing can trap the user.

## Env / config — cuidado

(Referencia por NOMBRE; nunca pegues valores.)

- `EXPO_PUBLIC_PB_URL` → URL del backend PocketBase
  (`src/lib/init-core.ts`). En `__DEV__` cae al host de Metro; en prod a la URL
  de producción.
- `EXPO_PUBLIC_AI_API_URL` → host de la API de IA (mismo archivo).
- `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` → client id de analytics (público, no es un
  secreto; aun así no lo reproduzcas en docs/PRs).
- **Trampa de release**: un `apps/mobile/.env.local` con una URL de PB en LAN
  tiene **precedencia sobre `.env` en tiempo de compilación** (las
  `EXPO_PUBLIC_*` se inlinean al compilar). Un build de release apuntado a
  producción con ese `.env.local` presente queda apuntando a la LAN y el
  dispositivo no llega al backend (programas vacíos). Para builds de prod,
  compila con la URL de producción (o sin `.env.local`).
- **Trampa de instalación Android**: `app.json` lleva `version` y `versionCode`
  propios (distintos de `package.json`). Si el `versionCode` no se sube por
  encima del build ya instalado, Android instala silenciosamente el código
  viejo. Bump `versionCode` al probar un build nuevo en el mismo dispositivo.
