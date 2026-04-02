/// <reference path="../pb_data/types.d.ts" />

/**
 * NO-OP — original i18n migration was broken (dropped columns, lost data).
 * Superseded by 1774378005 + 1774378015. Kept so PocketBase doesn't
 * complain about a missing migration file.
 */
migrate(
  (app) => { /* no-op */ },
  (app) => { /* no-op */ }
)
