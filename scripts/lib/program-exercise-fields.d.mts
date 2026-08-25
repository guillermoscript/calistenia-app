/**
 * Tipos a mano para `program-exercise-fields.mjs`.
 *
 * El helper vive en `scripts/` (JavaScript plano, lo ejecuta node directamente),
 * pero `packages/core/lib/style-tokens.test.ts` lo importa para verificar que todo
 * valor que el seeder puede producir tiene color en `PRIORITY_COLORS`. `core` está
 * en `strict`, así que necesita declaraciones.
 */

export type SeederPriority = 'high' | 'med' | 'low'

export declare const PRIORITIES: readonly SeederPriority[]
export declare const DEFAULT_PRIORITY: SeederPriority
export declare const PRIORITY_ALIASES: Record<string, SeederPriority>
export declare const SECTION_MARKERS: readonly string[]
export declare const DEFAULT_SECTION: string

export declare function normalizePriority(raw: unknown, label?: string): SeederPriority
export declare function resolveSection(exercise: { section?: unknown; priority?: unknown }): string
