#!/usr/bin/env node
/**
 * Prepara «Intermedio – Balance Total» para el E2E de CI.
 *
 * Desde #740 Balance Total es un programa curado más: vive en
 * `programs/intermedio-balance-total.json` + `SKELETONS` y lo siembra la
 * migración `1786100000_seed_official_programs.js` al arrancar PocketBase. Este
 * script ya NO crea el programa (antes lo creaba desde `intermedio_balance_total.json`,
 * con claves de hueco en vez de ids de catálogo, y quedó fuera de la resiembra,
 * del validador de contenido y de la auditoría).
 *
 * Lo único que le queda: comprobar que la migración lo sembró (si no, el job de
 * CI falla aquí y no con un smoke E2E críptico) y marcarlo `is_featured`, como
 * lo está en producción. La siembra deja `is_featured: false` en todos los
 * programas porque ningún otro del catálogo es destacado.
 *
 * Uso:
 *   node scripts/seed-program.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 */

const PB_URL = process.argv[2];
const SU_EMAIL = process.argv[3];
const SU_PASSWORD = process.argv[4];
const SLUG = "intermedio-balance-total";

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error("Usage: node scripts/seed-program.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>");
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  });
  const authH = { Authorization: `Bearer ${auth.token}` };

  const found = await api(
    `/api/collections/programs/records?perPage=1&filter=${encodeURIComponent(`slug = ${JSON.stringify(SLUG)} && is_official = true`)}`,
    { headers: authH },
  );
  const program = found.items?.[0];
  if (!program) {
    throw new Error(
      `No hay un programa oficial con slug "${SLUG}": la migración de siembra ` +
      `(pb_migrations/1786100000_seed_official_programs.js) no lo creó.`,
    );
  }

  if (!program.is_featured) {
    await api(`/api/collections/programs/records/${program.id}`, {
      method: "PATCH",
      headers: authH,
      body: JSON.stringify({ is_featured: true }),
    });
  }
  console.log(`✓ Balance Total listo (${program.id}), destacado.`);
}

main().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
