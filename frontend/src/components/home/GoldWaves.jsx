import { useId } from 'react'
import { cn } from '../../utils/cn'

// Flowing gold light lines (decorative, behind content, never clickable). Each line fades in and out at the
// ends; a blurred copy of the brightest lines gives the soft glow. `flip` mirrors it horizontally.
const LINES = [
  {
    d: 'M0 250 C 260 210, 420 330, 700 300 S 1180 150, 1600 70',
    w: 2.2,
    o: 1,
    glow: true,
  },
  {
    d: 'M0 268 C 280 232, 440 344, 720 316 S 1200 172, 1600 96',
    w: 1.2,
    o: 0.75,
  },
  {
    d: 'M0 286 C 300 256, 470 358, 740 332 S 1220 196, 1600 124',
    w: 0.9,
    o: 0.55,
  },
  {
    d: 'M0 304 C 320 280, 500 372, 760 350 S 1240 220, 1600 152',
    w: 0.7,
    o: 0.4,
  },
  {
    d: 'M0 322 C 340 304, 530 386, 780 368 S 1260 246, 1600 182',
    w: 0.6,
    o: 0.28,
  },
]

export default function GoldWaves({ className, flip = false }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox="0 0 1600 400"
      preserveAspectRatio="none"
      className={cn('pointer-events-none select-none', flip && '-scale-x-100', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d4a63a" stopOpacity="0" />
          <stop offset="18%" stopColor="#e8bc55" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#f7d477" stopOpacity="0.35" />
          <stop offset="80%" stopColor="#f7d477" stopOpacity="1" />
          <stop offset="100%" stopColor="#d4a63a" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      {LINES.filter((l) => l.glow).map((l) => (
        <path key={`g${l.d}`} d={l.d} fill="none" stroke={`url(#${id}-line)`} strokeWidth="10" opacity="0.55" filter={`url(#${id}-blur)`} />
      ))}
      {LINES.map((l) => (
        <path key={l.d} d={l.d} fill="none" stroke={`url(#${id}-line)`} strokeWidth={l.w} opacity={l.o} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
