/**
 * Visuales de `/features/races`.
 *
 * Son mocks HTML/CSS, no capturas. Dos razones, y la segunda pesa más que la
 * primera: el hero tiene que ser nítido a cualquier ancho, y una captura real
 * de una carrera lleva encima un mapa con una polilínea que empieza y acaba en
 * el portal de casa de alguien. Aquí no hay ni un dato real.
 *
 * Reproducen las pantallas del producto —`apps/web/src/components/race/
 * RaceLobby.tsx`, `RaceCountdown.tsx`, `RaceLive.tsx` y `RaceResults.tsx`— con
 * el vocabulario de la app (`race.*`), no con textos inventados.
 *
 * `BeyondVisual` se deja en paz: la landing sigue usando `index={2}` para
 * carreras (`apps/web/src/pages/LandingPage.tsx:204`) y el registro lo conserva
 * como fallback.
 */
import { useTranslation } from 'react-i18next'
import { PhoneFrame } from '../../components/landing/featureSections'

/**
 * Corredores de ejemplo. Los nombres son literales a propósito: son nombres
 * propios, iguales en los dos idiomas, y ya se usan en el panel de la landing.
 * `you` marca la fila propia, que va en lima como en el producto.
 */
const RUNNERS = [
  { name: 'Ana', km: '4.12', pace: '5:38', time: '23:14', you: false },
  { name: 'Leo', km: '3.87', pace: '5:52', time: '22:44', you: true },
  { name: 'Mar', km: '3.40', pace: '6:19', time: '21:29', you: false },
] as const

/**
 * Hero y S4: la clasificación en vivo con el tiempo restante.
 *
 * Se reutiliza en la sección de anatomía de la tabla, así que las cabeceras
 * salen de las mismas claves que describe la tabla de columnas (`board*Name`):
 * si alguien renombra una columna en el copy, el mock la renombra con ella.
 */
export function RaceBoardPanel() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.races.${s}`)

  return (
    <div
      role="img"
      aria-label={k('heroAlt')}
      className="w-full max-w-sm border border-white/10 bg-[hsl(75_6%_6%)] shadow-2xl shadow-black/40"
    >
      <div className="flex items-baseline justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-lime">{k('mockRaceName')}</p>
          <p className="mt-1.5 font-bebas text-2xl leading-none tracking-wide">5 km</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[.16em] text-white/35">{t('race.remaining')}</p>
          <p className="mt-1 font-mono text-sm text-white/80">02:15:33</p>
        </div>
      </div>

      {/* Las cinco columnas, las mismas que describe la tabla de S4: enseñar
          solo cuatro dejaría la ilustración contradiciendo al texto de al lado. */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-white/8">
            {[
              ['board1Name', 'w-7 px-2 text-center'],
              ['board2Name', 'px-2'],
              ['board3Name', 'px-2 text-right'],
              ['board4Name', 'px-2 text-right'],
              ['board5Name', 'px-3 text-right'],
            ].map(([key, cls]) => (
              <th key={key} scope="col" className={`py-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/30 ${cls}`}>
                {k(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RUNNERS.map((runner, i) => (
            <tr key={runner.name} className={runner.you ? 'bg-lime/[.07]' : ''}>
              <td className="px-2 py-3 text-center font-mono text-xs text-white/40">{i + 1}</td>
              <td className="px-2 py-3">
                <span className={`text-sm ${runner.you ? 'font-semibold text-lime' : 'text-white/80'}`}>{runner.name}</span>
                {i === 0 ? (
                  <span className="ml-1.5 border border-amber-400/30 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[.1em] text-amber-300">
                    {t('race.leader')}
                  </span>
                ) : null}
                {runner.you ? <span className="ml-1.5 font-mono text-[9px] tracking-widest text-lime/70">{k('mockYou')}</span> : null}
              </td>
              <td className="px-2 py-3 text-right font-mono text-[11px] text-white/45">{runner.pace}</td>
              <td className="px-2 py-3 text-right font-mono text-[11px] text-white/45">{runner.time}</td>
              <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-white/75">{runner.km}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** S2 · paso 1 (`waiting`): quién se ha unido y los botones de la sala. */
export function LobbyMock() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.races.${s}`)

  return (
    <PhoneFrame width={264}>
      <div role="img" aria-label={k('life1Alt')} className="px-5 pb-7 pt-5">
        <p className="text-center text-[10px] uppercase tracking-[.18em] text-white/40">{t('race.lobby')}</p>
        <h4 className="mt-3 text-center font-bebas text-3xl leading-none tracking-wide">{k('mockRaceName')}</h4>
        <p className="mt-1.5 text-center font-bebas text-xl leading-none tracking-wide text-lime">5 km</p>

        <p className="mt-5 text-[9px] uppercase tracking-[.2em] text-white/35">{t('race.participants')} (3)</p>
        <ul className="mt-2.5 grid gap-1.5">
          {RUNNERS.map((runner, i) => (
            <li
              key={runner.name}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                runner.you ? 'border-lime/30 bg-lime/[.06]' : 'border-white/10 bg-white/[.03]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 place-items-center rounded-full font-bebas text-[11px] ${
                  runner.you ? 'bg-lime/20 text-lime' : 'bg-white/8 text-white/50'
                }`}
              >
                {runner.name.charAt(0)}
              </span>
              <span className="flex-1 text-xs text-white/80">{runner.name}</span>
              {i === 2 ? (
                <span className="rounded bg-lime/10 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-lime">
                  {t('race.ready').toUpperCase()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg bg-lime py-2.5 text-center font-bebas text-base tracking-[.12em] text-[hsl(75_8%_5%)]">
          {t('race.join')}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center font-bebas text-xs tracking-[.12em] text-white/55">
          <span className="rounded-lg border border-white/12 py-2">{t('race.share')}</span>
          <span className="rounded-lg border border-white/12 py-2">{t('race.showQR').toUpperCase()}</span>
        </div>
      </div>
    </PhoneFrame>
  )
}

/**
 * S2 · paso 2 (`countdown`). La pantalla real dura 7 s y es un dígito enorme:
 * `RaceCountdown.tsx` lo pinta a 140 px en lima. Una captura no aportaría nada.
 */
export function CountdownMock() {
  const { t } = useTranslation()
  return (
    <PhoneFrame width={264}>
      <div
        role="img"
        aria-label={t('feature.races.life2Alt')}
        className="grid h-[300px] place-items-center px-5"
      >
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[.28em] text-white/40">{t('race.startingSoon')}</p>
          <p className="mt-3 font-bebas text-[7rem] leading-none text-lime">3</p>
        </div>
      </div>
    </PhoneFrame>
  )
}

/** S2 · paso 3 (`active`): stats propias, progreso al objetivo y clasificación. */
export function LiveMock() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.races.${s}`)

  return (
    <PhoneFrame width={264}>
      <div role="img" aria-label={k('life3Alt')} className="px-5 pb-7 pt-5">
        <div className="grid grid-cols-3 divide-x divide-white/10 border-y border-white/10">
          {[['3.87', t('race.km')], ['22:44', t('race.time')], ['5:52', t('race.pace')]].map(([value, label]) => (
            <div key={label} className="py-3 text-center">
              <p className="font-bebas text-xl leading-none tracking-wide">{value}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[.14em] text-white/40">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between font-mono text-[10px] text-white/45">
            <span>3.87 / 5.00 km</span>
            <span>77%</span>
          </div>
          <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/8">
            <span className="block h-full rounded-full bg-lime" style={{ width: '77%' }} />
          </span>
        </div>

        <ul className="mt-4 grid gap-1.5">
          {RUNNERS.map((runner, i) => (
            <li
              key={runner.name}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${
                runner.you ? 'bg-lime/[.08] text-white' : 'bg-white/[.03] text-white/65'
              }`}
            >
              <span className="font-mono text-[10px] text-white/35">{i + 1}</span>
              <span className="flex-1">{runner.name}</span>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-lime"
              />
              <span className="font-mono text-[10px] tabular-nums text-white/70">{runner.km}</span>
            </li>
          ))}
        </ul>
      </div>
    </PhoneFrame>
  )
}

/** S2 · paso 4 (`finished`): ganador, clasificación completa y el DNF al final. */
export function ResultsMock() {
  const { t } = useTranslation()
  const k = (s: string) => t(`feature.races.${s}`)
  const rows: Array<[string, string, boolean]> = [
    ['Ana', '5.00', false],
    ['Leo', '5.00', false],
    ['Mar', '3.40', true],
  ]

  return (
    <PhoneFrame width={264}>
      <div role="img" aria-label={k('life4Alt')} className="px-5 pb-7 pt-5">
        <p className="text-center text-3xl" aria-hidden="true">🏆</p>
        <p className="mt-3 text-center text-[9px] uppercase tracking-[.2em] text-white/35">{t('race.winner')}</p>
        <p className="mt-1 text-center font-bebas text-3xl leading-none tracking-wide text-lime">Ana</p>
        <p className="mt-1.5 text-center font-mono text-[11px] text-white/45">28:12 · 5.00 km</p>

        <ol className="mt-5 grid gap-1.5">
          {rows.map(([name, km, dnf], i) => (
            <li
              key={name}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs ${
                dnf ? 'border-white/8 text-white/30' : 'border-white/12 text-white/75'
              }`}
            >
              <span className="font-mono text-[10px] text-white/35">{i + 1}</span>
              <span className="flex-1">{name}</span>
              {dnf ? (
                <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[8px] tracking-widest">
                  {t('race.dnf')}
                </span>
              ) : null}
              <span className="font-mono text-[10px] tabular-nums">{km}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-lg bg-lime py-2.5 text-center font-bebas text-sm tracking-[.1em] text-[hsl(75_8%_5%)]">
          {t('race.saveAsWorkout').toUpperCase()}
        </div>
        <p className="mt-2.5 text-center font-mono text-[10px] tracking-widest text-white/40">
          {t('race.exportGpx').toUpperCase()}
        </p>
      </div>
    </PhoneFrame>
  )
}
