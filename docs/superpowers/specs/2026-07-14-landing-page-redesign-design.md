# Landing page redesign — design spec

**Status:** approved for specification review  
**Date:** 2026-07-14

## Objective

Turn the public landing page into a beginner-focused acquisition page that makes Android download the primary conversion and web sign-up an equally clear no-install path.

The page must present Calistenia as a connected training companion—not a collection of unrelated fitness features. A visitor should understand, within the first viewport, that they can start from their current level, receive a guided next step, and keep making progress across training, nutrition, and recovery.

## Research context

The design reflects the current repository, release notes, and GitHub activity through 2026-07-14. Key shipped capabilities include:

- Guided programs, free AI sessions, circuits, timed workouts, cardio, and time-based races.
- A 1,578-exercise library with level variants, filters, related movements, and challenges.
- AI meal logging, nutrition quality, saved recipes, and a pantry that supports meal planning, shopping lists, real prices, receipt scanning, and cost views.
- Unified calendar, progress photos, personal records, cross-metric weekly insights, Health Connect import, community activity, notifications, and user blocking.
- Android releases, web PWA access, and offline session/queue resilience.

The existing page understates this product breadth with obsolete claims such as "150+ exercises," "4 phases," and "100% PWA," plus generic feature cards and illustrative UI that is not representative of the current app.

## Visual direction

**Visual thesis:** A confident, kinetic training journal: near-black surfaces, the established lime accent, bold Bebas display type, and real, approachable training/product imagery. The page should feel achievable to a beginner, not like an elite-athlete campaign.

Use the existing two-font system (Bebas Neue and DM Sans) and one primary accent (lime). Default to flat layout, dividers, text columns, and media blocks. Cards are permitted only where they are literal product UI shown inside screenshots.

The hero is edge-to-edge. Its inner text column is constrained for readability; the section itself never inherits a shared max-width or page gutters.

## Content architecture

### 1. Hero — give beginners permission to start

- Brand: `CALISTENIA`
- Headline: `Empieza desde cero. Sigue avanzando.`
- Supporting copy: `Entrenamientos guiados, comida que acompaña tu objetivo y un plan claro para volver mañana.`
- Primary CTA: `Descargar para Android` linking to `/download`.
- Secondary CTA: `Usar en la web` invoking the existing account/start flow.
- Visual: a full-bleed, real-looking image of an approachable athlete training at home or outdoors, with a calm dark area behind the text. Avoid image text, logos, and embedded UI.

The Android CTA is visually primary. The web CTA is an explicit alternative, not a tertiary link.

### 2. Beginner promise — remove the choice burden

Heading: `No necesitas saber qué rutina elegir.`

Show three concise steps in a plain horizontal layout:

1. `Cuéntanos tu nivel`
2. `Recibe tu programa`
3. `Entrena paso a paso`

Pair this with an authentic onboarding or today-session capture. Do not use three promotional cards.

### 3. Today’s training — demonstrate the daily loop

- Eyebrow: `Tu próximo paso`
- Heading: `Abre la app. Haz lo que toca.`
- Copy: `Sesiones guiadas, una biblioteca de 1.578 ejercicios, alternativas por nivel y rutinas libres con IA.`
- Visual: a real Today/session screen. A single, restrained completion animation may highlight a checked exercise.

### 4. Nutrition and pantry — show the differentiator

- Eyebrow: `Comida que sí encaja`
- Heading: `De lo que tienes a lo que comes.`
- Copy: `Guarda tu despensa, crea comidas con IA, repite tus recetas y genera la compra que te falta.`
- Visual: a single narrative sequence from pantry to recipe to shopping list. Receipt scanning and cost per meal appear as supporting proof, not a separate feature list.

### 5. Progress — create a return reason

- Heading: `El progreso se vuelve evidente.`
- Copy: `Tu calendario, fotos de progreso, récords y resumen semanal conectan entrenamiento, descanso y nutrición.`
- Visual: a progress-photo comparison or weekly insight alongside a restrained trend trace.

### 6. Beyond the routine — acknowledge breadth without overload

Use a text-led horizontal reveal list:

`Cardio con GPS · Circuitos y temporizador · Carreras · Retos · Comunidad segura · Funciona sin conexión`

Each item reveals a relevant product crop on hover and keyboard focus; on touch, the crop follows the active item. This replaces the generic six-card feature grid.

### 7. Platform choice — convert on either surface

- Heading: `Tu plan te acompaña donde entrenas.`
- Copy: `Mantén tu progreso sincronizado entre ambos.`
- Android action: `Descargar la app` → `/download`
- Web action: `Empezar en la web` → existing account/start flow

### 8. Final CTA

- Heading: `Tu primer entrenamiento puede empezar hoy.`
- Repeat the Android and web paths with Android visually primary.

## Motion and interaction

Implement three intentional motion systems, respecting `prefers-reduced-motion`:

1. Hero entrance: image fade/scale followed by brand, headline, copy, and actions in a quick stagger.
2. Scroll storytelling: the product visual in the training/nutrition/progress narrative shifts subtly in depth and reveals content as it enters the viewport.
3. Feature reveal: the Beyond-the-routine list changes its active crop on hover, focus, or tap.

Use the installed Motion package where it reduces complexity. Motion cannot block navigation, reduce CTA clarity, or cause persistent layout shifts.

## Assets

Create or curate a small, consistent asset set before building:

- One hero lifestyle image with a safe text area.
- Four or five authentic product captures: onboarding/today, active session, pantry/recipe/shopping, progress/insight, and Android platform context.
- One social sharing image tailored to the landing-page promise.

The current public directory only contains logo/icon assets. Do not make fake product screens a substitute for screenshots.

## Copy and localization

Landing content remains in the existing Spanish and English translation files. The approved Spanish copy above is the source direction; English must preserve the beginner-first meaning rather than be a literal translation.

Remove unsupported or stale claims. Do not describe Health Connect as universally available; it is Android-specific. Do not promote receipt scanning or other capabilities beyond their shipped availability.

## Analytics and routing

Preserve existing CTA analytics and replace location-only tracking with an additional platform/intent field:

- `cta_clicked` with `location` and `intent: android_download | web_start`.
- Android actions route to `/download`.
- Web actions retain the existing sign-up/start behavior.

No backend or authentication behavior changes are required.

## Metadata

Update the static document metadata:

- Title: `Calistenia — Empieza desde cero. Sigue avanzando.`
- Description: `Entrenamientos guiados, nutrición con IA, despensa inteligente y progreso real. Disponible para Android y en la web.`
- Replace logo-only social preview metadata with the new dedicated share image.

## Verification

- Add/adjust unit coverage for CTA destination and analytics intent.
- Add responsive Playwright coverage for the desktop and mobile hero, Android route, and web-start flow.
- Manually verify contrast on image-backed hero text, keyboard navigation for all CTAs and the horizontal reveal, image alt text, and reduced-motion behavior.
- Run web typecheck, unit tests, and relevant Playwright tests before release.

## Scope boundaries

This redesign changes the public landing page, public metadata, and its supporting visual assets. It does not redesign the download page, alter the app onboarding flow, add product features, or change backend behavior.
