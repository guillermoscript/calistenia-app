# Recetas Favoritas (#179) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar/repetir recetas del plan pantry-aware: colección PB `saved_recipes` owner-scoped + ⭐ en `recipe-detail` + pantalla "Mis recetas" con costo/porción calculado con precios actuales de la despensa.

**Architecture:** Las recetas hoy viven embebidas en el plan (json en params, sin id propio) — la identidad de una receta guardada es `label_normalized` (via `normalizePantryName` que ya existe en core), con índice único `(user, label_normalized)`. El costo/porción NUNCA se persiste: se calcula on-the-fly con `computeRecipeCost` (F3, determinista). Hooks TanStack en `packages/core/hooks` (patrón `useFavorites`/`usePantry`), UI mobile spec-sheet (hairlines, Bebas/Mono, lime = interacción).

**Tech Stack:** PocketBase (migración JS), TanStack Query, Expo Router (file-based, sin tocar `_layout.tsx`), NativeWind, lucide-react-native, i18n flat dot-notation en `packages/core/locales`.

**Branch:** `feat/saved-recipes` (off `main`). Subagentes NO usan git — el controller commitea serial con paths explícitos.

**Tracks paralelos (archivos disjuntos):**
- **Track A** (core+PB): Tasks 1–2
- **Track B** (mobile+i18n): Tasks 3–6

Contrato entre tracks fijado en este plan (firmas de hooks + keys i18n). Track B compila solo cuando A esté en el tree — el controller corre `tsc` al integrar.

---

## Referencias clave (leer antes de tocar código)

- `packages/core/types/pantry.ts:66-82` — `Recipe`/`RecipeIngredient` (shape que se persiste en el json `recipe`).
- `packages/core/lib/pantry.ts:46-49` — `normalizePantryName(name)` (lowercase, sin acentos, trim). REUSAR, no duplicar.
- `packages/core/lib/shopping.ts:236-278` — `computeRecipeCost(ingredients, pantryItems, servings)` → `{ total, perServing, currency, hasEstimates, breakdown }`; `formatMoney` (línea 315).
- `packages/core/hooks/useFavorites.ts` — patrón toggle check-then-create/delete contra PB.
- `packages/core/hooks/usePantry.ts:32-44` — patrón `useQuery` + mapper snake→camel.
- `pb_migrations/1780700001_add_shopping_lists.js` — template de migración (guard try/catch, field ids estables, reglas owner-scoped).
- `apps/mobile/src/app/pantry.tsx:136-157` — patrón header (back + kicker + título + icon-button derecho).
- `apps/mobile/src/app/recipe-detail.tsx` — pantalla que recibe la estrella.

---

### Task 1: Migración PB `saved_recipes`

**Files:**
- Create: `pb_migrations/1780800001_add_saved_recipes.js`

**Reglas duras:** timestamp `1780800001` (> `1780700002`, el último). Field ids explícitos y estables (NUNCA cambiarlos después — pérdida de datos). Add-only con guard idempotente. NO aplicar la migración ni tocar el PB local — eso lo hace el controller al integrar.

- [ ] **Step 1: Crear el archivo de migración completo**

```js
/// <reference path="../pb_data/types.d.ts" />

/**
 * saved_recipes — Recetas favoritas (issue #179, épica #153).
 * recipe es json con el shape Recipe de F2 (steps, ingredients, prep_minutes,
 * servings, photo_query). Identidad = label_normalized (las recetas viven
 * embebidas en planes, no tienen id propio) con índice único por usuario.
 * times_used queda en schema para F4 ("cocinar de nuevo"); V1 no lo incrementa.
 */
migrate((app) => {
  try {
    app.findCollectionByNameOrId("saved_recipes")
  } catch (e) {
    const col = new Collection({
      "createRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "saved_recipes",
      "system": false,
      "type": "base",
      "id": "pbc_saved_recipes",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false, "id": "text3208210256", "max": 15, "min": 15,
          "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false,
          "primaryKey": true, "required": true, "system": true, "type": "text"
        },
        {
          "cascadeDelete": true, "collectionId": "_pb_users_auth_",
          "hidden": false, "id": "relation_sr_user", "maxSelect": 1, "minSelect": 0,
          "name": "user", "presentable": false, "required": true, "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "", "hidden": false, "id": "text_sr_label",
          "max": 0, "min": 0, "name": "label", "pattern": "", "presentable": true,
          "primaryKey": false, "required": true, "system": false, "type": "text"
        },
        {
          "autogeneratePattern": "", "hidden": false, "id": "text_sr_label_norm",
          "max": 0, "min": 0, "name": "label_normalized", "pattern": "", "presentable": false,
          "primaryKey": false, "required": true, "system": false, "type": "text"
        },
        {
          "hidden": false, "id": "json_sr_recipe", "maxSize": 0,
          "name": "recipe", "presentable": false, "required": false,
          "system": false, "type": "json"
        },
        {
          "hidden": false, "id": "number_sr_times_used", "max": null, "min": null,
          "name": "times_used", "onlyInt": true, "presentable": false,
          "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "autodate_sr_created", "name": "created",
          "onCreate": true, "onUpdate": false, "presentable": false,
          "system": false, "type": "autodate"
        },
        {
          "hidden": false, "id": "autodate_sr_updated", "name": "updated",
          "onCreate": true, "onUpdate": true, "presentable": false,
          "system": false, "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_sr_user_label ON saved_recipes (user, label_normalized)"
      ]
    })
    app.save(col)
  }
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("saved_recipes"))
  } catch (e) {
    // Already deleted, ignore
  }
})
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check pb_migrations/1780800001_add_saved_recipes.js`
Expected: exit 0 (node --check no conoce `migrate`, pero valida sintaxis JS — si falla por `migrate` no definido está bien, solo importa que no haya syntax error; alternativa: `node -e "new Function(require('fs').readFileSync('pb_migrations/1780800001_add_saved_recipes.js','utf8'))"` → exit 0).

**NO hacer:** aplicar migración, reiniciar PB, git.

---

### Task 2: Core — tipo `SavedRecipe` + query key + hook `useSavedRecipes`

**Files:**
- Modify: `packages/core/types/pantry.ts` (append al final)
- Modify: `packages/core/types/index.ts` (bloque de re-export de pantry, ~línea 671)
- Modify: `packages/core/lib/query-keys.ts` (dentro del objeto `qk`, junto al grupo `pantry`/`shopping` ~línea 180)
- Create: `packages/core/hooks/useSavedRecipes.ts`

- [ ] **Step 1: Agregar tipo a `packages/core/types/pantry.ts`** (después de `Recipe`)

```ts
/** Receta guardada por el usuario (#179). Identidad = label_normalized (único por user). */
export interface SavedRecipe {
  id: string
  user: string
  label: string
  labelNormalized: string
  recipe: Recipe
  timesUsed: number
  created: string
  updated: string
}
```

- [ ] **Step 2: Re-exportar desde `packages/core/types/index.ts`**

Buscar el bloque existente que re-exporta los tipos de pantry (el que incluye `Recipe`, `RecipeIngredient`, ~líneas 671-678) y agregar `SavedRecipe` a esa misma lista de `export type { ... } from './pantry'`. NO crear un export statement nuevo si ya existe uno para './pantry'.

- [ ] **Step 3: Agregar query key en `packages/core/lib/query-keys.ts`**

Dentro del objeto `qk`, después del grupo `shopping` (~línea 186-190), mismo estilo:

```ts
savedRecipes: {
  list: (userId: string | null) => ['savedRecipes', 'list', userId] as const,
},
```

- [ ] **Step 4: Crear `packages/core/hooks/useSavedRecipes.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecordModel } from 'pocketbase'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { normalizePantryName } from '../lib/pantry'
import type { Recipe, SavedRecipe } from '../types/pantry'

function mapSavedRecipeRecord(r: RecordModel): SavedRecipe {
  return {
    id: r.id,
    user: r.user as string,
    label: (r.label as string) ?? '',
    labelNormalized: (r.label_normalized as string) ?? '',
    recipe: (r.recipe ?? { steps: [], ingredients: [], prep_minutes: null }) as Recipe,
    timesUsed: (r.times_used as number) ?? 0,
    created: r.created,
    updated: r.updated,
  }
}

/** Recetas guardadas del usuario, más reciente primero. */
export function useSavedRecipes(userId: string | null) {
  return useQuery({
    queryKey: qk.savedRecipes.list(userId),
    enabled: !!userId,
    queryFn: async () => {
      const res = await pb.collection('saved_recipes').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-created',
      })
      return res.map(mapSavedRecipeRecord)
    },
  })
}

/**
 * Toggle guardar/quitar por label_normalized (patrón useFavorites: consulta PB
 * por el estado real antes de crear/borrar — robusto ante doble tap y ante el
 * índice único (user, label_normalized)).
 */
export function useToggleSavedRecipe(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ label, recipe }: { label: string; recipe: Recipe }) => {
      if (!userId) return
      const norm = normalizePantryName(label)
      const existing = await pb.collection('saved_recipes').getFullList({
        filter: pb.filter('user = {:uid} && label_normalized = {:norm}', { uid: userId, norm }),
      })
      if (existing.length > 0) {
        for (const r of existing) await pb.collection('saved_recipes').delete(r.id)
      } else {
        await pb.collection('saved_recipes').create({
          user: userId,
          label,
          label_normalized: norm,
          recipe,
          times_used: 0,
        })
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.savedRecipes.list(userId) }),
  })
}

/** Borra una receta guardada por id. 404 = ya borrada, no es error (patrón useShoppingList). */
export function useDeleteSavedRecipe(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await pb.collection('saved_recipes').delete(id)
      } catch (e) {
        if ((e as { status?: number })?.status !== 404) throw e
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.savedRecipes.list(userId) }),
  })
}
```

Nota: verificar cómo importa `pb` el resto de hooks de core (`grep -n "from '../lib/pocketbase'" packages/core/hooks/usePantry.ts`) y usar exactamente el mismo import. Si `RecordModel` no está exportado por el paquete `pocketbase` en la versión instalada, tipar el param del mapper como `Record<string, unknown> & { id: string; created: string; updated: string }` — no usar `any`.

- [ ] **Step 5: Verificar**

Run: `pnpm --filter @calistenia/core test`
Expected: 187 tests pass (sin cambios — no hay lib pura nueva).

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0 (el hook nuevo compila; nadie lo consume aún).

**NO hacer:** git, tocar archivos de mobile.

---

### Task 3: i18n — keys `savedRecipes.*` (es + en)

**Files:**
- Modify: `packages/core/locales/es/translation.json`
- Modify: `packages/core/locales/en/translation.json`

Formato: **flat dot-notation** (como `"pantry.kicker": "INVENTARIO"`). Insertar el bloque junto a las keys `shopping.*` existentes (orden alfabético aproximado del archivo — mirar dónde están `pantry.*`/`shopping.*` y seguir esa vecindad).

- [ ] **Step 1: Agregar a `es/translation.json`**

```json
"savedRecipes.kicker": "RECETAS",
"savedRecipes.title": "Mis recetas",
"savedRecipes.save": "Guardar receta",
"savedRecipes.unsave": "Quitar de guardadas",
"savedRecipes.emptyTitle": "SIN RECETAS GUARDADAS",
"savedRecipes.empty": "Guarda recetas del plan con la estrella para repetirlas cuando quieras.",
"savedRecipes.ingredientsCount": "{{count}} ingredientes",
"savedRecipes.perServing": "/porción",
"savedRecipes.deleteTitle": "¿Eliminar receta?",
"savedRecipes.deleteMsg": "“{{label}}” se eliminará de tus recetas guardadas.",
"savedRecipes.delete": "Eliminar"
```

- [ ] **Step 2: Agregar a `en/translation.json`**

```json
"savedRecipes.kicker": "RECIPES",
"savedRecipes.title": "My recipes",
"savedRecipes.save": "Save recipe",
"savedRecipes.unsave": "Remove from saved",
"savedRecipes.emptyTitle": "NO SAVED RECIPES",
"savedRecipes.empty": "Save plan recipes with the star to repeat them anytime.",
"savedRecipes.ingredientsCount": "{{count}} ingredients",
"savedRecipes.perServing": "/serving",
"savedRecipes.deleteTitle": "Delete recipe?",
"savedRecipes.deleteMsg": "“{{label}}” will be removed from your saved recipes.",
"savedRecipes.delete": "Delete"
```

- [ ] **Step 3: Validar JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/core/locales/es/translation.json','utf8')); JSON.parse(require('fs').readFileSync('packages/core/locales/en/translation.json','utf8')); console.log('ok')"`
Expected: `ok`

**Gotcha runtime (para el device test, no para esta task):** keys i18n nuevas requieren app en frío (force-stop + relaunch), no basta JS reload.

---

### Task 4: Mobile — ⭐ en `recipe-detail.tsx`

**Files:**
- Modify: `apps/mobile/src/app/recipe-detail.tsx`

Depende del contrato de Task 2 (hooks) y Task 3 (keys). El header actual (líneas 138-149) es una fila con solo el botón back — se agrega la estrella a la derecha con `ml-auto`.

- [ ] **Step 1: Imports**

En el import de lucide (línea 15) agregar `Star`:

```ts
import { ArrowLeft, ChevronDown, ChevronUp, Star } from 'lucide-react-native'
```

Después del import de `usePantryItems` (línea 18) agregar:

```ts
import { useSavedRecipes, useToggleSavedRecipe } from '@calistenia/core/hooks/useSavedRecipes'
import { normalizePantryName } from '@calistenia/core/lib/pantry'
```

- [ ] **Step 2: Constante lime**

Junto a `const MUTED = 'hsl(0 0% 55%)'` (línea 22):

```ts
const LIME = '#a3e635' // tailwind lime-400 — mismo tono que text-lime-400
```

(Antes: `grep -rn "a3e635\|lime-400.*color\|color.*lime" apps/mobile/src --include="*.tsx" | head -5` — si ya existe una constante lime para iconos en otra pantalla, copiar ese valor exacto.)

- [ ] **Step 3: Estado saved en el componente**

Después de `const { data: pantryItems = [] } = usePantryItems(authUser?.id ?? null)` (línea 112):

```ts
const { data: savedRecipes = [] } = useSavedRecipes(authUser?.id ?? null)
const toggleSaved = useToggleSavedRecipe(authUser?.id ?? null)
const isSaved = useMemo(
  () => savedRecipes.some((s) => s.labelNormalized === normalizePantryName(label)),
  [savedRecipes, label],
)
// Feedback inmediato: mientras la mutación viaja, mostrar el estado destino.
const showSaved = toggleSaved.isPending ? !isSaved : isSaved
```

- [ ] **Step 4: Botón estrella en el header**

En la fila del header (líneas 139-149), después del `Pressable` del back:

```tsx
{recipe != null && authUser != null && (
  <Pressable
    onPress={() => toggleSaved.mutate({ label, recipe })}
    disabled={toggleSaved.isPending}
    hitSlop={8}
    className="ml-auto p-2"
    accessibilityRole="button"
    accessibilityLabel={showSaved ? t('savedRecipes.unsave') : t('savedRecipes.save')}
  >
    <Star size={20} color={showSaved ? LIME : MUTED} fill={showSaved ? LIME : 'transparent'} />
  </Pressable>
)}
```

- [ ] **Step 5: Verificar**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0

Run: `cd apps/mobile && npx expo lint`
Expected: sin errores nuevos (warnings preexistentes ok).

**NO hacer:** git, tocar pantry.tsx ni crear pantallas.

---

### Task 5: Mobile — pantalla `saved-recipes.tsx`

**Files:**
- Create: `apps/mobile/src/app/saved-recipes.tsx`

Expo-router file-based: crear el archivo basta, NO tocar `_layout.tsx` (hereda `headerShown: false` + slide_from_right). Header manual patrón `pantry.tsx:138-157`. Filas hairline (`border-b border-border`), sin cards. Costo/porción por fila con `computeRecipeCost` + precios actuales (`usePantryItems`) — `—` implícito: si no hay precio, no se muestra número (silencio para el default).

- [ ] **Step 1: Crear la pantalla completa**

```tsx
/**
 * Mis recetas — recetas guardadas del plan pantry-aware (#179).
 * El costo/porción se calcula on-the-fly con computeRecipeCost (precios
 * actuales de la despensa) — nunca se persiste.
 *
 * Ruta: /saved-recipes
 */
import { memo, useMemo } from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { useDeleteSavedRecipe, useSavedRecipes } from '@calistenia/core/hooks/useSavedRecipes'
import { computeRecipeCost, formatMoney } from '@calistenia/core/lib/shopping'
import type { PantryItem, SavedRecipe } from '@calistenia/core/types'

const MUTED = 'hsl(0 0% 55%)'

const RecipeRow = memo(function RecipeRow({
  item,
  pantryItems,
  onPress,
  onDelete,
}: {
  item: SavedRecipe
  pantryItems: PantryItem[]
  onPress: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const servings = Math.max(1, item.recipe?.servings ?? 1)
  const ingredients = item.recipe?.ingredients ?? []
  const cost = useMemo(
    () => (ingredients.length ? computeRecipeCost(ingredients, pantryItems, servings) : null),
    [ingredients, pantryItems, servings],
  )
  const hasAnyPrice = cost != null && cost.breakdown.some((b) => b.source !== 'sin_precio')
  const meta = [
    t('savedRecipes.ingredientsCount', { count: ingredients.length }),
    item.recipe?.prep_minutes != null ? `${item.recipe.prep_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
      accessibilityRole="button"
    >
      <View className="flex-1">
        <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
          {item.label}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {meta}
        </Text>
      </View>
      {hasAnyPrice && (
        <View className="items-end">
          <Text className="font-bebas text-lg leading-none text-lime-400">
            {cost!.hasEstimates ? '~' : ''}${formatMoney(cost!.perServing)}
          </Text>
          <Text className="font-mono text-[9px] uppercase text-muted-foreground">
            {t('savedRecipes.perServing')}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onDelete}
        hitSlop={6}
        className="-my-2 p-2"
        accessibilityRole="button"
        accessibilityLabel={t('savedRecipes.delete')}
      >
        <X size={14} color={MUTED} />
      </Pressable>
    </Pressable>
  )
})

export default function SavedRecipesScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const authUser = useAuthUser()
  const uid = authUser?.id ?? null
  const { data: recipes = [], isLoading } = useSavedRecipes(uid)
  const { data: pantryItems = [] } = usePantryItems(uid)
  const del = useDeleteSavedRecipe(uid)

  const openRecipe = (r: SavedRecipe) => {
    router.push({
      pathname: '/recipe-detail',
      params: { label: r.label, recipe: JSON.stringify(r.recipe) },
    })
  }

  // Borrar aquí SÍ es destructivo: la receta no vive en ningún otro lado.
  const confirmDelete = (r: SavedRecipe) => {
    Alert.alert(t('savedRecipes.deleteTitle'), t('savedRecipes.deleteMsg', { label: r.label }), [
      { text: t('common.cancel', 'Cancelar'), style: 'cancel' },
      { text: t('savedRecipes.delete'), style: 'destructive', onPress: () => del.mutate(r.id) },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Volver')}
        >
          <ArrowLeft size={20} color={MUTED} />
        </Pressable>
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">
            {t('savedRecipes.kicker')}
          </Text>
          <Text className="font-bebas text-4xl text-foreground">{t('savedRecipes.title')}</Text>
        </View>
      </View>

      {recipes.length === 0 && !isLoading ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-2 font-mono text-xs uppercase tracking-[3px] text-muted-foreground">
            {t('savedRecipes.emptyTitle')}
          </Text>
          <Text className="text-center font-sans text-sm text-muted-foreground">
            {t('savedRecipes.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          className="px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <RecipeRow
              item={item}
              pantryItems={pantryItems}
              onPress={() => openRecipe(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}
```

Nota: si `PantryItem` no está re-exportado desde `@calistenia/core/types`, importar desde `@calistenia/core/types/pantry` (verificar con grep cómo lo importa `usePantry.ts` / otras pantallas).

- [ ] **Step 2: Verificar**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0

Run: `cd apps/mobile && npx expo lint`
Expected: sin errores nuevos.

**NO hacer:** git, tocar pantry.tsx ni recipe-detail.tsx.

---

### Task 6: Mobile — entrada "Mis recetas" en header de Despensa

**Files:**
- Modify: `apps/mobile/src/app/pantry.tsx` (header, líneas 138-157)

- [ ] **Step 1: Import del icono**

En el import de lucide existente en pantry.tsx agregar `BookMarked` (queda junto a `ShoppingCart`, `ArrowLeft`, etc.).

- [ ] **Step 2: Botón en el header**

El header actual termina con el botón ShoppingCart que lleva `className="ml-auto p-2"`. Insertar el botón nuevo ANTES del de ShoppingCart, moviéndole el `ml-auto` al nuevo (el nuevo empuja el grupo a la derecha) y dejando el de ShoppingCart con `className="p-2"`:

```tsx
<Pressable
  onPress={() => router.push('/saved-recipes')}
  hitSlop={8}
  className="ml-auto p-2"
  accessibilityRole="button"
  accessibilityLabel={t('savedRecipes.title')}
>
  <BookMarked size={20} color="hsl(0 0% 55%)" />
</Pressable>
<Pressable
  onPress={() => router.push('/shopping-list')}
  hitSlop={8}
  className="p-2"
  accessibilityRole="button"
  accessibilityLabel={t('shopping.title')}
>
  <ShoppingCart size={20} color="hsl(0 0% 55%)" />
</Pressable>
```

- [ ] **Step 3: Verificar**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0

**NO hacer:** git, tocar otros archivos.

---

## Integración (controller, después de los tracks)

- [ ] `cd apps/mobile && npx tsc --noEmit && npx expo lint` → verde
- [ ] `pnpm --filter @calistenia/core test` → 187 pass
- [ ] `cd mcp-server && npx tsc --noEmit` → verde (no debería tocarse, sanity)
- [ ] Aplicar migración al PB local (`migrate up`) y **REINICIAR `pocketbase serve`** (gotcha F3: serve corriendo no ve colecciones creadas por migrate externo)
- [ ] Commits seriales con paths explícitos:
  1. `git add pb_migrations/1780800001_add_saved_recipes.js packages/core/types/pantry.ts packages/core/types/index.ts packages/core/lib/query-keys.ts packages/core/hooks/useSavedRecipes.ts` → `feat(recetas): colección saved_recipes + hooks core (#179)`
  2. `git add packages/core/locales/es/translation.json packages/core/locales/en/translation.json apps/mobile/src/app/recipe-detail.tsx` → `feat(recetas): estrella guardar/quitar en recipe-detail (#179)`
  3. `git add apps/mobile/src/app/saved-recipes.tsx apps/mobile/src/app/pantry.tsx` → `feat(recetas): pantalla Mis recetas + entrada en Despensa (#179)`
- [ ] Reviews trailing (spec + quality) → controller arregla CRITICAL/IMPORTANT
- [ ] `/critique` + `/harden` sobre la UI nueva
- [ ] Device test de Guillermo (app en frío para i18n) ANTES de PR merge
- [ ] PR con `Closes #179`

## Fuera de scope (no implementar)

- Incrementar `times_used` / "cocinar de nuevo" → F4 (#173)
- Web parity
- Editar recetas guardadas
- Compartir recetas
