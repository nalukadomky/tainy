// Minimalistické čárové ikony (24×24, tah 1,75, barva textu) — místo barevných
// emoji, které na různých zařízeních vypadají různě a k vzhledu aplikace se nehodí.

const PATHS = {
  broom: (
    <>
      <path d="M10 10V4.5a2 2 0 0 1 4 0V10" />
      <path d="M6 13.5V12a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.5" />
      <path d="M5 13.5h14l1.5 7h-17z" />
      <path d="M9 20.5l.5-3M15 20.5l-.5-3M12 20.5v-3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7.5l8.5 6 8.5-6" />
    </>
  ),
  phone: <path d="M5.5 4h3l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3.5 6a2 2 0 0 1 2-2z" />,
  chat: <path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20.5 12z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l2-3h6l2 3h3V19H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4L2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15.5l-5-5L6 20" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  chart: <path d="M3 20h18M6.5 16.5v-5M11.5 16.5v-10M16.5 16.5v-7" />,
  home: (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16 9.5" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  zap: <path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" />,
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 7.5h18V10a2 2 0 0 0 0 4v2.5H3V14a2 2 0 0 0 0-4z" />
      <path d="M14.5 7.5v9" strokeDasharray="2 2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6.5v18h11V6.5z" />
      <path d="M14 3v3.5h3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18.5V6M3 14.5h18v4M21 14.5v-3a3 3 0 0 0-3-3h-7.5v6" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />,
  cart: (
    <>
      <path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.6" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 10a5.5 5.5 0 0 1-6.6 6.6L7.5 23.5l-3-3 6.9-6.9A5.5 5.5 0 0 1 18 3l-1.3 1.3a4 4 0 0 0-2 2z" />,
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  // Plamen (tvar podle ikon Lucide, licence ISC)
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "", label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {PATHS[name]}
    </svg>
  );
}
