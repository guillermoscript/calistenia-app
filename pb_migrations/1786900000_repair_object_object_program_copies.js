/// <reference path="../pb_data/types.d.ts" />

/**
 * Repara los programas copiados que se quedaron con el nombre literal
 * «[object Object] (copia)» (#692).
 *
 * QUÉ PASÓ
 *
 * Antes de #622 (2026-08-24) «Duplicar programa» concatenaba el sufijo sobre
 * `programs.name` como si fuera una cadena, y `name` ya era json i18n
 * `{es,en}`: `${name} (copia)` → «[object Object] (copia)». El cliente está
 * arreglado desde entonces (`duplicatedName` en `packages/core/lib/i18n-db.ts`),
 * pero las copias hechas antes siguen en producción con ese nombre y son
 * PÚBLICAS, así que se ven en el catálogo de todo el mundo.
 *
 * REGLA
 *
 * Para cada programa cuyo `name` contenga «[object Object]»:
 * 1. Se calcula la firma de su contenido (multiconjunto de `exercise_name.es`
 *    de sus `program_exercises`) y se busca un programa OFICIAL con la misma
 *    firma exacta. Si lo hay, la copia recupera «<nombre del oficial> (copia)»
 *    en cada idioma y, si `forked_from` está vacío, se acredita al oficial
 *    (#620: la relación nació después de estas copias).
 * 2. Si no hay ningún oficial idéntico, se llama «Programa copiado» /
 *    «Copied program»: no hay forma de saber de dónde salió.
 *
 * SQL crudo para no disparar los hooks de `programs` (contadores, avisos).
 * Re-ejecutable: en la segunda pasada no queda ningún «[object Object]».
 */
migrate((app) => {
  const TAG = "[repair_object_object_program_copies]"
  const SUFFIX = { es: " (copia)", en: " (copy)" }
  const FALLBACK = { es: "Programa copiado", en: "Copied program" }

  function parseJson(raw) {
    if (!raw) return null
    try { return JSON.parse(raw) } catch (e) { return raw }
  }
  function esOf(raw) {
    const v = parseJson(raw)
    if (v && typeof v === "object") return String(v.es || v.en || "")
    return String(v == null ? "" : v)
  }
  function norm(s) {
    return String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase()
  }

  try {
    const programs = arrayOf(new DynamicModel({ id: "", name: "", forked_from: "", is_official: false }))
    app.db().newQuery("SELECT id, name, forked_from, is_official FROM programs").all(programs)

    const broken = programs.filter((p) => String(p.name || "").indexOf("[object Object]") !== -1)
    if (broken.length === 0) {
      console.log(TAG + " nada que reparar")
      return
    }

    const exRows = arrayOf(new DynamicModel({ program: "", exercise_name: "" }))
    app.db().newQuery("SELECT program, exercise_name FROM program_exercises").all(exRows)

    const namesByProgram = {}
    for (const r of exRows) {
      if (!namesByProgram[r.program]) namesByProgram[r.program] = []
      namesByProgram[r.program].push(norm(esOf(r.exercise_name)))
    }
    function signature(programId) {
      const list = (namesByProgram[programId] || []).slice()
      list.sort()
      return list.length ? list.join("|") : null
    }

    const officialBySignature = {}
    for (const p of programs) {
      if (!p.is_official) continue
      if (String(p.name || "").indexOf("[object Object]") !== -1) continue
      const sig = signature(p.id)
      if (sig && !officialBySignature[sig]) officialBySignature[sig] = p
    }

    let restored = 0
    let generic = 0
    for (const p of broken) {
      const sig = signature(p.id)
      const origin = sig ? officialBySignature[sig] : null
      let name
      let forkedFrom = p.forked_from || ""
      if (origin) {
        const originName = parseJson(origin.name)
        name = {}
        if (originName && typeof originName === "object") {
          for (const loc in originName) {
            if (!Object.prototype.hasOwnProperty.call(originName, loc)) continue
            name[loc] = String(originName[loc]) + (SUFFIX[loc] || SUFFIX.es)
          }
        } else {
          name.es = String(originName) + SUFFIX.es
        }
        if (!forkedFrom) forkedFrom = origin.id
        restored++
      } else {
        name = { es: FALLBACK.es, en: FALLBACK.en }
        generic++
      }

      app.db()
        .newQuery("UPDATE programs SET name = {:name}, forked_from = {:forked} WHERE id = {:id}")
        .bind({ name: JSON.stringify(name), forked: forkedFrom, id: p.id })
        .execute()
      console.log(TAG + " " + p.id + " → " + JSON.stringify(name) + (origin ? " (origen " + origin.id + ")" : ""))
    }

    console.log(TAG + " " + restored + " copias con nombre recuperado, " + generic + " con nombre genérico")
  } catch (err) {
    console.log(TAG + " FALLO, copias sin renombrar:", err)
  }
}, (app) => {
  // Sin vuelta atrás: el nombre roto no tiene ningún valor que conservar.
})
