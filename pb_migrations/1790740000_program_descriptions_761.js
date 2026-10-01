/// <reference path="../pb_data/types.d.ts" />

/**
 * Descripción de la ficha de 6 programas oficiales (#761).
 *
 * `program.description` de `programs/*.json` no llegaba a la base: se sembraba
 * la de `SKELETONS`. Seis programas tenían en el JSON un texto mejor (y real) y
 * el catálogo seguía prometiendo otro (Glúteo + Tonificación decía «Bodyweight
 * + ligas» y pide también silla, escalón y toalla). Ahora el catálogo lleva el
 * texto correcto y esta migración de DATOS lo pone en las filas que ya existen
 * en producción: arreglar el JSON o el catálogo no llega a prod por sí solo.
 *
 * Re-ejecutable y respetuosa: solo toca una fila oficial si su `description.es`
 * sigue siendo la vieja, así que no pisa una edición posterior. SQL crudo con
 * `json_extract`, como 1790730000: nada de hooks por fila. No toca
 * `content_hash`: la siguiente resiembra de ese programa verá el hash distinto
 * y reescribirá el contenido, que es lo correcto.
 */
migrate((app) => {
  const TAG = "[1790740000 program descriptions 761]"

  const FIXES = [
      {
          "slug": "avanzado-volumen",
          "from": "6 días/sem. Hipertrofia de alta frecuencia con movimientos avanzados (planche, front lever progresiones).",
          "es": "6 días/sem. Hipertrofia de alta frecuencia PPL×2 con progresión real de planche y front lever. Tempo controlado, descarga en las semanas 4 y 8.",
          "en": "6 days/week. High-frequency PPL×2 hypertrophy with real planche and front lever progression. Controlled tempo, deload in weeks 4 and 8."
      },
      {
          "slug": "handstand-roadmap",
          "from": "Pino libre desde cero. Pared, equilibrio y progresión diaria.",
          "es": "Pino libre desde cero. Pared, equilibrio y progresión en tres sesiones semanales.",
          "en": "Freestanding handstand from zero. Wall work, balance and progression in three weekly sessions."
      },
      {
          "slug": "planche-roadmap",
          "from": "Progresión hacia planche. Tuck → straddle → full. Requiere base avanzada.",
          "es": "Progresión de brazo recto hacia el planche: de la báscula (lean) al tuck planche y los primeros intentos de advanced tuck. Straddle y full planche son metas de años, no de este bloque.",
          "en": "Straight-arm progression toward the planche: from the lean to the tuck planche and first attempts at the advanced tuck. Straddle and full planche are multi-year goals, not part of this block."
      },
      {
          "slug": "mujer-gluteo-tonificacion",
          "from": "Programa femenino 4 días/sem. Glúteo, piernas y tonificación de tren superior. Bodyweight + ligas.",
          "es": "Programa de 12 semanas centrado en glúteo y piernas, con tirón y empuje suficientes para tonificar el tren superior y sostener la postura. 4 días/semana. Necesitas una banda elástica, una silla o banco estable, un escalón bajo y una toalla.",
          "en": "12-week program centered on glutes and legs, with enough pulling and pushing to tone the upper body and support posture. 4 days/week. You need a resistance band, a sturdy chair or bench, a low step and a towel."
      },
      {
          "slug": "mujer-full-body-toning",
          "from": "Tonificación balanceada para mujeres. 4 días/sem, solo peso corporal. Ideal para principiantes.",
          "es": "Tonificación de cuerpo completo en 12 semanas sin material de gimnasio: una toalla, una puerta y una silla. Cada semana reparte empuje, tirón con carga real, piernas con glúteo e isquio, y core, en volumen suficiente para generar cambios reales.",
          "en": "12 weeks of full-body toning with no gym equipment: a towel, a door and a chair. Each week spreads push, loaded pull, legs with glutes and hamstrings, and core, at enough volume to drive real change."
      },
      {
          "slug": "mujer-fuerza-funcional",
          "from": "Fuerza real para mujeres: dominadas, dips y core fuerte. 4 días/sem. Requiere barra.",
          "es": "12 semanas de entrenamiento en calistenia enfocado en fuerza funcional. Dominamos el pull-up y el dip, construimos un core de hierro y ganamos potencia en las piernas. Diseñado para mujeres intermedias que buscan fuerza real, no solo tonificación.",
          "en": "12-week calisthenics program focused on functional strength. We master the pull-up and the dip, build an iron core and gain leg power. Designed for intermediate women who want real strength, not just toning."
      }
  ]

  try {
    let fixed = 0
    for (const f of FIXES) {
      const res = app.db()
        .newQuery(
          "UPDATE programs SET description = {:description} WHERE slug = {:slug} " +
          "AND is_official = 1 AND json_extract(description, '$.es') = {:from}"
        )
        .bind({
          description: JSON.stringify({ es: f.es, en: f.en }),
          slug: f.slug,
          from: f.from,
        })
        .execute()
      fixed += res.rowsAffected()
    }
    console.log(TAG + " " + fixed + " de " + FIXES.length + " descripciones actualizadas")
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar; si falla, las
    // fichas siguen como hasta hoy.
    console.log(TAG + " FALLO:", err)
  }
}, (app) => {
  // Sin vuelta atrás: no hay instantánea de la ficha anterior que valga la pena.
})
