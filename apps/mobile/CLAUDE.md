# Mobile app (Expo / React Native)

React Native + Expo Router + NativeWind. Shares logic with the web app via
`@calistenia/core`. Native bottom sheets use a native `<Modal animationType="slide">`
(see `src/components/social/CommentsSheet.tsx`), **not** gorhom — on Xiaomi/MIUI
edge-to-edge the gorhom JS sheet's insets collapse to 0 and collide with the
Android nav bar; the native Modal window sits above it.

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
