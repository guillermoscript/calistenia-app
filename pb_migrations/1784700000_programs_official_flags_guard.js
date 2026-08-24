/// <reference path="../pb_data/types.d.ts" />

/**
 * #600 — `programs`: cualquiera podía auto-marcarse `is_official`/`is_featured`
 * y vaciar `created_by` por POST/PATCH directo.
 *
 * Las reglas vivas solo miraban la propiedad de la fila, nunca el contenido del
 * body, así que el único freno para publicar como "oficial" era `canPublishOfficial`
 * en el cliente (`apps/web/src/pages/ProgramEditorPage.tsx`). Un curl lo saltaba:
 * badge «OFICIAL» falsificable y orden privilegiado en el catálogo. Y como el
 * `deleteRule` es `created_by = @request.auth.id`, vaciar `created_by` en un
 * update dejaba el programa huérfano e imborrable salvo por superusuario.
 *
 * Esta migración SOLO reescribe reglas: no toca campos, así que no hay `field.id`
 * que preservar ni datos que migrar.
 *
 * Sigue el precedente de `challenges` (1783000000:34) para las banderas y el de
 * `1781600000_harden_create_rules_per_user.js:38` para el campo de propiedad, con
 * una diferencia deliberada respecto al `:isset = false` a secas de `challenges`:
 * hay clientes legítimos que mandan el valor inocuo y romperían con la guarda pura.
 *
 *   - `duplicateProgram` (packages/core/hooks/usePrograms.ts:456-457) manda
 *     explícitamente `is_official: false` e `is_featured: false` al crear la copia.
 *   - `saveProgram` (packages/core/hooks/useProgramEditor.ts:548) manda
 *     `is_official: true` al editar un programa que YA es oficial.
 *
 * Por eso el create acepta además el `= false` explícito, y el update acepta el
 * eco del valor que ya tiene la fila (`@request.body.is_official = is_official`):
 * permiten el no-op sin permitir el cambio. Subir la bandera sigue siendo
 * exclusivo de `admin`/`editor`.
 *
 * Las reglas van literales DENTRO de cada callback a propósito: el JSVM de PB no
 * garantiza que el scope del módulo llegue al callback, y una constante que sale
 * `undefined` aquí borraría la regla en silencio.
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("programs")

  // Un usuario sin rol puede crear su programa mientras el body no ENCIENDA las
  // banderas de curación; admin/editor no tienen restricción.
  programs.createRule = '@request.auth.id != "" && @request.body.created_by = @request.auth.id && (' +
    '@request.auth.role = "admin" || @request.auth.role = "editor" || (' +
      '(@request.body.is_official:isset = false || @request.body.is_official = false) && ' +
      '(@request.body.is_featured:isset = false || @request.body.is_featured = false)' +
    ')' +
  ')'

  // El dueño puede seguir editando su programa mientras el body no CAMBIE las
  // banderas ni la propiedad de la fila; admin/editor no tienen restricción.
  programs.updateRule = '@request.auth.id != "" && (' +
    '@request.auth.role = "admin" || @request.auth.role = "editor" || (' +
      'created_by = @request.auth.id && ' +
      '(@request.body.is_official:isset = false || @request.body.is_official = is_official) && ' +
      '(@request.body.is_featured:isset = false || @request.body.is_featured = is_featured) && ' +
      '(@request.body.created_by:isset = false || @request.body.created_by = @request.auth.id)' +
    ')' +
  ')'

  app.save(programs)
}, (app) => {
  try {
    const programs = app.findCollectionByNameOrId("programs")
    // Reglas anteriores: 1774000057:17 y 1774000027:20.
    programs.createRule = '@request.auth.id != "" && @request.body.created_by = @request.auth.id'
    programs.updateRule = '@request.auth.id != "" && (created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
    app.save(programs)
  } catch (e) {}
})
