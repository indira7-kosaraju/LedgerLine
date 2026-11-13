import { useId } from 'react'

// Classical gold bank building for the homepage hero – pure SVG (no image download), scales to any width.
// Metallic look = horizontal gradients on the columns, lit top faces on the steps, a darker receding side face
// for depth, warm lit windows and a soft halo. Decorative only (aria-hidden).
const COLUMN_X = [125, 187, 249, 311, 373, 435]

export default function BankIllustration({ className }) {
  const id = useId().replace(/:/g, '')
  const g = (name) => `url(#${id}-${name})`

  return (
    <svg viewBox="0 0 560 420" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4a63a" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#9b7429" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#9b7429" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f7d477" stopOpacity="0" />
          <stop offset="35%" stopColor="#f7d477" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#e8bc55" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#d4a63a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-column`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a340f" />
          <stop offset="28%" stopColor="#f7d477" />
          <stop offset="48%" stopColor="#e8bc55" />
          <stop offset="78%" stopColor="#9b7429" />
          <stop offset="100%" stopColor="#2e2108" />
        </linearGradient>
        <linearGradient id={`${id}-goldV`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7d477" />
          <stop offset="55%" stopColor="#d4a63a" />
          <stop offset="100%" stopColor="#7a5a1d" />
        </linearGradient>
        <linearGradient id={`${id}-goldH`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9b7429" />
          <stop offset="40%" stopColor="#f7d477" />
          <stop offset="100%" stopColor="#b88a32" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5c4314" />
          <stop offset="100%" stopColor="#1c150a" />
        </linearGradient>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c160c" />
          <stop offset="100%" stopColor="#0c0a07" />
        </linearGradient>
        <linearGradient id={`${id}-roof`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6b4f1a" />
          <stop offset="100%" stopColor="#1f180c" />
        </linearGradient>
        <linearGradient id={`${id}-pediment`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2112" />
          <stop offset="100%" stopColor="#14100a" />
        </linearGradient>
        <linearGradient id={`${id}-window`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="60%" stopColor="#e8bc55" />
          <stop offset="100%" stopColor="#9b7429" />
        </linearGradient>
        <linearGradient id={`${id}-stepFront`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2c12" />
          <stop offset="100%" stopColor="#120e07" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* halo and ring */}
      <circle cx="300" cy="190" r="190" fill={g('halo')} />
      <path d="M128 230 A172 172 0 0 1 472 150" fill="none" stroke={g('ring')} strokeWidth="2.2" />
      <path d="M128 230 A172 172 0 0 1 472 150" fill="none" stroke="#f7d477" strokeOpacity="0.35" strokeWidth="8" filter={g('glow')} />

      {/* ground glow */}
      <ellipse cx="300" cy="376" rx="270" ry="26" fill="#d4a63a" opacity="0.28" filter={g('glow')} />

      {/* roof side + pediment */}
      <polygon points="280,58 326,40 522,108 475,128" fill={g('roof')} />
      <polygon points="85,128 280,58 475,128" fill={g('pediment')} />
      <polyline points="85,128 280,58 475,128" fill="none" stroke={g('goldH')} strokeWidth="4" strokeLinejoin="round" />
      <polygon points="122,122 280,72 438,122" fill="none" stroke="#b88a32" strokeOpacity="0.55" strokeWidth="1.5" />
      {/* emblem */}
      <g transform="translate(262 84)" fill={g('goldV')}>
        <path d="M18 0 2 8.5V11h32V8.5z" />
        <rect x="5" y="12.5" width="3.5" height="12" rx="0.6" />
        <rect x="12" y="12.5" width="3.5" height="12" rx="0.6" />
        <rect x="20.5" y="12.5" width="3.5" height="12" rx="0.6" />
        <rect x="27.5" y="12.5" width="3.5" height="12" rx="0.6" />
        <rect x="2" y="26" width="32" height="3.5" rx="0.8" />
      </g>

      {/* entablature */}
      <polygon points="475,124 522,106 522,132 465,154" fill={g('side')} />
      <rect x="85" y="124" width="390" height="7" fill={g('goldH')} />
      <rect x="95" y="131" width="370" height="21" fill={g('goldV')} />
      <rect x="95" y="141" width="370" height="2" fill="#5c4314" opacity="0.7" />

      {/* body: side wall, back wall, lit windows and door */}
      <polygon points="465,152 512,134 512,300 465,318" fill={g('side')} />
      {[474, 486, 498].map((x) => {
        const top = 196 - (x - 465) * 0.383 // follows the receding wall
        return <polygon key={x} points={`${x},${top} ${x + 7},${top - 2.7} ${x + 7},${top + 59} ${x},${top + 62}`} fill={g('window')} opacity="0.7" />
      })}
      <rect x="110" y="152" width="345" height="158" fill={g('wall')} />
      <g filter={g('soft')} opacity="0.55">
        <rect x="261" y="226" width="38" height="84" fill="#e8bc55" />
        {[150, 212, 342, 404].map((x) => (
          <rect key={x} x={x} y="196" width="20" height="62" fill="#e8bc55" />
        ))}
      </g>
      <rect x="263" y="228" width="34" height="82" rx="2" fill={g('window')} />
      <rect x="279" y="228" width="2" height="82" fill="#7a5a1d" />
      {[150, 212, 342, 404].map((x) => (
        <g key={x}>
          <rect x={x} y="196" width="20" height="62" rx="1.5" fill={g('window')} />
          <rect x={x + 9} y="196" width="2" height="62" fill="#7a5a1d" />
          <rect x={x} y="224" width="20" height="2" fill="#7a5a1d" />
        </g>
      ))}

      {/* columns */}
      {COLUMN_X.map((x) => (
        <g key={x}>
          <rect x={x - 18} y="152" width="36" height="8" rx="1" fill={g('goldV')} />
          <rect x={x - 15} y="160" width="30" height="4" fill="#7a5a1d" />
          <rect x={x - 13} y="164" width="26" height="134" fill={g('column')} />
          {[-6, 0, 6].map((dx) => (
            <rect key={dx} x={x + dx - 0.6} y="166" width="1.2" height="130" fill="#3a2a0c" opacity="0.35" />
          ))}
          <rect x={x - 16} y="298" width="32" height="5" fill="#9b7429" />
          <rect x={x - 18} y="303" width="36" height="7" rx="1" fill={g('goldV')} />
        </g>
      ))}

      {/* steps: lit top faces, dark fronts, receding right sides */}
      {[
        { x1: 80, x2: 480, y: 320, h: 14 },
        { x1: 60, x2: 500, y: 338, h: 14 },
        { x1: 40, x2: 520, y: 356, h: 18 },
      ].map(({ x1, x2, y, h }) => (
        <g key={y}>
          <polygon points={`${x1},${y} ${x2},${y} ${x2 + 28},${y - 10} ${x1 + 28},${y - 10}`} fill={g('goldH')} />
          <rect x={x1} y={y} width={x2 - x1} height={h} fill={g('stepFront')} />
          <rect x={x1} y={y} width={x2 - x1} height="1.5" fill="#f7d477" opacity="0.8" />
          <polygon points={`${x2},${y} ${x2 + 28},${y - 10} ${x2 + 28},${y - 10 + h} ${x2},${y + h}`} fill="#1a1309" />
        </g>
      ))}
    </svg>
  )
}
