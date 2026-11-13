// Gold line icons for the homepage (decorative: aria-hidden). Same 24×24 stroke style as components/icons.jsx.
function Icon({ children, className = 'size-6', strokeWidth = 1.7 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const CoinsIcon = (p) => (
  <Icon {...p}>
    <ellipse cx="9" cy="5.5" rx="6" ry="2.5" />
    <path d="M3 5.5v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-3M3 8.5v3c0 1.4 2.7 2.5 6 2.5 1 0 1.9-.1 2.7-.3M3 11.5v3c0 1.4 2.7 2.5 6 2.5 1 0 1.9-.1 2.7-.3" />
    <ellipse cx="16" cy="13.5" rx="5" ry="2.2" />
    <path d="M11 13.5v3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-3M11 16.5v2.3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-2.3" />
  </Icon>
)
export const ShieldTickIcon = (p) => (
  <Icon {...p}>
    <path d="M12 2.8 4.5 5.8v5.7c0 4.6 3.2 8.5 7.5 9.7 4.3-1.2 7.5-5.1 7.5-9.7V5.8z" />
    <path d="m8.6 12.1 2.3 2.3 4.6-4.8" />
  </Icon>
)
export const PeopleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="7.5" r="3.2" />
    <path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
    <circle cx="5.2" cy="9.3" r="2.3" />
    <circle cx="18.8" cy="9.3" r="2.3" />
    <path d="M1.8 18.2c.2-2.4 1.6-4 3.6-4.4M22.2 18.2c-.2-2.4-1.6-4-3.6-4.4" />
  </Icon>
)
export const ClipboardIcon = (p) => (
  <Icon {...p}>
    <rect x="4.5" y="4" width="15" height="17.5" rx="2" />
    <path d="M9 4V2.8h6V4M9 2.8h6v2.4H9z" />
    <path d="m7.8 10.2 1.3 1.3 2.2-2.3M13.5 10.3h3M7.8 15.7l1.3 1.3 2.2-2.3M13.5 15.8h3" />
  </Icon>
)
export const PulseIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12h4l2.5-6 4.5 13 3-9 1.5 2H22" />
  </Icon>
)
export const RefreshIcon = (p) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5" />
  </Icon>
)
export const ServerIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="17" height="7" rx="1.5" />
    <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
  </Icon>
)
export const DatabaseIcon = (p) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
    <path d="M4 5.5v6.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5M4 12v6.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V12" />
  </Icon>
)
export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)
export const LayersIcon = (p) => (
  <Icon {...p}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
    <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
  </Icon>
)
export const BoltIcon = (p) => (
  <Icon {...p}>
    <path d="M13.5 2 5 13.5h6L10 22l9-12h-6z" fill="currentColor" stroke="none" />
  </Icon>
)
export const InfoIcon = (p) => (
  <svg viewBox="0 0 20 20" className={p?.className ?? 'size-5'} aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="currentColor" />
    <path d="M10 8.6v5.4M10 5.6v.1" stroke="#111" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
export const CheckIcon = (p) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />
  </Icon>
)
export const ArrowRightIcon = (p) => (
  <Icon {...p} strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)
