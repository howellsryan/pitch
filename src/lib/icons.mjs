const ICONS = {
  search: ['<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'],
  home: ['<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M9 21v-7h6v7"/>'],
  squad: ['<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6M13.5 16c1-2 2.4-3 4.4-3 2.2 0 3.6 1.5 4.1 4.5"/>'],
  play: ['<path d="M6.2 4.8 19.2 12 6.2 19.2V4.8Z"/><path d="M8.9 8.2 15.8 12l-6.9 3.8V8.2Z" fill="currentColor" stroke="none"/><path d="M4.8 7.2v9.6"/>'],
  kickoff: ['<path d="M4 7v10M20 7v10M4 7h4M4 17h4M16 7h4M16 17h4"/><circle cx="12" cy="12" r="3.2"/><path d="m12 9.3 1.7 1.2-.65 2h-2.1l-.65-2z"/>'],
  market: ['<path d="M4 7h16l-1 13H5z"/><path d="M7 7a5 5 0 0 1 10 0M8 11h8"/>'],
  table: ['<path d="M4 5h16M4 10h16M4 15h16M4 20h16M9 5v15M16 5v15"/>'],
  menu: ['<path d="M5 7h14M5 12h14M5 17h14"/>'],
  close: ['<path d="m6 6 12 12M18 6 6 18"/>'],
  back: ['<path d="m15 5-7 7 7 7M8 12h11"/>'],
  chevron: ['<path d="m9 5 7 7-7 7"/>'],
  check: ['<path d="m5 12 4 4 10-10"/>'],
  warning: ['<path d="M12 3 22 20H2z"/><path d="M12 9v5M12 17h.01"/>'],
  info: ['<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'],
  success: ['<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-7"/>'],
  error: ['<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>'],
  injury: ['<path d="M9.5 3h5l1 5h5v5h-5l-1 8h-5l-1-8h-5V8h5z"/>'],
  fitness: ['<path d="M4 14h3l2-6 3 10 2-6h6"/><path d="M12 21C7 18 4 14.8 4 10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 3.5c0 4.3-3 7.5-8 10.5z"/>'],
  morale: ['<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14c1.1 2 2.4 3 4 3s2.9-1 4-3"/>'],
  form: ['<path d="M4 18 9 13l3 3 8-10"/><path d="M15 6h5v5"/>'],
  suspension: ['<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h5"/>'],
  transfer: ['<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>'],
  loan: ['<path d="M4 8h12M12 4l4 4-4 4M20 16H8"/><path d="M5 13v6h6"/>'],
  youth: ['<path d="M12 21v-9"/><path d="M12 13c-5 0-7-3-7-7 4 0 7 2 7 6M12 15c5 0 7-3 7-7-4 0-7 2-7 6"/>'],
  academy: ['<path d="m3 9 9-5 9 5-9 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M21 9v6"/>'],
  trophy: ['<path d="M8 4h8v4c0 4-1.5 7-4 7s-4-3-4-7z"/><path d="M8 7H4c0 4 2 6 5 6M16 7h4c0 4-2 6-5 6M12 15v4M8 21h8"/>'],
  cup: ['<path d="M7 4h10l-1 7c-.5 3-2 5-4 5s-3.5-2-4-5z"/><path d="M7 7H3c0 3 1.5 5 4.5 6M17 7h4c0 3-1.5 5-4.5 6M9 21h6M12 16v5"/>'],
  settings: ['<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.3-.7a7 7 0 0 0-.8-1.8L17 5.9l-2.1-2.1-2.1 1.1a7 7 0 0 0-1.8-.8L10.5 2h-3L6.8 4.3a7 7 0 0 0-1.8.8L2.9 4 1 6.1l1.1 2.1a7 7 0 0 0-.8 1.8L1 18.1 3.1 20l2.1-1.1a7 7 0 0 0 1.8.8l.5 2.3h3l.7-2.3a7 7 0 0 0 1.8-.8l2.1 1.1 2.1-2.1-1.1-2.1a7 7 0 0 0 .8-1.8z" transform="translate(2 0) scale(.83)"/>'],
  inbox: ['<path d="M4 6h16v12H4z"/><path d="m4 8 8 6 8-6"/>'],
  save: ['<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 17h8"/>'],
  cloud: ['<path d="M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.3 8.7 4.5 4.5 0 0 0 7 18z"/>'],
  download: ['<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'],
  upload: ['<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'],
  money: ['<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.9-1-3.1-1-1.8 0-3 .8-3 2 0 3.2 6.2 1.3 6.2 4.7 0 1.3-1.2 2.3-3.2 2.3-1.5 0-2.8-.5-3.8-1.4M12 5.5v13"/>'],
  star: ['<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>'],
  lock: ['<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'],
  unlock: ['<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2.6"/>'],
  eye: ['<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>'],
  calendar: ['<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'],
  clock: ['<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  speed: ['<path d="M4 18a8 8 0 1 1 16 0M12 12l5-4M7 18h10"/>'],
  pause: ['<path d="M8 5v14M16 5v14"/>'],
  skip: ['<path d="m5 5 9 7-9 7zM17 5v14"/>'],
  tactics: ['<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/><path d="M9 10.5v5M15 13.5V8"/>'],
  ball: ['<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2zM3.8 10.5 7 12.8l-1.2 3.7M20.2 10.5 17 12.8l1.2 3.7M8 20l2.1-3.1h3.8L16 20"/>'],
  goal: ['<path d="M4 20V5h16v15M4 8h16M8 8v12M12 8v12M16 8v12"/>'],
  whistle: ['<path d="M4 14h8a4 4 0 1 1-4 4H4z"/><path d="m12 14 5-4 3 2-4 5"/>'],
  corner: ['<path d="M6 21V4M6 5h9l-3 4 3 4H6M3 21h6"/>'],
  card: ['<rect x="7" y="3" width="10" height="18" rx="1"/>'],
  spark: ['<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z"/>'],
  user: ['<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/>'],
  refresh: ['<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 10A7 7 0 0 0 6 7M5.5 14A7 7 0 0 0 18 17"/>'],
  plus: ['<path d="M12 5v14M5 12h14"/>'],
  minus: ['<path d="M5 12h14"/>'],
  edit: ['<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM14 6.5l3.5 3.5"/>'],
  trash: ['<path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>'],
  filter: ['<path d="M4 5h16l-6 7v6l-4 2v-8z"/>'],
  sort: ['<path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3"/>'],
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

export function iconMarkup(name) {
  return ICONS[name] ?? ICONS.info;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function iconSvg(name, { size = 18, label = '', className = '' } = {}) {
  const title = label ? `<title>${esc(label)}</title>` : '';
  const aria = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const cls = className ? ` class="${esc(className)}"` : '';
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${Number(size) || 18}" height="${Number(size) || 18}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${aria}>${title}${iconMarkup(name).join('')}</svg>`;
}
