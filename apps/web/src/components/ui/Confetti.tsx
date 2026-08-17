/**
 * Lluvia de confeti para los finales: sesión terminada, circuito terminado.
 *
 * Las piezas se sortean una vez y viven en un `useRef`, no en el render: si se
 * recalcularan, cada re-render las movería de sitio a mitad de caída. La animación es
 * CSS pura y `forwards`, así que el componente no necesita saber cuándo acaba —
 * quien lo monta decide cuánto tiempo se queda.
 */
import { useRef } from 'react'

const CONFETTI_COLORS = ['#c8f542', '#42c8f5', '#f54242', '#f5c842', '#f542c8', '#42f5a8']
const CONFETTI_COUNT = 22

interface ConfettiPiece {
  id: number
  left: string
  size: number
  color: string
  delay: string
  dur: string
  rot: number
  shape: string
}

export default function Confetti() {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${(Math.random() * 1.4).toFixed(2)}s`,
      dur: `${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      rot: Math.floor(Math.random() * 360),
      shape: Math.random() > 0.5 ? '50%' : '2px',
    })),
  ).current

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {/* z-9998: por encima del panel post-entreno, que es lo que la sesión necesita. */}
      <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden" aria-hidden>
        {pieces.map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.left,
              top: -30,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.shape,
              transform: `rotate(${p.rot}deg)`,
              animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>
    </>
  )
}
