/**
 * Guardarrail: todo handler `onRecord*` de `pb_hooks/` encadena con `e.next()`.
 * Issue #457.
 *
 * POR QUE EXISTE. Los hooks de PocketBase son una cadena tipo middleware: un
 * handler que no llama a `e.next()` corta la cadena, y los handlers que OTROS
 * ficheros registraron para esa misma coleccion no corren jamas — sin un solo
 * error en el log. Se descubrio en #412, cuando los tres handlers de
 * `workout_stats.pb.js` llevaban tiempo sin ejecutarse porque
 * `notification_service.pb.js` se cargaba antes por orden alfabetico. No hay
 * nada en PocketBase que lo detecte y ningun test de integracion lo ve: el
 * sintoma es la AUSENCIA de un side effect que nadie sabe que deberia ocurrir.
 *
 * Es un test ESTATICO: lee los `.pb.js` como texto y no necesita PocketBase, asi
 * que tambien corre suelto con `node --test tests/pb_hooks/hook_chain.test.mjs`.
 * No hay parser de JS disponible aqui (esta suite no añade dependencias, ver
 * README.md), asi que el escaneo es a mano — de ahi el chequeo de cordura de
 * `blankNonCode`: si el escaner pierde el hilo, este test falla en vez de
 * aprobar en silencio lo que no ha sabido leer.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HOOKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../pb_hooks")

/** Registros que exigen encadenado. Los `.pb.js` de hoy solo usan `onRecord*`. */
const REGISTRATION_RE = /(?:^|[^\w.$])(onRecord[A-Za-z0-9]*)\s*\(/g

/**
 * Un `/` abre un literal regex (y no es una division) si el ultimo caracter de
 * codigo significativo es uno de estos, o si no hay ninguno (principio del
 * fichero). Hace falta porque `race_og_tags.pb.js` tiene `.replace(/"/g, ...)`:
 * sin esto, esa comilla abriria un "string" que se comeria el resto del fichero.
 */
const REGEX_CAN_FOLLOW = new Set([..."(,=:[!&|?{};+-*%~^<>", ""])

/**
 * Devuelve `src` con comentarios, contenido de strings y literales regex
 * sustituidos por espacios. Conserva longitud y saltos de linea, asi que los
 * offsets y los numeros de linea del resultado valen para el original.
 */
function blankNonCode(src) {
  const out = src.split("")
  const blank = (i) => { if (src[i] !== "\n") out[i] = " " }
  let i = 0

  // Ultimo caracter de codigo ya emitido, saltando espacios (los huecos que
  // dejan comentarios y strings ya blanqueados cuentan como espacio).
  const prevCode = () => {
    for (let j = i - 1; j >= 0; j--) {
      const c = out[j]
      if (c !== " " && c !== "\n" && c !== "\t" && c !== "\r") return c
    }
    return ""
  }

  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]

    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") blank(i++)
    } else if (c === "/" && d === "*") {
      blank(i++); blank(i++)
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) blank(i++)
      if (i < src.length) { blank(i++); blank(i++) }
    } else if (c === "/" && REGEX_CAN_FOLLOW.has(prevCode())) {
      i++ // deja la barra de apertura como codigo
      let inClass = false
      while (i < src.length) {
        if (src[i] === "\\") { blank(i++); blank(i++); continue }
        if (src[i] === "[") inClass = true
        else if (src[i] === "]") inClass = false
        else if (src[i] === "/" && !inClass) { i++; break }
        else if (src[i] === "\n") break // regex sin cerrar: no lo era
        blank(i++)
      }
    } else if (c === '"' || c === "'" || c === "`") {
      i++ // deja la comilla de apertura como codigo
      while (i < src.length) {
        if (src[i] === "\\") { blank(i++); blank(i++); continue }
        if (src[i] === c) { i++; break }
        blank(i++)
      }
    } else {
      i++
    }
  }

  return out.join("")
}

const lineOf = (src, offset) => src.slice(0, offset).split("\n").length

/**
 * Desde el `(` de la llamada, extrae el nombre del primer parametro del callback
 * y el cuerpo `{...}` casando llaves. Devuelve `null` si no reconoce la forma —
 * quien llama lo trata como fallo, no como aprobado.
 */
function parseHandler(code, openParen) {
  const head = code.slice(openParen + 1)
  // `(e) => {`, `e => {`, `function (e) {`, `function name(e) {`, con `async`.
  const shape = /^\s*(?:async\s+)?(?:function\s*[\w$]*\s*)?\(?\s*([\w$]+)\s*[\w$,\s]*\)?\s*(?:=>\s*)?\{/.exec(head)
  if (!shape) return null

  const bodyStart = openParen + 1 + shape[0].length - 1 // indice de la `{`
  let depth = 0
  for (let i = bodyStart; i < code.length; i++) {
    if (code[i] === "{") depth++
    else if (code[i] === "}" && --depth === 0) {
      return { param: shape[1], body: code.slice(bodyStart + 1, i) }
    }
  }
  return null
}

const hookFiles = readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".pb.js")).sort()

test("hay ficheros de hooks que escanear", () => {
  assert.ok(hookFiles.length > 0, `no se encontro ningun .pb.js en ${HOOKS_DIR}`)
})

for (const file of hookFiles) {
  const raw = readFileSync(join(HOOKS_DIR, file), "utf8")
  const code = blankNonCode(raw)

  test(`${file}: el escaner no pierde el hilo`, () => {
    // Cordura: todo registro que empieza en columna 0 en el fuente ORIGINAL
    // sigue intacto tras blanquear. Si `blankNonCode` se descarrilo (un regex
    // con comillas dentro, un backtick raro), aqui salta — en vez de dejar de
    // ver registros y dar el fichero por bueno.
    const rawStarts = [...raw.matchAll(/^on[A-Z][A-Za-z0-9]*\s*\(/gm)].map((m) => m.index)
    for (const at of rawStarts) {
      assert.equal(
        code.slice(at, at + 20), raw.slice(at, at + 20),
        `${file}:${lineOf(raw, at)} el escaner blanqueo un registro real; ` +
        "revisa blankNonCode antes de fiarte de este test"
      )
    }
  })

  test(`${file}: cada handler onRecord* llama a e.next()`, () => {
    REGISTRATION_RE.lastIndex = 0
    for (const m of code.matchAll(REGISTRATION_RE)) {
      const hook = m[1]
      const openParen = m.index + m[0].length - 1
      const where = `${file}:${lineOf(raw, openParen)} (${hook})`

      const parsed = parseHandler(code, openParen)
      assert.ok(
        parsed,
        `${where}: no he sabido leer el callback. Si es una forma nueva ` +
        "(callback fuera de la llamada, etc.) hay que enseñarsela a parseHandler; " +
        "un guardarrail que aprueba lo que no entiende no vale nada."
      )

      const { param, body } = parsed
      const chains = new RegExp(`\\b${param}\\.next\\s*\\(\\s*\\)`).test(body)
      assert.ok(
        chains,
        `${where}: el handler no llama a ${param}.next(), asi que corta la cadena ` +
        "de hooks: los handlers que otros .pb.js registren para esa misma " +
        "coleccion no correran nunca, y no habra ni un error en el log (#412, #457)."
      )

      // En los `After*Success`, ademas, al PRINCIPIO: son post-hoc (el registro
      // ya esta guardado, no hay nada que validar) y casi todos tienen `return`
      // tempranos, que se saltarian un `e.next()` puesto al final.
      //
      // Los hooks *previos* (`onRecordCreate`, `onRecordCreateRequest`,
      // `onRecordEnrich`) van al reves a proposito: comprueban primero y
      // encadenan al final, abortando con `throw` cuando toca — encadenar antes
      // de validar dejaria pasar la operacion. Ver `block_guards.pb.js:10-33`.
      if (/After[A-Za-z]*Success$/.test(hook)) {
        const first = body.replace(/^[\s;]+/, "")
        assert.ok(
          new RegExp(`^${param}\\.next\\s*\\(\\s*\\)`).test(first),
          `${where}: ${param}.next() no es la primera sentencia del cuerpo. ` +
          "En un hook After*Success no hay nada que comprobar antes, y un " +
          "`return` temprano por medio corta la cadena igual."
        )
      }
    }
  })
}
