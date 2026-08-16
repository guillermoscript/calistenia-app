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
 * diferencia entre '🥇' y '', así que el único guardarraíl posible es leer los
 * ficheros como TEXTO y comprobar los bytes — igual que hace el guard de claves
 * duplicadas de los locales (#379).
 *
 * Mientras la constante siga duplicada en seis sitios, este test los vigila a
 * todos. Cuando se unifique en `packages/core` (la otra mitad de #455), esto se
 * sustituye por un test normal sobre la constante exportada.
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

const DECLARATION = /const MEDALS = \[([^\]]*)\]/

describe('medallas del ranking (#455)', () => {
  for (const file of FILES) {
    it(`${file} declara las tres medallas`, () => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')
      const match = source.match(DECLARATION)
      expect(match, `no se encontró "const MEDALS = [...]" en ${file}`).not.toBeNull()

      const medals = match![1]
        .split(',')
        .map(entry => entry.trim().replace(/^['"]|['"]$/g, ''))

      expect(medals).toEqual(['🥇', '🥈', '🥉'])
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
