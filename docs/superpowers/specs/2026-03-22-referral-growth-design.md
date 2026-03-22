# Referral & Growth System Design

## Overview

Sistema de referidos y crecimiento orgánico para la app de calistenia. Combina invitaciones rápidas con challenges express para crear un loop viral: invitar amigos → ganar puntos → usar IA → ver valor → invitar más.

**Dos flujos de invitación:**
1. **Invitación rápida** — link de referido, registro rápido, puntos inmediatos
2. **Invitación con challenge** — challenge express incluido, engagement desde día 1

Ambos flujos pasan por una landing personalizada con preview (stats, rutina o challenge).

## Sistema de Referidos y Puntos

### Códigos de referido
- Cada usuario tiene un código único auto-generado: `{DISPLAY_NAME}-{HASH_4}` (ej: `GUILLE-7X3K`)
- Se genera al crear la cuenta y se guarda en `users.referral_code`
- Link de referido: `https://gym.guille.tech/invite/{código}`

### Tracking de referidos
- Colección `referrals`: `referrer`, `referred`, `source` (quick_invite | challenge), `challenge_id` (opcional), `points_awarded`
- Al abrir un link de referido, el `referral_code` se guarda en localStorage para no perderlo durante el flujo de registro
- Post-registro, se crea el registro en `referrals` automáticamente

### Sistema de puntos

**Acumulación:**
| Acción | Puntos |
|--------|--------|
| Referido se registra | 100 |
| Referido completa primer workout | 50 bonus |
| Challenge completado con referido | 75 (ambos) |

**Gasto (futuro):**
- Los puntos se canjean por uso de funciones de IA
- Valor por crédito a definir cuando se implemente el tier de pago

**Almacenamiento:**
- `referral_points`: balance actual, total ganado, total gastado por usuario
- `point_transactions`: historial de cada movimiento con tipo y descripción

### Panel "Mis Referidos"
- Ruta: `/referrals`, accesible desde el perfil
- Contenido: lista de referidos (avatar, nombre, fecha), puntos acumulados, barra de progreso hacia siguiente reward, historial de transacciones

## Landing de Invitación

### Rutas
- `/invite/{referral_code}` — invitación rápida
- `/invite/{referral_code}/challenge/{challenge_id}` — invitación con challenge
- Página pública, no requiere autenticación

### Contenido

**Header:**
- Avatar y display_name del invitante
- Mensaje: "{Nombre} te invitó a entrenar juntos"

**Social proof:**
- Nivel, streak actual, total de sesiones del invitante
- Reutiliza data del perfil público existente

**Preview condicional:**
- Sin challenge: muestra rutina actual del invitante (componente de RoutineViewPage en modo compacto)
- Con challenge: muestra el challenge express (ejercicio, duración, meta, participantes)

**CTA:**
- Botón principal: "Unirme" → registro con referral_code en contexto
- Link secundario: "Ya tengo cuenta" → login, aplica referido o une al challenge

### Open Graph meta tags
- Meta tags dinámicos para preview en WhatsApp/redes sociales
- Título, descripción, avatar del invitante
- Se resuelve con meta tags inyectados server-side (función serverless o endpoint PocketBase)

## Challenge Express

### Creación
- Accesible desde el flujo de invitación ("Invitar con challenge")
- También desde `/challenges/new` con toggle "challenge express"
- Formulario inline de 3 campos, sin wizard

### Formulario
1. **Ejercicio** — selector de ejercicios disponibles en la app
2. **Duración** — chips: 7 días, 14 días, 30 días
3. **Meta diaria** — input numérico con label contextual ("reps por día" o "minutos por día")

Título auto-generado: "Challenge de {ejercicio} — {meta} x {duración}" (editable)

### Relación con challenges existentes
- Usa la misma colección `challenges` con campo `type`: `standard` | `express`
- Campos adicionales para express: `exercise_id`, `daily_target`, `duration_days`
- Los challenges standard existentes no se modifican

### Tracking automático
- Cuando un participante loggea un workout con el ejercicio del challenge, se auto-registra progreso
- Vista del challenge: barra de progreso por participante, días completados vs total, streak dentro del challenge

### Vinculación con referidos
- Si el challenge se creó desde invitación, `challenge_id` se asocia en `referrals`
- Al completar: 75 puntos para referrer y referred

## Flujos de Usuario

### Flujo 1: Invitación rápida
1. Usuario toca "Invitar amigo" (perfil o página de referidos)
2. Se genera link `/invite/{código}` → comparte por WhatsApp, copiar link, o Web Share API
3. Amigo abre link → ve landing con stats + preview de rutina → toca "Unirme"
4. Registro (email/password o Google OAuth) → referral_code se asocia
5. Referrer recibe 100 puntos + notificación "{Nombre} se unió gracias a ti"
6. Referido completa primer workout → 50 puntos bonus + notificación

### Flujo 2: Invitación con challenge
1. Usuario toca "Invitar con challenge" → formulario express
2. Se crea challenge y genera link `/invite/{código}/challenge/{id}` → comparte
3. Amigo abre link → ve landing con challenge + stats → "Unirme al challenge"
4. Registro → se asocia referido + se une al challenge
5. Referrer recibe 100 puntos + notificación
6. Ambos entrenan → tracking automático
7. Challenge completado → 75 puntos cada uno + notificación

### Flujo 3: Usuario existente recibe invitación con challenge
1. Abre link → landing → "Ya tengo cuenta" → login
2. Se une al challenge automáticamente
3. No genera puntos de referido (ya tiene cuenta), sí los 75 por completar challenge

## Modelo de Datos

### Colecciones nuevas

#### `referrals`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `referrer` | relation (users) | Quien invitó |
| `referred` | relation (users) | Quien se registró |
| `source` | select (quick_invite, challenge) | Tipo de invitación |
| `challenge_id` | relation (challenges), nullable | Challenge asociado |
| `points_awarded` | number | Puntos otorgados |
| `created` | autodate | |

#### `referral_points`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `user` | relation (users), unique | Dueño de los puntos |
| `balance` | number | Puntos disponibles |
| `total_earned` | number | Total histórico ganado |
| `total_spent` | number | Total gastado en IA |

#### `point_transactions`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `user` | relation (users) | |
| `amount` | number | Positivo = ganado, negativo = gastado |
| `type` | select (referral_signup, referral_bonus, challenge_complete, ai_usage) | |
| `reference_id` | text | ID del referral o challenge relacionado |
| `description` | text | Descripción legible |
| `created` | autodate | |

### Modificaciones a colecciones existentes

#### `users`
- `referral_code` | text, unique | Código auto-generado al crear cuenta

#### `challenges`
- `type` | select (standard, express) | Default: standard
- `exercise_id` | relation (exercises), nullable | Solo para express
- `daily_target` | number, nullable | Meta diaria para express
- `duration_days` | number, nullable | Duración para express

### API Rules
- `referrals`: lectura solo para el referrer. Creación vía hooks al registrarse
- `referral_points`: lectura solo para el owner. Escritura solo vía hooks
- `point_transactions`: lectura solo para el owner. Creación solo vía hooks
- `users.referral_code`: lectura pública (necesario para la landing)

## Componentes y Hooks

### Hooks nuevos

#### `useReferrals()`
- `getReferrals()` — lista de referidos del usuario actual
- `getReferralStats()` — total referidos, puntos balance, total earned
- `trackReferral(referrerCode)` — llamado post-registro para crear el vínculo

#### `useReferralPoints()`
- `getBalance()` — puntos disponibles
- `getTransactions()` — historial de transacciones
- `spendPoints(amount, description)` — para futuro uso de IA

#### `useChallengeExpress()`
- `createExpress(exerciseId, durationDays, dailyTarget)` — crea challenge express
- `getProgress(challengeId)` — progreso por participante
- `autoTrack(challengeId, workoutData)` — registra progreso al loggear workout

### Componentes nuevos

#### Páginas
- `InviteLandingPage` — landing pública en `/invite/:code` y `/invite/:code/challenge/:id`
- `ReferralsPage` — panel "Mis Referidos" en `/referrals`

#### Componentes
- `InviteButton` — dropdown: "Invitar rápido" / "Invitar con challenge"
- `ChallengeExpressForm` — formulario inline de 3 campos
- `ReferralStats` — card con puntos, total referidos, barra de progreso
- `ReferralList` — lista de referidos con avatar, nombre, fecha, puntos
- `ChallengeProgressBar` — barra de progreso por participante
- `PointsBalance` — badge/chip de puntos disponibles para header o perfil

### Integraciones con componentes existentes
- `ShareButton` — agregar opción "Invitar amigo"
- `UserProfilePage` — sección de puntos y link a "Mis Referidos"
- `Sidebar` — item "Referidos" con badge de puntos
- `CreateChallengePage` — toggle para modo express
- Hooks de workout — trigger autoTrack post-workout para challenges express activos

## Notificaciones nuevas

Se agregan al sistema existente (`useNotifications`):

| Tipo | Mensaje |
|------|---------|
| `referral_signup` | "{Nombre} se unió gracias a tu invitación" |
| `referral_bonus` | "Ganaste 50 puntos: {Nombre} completó su primer workout" |
| `challenge_complete` | "Completaste el challenge de {ejercicio} con {Nombre}" |
