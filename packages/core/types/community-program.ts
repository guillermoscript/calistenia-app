/**
 * Programas de comunidad con hitos semanales (#353).
 *
 * NO confundir con los programas de entrenamiento (`programs`, `user_programs`,
 * `program_phases`, …), que son el currículo de ejercicios por fases y días.
 * Estas colecciones (`community_programs`, `community_program_milestones`,
 * `community_program_members`) son cohortes ligeras: contenido curado + una
 * fila de pertenencia por usuario. El progreso NO se guarda: se recalcula en
 * cada lectura desde los registros canónicos (ver `lib/community-programs.ts`).
 */

/**
 * `workout_count` = N entrenos dentro de la ventana de la semana.
 * `challenge` = además hay que estar apuntado al reset de retos enlazado (#350).
 */
export type CommunityMilestoneKind = 'workout_count' | 'challenge'

export type CommunityMembershipStatus = 'active' | 'left'

export interface CommunityProgram {
  id: string
  slug: string
  /** Clave i18n, no texto: el título sigue el idioma actual del usuario. */
  title_key: string
  description_key: string
  duration_days: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  icon?: string
  is_published: boolean
  sort_order?: number
}

export interface CommunityProgramMilestone {
  id: string
  /** id del `community_programs` al que pertenece. */
  program: string
  /** Semana 1-indexada. Dos hitos pueden compartir semana. */
  week: number
  title_key: string
  description_key?: string
  kind: CommunityMilestoneKind
  /** Entrenos necesarios para completarlo. */
  target: number
  /** Solo en `kind: 'challenge'`: slug del preset de `challenge-presets.ts`. */
  preset_key?: string
  sort_order?: number
}

export interface CommunityProgramMember {
  id: string
  program: string
  user: string
  /**
   * Día local `YYYY-MM-DD` en que empieza la SEMANA 1 de este miembro
   * (inscripción rodante). Sobrevive a abandonar el programa: al volver se
   * reutiliza, de modo que el progreso se reanuda en vez de reiniciarse.
   */
  started_at: string
  status: CommunityMembershipStatus
  left_at?: string
}
