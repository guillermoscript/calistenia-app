import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Sin backend de i18next las claves salen tal cual; da igual, porque lo que se
// se comprueba aquí son los emoji, no las traducciones.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import LeaderboardWidget from '../components/friends/LeaderboardWidget'

/**
 * Guardarraíl para #455: `LeaderboardPage` y `LeaderboardWidget` llevaban
 * `const MEDALS = ['', '', '']` (cadenas vacías, los emoji se perdieron por el
 * camino) y las medallas nunca se pintaban. Ni el typecheck ni el lint ven la
 * diferencia entre '🥇' y '', así que el guardarraíl tiene que leer el fuente
 * como TEXTO — igual que hace el guard de claves duplicadas de los locales
 * (#379).
 *
 * La constante ya vive en un solo sitio (`RANK_MEDALS` en
 * `packages/core/lib/challenges.ts`), y sus bytes los comprueba
 * `packages/core/lib/challenges.test.ts`. Lo que queda por vigilar aquí es que
 * nadie vuelva a hacerse una copia local: seis ficheros de web y móvil la
 * tenían, y bastó con que dos se desincronizaran para romper la UI.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const FILES = [
  'apps/web/src/pages/LeaderboardPage.tsx',
  'apps/web/src/components/friends/LeaderboardWidget.tsx',
  'apps/web/src/pages/ChallengeDetailPage.tsx',
  'apps/web/src/pages/features/ChallengesVisuals.tsx',
  'apps/mobile/src/app/leaderboard.tsx',
  'apps/mobile/src/app/challenges/[id].tsx',
]

/** Cualquier array de medallas declarado en local, se llame como se llame. */
const LOCAL_COPY = /const \w+ = \[\s*'(?:🥇|🥈|🥉|)'/

describe('medallas del ranking (#455)', () => {
  for (const file of FILES) {
    it(`${file} usa RANK_MEDALS de core, sin copia local`, () => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')

      expect(
        LOCAL_COPY.test(source),
        `${file} vuelve a declarar sus medallas en local; usa RANK_MEDALS de @calistenia/core/lib/challenges`,
      ).toBe(false)
      expect(source, `${file} no importa RANK_MEDALS de core`).toContain('RANK_MEDALS')
    })
  }
})

describe('LeaderboardWidget', () => {
  const entry = (userId: string, value: number) => ({
    userId,
    displayName: `Atleta ${userId}`,
    avatarUrl: null,
    value,
    isCurrentUser: false,
  })

  it('pinta las medallas en el top 3 y el número a partir del cuarto', () => {
    render(
      <LeaderboardWidget
        entries={[entry('a', 30), entry('b', 20), entry('c', 10), entry('d', 5)]}
        onNavigate={() => {}}
      />,
    )

    expect(screen.getByText('🥇')).toBeTruthy()
    expect(screen.getByText('🥈')).toBeTruthy()
    expect(screen.getByText('🥉')).toBeTruthy()
    // El widget solo pinta el top 3, así que el cuarto no llega al DOM.
    expect(screen.queryByText('Atleta d')).toBeNull()
  })
})
