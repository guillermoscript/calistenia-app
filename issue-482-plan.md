## Plan de ataque

Levantamiento previo de los 10 ficheros implicados (~3.500 L en total), porque los porcentajes del issue no cuentan la misma historia una vez abiertos:

| Contexto | web | móvil | Comparte |
|---|---|---|---|
| `CircuitSessionContext` | 473 L | 472 L | ~92 % |
| `RaceContext` | 338 L | 335 L | ~89 % |
| `ActiveSessionContext` | 388 L | 337 L | ~80 % |
| `CardioSessionContext` | 415 L | 492 L | ~67 % |
| `WorkoutContext` | 127 L | 149 L | ya delega casi todo en hooks de core |

### Causa raíz

Los cinco contextos son ports 1:1 declarados (los propios cabeceros lo dicen: *"localStorage → syncStorage, visibilitychange → AppState"*). Lo único que impedía compartirlos de verdad era que **`CorePlatform` no tenía forma de expresar "la app volvió a primer plano"**. Con `storage` ya abstraído en ambos lados, el lifecycle era la última pieza que ataba cada contexto a su plataforma.

Un detalle que sale del levantamiento y conviene fijar: **el storage NO es el bloqueante que parecía**. `CoreStorage` es síncrono en ambas plataformas — el móvil ya presenta un `syncStorage` (caché en memoria hidratada al arrancar sobre `AsyncStorage`), así que no hay impedancia sync/async que resolver. Lo que sí falta es que **los contextos de web usan `localStorage` global directamente** en vez del facade `storage` de core; el móvil ya usa el facade. Ese es el edit real por contexto en web.

### Enfoque

**Fase A — `lifecycle` en `CorePlatform`** (hecha, commit `44bddee`)

`CoreLifecycle` (`isForeground` / `onForeground` / `onBackground`) siguiendo exactamente el patrón que ya tiene `CoreConnectivity`: interfaz en `platform.ts`, facade estable exportado, una implementación por app inyectada en `initCore()`. Web lo resuelve con `visibilitychange`; móvil con `AppState` en `src/lib/lifecycle.ts`.

El campo va **opcional a propósito**, igual que `env.client`: los tests de core llaman a `initCore()` con una plataforma mínima, y el facade degrada a "siempre en primer plano, nunca notifica" en vez de lanzar.

El adapter nativo filtra por **transición** (no-activo → activo), no por estado a secas: Android emite `'active'` repetido y, sin el filtro, un handler que revalida el token dispararía varias veces por cada vuelta a la app. `'inactive'` (el limbo de iOS: multitarea, llamada entrante) cuenta como "ya no estás en primer plano", para persistir antes de que el sistema pueda matar la app.

**Efecto colateral cerrado en la misma fase**: `useAuth.ts` vive en core pero escuchaba `document.visibilitychange` a pelo, guardado con `typeof document === 'undefined'`. En RN no hay `document` → la revalidación del token fantasma (#254) **nunca corría en el móvil**. Ahora va por `lifecycle.onForeground()` y funciona en las dos plataformas.

**Fase B — contextos a core, uno por uno, de mayor a menor solape**

El patrón que sigo es el que ya estableció el #475 con `session-machine` (PRs #538/#539) y que conviene no romper: **la lógica pura y el estado van a core; los efectos se quedan en la app**. En concreto, para cada contexto:

- `packages/core/hooks/session-contexts/use<X>State.ts` — un hook que posee estado, persistencia (vía `storage`), lifecycle (vía `lifecycle`) y sincronización remota, y devuelve el valor del contexto.
- Cada app conserva su `createContext` + `Provider` fino, que llama al hook e inyecta lo específico de plataforma (sonidos, hápticas, navegación, tracker GPS, tag de analytics).

**El `createContext` se queda en cada app a propósito**, no sube a core. Es el precedente del #475 y evita el riesgo de que dos copias de React en Metro produzcan un contexto que la app no puede leer.

Orden: Circuit (92 %) → Race (89 %) → Active (80 %) → Cardio (67 %). `WorkoutContext` queda fuera: con 127/149 L ya delega en `useProgress`/`usePrograms` y no hay nada sustancial que extraer.

### Riesgos

1. **`ActiveSessionContext` tiene una regla explícita en `apps/mobile/CLAUDE.md`**: *"SessionView es dueño del estado local (`stepIdx`/`phase`) y lo empuja al context; el context nunca se lee de vuelta durante la sesión. No inviertas ese flujo."* La extracción tiene que preservar esa dirección; un hook de core que "posea" el estado de la sesión sería exactamente la inversión prohibida.
2. **El móvil no tiene red de seguridad.** Web tiene 1.594 L de tests de contexto (`ActiveSession` 326, `Cardio` 526, `Circuit` 742); el móvil tiene **cero** y estructuralmente no puede renderizar React en vitest (documentado en `apps/mobile/CLAUDE.md`). Toda regresión nativa es invisible en CI → hace falta QA en dispositivo. La contrapartida es justamente el argumento del issue: lo que baja a core sí queda cubierto.
3. **Cardio es el caso dudoso.** Con 67 % de solape y el GPS divergiendo de verdad (expo-location con Foreground Service vs `navigator.geolocation`), forzar un hook común puede salir peor que la duplicación. Lo evalúo al abrirlo y, si no compensa, lo digo en el PR en vez de forzarlo.
4. **Los providers se montan en orden distinto** en cada app (web: Cardio > Circuit > Active, y `WorkoutProvider` aparte; móvil: Workout > Active > Cardio > Circuit). Si aparece una dependencia de orden al unificar, sale aquí.

### Plan de pruebas

- `pnpm -r typecheck` — el del **móvil** es el estricto (core no tiene `tsconfig` propio).
- Tests de core con el binario de vitest del workspace móvil (baseline actual: **1.434 pasando**).
- Tests de web (baseline actual: **324 pasando**). Los 1.594 L de tests de contexto son la red real de esta refactor: tienen que seguir verdes **sin tocarlos**, salvo donde cambie deliberadamente un import.
- Tests nuevos en core para el lifecycle y para lo que baje de cada contexto (ahí sí se puede testear lo que en el móvil no se podía).
- QA manual en dispositivo para lo nativo, que CI no cubre.

Baseline verificada antes de empezar a mover nada: typecheck de web y móvil en verde, 1.434 + 324 tests pasando.
